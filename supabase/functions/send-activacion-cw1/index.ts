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
  // su propio secreto por header, igual que broadcast-send /
  // send-activacion-cero-lecciones. Secreto PROPIO (CW1_INTERNAL_SECRET): no
  // se comparte con otros crons para que rotar uno no afecte a los demas.
  // Si no matchea o el env falta -> 401 real, no procesa nada.
  const expectedSecret = Deno.env.get("CW1_INTERNAL_SECRET");
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const { user_id, email, nombre } = await req.json();

    if (!user_id || !email) {
      return Response.json(
        { ok: false, reason: "missing fields" },
        { headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Anti-duplicado: exactamente UN envio por usuario de por vida.
    // referencia es string fijo (NUNCA null): el UNIQUE es
    // (user_id, tipo, referencia) y referencia es nullable, asi que
    // un NULL no protegeria contra duplicados.
    const referencia = "activacion_24h";
    const { data: inserted } = await supabase
      .from("emails_enviados")
      .upsert(
        { user_id, tipo: "activacion", referencia },
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

    const subject = "Estas a una clase de construir con IA";
    const titulo = "Te falta un solo paso";
    const parrafo1 = `Ya viste la bienvenida. Lo que sigue es donde de verdad empieza: configuras Claude Cowork y quedas listo para construir.`;
    const bloque = `Son 5 minutos. Es el paso que el 70% se salta — y es justo el que abre todo lo demas.`;
    const boton = "Configurar Cowork →";
    const botonUrl = "https://www.claudehackers.com/leccion.html?id=cw-1";

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

    // Rollback si Resend fallo: borrar la fila recien insertada para
    // que el proximo cron reintente (el patron de inactividad no hacia
    // esto y dejaba al usuario sin reintento).
    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error(
        `send-activacion-cw1 resend error: user_id=${user_id} status=${resendRes.status} body=${errBody}`,
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

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    console.error("send-activacion-cw1 error:", e);
    return Response.json(
      { ok: false, error: e.message },
      { headers: corsHeaders },
    );
  }
});
