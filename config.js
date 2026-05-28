// ===================================================================
// Configuración de Supabase
// ===================================================================
// Estas keys son SEGURAS para frontend público.
// NUNCA pongas aquí la `sb_secret_...` o `service_role` key.
// ===================================================================

const SUPABASE_URL = 'https://rjabegfpuzdjccoxpsgv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dj00ZSkd-lMnbAY_Gl1xeQ_SEk7yTk1';

// Inicializa el cliente de Supabase (carga la librería desde el CDN en el HTML)
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
