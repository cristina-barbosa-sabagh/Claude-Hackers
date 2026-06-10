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
