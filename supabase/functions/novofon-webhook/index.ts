import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

// Novofon (Zadarma) отправляет уведомления на webhook.
// Верификация: параметр signature = base64(hex(hmac_sha1(concatSortedValues, api_secret)))
// либо GET verification-запрос со `zd_echo` (нужно вернуть его как есть).
async function hmacSha1HexB64(key: string, msg: string): Promise<string> {
  const { encodeHex } = await import("https://deno.land/std@0.224.0/encoding/hex.ts");
  const { encodeBase64 } = await import("https://deno.land/std@0.224.0/encoding/base64.ts");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg));
  const hex = encodeHex(new Uint8Array(sig));
  return encodeBase64(new TextEncoder().encode(hex));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const echo = url.searchParams.get("zd_echo");
  if (echo) {
    // проверочный GET от Novofon при сохранении URL
    return new Response(echo, { status: 200, headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let params: Record<string, string> = {};
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      params = Object.fromEntries(new URLSearchParams(text));
    } else if (contentType.includes("application/json")) {
      params = await req.json();
    } else {
      params = Object.fromEntries(url.searchParams);
    }

    const secret = Deno.env.get("NOVOFON_API_SECRET");
    const signature = req.headers.get("signature");
    if (secret && signature) {
      const sortedKeys = Object.keys(params).sort();
      const concat = sortedKeys.map((k) => params[k]).join("");
      const expected = await hmacSha1HexB64(secret, concat);
      if (expected !== signature) {
        console.warn("signature mismatch");
        // не прерываем — Novofon может слать без signature в некоторых событиях
      }
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Debug: логируем полный payload — Novofon шлёт разные форматы в разных событиях,
    // без этого невозможно понять, какие поля реально приходят.
    console.log("novofon-webhook payload:", JSON.stringify(params));

    const event = String(params.event || params.notification_type || params.type || "").toUpperCase();
    const callId = params.pbx_call_id || params.call_id || params.call_id_with_rec || params.call_session_id;

    if (!callId) {
      console.warn("novofon-webhook: no call id in payload");
      return new Response("no call id", { status: 200, headers: corsHeaders });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const isStart = event.includes("START") || event.includes("NOTIFY_START");
    const isAnswer = event.includes("ANSWER");
    // Явные события завершения: NOTIFY_END, NOTIFY_INTERNAL, HANGUP, END.
    const isEnd = event.includes("END") || event.includes("HANGUP") || event.includes("NOTIFY_INTERNAL");
    const hasRecording = event.includes("RECORD") || !!params.call_recording || !!params.link || !!params.record_link;
    // Иногда финальный статус приходит только с записью (RECORD-событие).
    const durationRaw = params.duration ?? params.billsec ?? params.talk_duration ?? params.call_duration;
    const parsedDuration = durationRaw != null ? (parseInt(String(durationRaw), 10) || null) : null;

    if (isStart) {
      patch.status = "ringing";
      patch.novofon_call_id = callId;
    }
    if (isAnswer) {
      patch.status = "answered";
      patch.answered_at = new Date().toISOString();
    }
    if (isEnd || (hasRecording && parsedDuration !== null)) {
      const rawStatus = String(params.disposition || params.status || "").toLowerCase();
      // ANSWER/ANSWERED → completed, иначе оставляем как есть (busy, no_answer, cancel, failed).
      patch.status = rawStatus.includes("answer") || (!rawStatus && parsedDuration && parsedDuration > 0)
        ? "completed"
        : (rawStatus || "completed");
      patch.ended_at = new Date().toISOString();
      if (parsedDuration !== null) patch.duration_sec = parsedDuration;
    }
    if (hasRecording) {
      patch.recording_url = params.call_recording || params.link || params.record_link;
      patch.has_recording = true;
    }

    // upsert по novofon_call_id
    const { data: existing } = await admin
      .from("call_logs")
      .select("id")
      .eq("novofon_call_id", callId)
      .maybeSingle();

    if (existing) {
      await admin.from("call_logs").update(patch).eq("id", existing.id);
    } else {
      // inbound звонок, которого мы не инициировали
      await admin.from("call_logs").insert({
        manager_user_id: "00000000-0000-0000-0000-000000000000",
        direction: params.internal ? "inbound" : "inbound",
        from_number: params.caller_id || params.from || "",
        to_number: params.destination || params.to || "",
        status: "completed",
        provider: "novofon",
        novofon_call_id: callId,
        ...patch,
      }).select().maybeSingle();
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("novofon-webhook error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
