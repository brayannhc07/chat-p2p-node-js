// Definición de constantes y variables para la gestión del chat
let socket = null;
let txtUserName = null;
let btnConnect = null;
let txtMessage = null;
let usersPanel = null;
let notification = null;
let uploadFile = null;
let webrtc = null;
let toLabel = null;
let messageForm = null;
let messagesContainer = null;

const CHAT_GENERAL = 'chatGeneral';
const LENGTH_MIN_USERNAME = 3;
const EMPTY = 0;
const LITERAL = {
  sameUser: 'No puedes enviarte un mensaje a ti mismo',
  minSizeUser: `El nombre del usuario debe tener <b>mínimo ${LENGTH_MIN_USERNAME} caracteres</b>`,
  uploadFile: 'Ha compartido un fichero',
  uploadSuccess: 'El fichero se ha subido y se esta compartiendo correctamente',
};

const unlockChatForm = reciepent => {
  toLabel.innerText = `Para: ${reciepent}`
  messageForm.removeAttribute("disabled");
}

const lockUserNameControls = () => {
  txtUserName.setAttribute('disabled', '');
  btnConnect.setAttribute('disabled', '');
}

const unlockUserNameControls = () => {
  txtUserName.removeAttribute('disabled');
  btnConnect.removeAttribute('disabled');
}


/** 
 * @description Creamos una sala privada
 * @param {object} user Información para crear la sala
 */
const chatTo = user => {
  if (txtUserName.value !== user.userName) {
    socket.emit("connect-to-user", user);

    unlockChatForm(user.userName);
  } else {
    notify(LITERAL.sameUser, 'danger');
  }
};

/** 
 * @description Envia mensajes al chat general y a un usuario privado
 * @param {object} e Evento implicito en la acción ejecutada
 */
const sendMessage = e => {

  if (txtMessage.value.trim().length > EMPTY) {
    const infoMensaje = {
      userOrigen: txtUserName.value,
      message: txtMessage.value
    };

    socket.emit(`message-chat`, infoMensaje);
    txtMessage.value = '';
    currentlyChat.scrollTo(0, currentlyChat.scrollHeight);
  }
};

/** 
 * @description Muestra texto en el chat general
 * @param {object} data Información relativa al usuario
 */
const reciveMessage = data => {
  const {
    userOrigen,
    message
  } = data;

  if (userOrigen !== txtUserName.value) {
    unlockChatForm(userOrigen);
  }

  const div = document.createElement('div');
  const span = document.createElement('span');
  span.classList.add('has-text-weight-bold', 'mr-1', userOrigen === txtUserName.value ? 'has-text-link' : 'has-text-primary');
  span.appendChild(document.createTextNode(`${userOrigen}:`));
  div.appendChild(span);
  div.innerHTML += message;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTo(0, messagesContainer.scrollHeight);
};

/** 
 * @description Añade y actualiza el panel lateral con el listado de los usuarios
 * @param {object} users Información de cada uno de los usuarios
 */
const displayUsers = users => {
  Array.from(usersPanel.children).forEach(item => item.remove());

  users.forEach(user => {
    const userButton = document.createElement('a');
    userButton.classList.add('panel-block');
    userButton.onclick = () => { chatTo(user); };

    userButton.appendChild(document.createTextNode(`${user.userName} - ${user.address}:${user.port}`));
    usersPanel.appendChild(userButton);
  });
};

/** 
 * @description Muestra mensaje de error al registrar el usuario
 * @param {object} payload Información de cada uno de los usuarios
 */
const errorRegisteredUser = payload => {
  const { error } = payload;
  notify(error, 'danger');
  unlockUserNameControls();
};

/** 
 * @description Realiza la conexion al servidor
 * @param {object} e Evento implicito en la acción ejecutada
 */
const connectedToMainServer = e => {
  if (txtUserName.value.length >= LENGTH_MIN_USERNAME) {
    lockUserNameControls();

    // Inicializar socket
    socket = io.connect();
    socket.on('recive-message', reciveMessage);
    socket.on('registered-user', displayUsers);
    socket.on('error-registered-user', payload => errorRegisteredUser(payload));
    socket.on('upload-progress', data => uploadProgress(data));

    socket.emit('connected-to-server', { userName: txtUserName.value });
  } else {
    notify(LITERAL.minSizeUser, 'danger');
  }
};

/** 
 * @description Mostramos el progreso de la subida
 * @param {object} data Información sobre la subida del archivo
 */
const uploadProgress = data => {
  const { recived, total, who } = data;
  const porcent = Math.floor((recived * 100) / total);
  const currentlySize = (recived / 1024) / 1024; // MB
  const totalSize = (total / 1024) / 1024; // MB
  const progress = document.querySelector('#upload-progress-bar');
  const infoProgress = document.querySelector('.info-progress');
  progress.value = Math.floor(porcent);
  progress.innerHTML = porcent.toFixed(2);
  infoProgress.innerHTML = `${currentlySize.toFixed(2)} MB ${totalSize.toFixed(2)} MB ${porcent} %`;
};

/** 
 * @description Cargamos un fichero y se sube al servidor
 * @param {object} evt Evento implicito en la acción ejecutada
 */
const upload = async evt => {
  if (txtUserName.value.length >= LENGTH_MIN_USERNAME) {
    const uploadProgress = document.querySelector('#containerProgress');
    uploadProgress.classList.remove('hidden');
    const btnUploadFile = document.querySelector('#btnUploadFile');
    btnUploadFile.classList.add('is-loading');
    btnUploadFile.setAttribute('disabled', true);
    const files = evt.target.files;
    const data = new FormData();
    data.append('archivo', files[0]);
    socket.emit('upload-file', { idUser: txtUserName.dataset.iduser });
    const result = await (await fetch('/upload-file', {
      method: 'POST',
      body: data
    })).json();
    btnUploadFile.classList.remove('is-loading');
    btnUploadFile.removeAttribute('disabled');
    const { statusCode, path, statusMessage } = result;
    if (statusCode === 200) {
      txtMessage.value = `${LITERAL.uploadFile} <a href='${statusMessage}' target='_blank'>[${files[0].name}]</a>`;
      sendMessage(evt = { key: 'Enter' }, true);
      notify(LITERAL.uploadSuccess, 'success', 4000);
    } else {
      notify(statusMessage, 'danger', 4000);
    }
    setTimeout(() => {
      uploadProgress.classList.add('hidden');
    }, 2000);
  } else {
    document.querySelector('form').reset();
    notify(LITERAL.minSizeUser, 'danger');
  }
};

/** 
 * @description Inicialización del chat
 */
const onLoad = () => {
  txtUserName = document.querySelector('#txtUserName');
  txtUserName.addEventListener('keydown', evt => {
    if (evt.key === 'Enter') {
      connectedToMainServer();
    }
  });
  btnConnect = document.querySelector('#btnConnect');
  messageForm = document.querySelector('#messageForm');
  messagesContainer = document.querySelector('#messagesContainer');
  toLabel = document.querySelector('#toLabel');
  txtMessage = document.querySelector('#txtMessage');
  usersPanel = document.querySelector('#usersConnected');
  notification = document.querySelector('#notification');
  txtMessage.addEventListener('keydown', evt => {
    if (evt.key === 'Enter') {
      sendMessage(evt, true);
    }
  });
  btnConnect.addEventListener('click', connectedToMainServer);
  uploadFile = document.querySelector('input[type=file]');
  uploadFile.addEventListener('change', upload);
};

/** 
 * @description Muestra notificaciones en el chat
 * @param {string} message Mensaje que se muestra en la notificación
 * @param {string} type Tipo de mensaje (danger, info, success, warning)
 * @param {number} timeout Duración de la notificación
 */
const notify = (message = '', type = 'info', timeout = 2000) => {
  notification.innerHTML = message;
  notification.classList.add(`is-${type}`);
  notification.classList.remove('is-hidden');
  setTimeout(() => {
    notification.classList.add('is-hidden');
    notification.classList.remove(`is-${type}`);
  }, timeout);
};


document.addEventListener("DOMContentLoaded", onLoad);