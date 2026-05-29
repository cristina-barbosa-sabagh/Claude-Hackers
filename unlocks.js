// =============================================================
// UNLOCKS — Referral-gated features
// =============================================================

const UNLOCK_THRESHOLDS = {
  skills: 8,
  comunidad: 16
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
    { id: 'comunidad', label: 'Comunidad', href: 'comunidad.html', threshold: UNLOCK_THRESHOLDS.comunidad, alwaysLink: true }
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

// Show unlock celebration modal with confetti
function showUnlockCelebration(unlockId, label, href) {
  return new Promise(resolve => {
    const existing = document.getElementById('unlockCelebModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'unlockCelebModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;justify-content:center;align-items:center;';

    const emoji = unlockId === 'skills' ? '⭐' : '💬';

    overlay.innerHTML = `
      <div id="unlockCelebBox" style="background:#141414;border:2px solid #ff6b1a;border-radius:16px;padding:40px;max-width:440px;width:90%;text-align:center;position:relative;overflow:hidden;">
        <div style="font-size:64px;margin-bottom:12px;">${emoji}</div>
        <div style="font-size:12px;font-weight:700;color:#ff6b1a;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">DESBLOQUEADO</div>
        <div style="font-size:22px;font-weight:700;color:#f5f1e8;margin-bottom:8px;">${label}</div>
        <div style="font-size:14px;color:#888;margin-bottom:24px;">Ya tienes acceso completo. Disfrutalo.</div>
        <div style="display:flex;gap:10px;justify-content:center;">
          <a href="${href}" style="flex:1;background:#ff6b1a;color:#fff;border:none;border-radius:8px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;text-align:center;font-family:'Inter',sans-serif;">Ir a ${label}</a>
          <button onclick="document.getElementById('unlockCelebModal').remove()" style="flex:1;background:#222;color:#f5f1e8;border:1px solid #333;border-radius:8px;padding:14px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;">Cerrar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Confetti
    const box = document.getElementById('unlockCelebBox');
    const colors = ['#ff6b1a', '#ff8534', '#f5f1e8', '#22c55e', '#fbbf24'];
    for (let i = 0; i < 30; i++) {
      const c = document.createElement('div');
      c.style.cssText = `position:absolute;width:8px;height:8px;top:-10px;left:${Math.random()*100}%;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>0.5?'50%':'0'};animation:confettiFallUnlock 1.5s ease-out ${Math.random()*0.5}s forwards;pointer-events:none;`;
      box.appendChild(c);
      setTimeout(() => c.remove(), 2500);
    }

    // Add keyframes if not present
    if (!document.getElementById('unlockConfettiStyle')) {
      const style = document.createElement('style');
      style.id = 'unlockConfettiStyle';
      style.textContent = `@keyframes confettiFallUnlock { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(300px) rotate(720deg); opacity: 0; } }`;
      document.head.appendChild(style);
    }

    // Resolve when closed or navigated
    const closeBtn = overlay.querySelector('button');
    closeBtn.addEventListener('click', resolve);
    overlay.querySelector('a').addEventListener('click', resolve);
  });
}
