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

    // Anti-duplicado: ON CONFLICT DO NOTHING
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
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-block;background:#FF6B1A;border-radius:10px;width:44px;height:44px;line-height:44px;text-align:center;color:#fff;font-weight:700;font-size:18px;">CH</div>
  </div>
  <h1 style="color:#f5f1e8;font-size:24px;font-weight:700;margin:0 0 8px;text-align:center;">Bienvenido/a, ${displayName}</h1>
  <p style="color:#888;font-size:15px;line-height:1.6;text-align:center;margin:0 0 32px;">Ya tenes acceso a las 20 lecciones del curso. Aprende a dominar Claude y Claude Code para tu negocio — gratis, a tu ritmo.</p>
  <div style="text-align:center;margin-bottom:32px;">
    <a href="https://claudehackers.com/dashboard.html" style="display:inline-block;background:#FF6B1A;color:#000;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;">Empezar ahora</a>
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
