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
    ctx.fillText('Claude Hackers — 5 modulos, 18 lecciones', W / 2, H * 0.59);

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
    window.open(
      'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(shareUrl),
      '_blank'
    );
  }

  function compartirEnLinkedIn(tipo, datos, texto, shareUrl) {
    abrirLinkedIn(shareUrl);
  }

  // Public API
  return {
    generarImagenCompartible,
    descargarImagen,
    abrirLinkedIn,
    compartirEnLinkedIn
  };

})();
