import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildRegistrationFailureMessage,
  hmacSha256Hex,
  readRegistrationAttemptBody,
  registrationClientAddress,
  REGISTRATION_ATTEMPT_GLOBAL_RATE_MAX,
  REGISTRATION_ATTEMPT_RATE_MAX,
  REGISTRATION_ATTEMPT_RATE_WINDOW_SECONDS,
  REGISTRATION_FAILURE_GLOBAL_RATE_MAX,
  REGISTRATION_FAILURE_GLOBAL_RATE_WINDOW_SECONDS,
  REGISTRATION_FAILURE_RATE_MAX,
  REGISTRATION_FAILURE_RATE_WINDOW_SECONDS,
  REGISTRATION_FAILURE_WINDOW_SECONDS,
  RegistrationAttemptContractError,
  type RegistrationAttemptPayload,
} from "./contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
type AdminClient = SupabaseClient<any>;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function rowFromPayload(payload: RegistrationAttemptPayload, ip: string, userAgent: string | null) {
  const { attempt_id: _attemptId, ...fields } = payload;
  return {
    ...fields,
    user_agent: userAgent?.slice(0, 500) || undefined,
    ip,
  };
}

type RegistrationRateScope =
  | "event_client"
  | "event_global"
  | "failure_client"
  | "failure_global";

async function claimRate(
  admin: AdminClient,
  scope: RegistrationRateScope,
  actorHash: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<"allowed" | "rate_limited" | "unavailable"> {
  const { data, error } = await admin.rpc("claim_registration_attempt_rate", {
    _scope: scope,
    _actor_hash: actorHash,
    _max_requests: maxRequests,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("registration attempt rate claim failed", { scope, code: error.code || "unknown" });
    return "unavailable";
  }
  return data === "allowed" || data === "rate_limited"
    ? data
    : "unavailable";
}

async function claimFailureAlert(
  admin: AdminClient,
  actorHash: string,
  dedupHash: string,
): Promise<"claimed" | "duplicate" | "unavailable"> {
  const { data, error } = await admin.rpc("claim_registration_failure_alert", {
    _actor_hash: actorHash,
    _dedup_hash: dedupHash,
    _lease_seconds: 300,
  });
  if (error) {
    console.error("registration failure alert claim failed", { code: error.code || "unknown" });
    return "unavailable";
  }
  return data === "claimed" || data === "duplicate" ? data : "unavailable";
}

async function completeFailureAlert(
  admin: AdminClient,
  dedupHash: string,
  delivered: boolean,
): Promise<void> {
  const { error } = await admin.rpc("complete_registration_failure_alert", {
    _dedup_hash: dedupHash,
    _delivered: delivered,
    _retry_after_seconds: delivered ? 300 : 60,
  });
  if (error) {
    console.error("registration failure alert completion failed", { code: error.code || "unknown" });
  }
}

async function notifyTelegramOnFailure(
  admin: AdminClient,
  payload: RegistrationAttemptPayload,
  ip: string,
  serviceRoleKey: string,
): Promise<void> {
  const clientRateActor = await hmacSha256Hex(`failure-rate-client:${ip}`, serviceRoleKey);
  const globalRateActor = await hmacSha256Hex("failure-rate-global", serviceRoleKey);
  const clientRate = await claimRate(
    admin,
    "failure_client",
    clientRateActor,
    REGISTRATION_FAILURE_RATE_MAX,
    REGISTRATION_FAILURE_RATE_WINDOW_SECONDS,
  );
  if (clientRate !== "allowed") return;
  const globalRate = await claimRate(
    admin,
    "failure_global",
    globalRateActor,
    REGISTRATION_FAILURE_GLOBAL_RATE_MAX,
    REGISTRATION_FAILURE_GLOBAL_RATE_WINDOW_SECONDS,
  );
  if (globalRate !== "allowed") return;

  const identity = payload.email?.toLowerCase() || payload.attempt_id || ip || "unknown";
  const actorHash = await hmacSha256Hex(`failure-actor:${identity}`, serviceRoleKey);
  const hourBucket = Math.floor(Date.now() / (REGISTRATION_FAILURE_WINDOW_SECONDS * 1000));
  const dedupHash = await hmacSha256Hex(`failure-dedup:${identity}:${hourBucket}`, serviceRoleKey);
  const claim = await claimFailureAlert(admin, actorHash, dedupHash);
  if (claim !== "claimed") return;

  let delivered = false;
  try {
    const { data, error } = await admin.functions.invoke("send-telegram-notification", {
      body: { message: buildRegistrationFailureMessage(payload, ip) },
    });
    delivered = !error && !!data && typeof data === "object" &&
      (data as Record<string, unknown>).success === true;
  } catch {
    delivered = false;
  }
  await completeFailureAlert(admin, dedupHash, delivered);
  if (!delivered) {
    console.warn("registration failure Telegram delivery not confirmed");
  }
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
    if (!supabaseUrl || serviceRoleKey.length < 32) {
      return json({ error: "service_unavailable" }, 503);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await readRegistrationAttemptBody(request);
    const ip = registrationClientAddress(request);
    const clientIdentity = ip === "unknown"
      ? request.headers.get("user-agent")?.slice(0, 500) || "unknown"
      : ip;
    const clientActorHash = await hmacSha256Hex(`event-rate-client:${clientIdentity}`, serviceRoleKey);
    const clientRate = await claimRate(
      admin,
      "event_client",
      clientActorHash,
      REGISTRATION_ATTEMPT_RATE_MAX,
      REGISTRATION_ATTEMPT_RATE_WINDOW_SECONDS,
    );
    if (clientRate === "unavailable") return json({ error: "logging_unavailable" }, 503);
    if (clientRate === "rate_limited") return json({ error: "rate_limited" }, 429);

    const globalActorHash = await hmacSha256Hex("event-rate-global", serviceRoleKey);
    const globalRate = await claimRate(
      admin,
      "event_global",
      globalActorHash,
      REGISTRATION_ATTEMPT_GLOBAL_RATE_MAX,
      REGISTRATION_ATTEMPT_RATE_WINDOW_SECONDS,
    );
    if (globalRate === "unavailable") return json({ error: "logging_unavailable" }, 503);
    if (globalRate === "rate_limited") return json({ error: "rate_limited" }, 429);

    const row = rowFromPayload(payload, ip, request.headers.get("user-agent"));
    let attemptId: string | null = payload.attempt_id || null;
    if (attemptId) {
      const { data, error } = await admin
        .from("registration_attempts")
        .update(row)
        .eq("id", attemptId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) attemptId = null;
    }
    if (!attemptId) {
      const { data, error } = await admin
        .from("registration_attempts")
        .insert(row)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      attemptId = data?.id || null;
    }

    if (payload.step === "failed") {
      await notifyTelegramOnFailure(admin, payload, ip, serviceRoleKey);
    }

    return json({ ok: true, attempt_id: attemptId });
  } catch (error) {
    if (error instanceof RegistrationAttemptContractError) {
      return json({ error: error.code }, error.status);
    }
    console.error("log-registration-attempt failed", {
      kind: error instanceof Error ? error.name : "unknown",
    });
    return json({ error: "internal_error" }, 500);
  }
});
