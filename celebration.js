// =============================================================
// CELEBRATION — Reusable Duolingo-style celebration component
// =============================================================
// Usage:
//   showCelebration({ tipo, titulo, subtitulo, icono, shareText })
//   Returns a Promise that resolves when the user closes the modal.
//
// tipo: 'leccion' | 'skill' | 'badge' | 'curso'
// titulo: main heading text
// subtitulo: secondary text
// icono: emoji string
// shareText: text for share buttons (optional, defaults per tipo)

(function () {
  // Inject styles once
  if (document.getElementById('celebrationStyles')) return;

  const style = document.createElement('style');
  style.id = 'celebrationStyles';
  style.textContent = `
    /* CELEBRATION OVERLAY */
    .celeb-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.82);
      z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .celeb-overlay.show { opacity: 1; pointer-events: auto; }

    /* MODAL BOX */
    .celeb-box {
      background: var(--background, #FAF4E9);
      border: 2px solid var(--accent, #ff6b1a);
      border-radius: 20px;
      padding: 40px 32px 32px;
      max-width: 420px; width: 92%;
      text-align: center;
      position: relative; overflow: hidden;
      transform: scale(0.6);
      opacity: 0;
      transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
    }
    .celeb-overlay.show .celeb-box {
      transform: scale(1); opacity: 1;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .celeb-box { transition: opacity 0.2s ease; transform: scale(1); }
      .celeb-overlay { transition: opacity 0.2s ease; }
      .celeb-icon-wrap { animation: none !important; }
      .celeb-confetti { display: none !important; }
      .celeb-sparkle { display: none !important; }
    }

    /* ICON */
    .celeb-icon-wrap {
      width: 88px; height: 88px;
      margin: 0 auto 20px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%;
      background: rgba(255,107,26,0.12);
      font-size: 44px;
      box-shadow: 0 0 0 0 rgba(255,107,26,0.4);
      animation: celebIconPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both,
                 celebIconGlow 2s ease-in-out 0.8s infinite;
    }
    @keyframes celebIconPop {
      0% { transform: scale(0) rotate(-20deg); opacity: 0; }
      60% { transform: scale(1.2) rotate(5deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }
    @keyframes celebIconGlow {
      0%, 100% { box-shadow: 0 0 24px rgba(255,107,26,0.25); }
      50% { box-shadow: 0 0 40px rgba(255,107,26,0.45); }
    }

    /* TITLE */
    .celeb-title {
      font-family: var(--font-pixel, 'Press Start 2P', monospace);
      font-size: 12px;
      color: var(--accent, #ff6b1a);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 8px;
      animation: celebFadeUp 0.4s ease 0.35s both;
    }

    /* HEADING */
    .celeb-heading {
      font-size: 22px; font-weight: 800;
      color: var(--foreground, #1A1A1A);
      margin-bottom: 6px;
      animation: celebFadeUp 0.4s ease 0.45s both;
    }

    /* SUBTITLE */
    .celeb-sub {
      font-size: 14px;
      color: var(--muted, #666);
      margin-bottom: 24px;
      line-height: 1.5;
      animation: celebFadeUp 0.4s ease 0.55s both;
    }

    @keyframes celebFadeUp {
      0% { opacity: 0; transform: translateY(12px); }
      100% { opacity: 1; transform: translateY(0); }
    }

    /* BUTTONS */
    .celeb-actions {
      display: flex; flex-direction: column; gap: 10px;
      animation: celebFadeUp 0.4s ease 0.65s both;
    }
    .celeb-btn-continue {
      width: 100%; padding: 14px;
      background: var(--accent, #ff6b1a); color: #000;
      border: none; border-radius: 10px;
      font-size: 14px; font-weight: 700;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: background 0.2s;
    }
    .celeb-btn-continue:hover { background: var(--accent-hover, #e55b10); }

    .celeb-share-toggle {
      width: 100%; padding: 12px;
      background: transparent;
      color: var(--foreground, #1A1A1A);
      border: 1px solid var(--border, #ddd);
      border-radius: 10px;
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: all 0.2s;
    }
    .celeb-share-toggle:hover {
      border-color: var(--accent, #ff6b1a);
      color: var(--accent, #ff6b1a);
    }

    /* SHARE PANEL (hidden by default) */
    .celeb-share-panel {
      display: none;
      gap: 8px;
      margin-top: 10px;
      animation: celebFadeUp 0.3s ease both;
    }
    .celeb-share-panel.show { display: flex; flex-wrap: wrap; justify-content: center; }

    .celeb-share-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 12px; font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      font-family: 'Inter', sans-serif;
      transition: opacity 0.2s;
      flex: 1; min-width: 100px; justify-content: center;
    }
    .celeb-share-btn:hover { opacity: 0.85; }
    .celeb-share-btn svg { width: 14px; height: 14px; flex-shrink: 0; }

    .celeb-share-wa { background: #25D366; color: #fff; }
    .celeb-share-x { background: #1A1A1A; color: #fff; }
    .celeb-share-li { background: #0A66C2; color: #fff; }
    .celeb-share-copy { background: var(--card-hover, #f0ece4); color: var(--foreground, #1A1A1A); border: 1px solid var(--border, #ddd); }

    /* CONFETTI */
    .celeb-confetti {
      position: absolute;
      width: 8px; height: 8px;
      top: -10px;
      pointer-events: none;
      animation: celebConfettiFall 1.8s ease-out forwards;
    }
    @keyframes celebConfettiFall {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      100% { transform: translateY(350px) rotate(720deg); opacity: 0; }
    }

    /* SPARKLES around icon */
    .celeb-sparkle {
      position: absolute;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--accent, #ff6b1a);
      pointer-events: none;
      animation: celebSparkleBurst 0.8s ease-out forwards;
    }
    @keyframes celebSparkleBurst {
      0% { transform: scale(0) translate(0, 0); opacity: 1; }
      100% { opacity: 0; }
    }

    /* RESPONSIVE */
    @media (max-width: 480px) {
      .celeb-box { padding: 32px 20px 24px; }
      .celeb-icon-wrap { width: 72px; height: 72px; font-size: 36px; }
      .celeb-heading { font-size: 18px; }
      .celeb-title { font-size: 10px; }
      .celeb-share-btn { padding: 10px 12px; font-size: 11px; min-width: 80px; }
    }
  `;
  document.head.appendChild(style);
})();

// Main function
function showCelebration({ tipo, titulo, subtitulo, icono, shareText }) {
  return new Promise(resolve => {
    try {
      // Remove any existing celebration
      const existing = document.getElementById('celebOverlay');
      if (existing) existing.remove();

      // Build share URL
      const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
      const refCode = (typeof userRefCode !== 'undefined' && userRefCode) ||
                      (typeof referralCode !== 'undefined' && referralCode) || '';
      const shareUrl = refCode ? base + '/?ref=' + refCode : base + '/';
      const ch = refCode ? function(c) { return '&ch=' + c; } : function() { return ''; };
      const defaultShareText = shareText || _celebDefaultShareText(tipo, titulo);
      const fullShareMsg = defaultShareText + ' ' + shareUrl + ch('wa');

      // Labels by tipo
      const labelMap = {
        leccion: 'Leccion completada',
        skill: 'Skill desbloqueado',
        badge: 'Insignia desbloqueada',
        curso: 'Curso completado'
      };
      const label = labelMap[tipo] || 'Logro desbloqueado';

      // Create overlay
      const overlay = document.createElement('div');
      overlay.id = 'celebOverlay';
      overlay.className = 'celeb-overlay';
      overlay.innerHTML = `
        <div class="celeb-box">
          <div class="celeb-icon-wrap">${icono || '🎉'}</div>
          <div class="celeb-title">${label}</div>
          <div class="celeb-heading">${titulo || 'Felicitaciones!'}</div>
          <div class="celeb-sub">${subtitulo || ''}</div>
          <div class="celeb-actions">
            <button class="celeb-btn-continue" id="celebContinueBtn">Continuar</button>
            <button class="celeb-share-toggle" id="celebShareToggle">Compartir mi logro 🚀</button>
            <div class="celeb-share-panel" id="celebSharePanel">
              <a class="celeb-share-btn celeb-share-wa" href="https://wa.me/?text=${encodeURIComponent(fullShareMsg)}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
              <a class="celeb-share-btn celeb-share-li" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl + ch('li'))}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                LinkedIn
              </a>
              <a class="celeb-share-btn celeb-share-x" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(defaultShareText)}&url=${encodeURIComponent(shareUrl + ch('x'))}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                X
              </a>
              <button class="celeb-share-btn celeb-share-copy" id="celebCopyBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                Copiar link
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Spawn confetti
      const box = overlay.querySelector('.celeb-box');
      const colors = ['#ff6b1a', '#d62828', '#FAF4E9', '#22c55e', '#fbbf24', '#ff8534'];
      for (let i = 0; i < 35; i++) {
        const c = document.createElement('div');
        c.className = 'celeb-confetti';
        c.style.left = Math.random() * 100 + '%';
        c.style.background = colors[Math.floor(Math.random() * colors.length)];
        c.style.animationDelay = Math.random() * 0.6 + 's';
        c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        c.style.width = (6 + Math.random() * 6) + 'px';
        c.style.height = (6 + Math.random() * 6) + 'px';
        box.appendChild(c);
        setTimeout(() => c.remove(), 2500);
      }

      // Spawn sparkles around icon
      const iconWrap = overlay.querySelector('.celeb-icon-wrap');
      const iconRect = { w: 88, h: 88 };
      for (let i = 0; i < 8; i++) {
        const s = document.createElement('div');
        s.className = 'celeb-sparkle';
        const angle = (i / 8) * Math.PI * 2;
        const dist = 50 + Math.random() * 20;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist;
        s.style.left = (iconRect.w / 2) + 'px';
        s.style.top = (iconRect.h / 2) + 'px';
        s.style.background = colors[Math.floor(Math.random() * colors.length)];
        s.style.animation = `celebSparkleBurst 0.8s ease-out ${0.3 + i * 0.05}s forwards`;
        s.style.setProperty('--tx', tx + 'px');
        s.style.setProperty('--ty', ty + 'px');
        // Override animation with inline transform endpoint
        s.animate([
          { transform: 'scale(0) translate(0,0)', opacity: 1 },
          { transform: `scale(1.5) translate(${tx}px, ${ty}px)`, opacity: 0 }
        ], { duration: 800, delay: 300 + i * 50, fill: 'forwards', easing: 'ease-out' });
        iconWrap.style.position = 'relative';
        iconWrap.appendChild(s);
        setTimeout(() => s.remove(), 1500);
      }

      // Trigger show
      requestAnimationFrame(() => {
        requestAnimationFrame(() => overlay.classList.add('show'));
      });

      // Close handler
      function close() {
        overlay.classList.remove('show');
        setTimeout(() => { overlay.remove(); resolve(); }, 300);
      }

      overlay.querySelector('#celebContinueBtn').addEventListener('click', close);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });

      // Share toggle
      overlay.querySelector('#celebShareToggle').addEventListener('click', function () {
        const panel = overlay.querySelector('#celebSharePanel');
        panel.classList.toggle('show');
        this.style.display = panel.classList.contains('show') ? 'none' : '';
      });

      // Copy link
      overlay.querySelector('#celebCopyBtn').addEventListener('click', function () {
        navigator.clipboard.writeText(shareUrl + ch('cp')).then(() => {
          this.innerHTML = '<span style="color:#059669;">&#10003; Copiado</span>';
          if (typeof showToast === 'function') showToast('Link copiado al portapapeles');
          setTimeout(() => { this.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copiar link'; }, 2000);
        });
      });

      console.log('[CH-DEBUG] showCelebration: displayed tipo=' + tipo + ', titulo=' + titulo);
    } catch (err) {
      console.error('[CH-DEBUG] showCelebration error:', err);
      resolve(); // Never block the flow
    }
  });
}

function _celebDefaultShareText(tipo, titulo) {
  switch (tipo) {
    case 'leccion':
      return 'Acabo de completar una leccion en Claude Hackers! Aprende a dominar Claude gratis:';
    case 'skill':
      return 'Desbloquee un nuevo Skill en Claude Hackers: ' + (titulo || '') + '. Aprende gratis:';
    case 'badge':
      return 'Gane la insignia "' + (titulo || '') + '" en Claude Hackers! Aprende a dominar Claude gratis:';
    case 'curso':
      return 'Complete Claude Hackers - 6 modulos y 20 lecciones para dominar Claude! Inscribete gratis:';
    default:
      return 'Estoy avanzando en Claude Hackers! Aprende a dominar Claude gratis:';
  }
}
