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
    const {
      referrer_user_id,
      referrer_email,
      referrer_nombre,
      referido_nombre,
      referidos_count,
    } = await req.json();

    if (!referrer_user_id || !referrer_email) {
      return Response.json(
        { ok: false, reason: "missing fields" },
        { headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Anti-duplicado: referencia = nombre del referido (unico por activacion)
    const ref = (referido_nombre || "unknown").slice(0, 100);
    const { data: inserted } = await supabase
      .from("emails_enviados")
      .upsert(
        {
          user_id: referrer_user_id,
          tipo: "referido_activo",
          referencia: ref,
        },
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

    const nombre = referrer_nombre || "Hacker";
    const refNombre = referido_nombre || "Alguien";
    const count = referidos_count || 1;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-block;background:#FF6B1A;border-radius:10px;width:44px;height:44px;line-height:44px;text-align:center;color:#fff;font-weight:700;font-size:18px;">CH</div>
  </div>
  <h1 style="color:#f5f1e8;font-size:24px;font-weight:700;margin:0 0 8px;text-align:center;">${refNombre} se unio con tu link!</h1>
  <p style="color:#888;font-size:15px;line-height:1.6;text-align:center;margin:0 0 24px;">${refNombre} acaba de activar su cuenta en Claude Hackers gracias a tu invitacion.</p>
  <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:20px 32px;">
      <div style="color:#FF6B1A;font-size:36px;font-weight:800;">${count}</div>
      <div style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">referidos activos</div>
    </div>
  </div>
  <p style="color:#888;font-size:14px;text-align:center;margin:0 0 24px;">Segui invitando para desbloquear Skills, Comunidad y Videos de expertos.</p>
  <div style="text-align:center;margin-bottom:32px;">
    <a href="https://claudehackers.com/referrals.html" style="display:inline-block;background:#FF6B1A;color:#000;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;">Ver mis referidos</a>
  </div>
  <p style="color:#555;font-size:12px;text-align:center;margin:0;">Dylan Rosemberg — <a href="https://www.growthrockstar.com" style="color:#FF6B1A;text-decoration:none;">Growth Rockstar</a></p>
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
        to: [referrer_email],
        subject: `${refNombre} se unio con tu link!`,
        html,
      }),
    });

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    console.error("send-referido-activo error:", e);
    return Response.json(
      { ok: false, error: e.message },
      { headers: corsHeaders },
    );
  }
});
