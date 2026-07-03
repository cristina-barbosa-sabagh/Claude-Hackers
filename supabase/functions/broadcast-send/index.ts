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
    // ── Admin check: verify JWT signature via Supabase Auth ──
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return Response.json(
        { ok: false, reason: "missing authorization" },
        { status: 401, headers: corsHeaders },
      );
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user: caller }, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !caller) {
      return Response.json(
        { ok: false, reason: "invalid token" },
        { status: 401, headers: corsHeaders },
      );
    }
    const callerEmail = (caller.email || "").toLowerCase().trim();
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
        { status: 400, headers: corsHeaders },
      );
    }
    if (test_mode && !test_email) {
      return Response.json(
        { ok: false, reason: "test_mode requires test_email" },
        { status: 400, headers: corsHeaders },
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
        { status: 400, headers: corsHeaders },
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    // ── TEST MODE (synchronous, single email) ──
    if (test_mode) {
      const subject = broadcast.asunto.replaceAll("{{nombre}}", "Cristina");
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
          subject,
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

    // Get recipients via internal function (no _assert_admin) — paginated to avoid 1000-row cap
    let recipients: any[] = [];
    let rErr: any = null;
    {
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data, error } = await supabase.rpc("_internal_broadcast_recipients", {
          p_segmento: broadcast.segmento,
          p_limit: PAGE,
          p_offset: offset,
        });
        if (error) { rErr = error; break; }
        recipients = recipients.concat(data || []);
        if (!data || data.length < PAGE) break;
        offset += PAGE;
      }
    }
    console.log(`[broadcast-send] Total recipients fetched: ${recipients.length}`);

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
        { status: 400, headers: corsHeaders },
      );
    }

    // Update total
    await supabase
      .from("broadcasts")
      .update({ total_destinatarios: recipients.length })
      .eq("id", broadcast_id);

    // ── Respond immediately, process batches in background ──
    // @ts-ignore: EdgeRuntime.waitUntil is available in Supabase Edge Functions
    EdgeRuntime.waitUntil((async () => {
      let enviados = 0;
      let fallidos = 0;

      try {
        for (let i = 0; i < recipients.length; i += RESEND_BATCH_SIZE) {
          const batch = recipients.slice(i, i + RESEND_BATCH_SIZE);

          if (i > 0) {
            await sleep(RESEND_BATCH_DELAY_MS);
          }

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
      } catch (e) {
        console.error("broadcast-send background error:", e);
        await supabase
          .from("broadcasts")
          .update({
            estado: "error",
            enviados,
            fallidos,
            enviado_en: new Date().toISOString(),
          })
          .eq("id", broadcast_id);
      }
    })());

    return Response.json(
      { ok: true, status: "processing", broadcast_id, total: recipients.length },
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
