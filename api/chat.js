// ===================================================================
// Proxy seguro a la API de Anthropic (Vercel Serverless Function)
// La ANTHROPIC_API_KEY vive en las variables de entorno de Vercel,
// nunca se expone al navegador.
// ===================================================================

// Respuestas de respaldo (fallback) para cuando la API no responde
// (ej. sin creditos, caida, rate limit). Cubre lo mas preguntado del curso,
// asi el usuario nunca ve un error seco.
function fallbackAnswer(messages) {
  const last = messages && messages.length ? messages[messages.length - 1] : null;
  const raw = last && last.content ? String(last.content) : '';
  // pasamos a minusculas y sacamos tildes para matchear mejor
  const q = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const has = (...kw) => kw.some(k => q.includes(k));

  if (has('claude code')) {
    return 'Claude Code es la herramienta para programar con Claude desde la terminal: le delegas tareas de codigo (crear y editar archivos, correr comandos) y las hace por vos. Lo usamos en los modulos tecnicos del curso, paso a paso.';
  }
  if (has('cowork')) {
    return 'Claude Cowork es la app pensada para trabajo de oficina (no solo codigo): Claude puede manejar archivos, documentos y tareas de punta a punta. En el curso lo vemos con ejemplos practicos.';
  }
  if (has('conect', 'connect', 'integrac', 'gmail', 'drive', 'calendar', 'mcp')) {
    return 'Podes conectar Claude a apps externas como Gmail, Google Drive o Calendar a traves de los conectores, para que lea y actue sobre tu informacion real. Se activan desde el menu de conectores dentro de Claude. Hay una leccion dedicada a esto en el curso.';
  }
  if (has('skill')) {
    return 'Los Skills son recetas que le dan a Claude buenas practicas para producir un tipo de resultado con calidad profesional (por ejemplo documentos Word, PDFs o presentaciones). En Claude Hackers vas desbloqueando Skills a medida que avanzas.';
  }
  if (has('artifact', 'artefact')) {
    return 'Un Artifact es contenido que Claude crea y que podes ver y editar al costado del chat: codigo, documentos, paginas web y mas. Sirve para cosas que vas a reutilizar o iterar.';
  }
  if (has('referid', 'invitar', 'invito', 'referral')) {
    return 'Cada persona que invitas con tu link y completa su primera leccion cuenta como referido. Con referidos desbloqueas recompensas como los videos de expertos y badges. Lo gestionas desde la seccion Referrals.';
  }
  if (has('certificad')) {
    return 'Al completar el curso obtenes un certificado oficial de Claude Hackers para compartir (por ejemplo en LinkedIn). Aparece en tu perfil cuando llegas al 100%.';
  }
  if (has('gratis', 'precio', 'cuesta', 'pagar', 'costo', 'tarjeta')) {
    return 'Claude Hackers es 100% gratis: te registras con Google y accedes a todos los modulos, lecciones y skills. No se pide tarjeta de credito.';
  }
  if (has('empez', 'empiez', 'comenz', 'arranc', 'primera leccion', 'como accedo', 'acceder', 'como entro')) {
    return 'Para empezar, registrate con Google y entra al Dashboard: ahi ves los modulos y arrancas por la primera leccion. El contenido se desbloquea de forma escalonada a medida que avanzas.';
  }
  if (has('que es claude', 'sobre claude', 'para que sirve claude')) {
    return 'Claude es el asistente de IA de Anthropic: te ayuda a escribir, programar, analizar y automatizar tareas. En Claude Hackers aprendes a sacarle el maximo provecho, paso a paso.';
  }

  // Sin match: generico util
  return 'Ahora mismo no puedo darte una respuesta detallada, pero te ayudo con lo basico del curso. Preguntame por: "Claude Code", "conectores", "Skills", "referidos" o "como empezar". Tambien tenes todo el contenido en los modulos del Dashboard.';
}

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  let messages;
  try {
    messages = req.body && req.body.messages;
  } catch (_) {
    messages = null;
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Envia al menos un mensaje.' });
  }

  // Si no hay API key configurada, igual respondemos con el fallback
  if (!apiKey) {
    console.error('[chat proxy] ANTHROPIC_API_KEY no configurada');
    return res.status(200).json({ response: fallbackAnswer(messages), fallback: true });
  }

  try {
    // Llamada a la API de Anthropic (Messages API)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: `Sos un tutor del curso "Claude Hackers". Ayudas con dudas de coding, de las lecciones del curso, y de "como hago X" con Claude. Respondes claro, en espanol latino, tono cercano y practico. Respuestas concisas (maximo 3 parrafos cortos). Si no sabes algo, decilo honestamente.`,
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content).slice(0, 4000)
        }))
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[chat proxy] Anthropic error:', response.status, errBody);

      // Rate limit: es transitorio, conviene pedir reintento
      if (response.status === 429) {
        return res.status(429).json({ error: 'Muchas consultas seguidas. Espera unos segundos e intenta de nuevo.' });
      }

      // Cualquier otra falla (sin creditos, caida, etc): fallback util
      return res.status(200).json({ response: fallbackAnswer(messages), fallback: true });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || fallbackAnswer(messages);

    return res.status(200).json({ response: text });

  } catch (err) {
    console.error('[chat proxy] Error inesperado:', err);
    // Aun ante una excepcion, intentamos el fallback antes de rendirnos
    return res.status(200).json({ response: fallbackAnswer(messages), fallback: true });
  }
}
