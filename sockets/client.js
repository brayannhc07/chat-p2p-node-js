const express = require('express');
const path = require('path');
const http = require("http");
const io = require("socket.io");
const ioClient = require("socket.io-client");
const formidable = require('formidable');

const createP2PServer = require("./p2p");
const utilities = require("./utilities");

const PORT = Number(process.argv[2]) || 13258; // Lee el puerto de la entrada
const ADDRESS = utilities.getAddress()[1];
const MAIN_SERVER_ADDRESS = "http://localhost:5005";

const app = express();
const webServer = http.createServer(app);
const frontendSocket = io(webServer);
const p2pServer = createP2PServer();


// Para servir los ficheros de la carpeta 'public'
app.use(express.static(`${__dirname}/public`));

let mainSocket = null;
let userName = null;

let peer = {
	port: null,
	address: null,
	peerId: null,
	userName: null,
}; // Para ayudarnos a guardar variables sobre el cliente receptor

let who = null;

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

/** 
 * @description Endpoint para la subida de documentos
 */
app.post('/upload-file', (req, res) => {
	let fileName = '';
	let fileType = '';
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
			fileType = file.type;
			error = false;
		}
	});
	form.on('end', () => {
		const base64str = utilities.base64_encode(path.join(__dirname, '/public/upload-file', fileName));
		const imageMessage = `data:${fileType};base64,${base64str}`;

		messageChat({
			userOrigen: userName,
			message: imageMessage
		}); // Forzamos el envío del mensaje

		res.status(error ? 400 : 200).send({
			statusCode: error ? 400 : 200,
			statusMessage: error ? LITERAL.fileNotAllowed : `${req.protocol}://${req.hostname}:${PORT}/upload-file/${fileName}`,
			path: null
		});
	});
	form.on('error', () => {
		res.status(404).send({ statusCode: 404, statusMessage: LITERAL.maxSize, path: null });
	})
});

/** 
 * @description Método que se dispara cuando subimos un fichero. Aquí almacenamos temporalmente el usuario que esta subiendo un archivo
 * @param {object} payload Datos del usuario
 */
const whoUpload = payload => {
	who = payload.idUser;
};

/** 
 * @description Se manda un mensaje directo al otro peer
 * @param {object} payload Datos del mensaje
 */
const messageChat = payload => {

	frontendSocket.emit('recive-message', payload); // avisar al front
	p2pServer.direct(peer.peerId, { name: payload.userOrigen, text: payload.message }); // enviar mensaje al peer
};

/**
 * Intentar conectarse a otro usuario por medio de p2p
 * @param {*} payload 
 */
const connectToUser = payload => {
	console.log("Conectar con usuario")

	peer = payload; // guardar los datos del otro peer para la sesión

	console.log(`Conectando a ${peer.address}:${peer.port}...`);

	// Empieza la conexión
	p2pServer.connect(peer.address, peer.port, () => {
		console.log(`Conexión a ${peer.address}:${peer.port} correcta.`);
	});
};

/** 
 * @description Evento que se dispara cuando se realiza la conexión
 * @param {object} El socket generado por el evento que dispara cuando se realiza la conexión
 */
frontendSocket.on('connection', socket => {
	socket.on('connected-to-server', payload => connectToMainSocket(payload, socket));
	socket.on('disconnect', () => mainSocket?.disconnect());
	socket.on('message-chat', payload => messageChat(payload));
	socket.on('upload-file', payload => whoUpload(payload));

	socket.on('connect-to-user', payload => connectToUser(payload));
});

/**
 * Conectarse al socket principal para encontrar otros usuarios
 * @param {*} payload
 * @param {*} socket 
 */
const connectToMainSocket = (payload, socket) => {
	userName = payload.userName;
	mainSocket = ioClient.connect(MAIN_SERVER_ADDRESS);

	mainSocket.on('registered-user', payload => frontendSocket.emit('registered-user', payload));
	mainSocket.on('error-registered-user', payload => frontendSocket.emit("error-registered-user", payload));

	mainSocket.emit('connected-to-server', { userName, address: ADDRESS, port: PORT, peerId: p2pServer.id });
}

// Servidor escuchando para los sockets 
webServer.listen(PORT, () => {
	console.log(utilities.showAddress(PORT, ADDRESS));
});

// Servidor escuchando a los mensajes p2p
p2pServer.listen(PORT, () => {
	p2pServer.on('direct', data => {
		const { origin, message: { name, text } } = data;
		peer.peerId = origin; // Actualiza el id del peer que nos manda mensaje

		console.log(`${name}: ${text}`);

		frontendSocket.emit("recive-message", { userOrigen: name, message: text });
	});
});