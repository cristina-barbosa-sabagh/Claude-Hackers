import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth acotada in-code (verify_jwt=false en el gateway): la funcion valida
  // su propio secreto por header, igual que send-activacion-cero-lecciones /
  // broadcast-send. Si no matchea o el env falta -> 401 real, no procesa nada.
  const expectedSecret = Deno.env.get("ACTIVACION_INTERNAL_SECRET");
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const { user_id, email, nombre, dia } = await req.json();

    if (!user_id || !email || !dia) {
      return Response.json(
        { ok: false, reason: "missing fields" },
        { headers: corsHeaders },
      );
    }

    // Toques validos: "instant" (toque inmediato de bienvenida, cron aparte)
    // + la secuencia FOMO de 4 (1, 3, 5, 7).
    if (![1, 3, 5, 7, "instant"].includes(dia)) {
      return Response.json(
        { ok: false, reason: "invalid dia (esperado instant|1|3|5|7)" },
        { headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Anti-duplicado POR TOQUE (no de por vida global): cada toque tiene su
    // propia referencia, asi que un usuario puede recibir instant + 1/3/5/7
    // pero cada uno una sola vez. dia=1 conserva la referencia historica
    // 'cero_lecciones' (ya existe en prod); instant -> 'cero_lecciones_instant';
    // el resto son *_Nd.
    const referencia = dia === "instant"
      ? "cero_lecciones_instant"
      : dia === 1
      ? "cero_lecciones"
      : `cero_lecciones_${dia}d`;
    const { data: inserted } = await supabase
      .from("emails_enviados")
      .upsert(
        { user_id, tipo: "activacion_cero_lecciones", referencia },
        { onConflict: "user_id,tipo,referencia", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (!inserted) {
      return Response.json(
        { ok: true, skipped: true },
        { headers: corsHeaders },
      );
    }

    const displayName = nombre || "Hacker";

    // Copy FOMO/urgencia escalado sobre "abri tu primera leccion" (gs-1).
    // Mismo patron estructural que send-recordatorio-inactividad (if/else if).
    let subject = "";
    let titulo = "";
    let parrafo1 = "";
    let bloque = "";
    const boton = "Abrir la leccion 1 →";
    const botonUrl = "https://www.claudehackers.com/leccion.html?id=gs-1";

    if (dia === "instant") {
      // Toque inmediato de bienvenida: calido, foco en beneficios concretos
      // (no FOMO; ese tono esta en los 4 toques de la secuencia 1/3/5/7).
      subject = `${displayName}, tu primera leccion te toma solo unos minutos`;
      titulo = `Empeza tu camino con Claude, ${displayName}`;
      parrafo1 = `Ya tenes acceso a Claude Hackers. Tu primera leccion es corta y practica: en unos minutos vas a saber como usar Claude para escribir mas rapido, ordenar tus ideas y sacarte de encima las tareas repetitivas.`;
      bloque = `Adentro aprendes a redactar y responder en minutos, automatizar lo tedioso y construir tus propias herramientas con IA — paso a paso y sin saber programar.`;
    } else if (dia === 1) {
      subject = `${displayName}, tu primera leccion ya esta lista`;
      titulo = `Estas a un clic de empezar, ${displayName}`;
      parrafo1 = `Creaste tu cuenta pero todavia no abriste ninguna leccion. El primer paso es el mas facil: abris la leccion 1 y en minutos ya estas usando Claude para trabajar distinto.`;
      bloque = `Es el paso que casi todos posponen y el unico que separa "me anote" de "lo estoy usando". Dalo hoy.`;
    } else if (dia === 3) {
      subject = `${displayName}, hace 3 dias que ni abriste la primera leccion`;
      titulo = `Otros ya arrancaron. Vos todavia no.`;
      parrafo1 = `Hace 3 dias creaste tu cuenta y todavia no abriste una sola leccion. En ese tiempo, otros founders ya dieron el primer paso con Claude y empezaron a automatizar su trabajo.`;
      bloque = `La diferencia entre ellos y vos hoy es un solo clic: abrir la leccion 1. Nada mas.`;
    } else if (dia === 5) {
      subject = `${displayName}, tu cuenta sigue sin estrenarse`;
      titulo = `Cada dia que pasa, mas lejos de construir con IA`;
      parrafo1 = `Pasaron 5 dias y tu cuenta sigue intacta: ni una leccion abierta. Claude esta cambiando como trabajan los mejores negocios, y cada dia sin empezar es terreno que otros te sacan.`;
      bloque = `No hace falta que termines el curso hoy. Solo abri la leccion 1 y da el primer paso. El resto viene solo.`;
    } else {
      // dia === 7
      subject = `${displayName}, ultima llamada para abrir tu primera leccion`;
      titulo = `7 dias con la puerta abierta y sin entrar, ${displayName}`;
      parrafo1 = `Hace una semana que tenes acceso y todavia no abriste ninguna leccion. Otros ya aprendieron a usar Claude para escribir, automatizar y construir mas rapido. Vos seguis donde empezaste.`;
      bloque = `Abri la leccion 1 hoy, o dentro de otra semana vas a estar exactamente igual que ahora.`;
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <img src="https://www.claudehackers.com/CH_Blanco.png" width="64" height="64" alt="Claude Hackers" style="border-radius:14px;"/>
  </div>
  <div style="background:#ffffff;border-radius:16px;padding:40px 32px;border:1px solid #e8e8e8;">
    <h1 style="color:#111111;font-size:24px;font-weight:700;margin:0 0 12px;text-align:center;">${titulo}</h1>
    <p style="color:#555555;font-size:15px;line-height:1.6;text-align:center;margin:0 0 24px;">${parrafo1}</p>
    <div style="background:#fff7f3;border-left:4px solid #FF6B1A;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="color:#333333;font-size:14px;margin:0;line-height:1.6;">${bloque}</p>
    </div>
    <div style="text-align:center;">
      <a href="${botonUrl}" style="display:inline-block;background:#FF6B1A;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;">${boton}</a>
    </div>
  </div>
  <p style="color:#999999;font-size:12px;text-align:center;margin:24px 0 0;">Dylan Rosemberg — <a href="https://www.growthrockstar.com" style="color:#FF6B1A;text-decoration:none;">Growth Rockstar</a></p>
</div>
</body></html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      },
      body: JSON.stringify({
        from: "Claude Hackers <hola@claudehackers.com>",
        to: [email],
        subject,
        html,
      }),
    });

    // Rollback si Resend fallo: borrar la fila recien insertada para que el
    // proximo cron reintente ese mismo toque (se conserva, a diferencia de
    // send-recordatorio-inactividad que es fire-and-forget).
    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error(
        `send-activacion-cero-lecciones resend error: user_id=${user_id} dia=${dia} status=${resendRes.status} body=${errBody}`,
      );
      await supabase
        .from("emails_enviados")
        .delete()
        .eq("id", inserted.id);
      return Response.json(
        { ok: false, error: "resend_failed", status: resendRes.status },
        { headers: corsHeaders },
      );
    }

    return Response.json({ ok: true, dia }, { headers: corsHeaders });
  } catch (e) {
    console.error("send-activacion-cero-lecciones error:", e);
    return Response.json(
      { ok: false, error: e.message },
      { headers: corsHeaders },
    );
  }
});
