// ===================================================================
// notifications.js — Centro de notificaciones in-app (campanita)
// ===================================================================
// Depende de config.js (define el global `supabaseClient`).
// Se auto-inyecta en el nav (.user-area) en cualquier página logueada.
// Lee de la tabla `notificaciones` con realtime + RLS.
//
// Para editar los textos/íconos de cada tipo: ver NOTIF_TIPOS abajo.
// ===================================================================

(function () {
  'use strict';

  if (window.__notifInit) return;       // evita doble init
  window.__notifInit = true;

  var LIMIT = 15;

  // --- Config por tipo (Dylan puede editar textos/íconos acá) ----------
  var ICON = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/>'
  };

  var NOTIF_TIPOS = {
    logro:             { icon: ICON.trophy,   color: '#b45309', bg: 'rgba(245,158,11,0.12)', text: function () { return 'Desbloqueaste un nuevo logro'; } },
    skill:             { icon: ICON.bolt,     color: '#6d28d9', bg: 'rgba(139,92,246,0.12)', text: function () { return 'Nueva skill desbloqueada'; } },
    referido:          { icon: ICON.users,    color: '#1d4ed8', bg: 'rgba(59,130,246,0.12)', text: function () { return 'Un amigo activó tu link de referido'; } },
    bienvenida:        { icon: ICON.sparkles, color: '#15803d', bg: 'rgba(34,197,94,0.12)',  text: function () { return '¡Te damos la bienvenida a Claude Hackers!'; } },
    modulo_completado: { icon: ICON.grid,     color: '#c2410c', bg: 'rgba(242,98,42,0.12)',  text: function (n) { return 'Completaste el Módulo ' + (n.referencia || ''); } }
  };
  var FALLBACK = { icon: ICON.bell, color: '#5f5e5a', bg: 'rgba(0,0,0,0.06)', text: function () { return 'Tenés una notificación nueva'; } };

  function cfg(n) { return NOTIF_TIPOS[n.tipo] || FALLBACK; }

  // --- Tiempo relativo en español --------------------------------------
  function rel(ts) {
    var d = new Date(ts), now = new Date(), s = Math.floor((now - d) / 1000);
    if (s < 60) return 'recién';
    var m = Math.floor(s / 60); if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60); if (h < 24) return 'hace ' + h + ' h';
    var days = Math.floor(h / 24); if (days === 1) return 'ayer';
    if (days < 7) return 'hace ' + days + ' días';
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // --- Estilos (inyectados, no tocan theme.css) ------------------------
  function injectStyles() {
    if (document.getElementById('notif-styles')) return;
    var css = ''
      + '.notif-wrap{position:relative;display:flex;align-items:center}'
      + '.notif-bell{position:relative;width:40px;height:40px;border-radius:50%;border:1px solid var(--border,#e4e2db);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,transform .15s;padding:0}'
      + '.notif-bell:hover{background:#f6f5f2;transform:scale(1.05)}'
      + '.notif-bell svg{width:21px;height:21px;stroke:var(--foreground,#1a1a1a);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
      + '.notif-badge{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent,#F2622A);color:#fff;font-size:10.5px;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid #fff;box-sizing:border-box}'
      + '.notif-badge.show{display:flex}'
      + '.notif-panel{position:absolute;top:52px;right:0;width:380px;max-width:calc(100vw - 24px);background:#fff;border:1px solid var(--border,#e4e2db);border-radius:14px;box-shadow:0 10px 36px rgba(0,0,0,.13);overflow:hidden;opacity:0;visibility:hidden;transform:translateY(-6px);transition:opacity .15s,transform .15s,visibility .15s;z-index:120}'
      + '.notif-panel.open{opacity:1;visibility:visible;transform:translateY(0)}'
      + '.notif-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #efedea}'
      + '.notif-head b{font-size:15px;font-weight:600;color:var(--foreground,#1a1a1a)}'
      + '.notif-readall{font-size:12px;color:var(--accent,#F2622A);cursor:pointer;background:none;border:none;padding:0}'
      + '.notif-readall:hover{text-decoration:underline}'
      + '.notif-list{max-height:420px;overflow-y:auto}'
      + '.notif-item{display:flex;gap:12px;padding:13px 16px;cursor:pointer;position:relative;border:none;background:none;width:100%;text-align:left}'
      + '.notif-item:hover{background:#faf9f7}'
      + '.notif-item.unread{background:rgba(242,98,42,.05)}'
      + '.notif-item.unread:hover{background:rgba(242,98,42,.08)}'
      + '.notif-ic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
      + '.notif-ic svg{width:18px;height:18px;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
      + '.notif-body{min-width:0;flex:1}'
      + '.notif-txt{font-size:13.5px;color:var(--foreground,#1a1a1a);line-height:1.35}'
      + '.notif-item:not(.unread) .notif-txt{color:#5f5e5a}'
      + '.notif-time{font-size:11.5px;color:#8a8780;margin-top:2px}'
      + '.notif-dot{position:absolute;top:18px;right:14px;width:8px;height:8px;border-radius:50%;background:var(--accent,#F2622A)}'
      + '.notif-empty{padding:34px 16px;text-align:center;color:#8a8780;font-size:13px}'
      + '@media(max-width:480px){.notif-panel{position:fixed;top:60px;right:12px;left:12px;width:auto}}';
    var s = document.createElement('style');
    s.id = 'notif-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // --- Render -----------------------------------------------------------
  var state = { items: [], open: false, uid: null, els: {} };

  function unreadCount() {
    return state.items.reduce(function (a, n) { return a + (n.leida ? 0 : 1); }, 0);
  }

  function renderBadge() {
    var c = unreadCount();
    var b = state.els.badge;
    if (!b) return;
    b.textContent = c > 9 ? '9+' : String(c);
    b.classList.toggle('show', c > 0);
  }

  function renderList() {
    var list = state.els.list;
    if (!list) return;
    if (!state.items.length) {
      list.innerHTML = '<div class="notif-empty">No tenés notificaciones todavía.</div>';
      return;
    }
    list.innerHTML = state.items.map(function (n) {
      var c = cfg(n);
      return '<button class="notif-item ' + (n.leida ? '' : 'unread') + '" data-id="' + esc(n.id) + '">'
        + '<span class="notif-ic" style="background:' + c.bg + ';color:' + c.color + '">'
        + '<svg viewBox="0 0 24 24" stroke="currentColor">' + c.icon + '</svg></span>'
        + '<span class="notif-body"><span class="notif-txt">' + esc(c.text(n)) + '</span>'
        + '<span class="notif-time">' + rel(n.created_at) + '</span></span>'
        + (n.leida ? '' : '<span class="notif-dot"></span>')
        + '</button>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.notif-item'), function (el) {
      el.addEventListener('click', function () { onItemClick(el.getAttribute('data-id')); });
    });
  }

  function render() { renderBadge(); renderList(); }

  // --- Acciones ---------------------------------------------------------
  function onItemClick(id) {
    var n = state.items.find(function (x) { return x.id === id; });
    if (!n) return;
    if (!n.leida) {
      n.leida = true; render();
      supabaseClient.from('notificaciones').update({ leida: true }).eq('id', id).then(function () {}, function () {});
    }
    if (n.link) window.location.href = n.link;
  }

  function markAllRead() {
    var changed = false;
    state.items.forEach(function (n) { if (!n.leida) { n.leida = true; changed = true; } });
    if (!changed) return;
    render();
    supabaseClient.from('notificaciones').update({ leida: true })
      .eq('user_id', state.uid).eq('leida', false).then(function () {}, function () {});
  }

  function toggle(forceClose) {
    state.open = forceClose ? false : !state.open;
    state.els.panel.classList.toggle('open', state.open);
  }

  // --- Datos ------------------------------------------------------------
  function fetchNotifs() {
    return supabaseClient.from('notificaciones')
      .select('id, tipo, referencia, link, leida, created_at')
      .eq('user_id', state.uid)
      .order('created_at', { ascending: false })
      .limit(LIMIT)
      .then(function (res) {
        state.items = res.data || [];
        render();
      });
  }

  function subscribeRealtime() {
    supabaseClient.channel('notif-' + state.uid)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificaciones', filter: 'user_id=eq.' + state.uid },
        function (payload) {
          if (payload.eventType === 'INSERT') {
            if (!state.items.some(function (n) { return n.id === payload.new.id; })) {
              state.items.unshift(payload.new);
              if (state.items.length > LIMIT) state.items.pop();
            }
          } else if (payload.eventType === 'UPDATE') {
            var i = state.items.findIndex(function (n) { return n.id === payload.new.id; });
            if (i >= 0) state.items[i] = payload.new;
          } else if (payload.eventType === 'DELETE') {
            state.items = state.items.filter(function (n) { return n.id !== payload.old.id; });
          }
          render();
        })
      .subscribe();
  }

  // --- Montaje ----------------------------------------------------------
  function mount(area) {
    injectStyles();
    var wrap = document.createElement('div');
    wrap.className = 'notif-wrap';
    wrap.innerHTML = ''
      + '<button class="notif-bell" aria-label="Notificaciones">'
      + '<svg viewBox="0 0 24 24">' + ICON.bell + '</svg>'
      + '<span class="notif-badge" aria-hidden="true"></span></button>'
      + '<div class="notif-panel" role="dialog" aria-label="Notificaciones">'
      + '<div class="notif-head"><b>Notificaciones</b>'
      + '<button class="notif-readall" type="button">Marcar todas como leídas</button></div>'
      + '<div class="notif-list"></div></div>';
    area.insertBefore(wrap, area.firstChild);

    state.els.badge = wrap.querySelector('.notif-badge');
    state.els.panel = wrap.querySelector('.notif-panel');
    state.els.list = wrap.querySelector('.notif-list');

    wrap.querySelector('.notif-bell').addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    wrap.querySelector('.notif-readall').addEventListener('click', function (e) { e.stopPropagation(); markAllRead(); });
    state.els.panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { if (state.open) toggle(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) toggle(true); });

    fetchNotifs().then(subscribeRealtime);
  }

  // --- Init: espera supabaseClient + sesión + nav ----------------------
  function init() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    var area = document.querySelector('.user-area');
    if (!area) return;                  // página sin nav logueado → no hace nada
    supabaseClient.auth.getUser().then(function (res) {
      var user = res && res.data && res.data.user;
      if (!user) return;                // no logueado → no monta campanita
      state.uid = user.id;
      mount(area);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
