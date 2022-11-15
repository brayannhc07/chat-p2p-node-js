const express = require('express');
const http = require("http");
const io = require('socket.io');

const app = express();
const webServer = http.createServer(app);
const socketServer = io(webServer);

const utilities = require("./utilities");

const PORT = 5005;

/**
 * Usuarios disponibles
 */
let users = [];

/** 
 * @description Proceso de reconocimiento de un usuario
 * @param {object} payload Datos del usuario
 * @param {object} socket
 */
const userConnected = (payload, socket) => {
  const user = {
    ...payload,
    idUser: socket.id
  };

  let errorMessage = null;
  users.forEach(item => {
    if (item.userName === user.userName) {
      errorMessage = `El nombre de usuario <b>${user.userName}</b> esta en uso.`;
    } else if (item.idUser === user.idUser) {
      errorMessage = `Ya está abierta una sesión en esta conexión.`;
    } else if (`${item.address}:${item.port}` === `${user.address}:${user.port}`) {
      errorMessage = `Ya se tiene un cliente desde <b>${user.address}</b>.`;
    }
  });

  if (errorMessage) {
    socketServer.to(user.idUser).emit('error-registered-user', { error: errorMessage });
  } else {
    users.push(user);
    socketServer.emit('registered-user', users);
    console.log("Usuario conectado", user);
  }
};

/** 
 * @description Cuando un usuario se desconecta hay que quitarlo de la lista
 * @param {object} socket
 */
const userDisconnected = socket => {
  console.log("Usuario desconectado")
  users = [...users.filter(item => item.idUser !== socket.id)];
  socketServer.emit('registered-user', users);
};

/** 
 * @description Conexión del webSocket
 * @param {object} El socket generado por el evento que dispara cuando se realiza la conexión
 */
socketServer.on('connection', socket => {
  socket.on('connected-to-server', payload => userConnected(payload, socket));
  socket.on('disconnect', () => userDisconnected(socket));
});

// Servidor escuchando
webServer.listen(PORT, () => {
  console.log(utilities.showAddress(PORT, utilities.getAddress()[1]));
});