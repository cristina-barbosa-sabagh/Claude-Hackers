-- ===================================================================
-- CLAUDE HACKERS — Fase 3: Estructura de base de datos
-- ===================================================================
-- Ejecutar en: Supabase SQL Editor (copiar y pegar completo)
-- Fecha: 2026-05-28
-- ===================================================================

-- ===================================================================
-- 1. TABLA: modulos
-- ===================================================================
CREATE TABLE public.modulos (
  id SERIAL PRIMARY KEY,
  num TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  orden INT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================================================================
-- 2. TABLA: lecciones
-- ===================================================================
CREATE TABLE public.lecciones (
  id TEXT PRIMARY KEY,
  modulo_num TEXT NOT NULL REFERENCES public.modulos(num),
  num TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  duracion TEXT NOT NULL,
  orden_global INT NOT NULL UNIQUE,
  prev_id TEXT,
  next_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================================================================
-- 3. TABLA: progreso_usuarios
-- ===================================================================
CREATE TABLE public.progreso_usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leccion_id TEXT NOT NULL REFERENCES public.lecciones(id) ON DELETE CASCADE,
  completada BOOLEAN DEFAULT false,
  completada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, leccion_id)
);

CREATE INDEX idx_progreso_user ON public.progreso_usuarios(user_id);

-- ===================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ===================================================================
ALTER TABLE public.modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progreso_usuarios ENABLE ROW LEVEL SECURITY;

-- Modulos: lectura para usuarios autenticados
CREATE POLICY "modulos_select_authenticated"
  ON public.modulos FOR SELECT TO authenticated USING (true);

-- Lecciones: lectura para usuarios autenticados
CREATE POLICY "lecciones_select_authenticated"
  ON public.lecciones FOR SELECT TO authenticated USING (true);

-- Progreso: cada usuario solo ve su propio progreso
CREATE POLICY "progreso_select_own"
  ON public.progreso_usuarios FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "progreso_insert_own"
  ON public.progreso_usuarios FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "progreso_update_own"
  ON public.progreso_usuarios FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===================================================================
-- 5. INSERT: 6 modulos
-- ===================================================================
INSERT INTO public.modulos (num, titulo, descripcion, orden) VALUES
  ('01', 'Fundamentos: Empezando con Claude',   'Los cimientos para dominar Claude y Claude Code desde cero.', 1),
  ('02', 'Dominando Claude para tu Operacion',   'Flujos de trabajo, automatizacion y casos de uso reales para tu negocio.', 2),
  ('03', 'Skills: Tu Arsenal de Superpoderes',   'Prompts reutilizables que multiplican tu productividad.', 3),
  ('04', 'Claude Code: De Idea a Producto',      'Construye herramientas y apps reales sin experiencia tecnica.', 4),
  ('05', 'Deploy y Escalado en Produccion',      'Lleva tu proyecto de local a produccion con dominio y seguridad.', 5),
  ('06', 'Liderando un Equipo con IA',           'Escala Claude a todo tu equipo con procesos y colaboracion.', 6);

-- ===================================================================
-- 6. INSERT: 19 lecciones
-- ===================================================================
INSERT INTO public.lecciones (id, modulo_num, num, titulo, descripcion, duracion, orden_global, prev_id, next_id) VALUES
  -- Modulo 01: Fundamentos
  ('gs-1',  '01', '01', 'Bienvenido a Claude Hackers',                          'Conoce el programa, a tu instructor y la ruta que vas a recorrer para dominar Claude.',                              '1:48',  1,  NULL,    'new-1'),
  ('new-1', '01', '02', 'Conectando tu terminal a Claude Code y GitHub',         'Configura tu entorno de trabajo: instala Claude Code, conecta tu terminal y vincula tu cuenta de GitHub.',          '12:00', 2,  'gs-1',  'new-2'),
  ('new-2', '01', '03', 'Claude vs Claude Code: cuando usar cada uno',           'Entiende las diferencias entre Claude (web/app) y Claude Code (terminal) para elegir la herramienta correcta.',     '8:00',  3,  'new-1', 'cw-1'),

  -- Modulo 02: Dominando Claude
  ('cw-1',  '02', '01', 'Configurando Claude para tu flujo de trabajo',          'Configura Claude Desktop, conectores, extensiones y memoria para maximizar tu productividad.',                     '14:38', 4,  'new-2', 'cw-2'),
  ('cw-2',  '02', '02', 'Tu primer workflow paralelo',                           'Aprende a ejecutar multiples flujos de trabajo simultaneamente para multiplicar tu output.',                       '9:02',  5,  'cw-1',  'cw-3'),
  ('cw-3',  '02', '03', 'Claude para inversion en performance y ads',            'Usa Claude para analizar campanas, generar creativos y optimizar tu inversion publicitaria.',                      '14:27', 6,  'cw-2',  'cw-4'),
  ('cw-4',  '02', '04', 'Claude para customer lifecycle y email',                'Optimiza tu ciclo de vida del cliente y tus secuencias de email con Claude.',                                      '8:49',  7,  'cw-3',  'cw-5'),
  ('cw-5',  '02', '05', 'Claude para growth y estrategia',                       'Aplica Claude a tu estrategia de crecimiento: analisis de mercado, pricing, canales y decision-making.',           '7:46',  8,  'cw-4',  'cw-6'),
  ('cw-6',  '02', '06', 'Dashboards y reportes con Artifacts',                   'Crea dashboards interactivos, reportes ejecutivos y visualizaciones con Artifacts de Claude.',                     '9:19',  9,  'cw-5',  'sp-0'),

  -- Modulo 03: Skills
  ('sp-0',  '03', '01', 'Que son los Skills y como instalarlos',                 'Descubre que son los Skills en Claude, como funcionan internamente y como instalarlos en tu workspace.',            '6:47',  10, 'cw-6',  'new-3'),
  ('new-3', '03', '02', 'Creando tu primer Skill personalizado',                 'Paso a paso para crear un Skill adaptado a tu operacion, testearlo y compartirlo con tu equipo.',                  '10:00', 11, 'sp-0',  'cc-1'),

  -- Modulo 04: Claude Code
  ('cc-1',  '04', '01', 'Conceptos clave de Claude Code',                        'Los conceptos fundamentales que necesitas entender para construir con Claude Code como no-tecnico.',               '10:06', 12, 'new-3', 'cc-2'),
  ('cc-2',  '04', '02', 'Tu primera web app con Claude Code',                    'Construye una aplicacion web funcional desde cero usando solo Claude Code.',                                       '9:59',  13, 'cc-1',  'cc-3'),
  ('cc-3',  '04', '03', 'Construyendo herramientas internas para tu equipo',     'Crea herramientas personalizadas para tu operacion: dashboards, CRMs internos, trackers y mas.',                  '21:31', 14, 'cc-2',  'cc-4'),
  ('cc-4',  '04', '04', 'Conceptos fundamentales de deploy',                     'Entiende los conceptos esenciales para llevar tu proyecto de localhost al mundo real.',                            '6:24',  15, 'cc-3',  'new-4'),

  -- Modulo 05: Deploy
  ('new-4', '05', '01', 'Deploy con GitHub, hosting y dominio',                  'Paso a paso completo para llevar tu proyecto a produccion con hosting real y dominio personalizado.',               '15:00', 16, 'cc-4',  'new-5'),
  ('new-5', '05', '02', 'Seguridad y autenticacion para producto interno',       'Implementa autenticacion, controles de acceso y mejores practicas de seguridad para herramientas internas.',       '12:00', 17, 'new-4', 'mt-0'),

  -- Modulo 06: Liderazgo
  ('mt-0',  '06', '01', 'Llevando Claude a tu equipo',                           'Escala el uso de Claude a toda tu organizacion con un repositorio compartido, Skills y procesos.',                 '8:12',  18, 'new-5', 'new-6'),
  ('new-6', '06', '02', 'Workflows colaborativos y handoffs',                    'Disena flujos de trabajo donde multiples personas y Claude colaboran eficientemente con handoffs claros.',          '10:00', 19, 'mt-0',  NULL);
