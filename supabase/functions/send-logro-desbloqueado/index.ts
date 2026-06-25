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
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <img src="https://www.claudehackers.com/CH_Blanco.png" width="64" height="64" alt="Claude Hackers" style="border-radius:14px;"/>
  </div>
  <div style="background:#ffffff;border-radius:16px;padding:40px 32px;border:1px solid #e8e8e8;">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-block;background:#fff7f3;border:2px solid #FF6B1A;border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;">
        <span style="font-size:28px;">🏆</span>
      </div>
    </div>
    <h1 style="color:#111111;font-size:24px;font-weight:700;margin:0 0 12px;text-align:center;">¡Desbloqueaste ${logro}!</h1>
    <p style="color:#555555;font-size:15px;line-height:1.6;text-align:center;margin:0 0 16px;">${displayName}, lo lograste. Invitaste a tus amigos y ahora tenés acceso a contenido exclusivo que la mayoría todavía no puede ver. Esto es tuyo — aprovechalo al máximo.</p>
    <div style="background:#fff7f3;border-left:4px solid #FF6B1A;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="color:#333333;font-size:14px;margin:0 0 8px;font-weight:600;">Y esto es solo el comienzo. Cuantos más amigos invitás, más desbloqueás:</p>
      <p style="color:#333333;font-size:14px;margin:0;line-height:1.8;">⚡ Skills exclusivos de Claude<br/>🏆 Acceso a la Comunidad privada<br/>🎥 Videos de expertos</p>
    </div>
    <p style="color:#555555;font-size:14px;text-align:center;margin:0 0 24px;">Seguí compartiendo tu link y seguí ganando.</p>
    <div style="text-align:center;">
      <a href="${url}" style="display:inline-block;background:#FF6B1A;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;">Invitar a más amigos →</a>
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
        subject: `¡Desbloqueaste ${logro}!`,
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
