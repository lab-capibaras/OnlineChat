/* chat.js — Lógica del cliente */

(function () {
  'use strict';

  // ── Obtener nombre de usuario ──────────────────────────────────────────────
  const username = sessionStorage.getItem('chat_username');
  if (!username) {
    window.location.href = 'index.html';
    return;
  }

  // ── Mostrar nombre en el header ────────────────────────────────────────────
  const selfNameEl = document.getElementById('selfName');
  if (selfNameEl) selfNameEl.textContent = '' + username;

  // ── Referencias al DOM ─────────────────────────────────────────────────────
  const messagesEl   = document.getElementById('messages');
  const messageForm  = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const leaveBtn     = document.getElementById('leaveBtn');

  // ── Conectar a Socket.io ───────────────────────────────────────────────────
  const socket = io();

  // Al conectar, enviar nombre al servidor
  socket.on('connect', function () {
    socket.emit('join', username);
  });

  // ── Recibir historial ──────────────────────────────────────────────────────
  socket.on('history', function (messages) {
    messages.forEach(renderMessage);
    scrollToBottom();
  });

  // ── Recibir mensaje nuevo ──────────────────────────────────────────────────
  socket.on('chat message', function (msg) {
    renderMessage(msg);
    scrollToBottom();
  });

  // ── Indicador de escritura de sofIA ───────────────────────────────────────
  var sofiaTypingEl = null;

  socket.on('sofia_typing', function (isTyping) {
    if (isTyping) {
      if (sofiaTypingEl) return;
      sofiaTypingEl = document.createElement('div');
      sofiaTypingEl.className = 'event-msg sofia-typing';
      sofiaTypingEl.innerHTML = '<span class="sofia-badge">✨ dani</span> está escribiendo<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
      messagesEl.appendChild(sofiaTypingEl);
      scrollToBottom();
    } else {
      if (sofiaTypingEl) {
        sofiaTypingEl.remove();
        sofiaTypingEl = null;
      }
    }
  });

  // ── Evento de usuario (entró / salió) ─────────────────────────────────────
  socket.on('user_event', function (evt) {
    const div = document.createElement('div');
    div.className = 'event-msg';
    div.textContent = evt.text;          // textContent nunca ejecuta HTML
    messagesEl.appendChild(div);
    scrollToBottom();
  });

  // ── Enviar mensaje ─────────────────────────────────────────────────────────
  messageForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    // Sanitizar con DOMPurify antes de enviar (doble capa)
    const clean = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    if (!clean) return;
    socket.emit('chat message', clean);
    messageInput.value = '';
    messageInput.focus();
  });

  // ── Botón salir ────────────────────────────────────────────────────────────
  leaveBtn.addEventListener('click', function () {
    sessionStorage.removeItem('chat_username');
    window.location.href = 'index.html';
  });

  // ── Render de un mensaje ───────────────────────────────────────────────────
  function renderMessage(msg) {
    const isOwn   = msg.username === username;
    const isSofIA = msg.isSofIA === true || msg.username === 'Dani';

    const wrapper = document.createElement('div');
    wrapper.className = 'message ' + (isOwn ? 'own' : 'other') + (isSofIA ? ' sofia-msg' : '');

    // Meta (nombre + hora)
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const time = msg.timestamp ? formatTime(new Date(msg.timestamp)) : '';

    if (isSofIA) {
      meta.innerHTML = '<span class="sofia-badge">✨ Dani</span><span class="msg-time"> ' + time + '</span>';
    } else {
      meta.textContent = isOwn ? time : msg.username + '  ' + time;
      if (!isOwn) meta.style.color = msg.color;
    }

    // Burbuja
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble' + (isSofIA ? ' sofia-bubble' : '');
    // textContent = jamás interpreta HTML/JS → protección XSS en cliente
    bubble.textContent = msg.text;

    if (!isOwn && !isSofIA) {
      bubble.style.borderColor = msg.color;
    }

    wrapper.appendChild(meta);
    wrapper.appendChild(bubble);
    messagesEl.appendChild(wrapper);
  }

  // ── Scroll al final ────────────────────────────────────────────────────────
  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Formatear hora ─────────────────────────────────────────────────────────
  function formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

})();
