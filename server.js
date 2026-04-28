const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');
const path = require('path');
const fetch = require('node-fetch');

// ─── Configuración de sofIA (DeepSeek) ───────────────────────────────────────
const DEEPSEEK_API_KEY = 'API_KEY';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// System prompt de Dani — agrégalo aquí:
const SOFIA_SYSTEM_PROMPT = `Rol Principal: Eres Dani, una chica de 19 años. Estás chateando, no escribiendo un ensayo. Tu personalidad es relajada, tranquila y directa.

Estilo de Escritura (IMPORTANTE):

Cero formalidad: Escribe todo en minúsculas o mezcla mayúsculas solo si es el autocorrector.

Mala puntuación intencional: Evita poner puntos al final de los mensajes. Usa muy pocas comas; prefiere oraciones seguidas o separadas por espacios.

Ortografía relajada: No te preocupes por las tildes (acentos). Puedes escribir "que" como "q" a veces, pero no abuses. Si se te va alguna letra, déjalo así.

Frases o modismos: Puedes usar expresiones mexicanas casuales de vez en cuando, pero con moderación. Evita repetir mucho "wey" o "vato". Evita palabras como "cute", "uwu", "xd" que suenan infantiles.

Emojis: ninguno.

Personalidad y Gustos (Sutiles):

Rutina chill: Tu día a día es tranquilo. A veces mencionas que estás en casa, que tienes flojera, que hace calor, o que no dormiste bien. Sin drama.

BTS / K-Pop: Son tu música de fondo. Mencionas canciones o artistas sin dar explicaciones, asumiendo que el otro sabe.

K-Dramas: Si mencionas que estás viendo algo, es probablemente un drama coreano. Dices "estoy viendo mi kdrama" o "el capitulo de hoy".

Vainilla/Pastel: Si te piden elegir algo, siempre vas por colores pasteles como el rosa o morado, o el sabor vainilla, pero sin hacer un show de ello.

Ejemplo de respuesta: "ay no pues ya hasta me rendí con el capitulo de hoy lo dejé a medias y me quedé dormida escuchando música"`;

const SOFIA_USER = { username: 'Dani', color: '#a78bfa' }; // violeta suave

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MONGO_URI = 'mongodb://127.0.0.1:27017/onlinechat';

// ─── Colores de usuarios (ciclo de 8) ─────────────────────────────────────────
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

// ─── Mongoose ─────────────────────────────────────────────────────────────────
const MessageSchema = new mongoose.Schema({
  username: { type: String, required: true, maxlength: 30 },
  text: { type: String, required: true, maxlength: 1000 },
  color: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model('Message', MessageSchema);

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Error MongoDB:', err));

// ─── Archivos estáticos ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Socket.io ────────────────────────────────────────────────────────────────
let userColorIndex = 0;                // índice global de color
const connectedUsers = new Map();      // socketId → { username, color }

io.on('connection', async (socket) => {

  // 1. Usuario se une con su nombre
  socket.on('join', async (rawUsername) => {
    // Validar y sanitizar nombre
    if (typeof rawUsername !== 'string') return;
    const username = sanitizeHtml(rawUsername.trim(), { allowedTags: [], allowedAttributes: {} }).substring(0, 30);
    if (!username) return;

    // Asignar color
    const color = USER_COLORS[userColorIndex % USER_COLORS.length];
    userColorIndex++;

    connectedUsers.set(socket.id, { username, color });

    // Enviar historial de los últimos 50 mensajes
    try {
      const history = await Message.find()
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();
      socket.emit('history', history.reverse());
    } catch (e) {
      console.error('Error cargando historial:', e);
    }

    // Notificar a todos que alguien entró
    io.emit('user_event', {
      text: `${username} se unió al chat`,
      type: 'join',
    });

    console.log(`🟢 ${username} conectado (color: ${color})`);
  });

  // 2. Mensaje de chat
  socket.on('chat message', async (rawText) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (typeof rawText !== 'string') return;

    // Sanitizar texto (eliminar todo HTML/JS)
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

    // Guardar en MongoDB
    try {
      await Message.create(msgData);
    } catch (e) {
      console.error('Error guardando mensaje:', e);
    }

    // Emitir a todos
    io.emit('chat message', msgData);

    // ── Detectar mención @dani ────────────────────────────────────────────
    if (/@dani\b/i.test(text)) {
      // Extraer la pregunta quitando el tag
      const question = text.replace(/@dani\b/gi, '').trim();
      askSofIA(question, user.username);
    }
  });

  // ── Función que llama a DeepSeek y emite la respuesta como sofIA ──────────
  async function askSofIA(question, askedBy) {
    // Indicador de escritura
    io.emit('sofia_typing', true);

    const messages = [];
    if (SOFIA_SYSTEM_PROMPT.trim()) {
      messages.push({ role: 'system', content: SOFIA_SYSTEM_PROMPT });
    }
    messages.push({ role: 'user', content: question || '...' });

    let replyText;
    try {
      const res = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          max_tokens: 512,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error('DeepSeek error:', res.status, errBody);
        replyText = '⚠️ No pude conectarme con DeepSeek en este momento.';
      } else {
        const data = await res.json();
        replyText = data.choices?.[0]?.message?.content?.trim() ||
          '(sin respuesta)';
      }
    } catch (err) {
      console.error('Error al llamar a DeepSeek:', err);
      replyText = '⚠️ Error de conexión con la IA.';
    }

    io.emit('sofia_typing', false);

    const sofiaMsg = {
      username: SOFIA_USER.username,
      text: replyText,
      color: SOFIA_USER.color,
      timestamp: new Date(),
      isSofIA: true,
    };

    // Guardar respuesta de sofIA en MongoDB
    try {
      await Message.create(sofiaMsg);
    } catch (e) {
      console.error('Error guardando mensaje de sofIA:', e);
    }

    io.emit('chat message', sofiaMsg);
  }

  // 3. Desconexión
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      io.emit('user_event', {
        text: `${user.username} salió del chat`,
        type: 'leave',
      });
      console.log(`🔴 ${user.username} desconectado`);
    }
    connectedUsers.delete(socket.id);
  });
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
  console.log(`   Accesible en la red por: http://<TU_IP>:${PORT}`);
});
