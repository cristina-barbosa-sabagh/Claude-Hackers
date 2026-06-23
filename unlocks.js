// =============================================================
// UNLOCKS — Referral-gated features
// =============================================================

const UNLOCK_THRESHOLDS = {
  skills: 8,
  comunidad: 16,
  'videos-expertos': 20
};

async function getReferralCount(userId) {
  try {
    const { data, error } = await supabaseClient
      .from('referrals')
      .select('id, activated')
      .eq('referrer_id', userId);
    if (error) throw error;
    const all = data || [];
    return {
      total: all.length,
      active: all.filter(r => r.activated).length
    };
  } catch (err) {
    console.error('Error fetching referral count:', err);
    return { total: 0, active: 0 };
  }
}

async function checkUnlock(userId, unlockId) {
  const threshold = UNLOCK_THRESHOLDS[unlockId];
  if (!threshold) return { unlocked: false, count: 0, threshold: 0, alreadySeen: false };

  const refs = await getReferralCount(userId);
  const unlocked = refs.active >= threshold;

  let alreadySeen = false;
  if (unlocked) {
    try {
      const { data } = await supabaseClient
        .from('unlocks_vistos')
        .select('id')
        .eq('user_id', userId)
        .eq('unlock_id', unlockId)
        .maybeSingle();
      alreadySeen = !!data;
    } catch (e) {}
  }

  return { unlocked, count: refs.active, threshold, alreadySeen };
}

async function markUnlockAsSeen(userId, unlockId) {
  try {
    await supabaseClient
      .from('unlocks_vistos')
      .insert({ user_id: userId, unlock_id: unlockId });
  } catch (e) {
    console.error('Error marking unlock as seen:', e);
  }
}

// Render a small progress bar for sidebar locked items
function renderLockedProgress(current, threshold) {
  const pct = Math.min(Math.round((current / threshold) * 100), 100);
  return `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
    <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
      <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:2px;"></div>
    </div>
    <span style="font-size:9px;color:var(--muted);font-family:var(--font-mono);white-space:nowrap;">${current}/${threshold}</span>
  </div>`;
}

// Apply lock states to sidebar and mobile tabs
// Call after you have currentUserId set
async function applyUnlockStates(userId) {
  const refs = await getReferralCount(userId);
  const active = refs.active;

  // Check for skill bonuses
  let hasSkillBonus = false;
  try {
    const { data } = await supabaseClient
      .from('skill_bonuses')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    hasSkillBonus = (data && data.length > 0);
  } catch (e) {}

  const unlocks = [
    { id: 'skills', label: 'Skills', href: 'skills.html', threshold: UNLOCK_THRESHOLDS.skills, alwaysLink: true },
    { id: 'comunidad', label: 'Comunidad', href: 'comunidad.html', threshold: UNLOCK_THRESHOLDS.comunidad, alwaysLink: true },
    { id: 'videos-expertos', label: 'Videos Bonus', href: 'videos-expertos.html', threshold: UNLOCK_THRESHOLDS['videos-expertos'], alwaysLink: true }
  ];

  // Store on window for other uses
  window._unlocksData = { active, skills: active >= UNLOCK_THRESHOLDS.skills, comunidad: active >= UNLOCK_THRESHOLDS.comunidad, hasSkillBonus };

  for (const u of unlocks) {
    const unlocked = active >= u.threshold;
    // Skills always links to page (page handles locked state with blur)
    const alwaysLink = u.alwaysLink;

    // Update sidebar links
    const isSkillsItem = u.id === 'skills';
    document.querySelectorAll(`.sidebar-nav a[href="${u.href}"]`).forEach(el => {
      if (unlocked) {
        el.classList.add('unlocked-item');
        el.onclick = null;
      } else if (isSkillsItem && hasSkillBonus) {
        // Skills with bonus: show as partially unlocked, link normally
        el.classList.add('unlocked-item');
        el.onclick = null;
        if (!el.querySelector('.lock-progress')) {
          const hint = document.createElement('div');
          hint.className = 'lock-progress';
          hint.innerHTML = '<span style="font-size:9px;color:var(--accent);font-family:var(--font-mono);">1 desbloqueado</span>';
          el.appendChild(hint);
        }
      } else if (alwaysLink) {
        // Locked but navigable (shows locked page with blur)
        el.classList.add('locked-item');
        el.onclick = null;
        if (!el.querySelector('.lock-progress')) {
          const prog = document.createElement('div');
          prog.className = 'lock-progress';
          prog.innerHTML = renderLockedProgress(active, u.threshold);
          el.appendChild(prog);
        }
      } else {
        el.classList.add('locked-item');
        el.onclick = (e) => { e.preventDefault(); showLockModal(u.label, active, u.threshold); };
        if (!el.querySelector('.lock-progress')) {
          const prog = document.createElement('div');
          prog.className = 'lock-progress';
          prog.innerHTML = renderLockedProgress(active, u.threshold);
          el.appendChild(prog);
        }
      }
    });

    // Update mobile tabs
    document.querySelectorAll(`.mobile-tabs a[href="${u.href}"]`).forEach(el => {
      if (unlocked) {
        el.classList.add('unlocked-item');
        el.onclick = null;
      } else if (alwaysLink) {
        // Navigable but locked visually (only skills gets accent if has bonus)
        if (isSkillsItem && hasSkillBonus) el.classList.add('unlocked-item');
        else el.classList.add('locked-item');
        el.onclick = null;
      } else {
        el.classList.add('locked-item');
        el.onclick = (e) => { e.preventDefault(); showLockModal(u.label, active, u.threshold); };
      }
    });
  }

  // Check for first-time unlock celebrations
  for (const u of unlocks) {
    const unlocked = active >= u.threshold;
    if (!unlocked) continue;
    try {
      const { data } = await supabaseClient
        .from('unlocks_vistos')
        .select('id')
        .eq('user_id', userId)
        .eq('unlock_id', u.id)
        .maybeSingle();
      if (!data) {
        await showUnlockCelebration(u.id, u.label, u.href);
        await markUnlockAsSeen(userId, u.id);
      }
    } catch (e) {}
  }
}

// Show "locked" modal
function showLockModal(featureName, current, threshold) {
  const remaining = threshold - current;
  // Remove existing
  const existing = document.getElementById('lockModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lockModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;justify-content:center;align-items:center;';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div style="background:#141414;border:1px solid #333;border-radius:16px;padding:32px;max-width:420px;width:90%;text-align:center;position:relative;">
      <button onclick="this.closest('#lockModal').remove()" style="position:absolute;top:10px;right:14px;background:none;border:none;color:#888;font-size:20px;cursor:pointer;">&times;</button>
      <div style="font-size:48px;margin-bottom:12px;">🔒</div>
      <div style="font-size:18px;font-weight:700;color:#f5f1e8;margin-bottom:8px;">${featureName} esta bloqueado</div>
      <div style="font-size:14px;color:#888;margin-bottom:20px;">Te faltan <span style="color:#ff6b1a;font-weight:700;">${remaining} referrals</span> para desbloquear ${featureName}.</div>
      <div style="background:#222;border-radius:8px;overflow:hidden;height:8px;margin-bottom:20px;">
        <div style="width:${Math.round((current/threshold)*100)}%;height:100%;background:#ff6b1a;border-radius:8px;"></div>
      </div>
      <div style="font-size:12px;color:#888;margin-bottom:16px;font-family:'JetBrains Mono',monospace;">${current} / ${threshold} referrals activos</div>
      <button onclick="this.closest('#lockModal').remove();if(typeof openInviteModal==='function')openInviteModal();" style="width:100%;background:#ff6b1a;color:#fff;border:none;border-radius:8px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">Invitar amigos para desbloquear</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Show unlock celebration — uses reusable celebration.js
function showUnlockCelebration(unlockId, label, href) {
  const emoji = unlockId === 'skills' ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' : unlockId === 'videos-expertos' ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>' : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>';
  return showCelebration({
    tipo: 'skill',
    titulo: label + ' desbloqueado!',
    subtitulo: 'Ya tienes acceso completo. Disfrutalo.',
    icono: emoji
  });
}

// =============================================================
// MODULE UNLOCK — Time-gated + referral preview
// =============================================================
// Función pura: no toca DOM ni Supabase.
//
// Reglas:
//   - Módulo 1 siempre abierto.
//   - 1 módulo nuevo cada 4 días desde created_at.
//   - Con 5+ referidos activos: preview de la 1ª lección del siguiente módulo bloqueado.
//
// @param {string|Date} createdAt  — profiles_usuarios.created_at
// @param {number} activeReferrals — referidos con activated=true
// @param {Array} modulesData      — array de módulos con .lessons[].id
// @returns {object} estado de desbloqueo
function getUnlockState(createdAt, activeReferrals, modulesData) {
  var now = new Date();
  var start = new Date(createdAt);
  var msPerDay = 86400000;
  var daysElapsed = Math.floor((now - start) / msPerDay);

  // Módulos abiertos por tiempo: 1 base + 1 cada 4 días, máximo 5
  var openModules = Math.min(5, 1 + Math.floor(daysElapsed / 4));

  // Días hasta el próximo desbloqueo (mínimo 1 para evitar "0 días")
  var daysUntilNext = null;
  if (openModules < 5) {
    var nextUnlockDay = openModules * 4;
    daysUntilNext = Math.max(1, nextUnlockDay - daysElapsed);
  }

  // Preview: 5+ referidos activos desbloquea la 1ª lección del siguiente módulo
  var previewLesson = null;
  if (activeReferrals >= 5 && openModules < 5) {
    var nextModule = modulesData[openModules];
    if (nextModule && nextModule.lessons.length > 0) {
      previewLesson = nextModule.lessons[0].id;
    }
  }

  return {
    openModules: openModules,
    daysElapsed: daysElapsed,
    daysUntilNext: daysUntilNext,
    previewLesson: previewLesson
  };
}
