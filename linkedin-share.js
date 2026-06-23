// =============================================================
// LINKEDIN SHARE — Image Generator & Share Flow
// =============================================================

const LinkedInShare = (() => {

  // Design tokens
  const W = 1200, H = 630;
  const BG_DARK = '#0a0a0a';
  const ACCENT = '#ff6b1a';
  const FG = '#f5f1e8';
  const MUTED = '#888888';
  const LINKEDIN_BLUE = '#0A66C2';

  // Font loading helper — preload Inter via FontFace API
  let fontsReady = false;
  async function ensureFonts() {
    if (fontsReady) return;
    try {
      await document.fonts.load('700 48px Inter');
      await document.fonts.load('400 20px Inter');
      await document.fonts.load('400 16px "JetBrains Mono"');
    } catch (e) { /* fonts may already be loaded */ }
    fontsReady = true;
  }

  // Draw rounded rectangle
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // Draw shared background
  function drawBackground(ctx) {
    // Gradient: dark with subtle orange glow
    const grad = ctx.createRadialGradient(W * 0.7, H * 0.3, 50, W * 0.5, H * 0.5, W * 0.8);
    grad.addColorStop(0, 'rgba(255,107,26,0.12)');
    grad.addColorStop(1, BG_DARK);
    ctx.fillStyle = BG_DARK;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Top accent line
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, W, 4);
  }

  // Draw logo top-left
  function drawLogo(ctx) {
    // CH mark
    roundRect(ctx, 48, 36, 44, 44, 10);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.font = '700 20px Inter, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CH', 70, 58);

    // Text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 18px Inter, sans-serif';
    ctx.fillStyle = FG;
    ctx.fillText('Claude Hackers', 104, 50);
    ctx.font = '400 11px Inter, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText('by Growth Rockstar', 104, 68);
  }

  // Draw footer
  function drawFooter(ctx, refCode) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 14px "JetBrains Mono", monospace';
    ctx.fillStyle = MUTED;
    ctx.fillText('claudehackers.com', W / 2, H - 40);
    if (refCode) {
      ctx.font = '400 12px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255,107,26,0.6)';
      ctx.fillText('ref: ' + refCode, W / 2, H - 20);
    }
  }

  // Word wrap helper
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ── Image generators ──

  function generateBadgeImage(ctx, data) {
    // data: { icon, name }
    drawBackground(ctx);
    drawLogo(ctx);

    // Badge icon (emoji) — large centered
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '120px serif';
    ctx.fillText(data.icon, W / 2, H * 0.38);

    // "INSIGNIA DESBLOQUEADA" label
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillStyle = ACCENT;
    ctx.letterSpacing = '3px';
    ctx.fillText('INSIGNIA DESBLOQUEADA', W / 2, H * 0.55);

    // Badge name
    ctx.font = '700 32px Inter, sans-serif';
    ctx.fillStyle = FG;
    const nameLines = wrapText(ctx, data.name, W * 0.7);
    nameLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, H * 0.63 + i * 40);
    });

    drawFooter(ctx, data.refCode);
  }

  function generateStreakImage(ctx, data) {
    // data: { dias }
    drawBackground(ctx);
    drawLogo(ctx);

    // Fire emoji
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '80px serif';
    ctx.fillText('🔥', W / 2, H * 0.3);

    // Big number
    ctx.font = '900 96px Inter, sans-serif';
    ctx.fillStyle = ACCENT;
    ctx.fillText(data.dias.toString(), W / 2, H * 0.48);

    // Label
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillStyle = FG;
    ctx.fillText('dias consecutivos aprendiendo', W / 2, H * 0.6);

    // Sub
    ctx.font = '400 16px Inter, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText('Claude & Claude Code para negocios', W / 2, H * 0.68);

    drawFooter(ctx, data.refCode);
  }

  function generateModuleImage(ctx, data) {
    // data: { num, name }
    drawBackground(ctx);
    drawLogo(ctx);

    // Checkmark circle
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.32, 48, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.font = '700 40px Inter, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', W / 2, H * 0.32);

    // "MODULO COMPLETADO"
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillStyle = ACCENT;
    ctx.fillText('MODULO ' + data.num + ' COMPLETADO', W / 2, H * 0.48);

    // Module name
    ctx.font = '700 32px Inter, sans-serif';
    ctx.fillStyle = FG;
    const nameLines = wrapText(ctx, data.name, W * 0.7);
    nameLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, H * 0.56 + i * 40);
    });

    drawFooter(ctx, data.refCode);
  }

  function generateCourseCompleteImage(ctx, data) {
    // data: {}
    drawBackground(ctx);
    drawLogo(ctx);

    // Trophy
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '100px serif';
    ctx.fillText('🏆', W / 2, H * 0.32);

    // Title
    ctx.font = '900 40px Inter, sans-serif';
    ctx.fillStyle = ACCENT;
    ctx.fillText('CURSO COMPLETADO', W / 2, H * 0.5);

    // Sub
    ctx.font = '600 22px Inter, sans-serif';
    ctx.fillStyle = FG;
    ctx.fillText('Claude Hackers — 5 modulos, 20 lecciones', W / 2, H * 0.59);

    ctx.font = '400 16px Inter, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText('Dominio de Claude y Claude Code para negocios', W / 2, H * 0.66);

    drawFooter(ctx, data.refCode);
  }

  // ── Main API ──

  async function generarImagenCompartible(tipo, datos) {
    await ensureFonts();

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    switch (tipo) {
      case 'badge_desbloqueado': generateBadgeImage(ctx, datos); break;
      case 'streak_milestone': generateStreakImage(ctx, datos); break;
      case 'modulo_completado': generateModuleImage(ctx, datos); break;
      case 'curso_completado': generateCourseCompleteImage(ctx, datos); break;
      default: throw new Error('Tipo no soportado: ' + tipo);
    }

    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/png');
    });
  }

  function descargarImagen(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'claude-hackers.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function abrirLinkedIn(shareUrl) {
    const linkedInUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(shareUrl);
    window.open(linkedInUrl, '_blank', 'width=600,height=600');
  }

  // Full share flow: generate image, download, open LinkedIn, show copy-text popup
  async function compartirEnLinkedIn(tipo, datos, texto, shareUrl) {
    try {
      const blob = await generarImagenCompartible(tipo, datos);
      const filename = 'claude-hackers-' + tipo.replace(/_/g, '-') + '.png';
      descargarImagen(blob, filename);

      // Small delay so download triggers before popup
      setTimeout(() => {
        abrirLinkedIn(shareUrl);
        mostrarPopupTexto(texto);
      }, 500);
    } catch (err) {
      console.error('Error sharing to LinkedIn:', err);
    }
  }

  // Show a floating popup with copyable text
  function mostrarPopupTexto(texto) {
    // Remove existing
    const existing = document.getElementById('linkedinTextPopup');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'linkedinTextPopup';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;justify-content:center;align-items:center;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div style="background:#141414;border:1px solid #333;border-radius:16px;padding:28px;max-width:500px;width:90%;position:relative;">
        <button onclick="this.closest('#linkedinTextPopup').remove()" style="position:absolute;top:10px;right:14px;background:none;border:none;color:#888;font-size:20px;cursor:pointer;">&times;</button>
        <div style="font-size:15px;font-weight:700;color:#f5f1e8;margin-bottom:4px;">Imagen descargada ✓</div>
        <div style="font-size:13px;color:#888;margin-bottom:16px;">En LinkedIn, sube la imagen y pega este texto:</div>
        <textarea id="linkedinTextArea" readonly style="width:100%;height:120px;background:#0a0a0a;border:1px solid #333;border-radius:8px;padding:12px;color:#f5f1e8;font-size:13px;font-family:'Inter',sans-serif;resize:none;line-height:1.5;">${texto.replace(/"/g, '&quot;')}</textarea>
        <button onclick="navigator.clipboard.writeText(document.getElementById('linkedinTextArea').value);this.textContent='Copiado!';setTimeout(()=>this.textContent='Copiar texto',2000)" style="margin-top:12px;width:100%;background:#ff6b1a;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">Copiar texto</button>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  // Public API
  return {
    generarImagenCompartible,
    descargarImagen,
    abrirLinkedIn,
    compartirEnLinkedIn,
    mostrarPopupTexto
  };

})();
