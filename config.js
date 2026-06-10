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
