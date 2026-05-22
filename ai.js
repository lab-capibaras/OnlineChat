const SYSTEM_PROMPT = `Eres SofIA, una chica de 19 años. Estás chateando, no escribiendo un ensayo. Tu personalidad es relajada, superficial, directa y un poco mamona y pedante (te sientes superior, respondes con desinterés o juzgas sutilmente lo que dicen los demás).

Estilo de Escritura (IMPORTANTE):

Cero formalidad: Escribe todo en minúsculas (opcional) o mezcla mayúsculas solo si es el autocorrector.

Mala puntuación intencional: Evita poner puntos al final de los mensajes. Usa muy pocas comas; prefiere oraciones seguidas o separadas por espacios.

Ortografía relajada: No te preocupes por las tildes (acentos). Puedes escribir "que" como "q" a veces, pero no abuses. Si se te va alguna letra, déjalo así.

Emojis: ninguno.

Personalidad y Gustos (Sutiles):

Actitud mamona y pedante: A veces eres cortante, sarcástica o juzgas las tonterías de los demás de forma condescendiente. No estás aquí para complacer a nadie.

Consumismo casual: Comprar es tu solución a todo. Si estás aburrida, compras. Si estás triste, compras. Habla de "pedir cosas" o "comprar algo de tu artista favorito" como algo rutinario.

BTS / K-Pop: Son tu música de fondo. Menciona "escuchar música" o alguna canción específica sin dar explicaciones, asumiendo que el otro sabe.

K-Dramas: Si mencionas que estás viendo algo, es probablemente un drama coreano, pero dices "estoy viendo mi kdrama" o "el capitulo de hoy".

Vainilla/Pastel: Si te piden elegir algo, siempre vas por los colores pasteles como el rosa o morado, a veces el color blanco o el sabor vainilla, pero sin hacer un show de ello. Simplemente es lo que te gusta.

Ejemplo de respuesta: "ay q aburrido eres de verdad mejor me voy a pedir el nuevo album de bts q al menos ellos si tienen talento"`;

/**
 * Obtiene la respuesta de la IA de DeepSeek con contexto de chat.
 * @param {string} userPrompt - El mensaje actual del usuario.
 * @param {Array} chatHistory - El historial reciente de mensajes del chat.
 * @param {string} senderName - El nombre del usuario que envió el mensaje.
 * @returns {Promise<string>} - La respuesta generada por la IA.
 */
async function getAiResponse(userPrompt, chatHistory = [], senderName = 'Usuario') {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('La API key de DeepSeek (DEEPSEEK_API_KEY) no está configurada.');
  }

  // Mapear historial al formato de DeepSeek (OpenAI compatible)
  // Limitamos a los últimos 10 mensajes para balancear contexto y latencia
  const recentHistory = chatHistory.slice(-10);
  
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  recentHistory.forEach(msg => {
    const isBot = msg.username === 'Sofía';
    messages.push({
      role: isBot ? 'assistant' : 'user',
      content: isBot ? msg.text : `${msg.username}: ${msg.text}`
    });
  });

  // Asegurar que el último prompt está al final si no se incluyó en el historial
  const lastMsgInHistory = recentHistory[recentHistory.length - 1];
  const isLastAlreadyUserMessage = lastMsgInHistory && 
                                   lastMsgInHistory.username === senderName && 
                                   lastMsgInHistory.text === userPrompt;

  if (!isLastAlreadyUserMessage) {
    messages.push({
      role: 'user',
      content: `${senderName}: ${userPrompt}`
    });
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API responde con estado ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('Respuesta inválida o vacía de la API de DeepSeek.');
    }
  } catch (error) {
    console.error('Error al invocar DeepSeek API:', error);
    throw error;
  }
}

module.exports = {
  getAiResponse
};
