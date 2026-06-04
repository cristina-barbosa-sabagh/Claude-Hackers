// ===================================================================
// Chat Widget — Asistente IA flotante para Claude Hackers
// Se incluye en todas las paginas via <script src="chat-widget.js">
// Requiere: supabaseClient (de config.js) ya cargado
// ===================================================================

(function () {
  // Evitar doble carga
  if (document.getElementById('chChatWidget')) return;

  // ---------------------------------------------------------------
  // CSS
  // ---------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    /* Boton flotante */
    .ch-chat-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--accent, #ff5c00);
      color: #000;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(255,92,0,0.3), 0 0 0 0 rgba(255,92,0,0.2);
      z-index: 9999;
      transition: transform 0.25s, box-shadow 0.25s;
      -webkit-tap-highlight-color: transparent;
      outline: none;
    }
    .ch-chat-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 4px 28px rgba(255,92,0,0.45), 0 0 0 4px rgba(255,92,0,0.1);
    }
    .ch-chat-fab svg { width: 24px; height: 24px; }

    /* Panel */
    .ch-chat-panel {
      position: fixed;
      bottom: 88px;
      right: 24px;
      width: 370px;
      max-height: 520px;
      background: #1a1a1a;
      border: 1px solid rgba(255,92,0,0.2);
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 30px rgba(255,92,0,0.06);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 9998;
      animation: chChatSlideUp 0.3s cubic-bezier(0.16,1,0.3,1);
    }
    .ch-chat-panel.open { display: flex; }
    @keyframes chChatSlideUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Header */
    .ch-chat-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
    .ch-chat-header-dot {
      width: 8px; height: 8px;
      background: #22c55e;
      border-radius: 50%;
      flex-shrink: 0;
      animation: pulse-dot 2s infinite;
    }
    .ch-chat-header-title {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.85);
      flex: 1;
    }
    .ch-chat-close {
      background: none; border: none; cursor: pointer;
      color: rgba(255,255,255,0.4); padding: 4px;
      transition: color 0.2s;
      outline: none;
    }
    .ch-chat-close:hover { color: rgba(255,255,255,0.8); }

    /* Mensajes */
    .ch-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 200px;
    }
    .ch-chat-messages::-webkit-scrollbar { width: 4px; }
    .ch-chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .ch-chat-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
    }
    .ch-chat-msg.user {
      align-self: flex-end;
      background: var(--accent, #ff5c00);
      color: #000;
      border-bottom-right-radius: 4px;
    }
    .ch-chat-msg.assistant {
      align-self: flex-start;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.85);
      border-bottom-left-radius: 4px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .ch-chat-msg.typing {
      font-style: italic;
      color: rgba(255,255,255,0.4);
    }
    .ch-chat-msg.error {
      color: #ef4444;
      border-color: rgba(239,68,68,0.2);
    }

    /* Input */
    .ch-chat-input-row {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
    .ch-chat-input {
      flex: 1;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }
    .ch-chat-input::placeholder { color: rgba(255,255,255,0.3); }
    .ch-chat-input:focus { border-color: rgba(255,92,0,0.4); }
    .ch-chat-send {
      width: 38px; height: 38px;
      border-radius: 8px;
      background: var(--accent, #ff5c00);
      color: #000;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.2s;
      outline: none;
    }
    .ch-chat-send:disabled { opacity: 0.4; cursor: default; }
    .ch-chat-send svg { width: 16px; height: 16px; }

    /* Login prompt */
    .ch-chat-login {
      padding: 24px 16px;
      text-align: center;
      color: rgba(255,255,255,0.5);
      font-size: 13px;
      line-height: 1.5;
    }
    .ch-chat-login a {
      color: var(--accent, #ff5c00);
      text-decoration: underline;
    }

    /* Mobile */
    @media (max-width: 480px) {
      .ch-chat-panel {
        right: 12px;
        left: 12px;
        bottom: 80px;
        width: auto;
        max-height: 70vh;
      }
      .ch-chat-fab {
        bottom: 16px;
        right: 16px;
        width: 48px;
        height: 48px;
      }
    }
  `;
  document.head.appendChild(style);

  // ---------------------------------------------------------------
  // HTML
  // ---------------------------------------------------------------
  const widget = document.createElement('div');
  widget.id = 'chChatWidget';
  widget.innerHTML = `
    <button class="ch-chat-fab" id="chChatFab" aria-label="Abrir asistente">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    <div class="ch-chat-panel" id="chChatPanel">
      <div class="ch-chat-header">
        <div class="ch-chat-header-dot"></div>
        <span class="ch-chat-header-title">Asistente Claude Hackers</span>
        <button class="ch-chat-close" id="chChatClose" aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="ch-chat-messages" id="chChatMessages">
        <div class="ch-chat-msg assistant">Hola! Soy el asistente de Claude Hackers. Preguntame lo que quieras sobre el curso, coding o Claude.</div>
      </div>
      <div id="chChatInputArea"></div>
    </div>
  `;
  document.body.appendChild(widget);

  // ---------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------
  const chatHistory = []; // { role, content } para enviar a la API
  let sending = false;

  const fab = document.getElementById('chChatFab');
  const panel = document.getElementById('chChatPanel');
  const closeBtn = document.getElementById('chChatClose');
  const messagesDiv = document.getElementById('chChatMessages');
  const inputArea = document.getElementById('chChatInputArea');

  // ---------------------------------------------------------------
  // Toggle panel
  // ---------------------------------------------------------------
  fab.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('open');
    if (isOpen) renderInputArea();
  });
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  // ---------------------------------------------------------------
  // Renderizar input o mensaje de login
  // ---------------------------------------------------------------
  function renderInputArea() {
    const session = typeof supabaseClient !== 'undefined' ? null : undefined;
    // Intentar obtener sesion
    if (typeof supabaseClient !== 'undefined') {
      supabaseClient.auth.getSession().then(({ data }) => {
        if (data?.session?.user) {
          showInput();
        } else {
          showLoginPrompt();
        }
      });
    } else {
      showInput(); // Sin supabase, igual funciona el chat
    }
  }

  function showLoginPrompt() {
    inputArea.innerHTML = `
      <div class="ch-chat-login">
        Para usar el asistente, <a href="login.html">inicia sesion</a> primero.
      </div>
    `;
  }

  function showInput() {
    if (inputArea.querySelector('.ch-chat-input-row')) return;
    inputArea.innerHTML = `
      <div class="ch-chat-input-row">
        <input type="text" class="ch-chat-input" id="chChatInput" placeholder="Escribi tu pregunta..." autocomplete="off" />
        <button class="ch-chat-send" id="chChatSend" aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;
    const input = document.getElementById('chChatInput');
    const sendBtn = document.getElementById('chChatSend');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    sendBtn.addEventListener('click', sendMessage);
    input.focus();
  }

  // ---------------------------------------------------------------
  // Agregar burbuja al chat
  // ---------------------------------------------------------------
  function addBubble(text, role, extraClass) {
    const div = document.createElement('div');
    div.className = 'ch-chat-msg ' + role + (extraClass ? ' ' + extraClass : '');
    div.textContent = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return div;
  }

  // ---------------------------------------------------------------
  // Enviar mensaje
  // ---------------------------------------------------------------
  async function sendMessage() {
    if (sending) return;
    const input = document.getElementById('chChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addBubble(text, 'user');
    chatHistory.push({ role: 'user', content: text });

    sending = true;
    const sendBtn = document.getElementById('chChatSend');
    if (sendBtn) sendBtn.disabled = true;

    const typingBubble = addBubble('Escribiendo...', 'assistant', 'typing');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory })
      });

      const data = await res.json();

      // Quitar burbuja de "escribiendo"
      typingBubble.remove();

      if (!res.ok || data.error) {
        addBubble(data.error || 'Error al obtener respuesta.', 'assistant', 'error');
        // Quitar el ultimo mensaje del historial si fallo
        chatHistory.pop();
      } else {
        const respuesta = data.response;
        addBubble(respuesta, 'assistant');
        chatHistory.push({ role: 'assistant', content: respuesta });

        // Guardar en Supabase
        guardarEnSupabase(text, respuesta);
      }
    } catch (err) {
      typingBubble.remove();
      addBubble('No pude conectar con el asistente. Revisa tu conexion.', 'assistant', 'error');
      chatHistory.pop();
    } finally {
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
      const inp = document.getElementById('chChatInput');
      if (inp) inp.focus();
    }
  }

  // ---------------------------------------------------------------
  // Guardar pregunta + respuesta en Supabase
  // ---------------------------------------------------------------
  async function guardarEnSupabase(pregunta, respuesta) {
    try {
      if (typeof supabaseClient === 'undefined') return;
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      // Detectar leccion_id desde la URL (?id=1-1)
      const params = new URLSearchParams(window.location.search);
      const leccionId = params.get('id') || null;

      // Nombre de la pagina actual
      const pagina = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

      await supabaseClient.from('chat_mensajes').insert({
        user_id: user.id,
        pregunta: pregunta,
        respuesta: respuesta,
        leccion_id: leccionId,
        pagina: pagina,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('[chat-widget] Error guardando en Supabase:', err);
    }
  }

  // Render input on load if panel is open (it won't be, but just in case)
  renderInputArea();
})();
