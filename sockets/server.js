/**
 * Servidor que se encarga de encontrar clientes y exponer 
 * las direcciones entre ellos.
 */

const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const PORT = process.SERVER_PORT || 13257;

// Definición de constantes y variables para la gestión del chat
let users = [];

const showPort = () => `listening on *:${PORT}`;


/** 
 * @description Método que se dispara cuando realizamos la conexión del usuario. Aquí realizamos la conexión y validación del usuario
 * @param {object} payload Datos del usuario
 * @param {object} El socket generado por el evento que dispara cuando se realiza la conexión
 */
const connection = (payload, socket) => {
  const user = {
    ...payload,
    idUser: socket.id,
    address: getAddress(socket)
  };


  let errorMessage = null;
  users.forEach(item => {
    if (item.userName === user.userName) {
      errorMessage = `El nombre de usuario <b>${user.userName}</b> esta en uso.`;
    }

    if (item.idUser === user.idUser) {
      errorMessage = `Ya está abierta una sesión en esta conexión.`;
    }

    if (`${item.address}:${item.port}` === `${user.address}:${user.port}`) {
      errorMessage = `Ya se tiene un cliente desde <b>${user.address}</b>.`;
    }
  });

  if (errorMessage) {
    io.to(user.idUser).emit('error-registered-user', { error: errorMessage });
  } else {
    users.push(user);
    io.emit('registered-user', users);
    console.log("client connected", user);
  }
};

const getAddress = socket => socket.request.connection.remoteAddress.split(":").pop();


/** 
 * @description Método que se dispara cuando realizamos la desconexión del usuario (Recargar y nuevo acceso). Aquí realizamos la desconexión
 * @param {object} El socket generado por el evento que dispara cuando se realiza la conexión
 */
const closeConnection = socket => {
  console.log("Client disconnected")
  users = [...users.filter(item => item.idUser !== socket.id)];
  io.emit('registered-user', users);
};

/** 
 * @description Evento que se dispara cuando se realiza la conexión
 * @param {object} El socket generado por el evento que dispara cuando se realiza la conexión
 */
io.on('connection', socket => {
  socket.on('connected-to-server', payload => connection(payload, socket));
  socket.on('disconnect', () => closeConnection(socket));
});

// Servidor escuchando
server.listen(PORT, () => {
  console.log(showPort());
});