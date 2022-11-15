const os = require("os");
var fs = require('fs');

/**
 * Obtiene las direcciones locales para conocer la ip.
 * @returns 
 */
const getAddress = () => Object.values(os.networkInterfaces()).reduce((r, list) => r.concat(list.reduce((rr, i) => rr.concat(i.family === 'IPv4' && !i.internal && i.address || []), [])), []);


/** 
 * @description Muestra la dirección donde se ha iniciado la aplicación
 */
const showAddress = (port, ip = "*") => `listening on ${ip}:${port}`;


// function to encode file data to base64 encoded string
const base64_encode = file => {
	// read binary data
	var bitmap = fs.readFileSync(file);
	// convert binary data to base64 encoded string
	return new Buffer(bitmap).toString('base64');
}

// function to create file from base64 encoded string
const base64_decode = (base64str, file) => {
	// create buffer object from base64 encoded string, it is important to tell the constructor that the string is base64 encoded
	var bitmap = new Buffer(base64str, 'base64');
	// write buffer to file
	fs.writeFileSync(file, bitmap);
	console.log('******** File created from base64 encoded string ********');
}

// convert image to base64 encoded string
// var base64str = base64_encode('kitten.jpg');
// console.log(base64str);
// convert base64 string back to image 
// base64_decode(base64str, 'copy.jpg');

module.exports = {
	showAddress,
	getAddress,
	base64_encode,
	base64_decode
}