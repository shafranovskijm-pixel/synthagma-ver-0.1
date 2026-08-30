import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildSubscriptionUpgradeMessage,
  normalizeSubscriptionPlan,
  trimmed,
  uuid,
} from "../_shared/telegram-domain-contract.ts";
import {
  deliverTelegramDomainNotification,
  supportTelegramChatId,
} from "../_shared/telegram-domain-delivery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PLAN_NAMES: Record<string, string> = {
  free: "Бесплатный",
  start: "Старт",
  standard: "Стандарт",
  professional: "Профессиональный",
  maximum: "Максимальный",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ ok: false, error: "authentication_required" }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ ok: false, error: "invalid_session" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const requestId = uuid(body.request_id);
  const organizationId = uuid(body.organization_id);
  const requestedPlan = normalizeSubscriptionPlan(body.requested_plan);
  const comment = trimmed(body.comment, 1_000) || null;
  if (!requestId || !organizationId || !requestedPlan || requestedPlan === "free") {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const { data: canAccess, error: accessError } = await userClient.rpc(
    "can_access_organization",
    { _organization_id: organizationId, _permission: "settings.write" },
  );
  if (accessError || canAccess !== true) return json({ ok: false, error: "forbidden" }, 403);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id, name, contact_name, email, phone, subscription_plan")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) return json({ ok: false, error: "organization_not_found" }, 404);

  const currentPlan = normalizeSubscriptionPlan(organization.subscription_plan) || "free";
  if (currentPlan === requestedPlan) return json({ ok: false, error: "plan_already_active" }, 409);

  const requestPayload = {
    id: requestId,
    organization_id: organization.id,
    current_plan: currentPlan,
    requested_plan: requestedPlan,
    status: "pending",
    message: comment,
  };
  const { data: inserted, error: insertError } = await admin
    .from("subscription_requests")
    .insert(requestPayload)
    .select("id, organization_id, current_plan, requested_plan, message, created_at")
    .maybeSingle();

  let stored = inserted;
  let replay = false;
  if (insertError?.code === "23505") {
    const { data: existing, error: existingError } = await admin
      .from("subscription_requests")
      .select("id, organization_id, current_plan, requested_plan, message, created_at")
      .eq("id", requestId)
      .maybeSingle();
    const exactReplay = Boolean(
      existing &&
      existing.organization_id === requestPayload.organization_id &&
      existing.current_plan === requestPayload.current_plan &&
      existing.requested_plan === requestPayload.requested_plan &&
      (existing.message || null) === requestPayload.message,
    );
    if (existingError || !exactReplay) return json({ ok: false, error: "request_id_conflict" }, 409);
    stored = existing;
    replay = true;
  } else if (insertError) {
    console.error("subscription request persistence failed", { code: insertError.code || "unknown" });
    return json({ ok: false, error: "persistence_failed" }, 500);
  }
  if (!stored?.id) return json({ ok: false, error: "persistence_failed" }, 500);

  const delivery = await deliverTelegramDomainNotification(admin, {
    action: "subscription_upgrade",
    entityId: stored.id,
    actorKey: `${authData.user.id}:${organization.id}`,
    maxRequests: 3,
    windowSeconds: 3_600,
    targetChatId: supportTelegramChatId(),
    message: buildSubscriptionUpgradeMessage({
      organizationName: organization.name,
      contactName: organization.contact_name,
      email: organization.email,
      phone: organization.phone,
      currentPlan: PLAN_NAMES[currentPlan] || currentPlan,
      requestedPlan,
      requestedPlanName: PLAN_NAMES[requestedPlan] || requestedPlan,
      monthlyPrice: null,
      comment: stored.message,
    }),
  });

  return json({
    ok: true,
    request_id: stored.id,
    created_at: stored.created_at,
    stored: true,
    replay,
    delivery,
  });
});
