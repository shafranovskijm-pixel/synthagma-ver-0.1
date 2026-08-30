import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildOrganizationRegistrationMessage, uuid } from "../_shared/telegram-domain-contract.ts";
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
  if (!organizationId) return json({ ok: false, error: "invalid_organization_id" }, 400);

  const { data: canAccess, error: accessError } = await userClient.rpc(
    "can_access_organization",
    { _organization_id: organizationId, _permission: "settings.write" },
  );
  if (accessError || canAccess !== true) return json({ ok: false, error: "forbidden" }, 403);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [organizationResult, requestResult] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, contact_name, email, phone, inn, promo_code, subscription_plan")
      .eq("id", organizationId)
      .maybeSingle(),
    admin
      .from("subscription_requests")
      .select("requested_plan")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (organizationResult.error || !organizationResult.data) {
    return json({ ok: false, error: "organization_not_found" }, 404);
  }

  const organization = organizationResult.data;
  const delivery = await deliverTelegramDomainNotification(admin, {
    action: "organization_registration",
    entityId: organization.id,
    actorKey: authData.user.id,
    maxRequests: 5,
    windowSeconds: 3_600,
    targetChatId: supportTelegramChatId(),
    message: buildOrganizationRegistrationMessage({
      name: organization.name,
      contactName: organization.contact_name,
      email: organization.email,
      phone: organization.phone,
      inn: organization.inn,
      requestedPlan: requestResult.data?.requested_plan || organization.subscription_plan,
      promoCode: organization.promo_code,
    }),
  });

  return json({ ok: true, organization_id: organization.id, delivery });
});
