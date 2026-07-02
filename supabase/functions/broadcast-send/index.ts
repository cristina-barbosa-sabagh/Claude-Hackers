import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESEND_BATCH_SIZE = 10;
const RESEND_BATCH_DELAY_MS = 1200; // ~8 emails/sec, well under Resend's 10/sec limit

function deriveNameFromEmail(email: string): string {
  const prefix = email.split("@")[0] || "";
  const clean =
    prefix.replace(/[._\d].*$/, "") ||
    prefix.replace(/[._\d]/g, "") ||
    prefix;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Admin check: extract caller email from Authorization JWT ──
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return Response.json(
        { ok: false, reason: "missing authorization" },
        { status: 401, headers: corsHeaders },
      );
    }

    // Decode JWT payload (base64url) to get caller email
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) {
      return Response.json(
        { ok: false, reason: "invalid token" },
        { status: 401, headers: corsHeaders },
      );
    }
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    const callerEmail = (payload.email || "").toLowerCase().trim();
    if (callerEmail !== "cristina@growthrockstar.com") {
      return Response.json(
        { ok: false, reason: "unauthorized" },
        { status: 403, headers: corsHeaders },
      );
    }

    // ── Parse input ──
    const { broadcast_id, test_mode, test_email } = await req.json();

    if (!broadcast_id) {
      return Response.json(
        { ok: false, reason: "missing broadcast_id" },
        { headers: corsHeaders },
      );
    }
    if (test_mode && !test_email) {
      return Response.json(
        { ok: false, reason: "test_mode requires test_email" },
        { headers: corsHeaders },
      );
    }

    // ── Supabase client (service role for DB access) ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Read broadcast ──
    const { data: broadcast, error: bErr } = await supabase
      .from("broadcasts")
      .select("asunto, cuerpo_html, segmento")
      .eq("id", broadcast_id)
      .maybeSingle();

    if (bErr || !broadcast) {
      return Response.json(
        { ok: false, reason: "broadcast not found" },
        { headers: corsHeaders },
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    // ── TEST MODE ──
    if (test_mode) {
      const body = broadcast.cuerpo_html.replaceAll("{{nombre}}", "Cristina");

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "Claude Hackers <hola@claudehackers.com>",
          to: [test_email],
          subject: broadcast.asunto,
          html: body,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return Response.json(
          { ok: false, reason: "resend error", detail: err },
          { headers: corsHeaders },
        );
      }

      return Response.json(
        { ok: true, sent_to: test_email },
        { headers: corsHeaders },
      );
    }

    // ── REAL SEND ──

    // Set estado = 'enviando'
    await supabase
      .from("broadcasts")
      .update({ estado: "enviando" })
      .eq("id", broadcast_id);

    // Get recipients via internal function (no _assert_admin)
    const { data: recipients, error: rErr } = await supabase
      .rpc("_internal_broadcast_recipients", { p_segmento: broadcast.segmento });

    if (rErr || !recipients || recipients.length === 0) {
      await supabase
        .from("broadcasts")
        .update({
          estado: "error",
          total_destinatarios: 0,
          enviado_en: new Date().toISOString(),
        })
        .eq("id", broadcast_id);

      return Response.json(
        { ok: false, reason: "no recipients", detail: rErr?.message },
        { headers: corsHeaders },
      );
    }

    // Update total
    await supabase
      .from("broadcasts")
      .update({ total_destinatarios: recipients.length })
      .eq("id", broadcast_id);

    let enviados = 0;
    let fallidos = 0;

    // Process in batches
    for (let i = 0; i < recipients.length; i += RESEND_BATCH_SIZE) {
      const batch = recipients.slice(i, i + RESEND_BATCH_SIZE);

      // Rate limit pause between batches (skip before first batch)
      if (i > 0) {
        await sleep(RESEND_BATCH_DELAY_MS);
      }

      // Send batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (r: { user_id: string; email: string; nombre_completo: string | null }) => {
          const nombre = r.nombre_completo
            ? r.nombre_completo.split(" ")[0]
            : deriveNameFromEmail(r.email);

          const body = broadcast.cuerpo_html.replaceAll("{{nombre}}", nombre);

          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: "Claude Hackers <hola@claudehackers.com>",
              to: [r.email],
              subject: broadcast.asunto.replaceAll("{{nombre}}", nombre),
              html: body,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
          }
        }),
      );

      // Count results
      for (const r of results) {
        if (r.status === "fulfilled") {
          enviados++;
        } else {
          fallidos++;
          console.error("broadcast-send failed:", r.reason);
        }
      }

      // Incremental update after each batch
      await supabase
        .from("broadcasts")
        .update({ enviados, fallidos })
        .eq("id", broadcast_id);
    }

    // Final update
    const estadoFinal = fallidos === recipients.length ? "error" : "completado";
    await supabase
      .from("broadcasts")
      .update({
        estado: estadoFinal,
        enviados,
        fallidos,
        enviado_en: new Date().toISOString(),
      })
      .eq("id", broadcast_id);

    return Response.json(
      { ok: true, enviados, fallidos, total: recipients.length },
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error("broadcast-send error:", e);
    return Response.json(
      { ok: false, error: e.message },
      { headers: corsHeaders },
    );
  }
});
