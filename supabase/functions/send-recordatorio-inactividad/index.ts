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

  try {
    const { user_id, email, nombre, dias_inactivo } = await req.json();

    if (!user_id || !email || !dias_inactivo) {
      return Response.json(
        { ok: false, reason: "missing fields" },
        { headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Anti-duplicado: un email por ciclo de inactividad (1, 3, 5, 7 dias)
    const referencia = `inactividad_${dias_inactivo}d`;
    const { data: inserted } = await supabase
      .from("emails_enviados")
      .upsert(
        { user_id, tipo: "inactividad", referencia },
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
    const dias = dias_inactivo;

    let subject = "";
    let titulo = "";
    let parrafo1 = "";
    let bloque = "";
    let boton = "";
    let botonUrl = "https://claudehackers.com/dashboard.html";

    if (dias === 1) {
      subject = `${displayName}, tu lección de hoy te espera`;
      titulo = `${displayName}, hoy es el día`;
      parrafo1 = `Cada día que practicás con Claude es un día que tu negocio avanza. Tenés una lección esperándote — son minutos que pueden cambiar cómo trabajás para siempre.`;
      bloque = `Los founders que dominan Claude hoy son los que van a liderar mañana. No dejes pasar otro día.`;
      boton = `Continuar ahora →`;
    } else if (dias === 3) {
      subject = `${displayName}, hace 3 días que no avanzás`;
      titulo = `Mientras vos esperás, otros avanzan`;
      parrafo1 = `Hace 3 días que no entrás a Claude Hackers. En ese tiempo, otros founders aprendieron a automatizar tareas, escribir mejor y trabajar más rápido con Claude. El mundo no para — y tu competencia tampoco.`;
      bloque = `El que aprende Claude hoy tiene una ventaja que el resto va a tardar meses en alcanzar. ¿Vas a dejar que te ganen la delantera?`;
      boton = `Retomar ahora →`;
    } else if (dias === 5) {
      subject = `${displayName}, te estás quedando atrás`;
      titulo = `La ventaja se achica cada día, ${displayName}`;
      parrafo1 = `Hace 5 días que no entrás. Claude está redefiniendo cómo trabajan los mejores negocios del mundo — y cada día sin practicar es un día que otros te sacan ventaja.`;
      bloque = `No es exageración: los founders que dominan Claude hoy van a tener una ventaja imposible de alcanzar en 6 meses. Volvé ahora.`;
      boton = `No perder más tiempo →`;
    } else {
      subject = `${displayName}, esta es tu última oportunidad de no quedarte atrás`;
      titulo = `7 días. Mucho tiempo perdido, ${displayName}.`;
      parrafo1 = `Hace una semana que no entrás. Mientras vos no estabas, otros founders aprendieron a usar Claude para multiplicar su productividad, automatizar lo aburrido y construir herramientas que antes les llevaban semanas. Eso ya no lo recuperás — pero podés empezar hoy.`;
      bloque = `Claude está cambiando las reglas del juego. Los que aprenden ahora lideran. Los que esperan, siguen. ¿De qué lado querés estar?`;
      boton = `Volver y no quedarme atrás →`;
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

    await fetch("https://api.resend.com/emails", {
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

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    console.error("send-recordatorio-inactividad error:", e);
    return Response.json(
      { ok: false, error: e.message },
      { headers: corsHeaders },
    );
  }
});
