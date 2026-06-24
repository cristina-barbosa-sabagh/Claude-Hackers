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

    // Anti-duplicado para inactividad: solo 1 email cada 30 dias
    const { data: recent } = await supabase
      .from("emails_enviados")
      .select("id, created_at")
      .eq("user_id", user_id)
      .eq("tipo", "inactividad")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) {
      const lastSent = new Date(recent.created_at);
      const daysSince =
        (Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return Response.json(
          { ok: true, skipped: true, reason: "sent_recently" },
          { headers: corsHeaders },
        );
      }
    }

    // Registrar el envio (referencia = fecha para permitir multiples en el tiempo)
    const today = new Date().toISOString().slice(0, 10);
    await supabase
      .from("emails_enviados")
      .insert({ user_id, tipo: "inactividad", referencia: today });

    const displayName = nombre || "Hacker";
    const dias = dias_inactivo || 7;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-block;background:#FF6B1A;border-radius:10px;width:44px;height:44px;line-height:44px;text-align:center;color:#fff;font-weight:700;font-size:18px;">CH</div>
  </div>
  <h1 style="color:#f5f1e8;font-size:24px;font-weight:700;margin:0 0 8px;text-align:center;">Te extraniamos, ${displayName}</h1>
  <p style="color:#888;font-size:15px;line-height:1.6;text-align:center;margin:0 0 24px;">Hace ${dias} dias que no entras a Claude Hackers. Tu racha y tu progreso te esperan.</p>
  <div style="text-align:center;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:20px;margin-bottom:24px;">
    <p style="color:#f5f1e8;font-size:14px;margin:0;line-height:1.6;">Cada dia que practicas con Claude es un dia que tu negocio avanza. No dejes que se enfrie el momentum.</p>
  </div>
  <div style="text-align:center;margin-bottom:32px;">
    <a href="https://claudehackers.com/dashboard.html" style="display:inline-block;background:#FF6B1A;color:#000;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;">Retomar el curso</a>
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
        subject: `Te extraniamos en Claude Hackers, ${displayName}`,
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
