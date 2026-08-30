import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  attemptDemoTelegramDelivery,
  confirmDemoTelegramDelivery,
  DEMO_FORCE_RETRY_CONFIRMATION,
  forceReclaimDemoTelegramClaim,
  isDemoNotificationRecord,
  parseDemoTelegramMetadata,
} from "../submit-demo-request/telegramDelivery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function uuid(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(normalized)
    ? normalized
    : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const payload = body && typeof body === "object"
    ? body as Record<string, unknown>
    : {};
  const notificationId = uuid(payload.notification_id);
  if (!notificationId) {
    return json({ ok: false, error: "invalid_notification_id" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: record, error: recordError } = await admin
    .from("admin_notifications")
    .select("id, related_entity_id, type, metadata")
    .eq("id", notificationId)
    .maybeSingle();

  if (recordError || !record || !isDemoNotificationRecord(record)) {
    return json({ ok: false, error: "notification_not_found" }, 404);
  }

  const metadata = parseDemoTelegramMetadata(record.metadata);
  if (!metadata) {
    return json({ ok: false, error: "notification_not_found" }, 404);
  }
  if (metadata.telegram_status === "sent") {
    return json({ ok: true, status: "sent" });
  }

  if (payload.confirm_delivered === true) {
    const confirmed = await confirmDemoTelegramDelivery(admin, record);
    return confirmed
      ? json({ ok: true, status: "sent", reconciled: true })
      : json({ ok: false, error: "delivery_confirmation_failed" }, 500);
  }

  const forceRetry = payload.force_retry === true;
  const forceConfirmation = payload.confirm_duplicate_risk;
  const uncertainDelivery = metadata.telegram_status === "pending" ||
    metadata.telegram_status === "sending" ||
    metadata.failure_code === "telegram_invoke_failed" ||
    metadata.failure_code === "telegram_delivery_outcome_unknown";

  if (uncertainDelivery && !forceRetry) {
    return json({
      ok: false,
      status: "pending",
      error: "force_retry_confirmation_required",
      duplicate_risk: true,
    }, 409);
  }

  let preclaimedKey: string | undefined;
  if (forceRetry) {
    if (forceConfirmation !== DEMO_FORCE_RETRY_CONFIRMATION) {
      return json({
        ok: false,
        error: "force_retry_confirmation_required",
        duplicate_risk: true,
      }, 400);
    }
    const forceClaim = await forceReclaimDemoTelegramClaim(admin, metadata);
    if (forceClaim.status === "failed") {
      return json({ ok: false, error: "force_retry_claim_failed" }, 500);
    }
    if (forceClaim.status === "busy") {
      return json({
        ok: true,
        status: "pending",
        refresh_required: true,
        duplicate_risk: true,
      });
    }
    preclaimedKey = forceClaim.claim_key;
  }

  const status = await attemptDemoTelegramDelivery(admin, record, {
    preclaimedKey,
  });
  if (status === "sent") return json({ ok: true, status: "sent" });
  if (status === "pending") {
    return json({ ok: true, status: "pending", duplicate_risk: true });
  }
  return json({
    ok: false,
    status: "failed",
    error: "telegram_delivery_failed",
  }, 502);
});
