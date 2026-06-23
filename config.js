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
