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

    const { data: inserted } = await supabase
      .from("emails_enviados")
      .upsert(
        { user_id, tipo: "bienvenida", referencia: "registro" },
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

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <img src="https://www.claudehackers.com/CH_Blanco.png" width="64" height="64" alt="Claude Hackers" style="border-radius:14px;"/>
  </div>
  <div style="background:#ffffff;border-radius:16px;padding:40px 32px;border:1px solid #e8e8e8;">
    <h1 style="color:#111111;font-size:24px;font-weight:700;margin:0 0 12px;text-align:center;">¡Bienvenido/a, ${displayName}!</h1>
    <p style="color:#555555;font-size:15px;line-height:1.6;text-align:center;margin:0 0 16px;">Nos alegra que estés acá. Claude Hackers es el lugar donde founders, C-levels y equipos aprenden a usar Claude para multiplicar su productividad. Ya tenés acceso al Módulo 1 — el primero de 20 lecciones para dominar Claude y transformar la forma en que trabajás.</p>
    <div style="text-align:center;margin-bottom:16px;">
      <a href="https://claudehackers.com/dashboard.html" style="display:inline-block;background:#FF6B1A;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;">Empezar el Módulo 1 →</a>
    </div>
    <p style="color:#555555;font-size:15px;line-height:1.6;text-align:center;margin:0;">Si querés avanzar más rápido, invitá a un amigo con tu link y el siguiente módulo se desbloquea al instante. Aprendé a escribir prompts que realmente funcionan, automatizá lo aburrido, construí herramientas internas y dominá Claude Code. Todo a tu ritmo, todo gratis. Tu negocio te lo va a agradecer.</p>
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
        subject: `Bienvenido/a a Claude Hackers, ${displayName}`,
        html,
      }),
    });

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    console.error("send-bienvenida error:", e);
    return Response.json(
      { ok: false, error: e.message },
      { headers: corsHeaders },
    );
  }
});
