require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sanitizeHtml = require('sanitize-html');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ─── Colores de usuarios  ─────────────────────────────────────────
const USER_COLORS = [
  '#e74c3c', // rojo
  '#3498db', // azul
  '#2ecc71', // verde
  '#f39c12', // naranja
  '#9b59b6', // violeta
  '#1abc9c', // turquesa
  '#e67e22', // naranja oscuro
  '#e91e63', // rosa
];

// ─── Historial en memoria ──────────────────────────────────
const MAX_MESSAGES = 100;
const messageHistory = [];

function addToHistory(msg) {
  messageHistory.push(msg);
  if (messageHistory.length > MAX_MESSAGES) {
    messageHistory.shift(); // eliminar el más antiguo
  }
}

// ─── Archivos estáticos ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Socket.io ────────────────────────────────────────────────────────────────
let userColorIndex = 0;                // índice global de color
const connectedUsers = new Map();      // socketId → { username, color }

io.on('connection', (socket) => {

  // 1. Usuario se une con su nombre
  socket.on('join', (rawUsername) => {
    if (typeof rawUsername !== 'string') return;

    // Validar etiquetas HTML
    const htmlTagRegex = /<[a-zA-Z/][^>]*>/i;
    if (htmlTagRegex.test(rawUsername)) {
      socket.emit('validation_error', { field: 'username', message: 'El nombre no puede contener etiquetas HTML.' });
      return;
    }

    const username = sanitizeHtml(rawUsername.trim(), { allowedTags: [], allowedAttributes: {} }).substring(0, 30);
    if (!username) return;

    // Asignar color
    const color = USER_COLORS[userColorIndex % USER_COLORS.length];
    userColorIndex++;

    connectedUsers.set(socket.id, { username, color });

    // Enviar historial al usuario que se acaba de conectar
    socket.emit('history', messageHistory);

    // Notificar a todos que alguien entró
    io.emit('user_event', {
      text: `${username} se unió al chat`,
      type: 'join',
    });

    console.log(` ${username} conectado (color: ${color})`);
  });

  // 2. Mensaje de chat
  socket.on('chat message', (rawText) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (typeof rawText !== 'string') return;

    // Validar etiquetas HTML
    const htmlTagRegex = /<[a-zA-Z/][^>]*>/i;
    if (htmlTagRegex.test(rawText)) {
      socket.emit('validation_error', { field: 'message', message: 'El mensaje no puede contener etiquetas HTML.' });
      return;
    }

    const text = sanitizeHtml(rawText.trim(), {
      allowedTags: [],
      allowedAttributes: {},
    }).substring(0, 1000);

    if (!text) return;

    const msgData = {
      username: user.username,
      text,
      color: user.color,
      timestamp: new Date(),
    };

    // Guardar en historial en memoria
    addToHistory(msgData);

    // Emitir a todos
    io.emit('chat message', msgData);


  });

  // 3. Desconexión
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      io.emit('user_event', {
        text: `${user.username} salió del chat`,
        type: 'leave',
      });
      console.log(` ${user.username} desconectado`);
    }
    connectedUsers.delete(socket.id);
  });
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
  console.log(`   Accesible en la red por: http://<TU_IP>:${PORT}`);
});
