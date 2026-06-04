// ===================================================================
// Proxy seguro a la API de Anthropic (Vercel Serverless Function)
// La ANTHROPIC_API_KEY vive en las variables de entorno de Vercel,
// nunca se expone al navegador.
// ===================================================================

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[chat proxy] ANTHROPIC_API_KEY no configurada');
    return res.status(500).json({ error: 'El asistente no esta disponible en este momento.' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Envia al menos un mensaje.' });
    }

    // Llamada a la API de Anthropic (Messages API)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
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

      if (response.status === 429) {
        return res.status(429).json({ error: 'Muchas consultas seguidas. Espera unos segundos e intenta de nuevo.' });
      }
      return res.status(502).json({ error: 'Error al consultar al asistente. Intenta de nuevo.' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || 'No pude generar una respuesta.';

    return res.status(200).json({ response: text });

  } catch (err) {
    console.error('[chat proxy] Error inesperado:', err);
    return res.status(500).json({ error: 'Error interno del asistente. Intenta de nuevo.' });
  }
}
