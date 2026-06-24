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
    const { user_id, email, nombre, unlock_tipo, unlock_nombre, unlock_url } =
      await req.json();

    if (!user_id || !email || !unlock_tipo) {
      return Response.json(
        { ok: false, reason: "missing fields" },
        { headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Anti-duplicado: un email por tipo de desbloqueo
    const { data: inserted } = await supabase
      .from("emails_enviados")
      .upsert(
        { user_id, tipo: "logro_desbloqueado", referencia: unlock_tipo },
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
    const logro = unlock_nombre || unlock_tipo;
    const url = unlock_url || "https://claudehackers.com/dashboard.html";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-block;background:#FF6B1A;border-radius:10px;width:44px;height:44px;line-height:44px;text-align:center;color:#fff;font-weight:700;font-size:18px;">CH</div>
  </div>
  <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;background:#1a1a1a;border:2px solid #FF6B1A;border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;">
      <span style="font-size:28px;">&#127942;</span>
    </div>
  </div>
  <h1 style="color:#f5f1e8;font-size:24px;font-weight:700;margin:0 0 8px;text-align:center;">Desbloqueaste ${logro}!</h1>
  <p style="color:#888;font-size:15px;line-height:1.6;text-align:center;margin:0 0 32px;">${displayName}, tu esfuerzo tiene recompensa. Ya podes acceder a contenido exclusivo que antes estaba bloqueado.</p>
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${url}" style="display:inline-block;background:#FF6B1A;color:#000;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;">Ir a verlo</a>
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
        subject: `Desbloqueaste ${logro}!`,
        html,
      }),
    });

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    console.error("send-logro-desbloqueado error:", e);
    return Response.json(
      { ok: false, error: e.message },
      { headers: corsHeaders },
    );
  }
});
