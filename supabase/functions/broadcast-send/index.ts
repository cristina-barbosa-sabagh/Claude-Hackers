import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const CHUNK_SIZE = 1000;
const RESEND_BATCH = 100;
const BATCH_DELAY_MS = 500;
const LEASE_SECONDS = 120;
const MAX_INTENTOS = 3; // tope de reintentos por destinatario -> fallido terminal
const FN_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/broadcast-send`;
const ADMIN_DOMAIN = "growthrockstar.com";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function deriveNameFromEmail(email: string): string {
  const p = email.split("@")[0] || "";
  const c = p.replace(/[._\d].*$/, "") || p.replace(/[._\d]/g, "") || p;
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

async function idemKey(broadcastId: string, userIds: string[]): Promise<string> {
  const raw = `${broadcastId}|${userIds.join(",")}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `bc_${hex.slice(0, 40)}`;
}

async function fetchSegment(supabase: any, segmento: string): Promise<any[]> {
  const PAGE = 1000;
  let offset = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await supabase.rpc("_internal_broadcast_recipients", {
      p_segmento: segmento,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// user_ids "done" (enviado o fallido-terminal) + intentos previos de los reintentables
async function loadEnvioState(supabase: any, broadcastId: string) {
  const done = new Set<string>();
  const intentos = new Map<string, number>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase
      .from("broadcast_envios")
      .select("user_id, estado, intentos")
      .eq("broadcast_id", broadcastId)
      .range(from, from + PAGE - 1);
    for (const r of (data || [])) {
      if (r.estado === "enviado" || (r.estado === "fallido" && r.intentos >= MAX_INTENTOS)) {
        done.add(r.user_id);
      } else {
        intentos.set(r.user_id, r.intentos || 0);
      }
    }
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return { done, intentos };
}

async function processChunk(supabase: any, resendKey: string, broadcastId: string) {
  // Lease atomico: solo procesa si esta 'enviando' y sin lease vigente
  const nowIso = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();
  const { data: claimed } = await supabase
    .from("broadcasts")
    .update({ lease_hasta: leaseUntil })
    .eq("id", broadcastId)
    .eq("estado", "enviando")
    .or(`lease_hasta.is.null,lease_hasta.lt.${nowIso}`)
    .select("id, asunto, cuerpo_html, segmento")
    .maybeSingle();
  if (!claimed) return;

  try {
    const segment = await fetchSegment(supabase, claimed.segmento);
    const { done, intentos } = await loadEnvioState(supabase, broadcastId);
    const pending = segment.filter((r: any) => !done.has(r.user_id)).slice(0, CHUNK_SIZE);

    if (pending.length === 0) {
      await finalize(supabase, broadcastId);
      return;
    }

    let progresoEnChunk = 0; // filas realmente escritas (enviado/fallido) en esta invocacion
    for (let i = 0; i < pending.length; i += RESEND_BATCH) {
      const group = pending.slice(i, i + RESEND_BATCH);
      if (i > 0) await sleep(BATCH_DELAY_MS);

      const emails = group.map((r: any) => {
        const nombre = r.nombre_completo ? r.nombre_completo.split(" ")[0] : deriveNameFromEmail(r.email);
        return {
          from: "Claude Hackers <hola@claudehackers.com>",
          to: [r.email],
          subject: claimed.asunto.replaceAll("{{nombre}}", nombre),
          html: claimed.cuerpo_html.replaceAll("{{nombre}}", nombre),
        };
      });
      const key = await idemKey(broadcastId, group.map((r: any) => r.user_id));

      let res: Response;
      try {
        res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
            "Idempotency-Key": key,
            "x-batch-validation": "permissive", // envia los validos; devuelve errors[] por item
          },
          body: JSON.stringify(emails),
        });
      } catch (e) {
        // Error de red: transitorio -> no registrar, se reintenta el proximo chunk
        console.warn("batch fetch error (transitorio, se reintenta):", e);
        continue;
      }

      // Transitorios (429 / 5xx): no queman intentos, se reintentan
      if (!res.ok && (res.status === 429 || res.status >= 500)) {
        console.warn(`batch ${res.status} (transitorio, se reintenta)`);
        continue;
      }

      const enviadoRows: any[] = [];
      const falladoRows: any[] = [];

      if (res.ok) {
        // Permissive: data[] viene COMPACTADO (solo exitosos, en orden original, sin gaps);
        // errors[].index apunta a la posicion ORIGINAL en `group`. Por eso dataPtr solo
        // avanza en los exitos y recorre `group` en orden -> emparejamiento correcto.
        const j: any = await res.json().catch(() => ({}));
        const data = Array.isArray(j?.data) ? j.data : [];
        const errs = Array.isArray(j?.errors) ? j.errors : [];
        const failIdx = new Map<number, string>(
          errs.map((e: any) => [e.index, e.message || "validation error"]),
        );
        let dataPtr = 0;
        group.forEach((r: any, idx: number) => {
          if (failIdx.has(idx)) {
            falladoRows.push({
              broadcast_id: broadcastId,
              user_id: r.user_id,
              email: r.email,
              estado: "fallido",
              error: (failIdx.get(idx) || "").slice(0, 500),
              intentos: (intentos.get(r.user_id) || 0) + 1,
              resend_id: null,
              enviado_en: null,
            });
          } else {
            enviadoRows.push({
              broadcast_id: broadcastId,
              user_id: r.user_id,
              email: r.email,
              estado: "enviado",
              resend_id: data[dataPtr++]?.id ?? null,
              error: null,
              enviado_en: new Date().toISOString(),
              intentos: intentos.get(r.user_id) || 0,
            });
          }
        });
      } else {
        // 4xx duro (no 429/5xx, ya filtrados arriba): lote invalido a nivel request.
        // Bloque hermano de `if (res.ok)` — no anidado. Sin dataPtr aca.
        const t = await res.text();
        group.forEach((r: any) => {
          falladoRows.push({
            broadcast_id: broadcastId,
            user_id: r.user_id,
            email: r.email,
            estado: "fallido",
            error: t.slice(0, 500),
            intentos: (intentos.get(r.user_id) || 0) + 1,
            resend_id: null,
            enviado_en: null,
          });
        });
      }

      // Upsert (onConflict update; enviado pisa fallido previo; intentos se actualiza).
      // Si falla, abortar el chunk (throw): reintenta con la MISMA composicion de lote
      // -> mismo Idempotency-Key -> Resend deduplica, sin envio duplicado.
      if (enviadoRows.length) {
        const { error: upEnvErr } = await supabase.from("broadcast_envios").upsert(enviadoRows, { onConflict: "broadcast_id,user_id" });
        if (upEnvErr) throw new Error("upsert enviados fallo: " + upEnvErr.message);
      }
      if (falladoRows.length) {
        const { error: upFalErr } = await supabase.from("broadcast_envios").upsert(falladoRows, { onConflict: "broadcast_id,user_id" });
        if (upFalErr) throw new Error("upsert fallidos fallo: " + upFalErr.message);
      }

      progresoEnChunk += enviadoRows.length + falladoRows.length; // solo cuenta progreso REAL (no transitorios)
      await bumpProgress(supabase, broadcastId);
    }

    // Recalcular: ¿queda algo por enviar (incluye fallidos no-terminales que reintentan)?
    const { done: done2 } = await loadEnvioState(supabase, broadcastId);
    const remaining = segment.filter((r: any) => !done2.has(r.user_id)).length;
    // Siempre soltar el lease; pero ultimo_progreso_en SOLO si hubo progreso real en
    // esta invocacion. Si progresoEnChunk === 0 (todos los batches transitorios), NO se
    // toca ultimo_progreso_en -> el watchdog mide tiempo sin progreso REAL, no sin intentar.
    const finalUpd: Record<string, unknown> = { lease_hasta: null };
    if (progresoEnChunk > 0) finalUpd.ultimo_progreso_en = new Date().toISOString();
    await supabase.from("broadcasts").update(finalUpd).eq("id", broadcastId);
    // Self-invoke SOLO si hubo progreso real: evita loop ajustado si Resend esta caido
    // (todo transitorio). En ese caso el cron de continuacion reintenta con espaciado.
    if (remaining > 0 && progresoEnChunk > 0) selfInvoke(broadcastId);
    else if (remaining === 0) await finalize(supabase, broadcastId);
  } catch (e) {
    console.error("processChunk error:", e);
    // Soltar lease; el watchdog decide si estanco. No marcar 'error' por timeout.
    await supabase.from("broadcasts").update({ lease_hasta: null }).eq("id", broadcastId);
    throw e;
  }
}

async function countEnvios(supabase: any, broadcastId: string) {
  const { count: env } = await supabase
    .from("broadcast_envios")
    .select("*", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("estado", "enviado");
  const { count: fal } = await supabase
    .from("broadcast_envios")
    .select("*", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("estado", "fallido")
    .gte("intentos", MAX_INTENTOS); // solo fallidos definitivos
  return { enviados: env || 0, fallidos: fal || 0 };
}

async function bumpProgress(supabase: any, broadcastId: string) {
  const { enviados, fallidos } = await countEnvios(supabase, broadcastId);
  await supabase
    .from("broadcasts")
    .update({
      enviados,
      fallidos,
      ultimo_progreso_en: new Date().toISOString(),
      lease_hasta: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
    })
    .eq("id", broadcastId);
}

async function finalize(supabase: any, broadcastId: string) {
  const { enviados, fallidos } = await countEnvios(supabase, broadcastId);
  await supabase
    .from("broadcasts")
    .update({
      estado: enviados === 0 ? "error" : "completado",
      enviados,
      fallidos,
      lease_hasta: null,
      enviado_en: new Date().toISOString(),
    })
    .eq("id", broadcastId);
}

function selfInvoke(broadcastId: string) {
  const secret = Deno.env.get("BROADCAST_INTERNAL_SECRET")!;
  // @ts-ignore EdgeRuntime disponible en Supabase Edge Functions
  EdgeRuntime.waitUntil(
    fetch(FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ broadcast_id: broadcastId, mode: "chunk" }),
    }).catch((e) => console.error("selfInvoke failed:", e)),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { broadcast_id, mode, test_mode, test_email } = body;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    // ── AUTH ──
    if (mode === "chunk") {
      if ((req.headers.get("x-internal-secret") || "") !== Deno.env.get("BROADCAST_INTERNAL_SECRET")) {
        return Response.json({ ok: false, reason: "unauthorized" }, { status: 401, headers: corsHeaders });
      }
    } else {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return Response.json({ ok: false, reason: "missing authorization" }, { status: 401, headers: corsHeaders });
      const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user: caller }, error: authErr } = await authClient.auth.getUser(token);
      if (authErr || !caller) return Response.json({ ok: false, reason: "invalid token" }, { status: 401, headers: corsHeaders });
      const dom = (caller.email || "").toLowerCase().trim().split("@")[1] || "";
      if (dom !== ADMIN_DOMAIN) return Response.json({ ok: false, reason: "unauthorized" }, { status: 403, headers: corsHeaders });
    }

    if (!broadcast_id) return Response.json({ ok: false, reason: "missing broadcast_id" }, { status: 400, headers: corsHeaders });

    // ── TEST MODE (single, sincrono) ──
    if (test_mode) {
      if (!test_email) return Response.json({ ok: false, reason: "test_mode requires test_email" }, { status: 400, headers: corsHeaders });
      const { data: b } = await supabase.from("broadcasts").select("asunto, cuerpo_html").eq("id", broadcast_id).maybeSingle();
      if (!b) return Response.json({ ok: false, reason: "broadcast not found" }, { status: 400, headers: corsHeaders });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: "Claude Hackers <hola@claudehackers.com>",
          to: [test_email],
          subject: b.asunto.replaceAll("{{nombre}}", "Cristina"),
          html: b.cuerpo_html.replaceAll("{{nombre}}", "Cristina"),
        }),
      });
      if (!res.ok) return Response.json({ ok: false, reason: "resend error", detail: await res.text() }, { headers: corsHeaders });
      return Response.json({ ok: true, sent_to: test_email }, { headers: corsHeaders });
    }

    // ── CHUNK (continuacion interna: cron / self-invoke) ──
    if (mode === "chunk") {
      // @ts-ignore
      EdgeRuntime.waitUntil(processChunk(supabase, resendKey, broadcast_id));
      return Response.json({ ok: true, status: "chunk-processing", broadcast_id }, { headers: corsHeaders });
    }

    // ── START (inicio / reanudacion humana) ──
    const { data: b, error: bErr } = await supabase.from("broadcasts").select("segmento").eq("id", broadcast_id).maybeSingle();
    if (bErr || !b) return Response.json({ ok: false, reason: "broadcast not found" }, { status: 400, headers: corsHeaders });
    const total = (await fetchSegment(supabase, b.segmento)).length;
    if (total === 0) {
      await supabase.from("broadcasts").update({
        estado: "error",
        total_destinatarios: 0,
        nota_estado: "Sin destinatarios en el segmento",
        enviado_en: new Date().toISOString(),
      }).eq("id", broadcast_id);
      return Response.json({ ok: false, reason: "no recipients" }, { status: 400, headers: corsHeaders });
    }
    const { error: startErr } = await supabase.from("broadcasts").update({
      estado: "enviando",
      total_destinatarios: total,
      ultimo_progreso_en: new Date().toISOString(),
      lease_hasta: null,
      nota_estado: null,
    }).eq("id", broadcast_id);
    // Si el START falla, NO seguir: procesar sin marcar 'enviando' deja un broadcast fantasma.
    if (startErr) {
      console.error("broadcast-send START update failed:", startErr);
      return Response.json({ ok: false, reason: "failed to start", detail: startErr.message }, { status: 500, headers: corsHeaders });
    }
    // @ts-ignore
    EdgeRuntime.waitUntil(processChunk(supabase, resendKey, broadcast_id));
    return Response.json({ ok: true, status: "started", broadcast_id, total }, { headers: corsHeaders });
  } catch (e) {
    console.error("broadcast-send error:", e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
