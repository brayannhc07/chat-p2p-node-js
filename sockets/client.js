const express = require('express');
const path = require('path');
const http = require("http");
const io = require("socket.io");
const ioClient = require("socket.io-client");
const formidable = require('formidable');

const createP2PServer = require("./p2p");
const utilities = require("./utilities");

const PORT = Number(process.argv[2]) || 13258; // Lee el puerto de la entrada
const ADDRESS = utilities.getAddress().pop();
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

/**
 * Variable que nos sirve para ir guardando datos de imágenes que nos manden por p2p
 */
let imageRecievedData = {
	data: "",
	fileType: "",
	fileName: "",
	userName: ""
};

const MAX_FILE_SIZE_MB = 0.3;
const MAX_FILE_LENGTH = 17;
const MIME_TYPE = [
	'image/gif',
	'image/jpeg',
	'image/png'
];

const MESSAGE_IMG_START_TOKEN = "img-s;";
const MESSAGE_IMG_CONTENT_TOKEN = "img-c;";
const MESSAGE_IMG_END_TOKEN = "img-e;";

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

		sendImageData(path.join(__dirname, '/public/upload-file', fileName), fileType, fileName, userName); // Envía la imagen

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
 * Envía una imagen a otro peer.
 * @param {string} filePath 
 * @param {string} fileType 
 * @param {string} fileName 
 * @param {string} userName 
 */
const sendImageData = (filePath, fileType, fileName, userName) => {
	const base64str = utilities.base64_encode(filePath);
	let imageDataArray = base64str.match(/.{1,1024}/g);

	// Agregar los tokens para identificar como fragmentos de una imagen
	imageDataArray = imageDataArray.map(dataItem => MESSAGE_IMG_CONTENT_TOKEN + dataItem);
	// Agregar un encabezado con el nombre del peer, ruta del archivo y el token final
	imageDataArray = [
		MESSAGE_IMG_START_TOKEN + `${userName};${fileName};${fileType}`,
		...imageDataArray,
		MESSAGE_IMG_END_TOKEN
	];
	imageDataArray.forEach(dataItem => {
		// Enviamos cada fragmento sin que se detecte como mensaje
		messageChat({
			userOrigen: userName,
			message: dataItem
		}, false);
	});
}

/**
 * Lee los datos de una imagen de otro peer
 * @param {string} textData 
 */
const recieveImageData = textData => {
	const message = splitImageDataMessage(textData);

	if (!message) {
		return;
	}

	switch (message.messageToken) {
		case MESSAGE_IMG_START_TOKEN:
			// Primer fragmento de la imagen
			const [userName, fileName, fileType] = message.messageData.split(";");
			imageRecievedData = {
				userName,
				fileName,
				fileType,
				data: ''
			};
			break;
		case MESSAGE_IMG_CONTENT_TOKEN:
			// Contenido de la imagen
			imageRecievedData.data += message.messageData;
			break;
		case MESSAGE_IMG_END_TOKEN:
			// Guarda la imagen completada como archivo
			storeImageRecievedToFiles();
			// Se terminó de mandar la imagen y ahora sí se manda el mensaje
			messageChat({
				userOrigen: imageRecievedData.userName,
				message: '/upload-file/' + imageRecievedData.fileName
			});
		default:
			break;
	}
}

/**
 * Separa el texto de los datos para imagen en el token y la data
 * @param {string} textData 
 * @returns 
 */
const splitImageDataMessage = textData => {
	let token = "";
	if (textData.startsWith(MESSAGE_IMG_START_TOKEN)) {
		token = MESSAGE_IMG_START_TOKEN;
	} else if (textData.startsWith(MESSAGE_IMG_CONTENT_TOKEN)) {
		token = MESSAGE_IMG_CONTENT_TOKEN;
	} else if (textData.startsWith(MESSAGE_IMG_END_TOKEN)) {
		token = MESSAGE_IMG_END_TOKEN;
	}

	if (token) {
		const [_, messageData] = textData.split(token);
		return { messageToken: token, messageData };
	}

	return null;
}

const storeImageRecievedToFiles = () => {
	require("fs").writeFile(path.join(__dirname, '/public/upload-file', imageRecievedData.fileName), imageRecievedData.data, 'base64', function (err) {
		console.log(err);
	});
}


/** 
 * @description Se manda un mensaje directo al otro peer
 * @param {object} payload Datos del mensaje
 */
const messageChat = (payload, notifyFront = true) => {

	if (notifyFront === true) {
		frontendSocket.emit('recive-message', payload); // avisar al front
	}

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
		if (name && text) {
			peer.peerId = origin; // Actualiza el id del peer que nos manda mensaje

			if (text.startsWith(MESSAGE_IMG_CONTENT_TOKEN) || text.startsWith(MESSAGE_IMG_START_TOKEN) || text.startsWith(MESSAGE_IMG_END_TOKEN)) {
				// Caso especial para cuando se recibe una imagen
				recieveImageData(text);
			} else {
				console.log(`${name}: ${text}`);
				frontendSocket.emit("recive-message", { userOrigen: name, message: text });
			}

		}
	});
});