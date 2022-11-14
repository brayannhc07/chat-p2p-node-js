const PORT = Number(process.argv[2]) || 13258; // Lee el puerto de la entrada

const createNode = require("./p2p");
const express = require('express');
const EventEmitter = require('events');
const app = express();
const http = require('http').createServer(app);
const frontSocket = require('socket.io')(http);
const ioClient = require("socket.io-client");
const formidable = require('formidable');
const path = require('path');

const node = createNode();

let mainSocket = null;


/** 
 * @description Muestra el puerto donde se ha iniciado la aplicación
 */
const showPort = () => `listening on *:${PORT}`;

const me = {
	port: PORT,
	address: null,
	peerId: node.id,
	userName: null,
}; // Para ayudarnos a guardar variables sobre el cliente emisor
let to = {
	port: null,
	address: null,
	peerId: null,
	userName: null,
}; // Para ayudarnos a guardar variables sobre el cliente receptor

let who = null;
const chats = [];
const MAX_FILE_SIZE_MB = 0.3;
const MAX_FILE_LENGTH = 17;
const MIME_TYPE = [
	'image/gif',
	'image/jpeg',
	'image/png'
];
const LITERAL = {
	fileNotAllowed: `El fichero que intenta subir no esta permitido. Los tipos permitidos son los siguientes: <b>[${MIME_TYPE.join(', ')}]</b>`,
	maxSize: `El fichero no puede tener un tamaño superior a <b>${MAX_FILE_SIZE_MB} MB</b> y/o no debe exceder de <b>${MAX_FILE_LENGTH}</b> caracteres`,
};


// Para servir los ficheros de la carpeta 'public'
app.use(express.static(`${__dirname}/public`));

/** 
 * @description Endpoint para la subida de documentos
 */
app.post('/upload-file', (req, res) => {
	let fileName = '';
	let error = true;
	const form = new formidable.IncomingForm({
		maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024
	});
	form.parse(req);
	form.on('fileBegin', (field, file) => {
		console.log(file, field);
		if (MIME_TYPE.includes(file.type) && file.type.length < 20) {
			file.path = path.join(__dirname, '/public/upload-file', file.name);
			fileName = file.name;
			error = false;
		}
	});
	form.on('end', () => {
		res.status(error ? 400 : 200).send({
			statusCode: error ? 400 : 200,
			statusMessage: error ? LITERAL.fileNotAllowed : `${req.protocol}://${req.hostname}:${PORT}/upload-file/${fileName}`,
			path: null
		});
	});
	form.on('progress', (bytesReceived, bytesExpected) => {
		frontSocket.to(who).emit('upload-progress', { recived: bytesReceived, total: bytesExpected, who });
		console.log(bytesReceived, bytesExpected);
	});
	form.on('error', () => {
		res.status(404).send({ statusCode: 404, statusMessage: LITERAL.maxSize, path: null });
	})
});


/** 
 * @description Método que se dispara cuando escribimos en nuestro chat. Aquí emitimos la información de quien esta escribiendo
 * @param {object} payload Datos del usuario
 */
const writeClient = payload => {
	const { data } = payload;
	frontSocket.emit('client-been-writing', data ? `El usuario ${data} esta escribiendo...` : '');
};

/** 
 * @description Método que se dispara cuando subimos un fichero. Aquí almacenamos temporalmente el usuario que esta subiendo un archivo
 * @param {object} payload Datos del usuario
 */
const whoUpload = payload => {
	who = payload.idUser;
};

/** 
 * @description Método que se dispara cuando enviamos un mensaje. Desde aquí gestionamos el envio de mensajes a un usuario privado o al chat público
 * @param {object} payload Datos del usuario
 * @param {string} color Color del usuario
 * @param {string} type Indicamos si es un chat privado o no
 */
const messageChat = payload => {

	frontSocket.emit('recive-message', payload);
	node.direct(to.peerId, { name: payload.userOrigen, text: payload.message });
};

const connectToUser = payload => {
	console.log("Conectar con usuario")

	to = payload; // guardar los datos del otro peer para la sesión

	console.log(`Conectando a ${to.address}:${to.port}...`);

	node.connect(to.address, to.port, () => {
		console.log(`Conección a ${to.address}:${to.port} correcta..`);
	});
};

/** 
 * @description Evento que se dispara cuando se realiza la conexión
 * @param {object} El socket generado por el evento que dispara cuando se realiza la conexión
 */
frontSocket.on('connection', socket => {
	socket.on('connected-to-server', payload => connectToMainSocket(payload, socket));
	socket.on('disconnect', () => disconnectFromMainSocket(socket));
	socket.on('write-client', writeClient);
	socket.on('message-chat', payload => messageChat(payload));
	socket.on('upload-file', payload => whoUpload(payload));

	socket.on('connect-to-user', payload => connectToUser(payload));
});

/**
 * Cuando se actualizan los usuarios en el socket principal
 * @param {} payload 
 */
const registerUser = payload => {
	frontSocket.emit('registered-user', payload);
};
/**
 * Conectarse al socket principal
 * @param {*} userData 
 * @param {*} socket 
 */

const connectToMainSocket = (userData, socket) => {
	me.userName = userData.userName;
	mainSocket = ioClient.connect("http://localhost:13257");
	mainSocket.on('registered-user', registerUser);
	mainSocket.on('error-registered-user', payload => frontSocket.emit("error-registered-user", payload));
	mainSocket.emit('connected-to-server', me);
}

/** 
 * @description Método que se dispara cuando realizamos la desconexión del usuario (Recargar y nuevo acceso). Aquí realizamos la desconexión
 * @param {object} El socket generado por el evento que dispara cuando se realiza la conexión
 */
const disconnectFromMainSocket = () => {
	mainSocket?.disconnect();
};

// Servidor escuchando
http.listen(PORT, () => {
	console.log(showPort());
});

node.listen(PORT, () => {
	node.on('direct', data => {
		const { origin, message: { name, text } } = data;
		to.peerId = origin; // Actualiza el id del peer que nos manda mensaje

		console.log(`${name}: ${text}`);

		frontSocket.emit("recive-message", { userOrigen: name, message: text });
	});
});