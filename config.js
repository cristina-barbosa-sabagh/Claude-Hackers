// ===================================================================
// Configuración de Supabase
// ===================================================================
// Estas keys son SEGURAS para frontend público.
// NUNCA pongas aquí la `sb_secret_...` o `service_role` key.
// ===================================================================

const SUPABASE_URL = 'https://rjabegfpuzdjccoxpsgv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dj00ZSkd-lMnbAY_Gl1xeQ_SEk7yTk1';

// ===================================================================
// Conteo de lecciones activas (excluye comingSoon)
// ===================================================================
// Actualizá este número CADA VEZ que una lección deje de ser
// comingSoon en modulesData (dashboard, leccion, logros, cursos, index).
// Es el UNICO número manual de progreso en todo el sistema.
// ===================================================================
window.ACTIVE_LESSON_COUNT = 20;

// Inicializa el cliente de Supabase (carga la librería desde el CDN en el HTML)
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// ===================================================================
// UTM + Referral + Channel capture (runs on every page load)
// ===================================================================
try {
  (function() {
    var params = new URLSearchParams(window.location.search);

    // Referral code
    var ref = params.get('ref');
    if (ref) localStorage.setItem('ch_ref', ref.trim().toUpperCase());

    // Referral channel
    var ch = params.get('ch');
    if (ch) localStorage.setItem('ch_ref_channel', ch);

    // UTMs — first touch: only store if no previous UTMs exist
    var utmKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    var utms = {};
    utmKeys.forEach(function(k) { var v = params.get(k); if (v) utms[k] = v; });
    if (Object.keys(utms).length > 0 && !localStorage.getItem('ch_utm')) {
      localStorage.setItem('ch_utm', JSON.stringify(utms));
    }
  })();
} catch (e) { /* localStorage may be blocked (incognito/Safari) — fail silently */ }

// ===================================================================
// Session tracking (runs on every page, throttled to 1 per 30min)
// ===================================================================
// Registrar sesión cuando la sesión de Supabase está confirmada (evita timing nulo)
function registrarSesion(s) {
  if (!s) return;
  try {
    var last = parseInt(localStorage.getItem('ch_last_session_ts') || '0');
    if (Date.now() - last < 1800000) return; // throttle 30 min
    localStorage.setItem('ch_last_session_ts', String(Date.now()));
    var page = location.pathname.split('/').pop().replace('.html', '') || 'index';
    supabaseClient.from('sesiones_usuario')
      .insert({ user_id: s.user.id, page: page })
      .then(function (r) { if (r && r.error) console.warn('sesion insert error:', r.error); });
  } catch (e) { console.warn('registrarSesion error:', e); }
}

// Dispara cuando la sesión se restaura/confirma (login, refresh de token, carga con sesión válida)
supabaseClient.auth.onAuthStateChange(function (event, session) {
  if (session) registrarSesion(session);
});

// Fallback: si ya había sesión al cargar (onAuthStateChange a veces no re-dispara en página ya logueada)
supabaseClient.auth.getSession().then(function (res) {
  if (res && res.data && res.data.session) registrarSesion(res.data.session);
});

// ===================================================================
// Activity tracking — heartbeat + flush to actividad_diaria
// Acumula segundos en memoria, flush cada 5 min o al cerrar pestaña.
// Solo corre si hay sesión activa.
// ===================================================================
(function () {
  var _at = {
    userId: null,
    token: null,
    segundosHoy: 0,
    segundosPendientes: 0,
    lastFlush: 0,
    heartbeatId: null,
    flushId: null,
    flushing: false,
    iniciado: false
  };

  function iniciarTracking(session) {
    if (_at.iniciado || !session || !session.user) return;
    _at.iniciado = true;
    _at.userId = session.user.id;
    _at.token = session.access_token;

    cargarSegundosHoy().then(function () {
      _at.heartbeatId = setInterval(function () {
        if (document.visibilityState === 'visible') {
          _at.segundosHoy += 30;
          _at.segundosPendientes += 30;
        }
      }, 30000);

      _at.flushId = setInterval(function () {
        flushActividad();
      }, 300000);

      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flushActividad();
      });

      window.addEventListener('beforeunload', function () {
        flushBeacon();
      });
    });
  }

  function cargarSegundosHoy() {
    var hoy = new Date().toISOString().slice(0, 10);
    return supabaseClient
      .from('actividad_diaria')
      .select('segundos_plataforma')
      .eq('user_id', _at.userId)
      .eq('fecha', hoy)
      .maybeSingle()
      .then(function (res) {
        if (res && res.data && res.data.segundos_plataforma) {
          _at.segundosHoy = res.data.segundos_plataforma;
        }
      })
      .catch(function (e) { console.warn('actividad: error cargando hoy:', e); });
  }

  function flushActividad() {
    if (!_at.userId || _at.segundosPendientes === 0 || _at.flushing) return;
    _at.flushing = true;
    var ahora = new Date().toISOString();
    var hoy = ahora.slice(0, 10);

    supabaseClient
      .from('actividad_diaria')
      .upsert({
        user_id: _at.userId,
        fecha: hoy,
        segundos_plataforma: _at.segundosHoy,
        primera_actividad: ahora,
        ultima_actividad: ahora
      }, { onConflict: 'user_id,fecha', ignoreDuplicates: false })
      .then(function (res) {
        if (res && res.error) {
          console.warn('actividad flush error:', res.error);
        } else {
          _at.segundosPendientes = 0;
          _at.lastFlush = Date.now();
        }
        _at.flushing = false;
      })
      .catch(function (e) {
        console.warn('actividad flush error:', e);
        _at.flushing = false;
      });
  }

  function flushBeacon() {
    if (!_at.userId || !_at.token || _at.segundosPendientes === 0) return;
    if (Date.now() - _at.lastFlush < 5000) return;

    var ahora = new Date().toISOString();
    var hoy = ahora.slice(0, 10);
    var url = SUPABASE_URL + '/rest/v1/actividad_diaria';
    var body = JSON.stringify({
      user_id: _at.userId,
      fecha: hoy,
      segundos_plataforma: _at.segundosHoy,
      primera_actividad: ahora,
      ultima_actividad: ahora
    });

    try {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY,
          'Authorization': 'Bearer ' + _at.token,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: body,
        keepalive: true
      });
    } catch (e) { /* silencioso */ }
  }

  supabaseClient.auth.onAuthStateChange(function (event, session) {
    if (session) {
      _at.token = session.access_token;
      iniciarTracking(session);
    }
  });

  supabaseClient.auth.getSession().then(function (res) {
    if (res && res.data && res.data.session) {
      iniciarTracking(res.data.session);
    }
  });
})();
