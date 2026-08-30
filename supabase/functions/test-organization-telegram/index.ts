import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildOrganizationTelegramTestMessage, uuid } from "../_shared/telegram-domain-contract.ts";
import { deliverTelegramDomainNotification } from "../_shared/telegram-domain-delivery.ts";

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
  const organizationId = uuid(body.organization_id);
  const requestId = uuid(body.request_id);
  if (!organizationId || !requestId) return json({ ok: false, error: "invalid_request" }, 400);

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
    .select("id, name, telegram_notify_enabled, telegram_notify_chat_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) return json({ ok: false, error: "organization_not_found" }, 404);
  if (organization.telegram_notify_enabled !== true || !organization.telegram_notify_chat_id) {
    return json({ ok: false, error: "telegram_not_configured" }, 409);
  }

  const delivery = await deliverTelegramDomainNotification(admin, {
    action: "organization_telegram_test",
    entityId: requestId,
    actorKey: `${authData.user.id}:${organization.id}`,
    maxRequests: 3,
    windowSeconds: 300,
    targetChatId: organization.telegram_notify_chat_id,
    message: buildOrganizationTelegramTestMessage(organization.name),
  });

  if (delivery === "rate_limited") return json({ ok: false, error: "rate_limited", delivery }, 429);
  if (delivery === "configuration_error") return json({ ok: false, error: "telegram_not_configured", delivery }, 409);
  return json({
    ok: delivery === "sent" || delivery === "duplicate",
    organization_id: organization.id,
    delivery,
  }, delivery === "pending" ? 202 : 200);
});
