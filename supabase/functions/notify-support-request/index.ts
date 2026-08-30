import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildSupportRequestMessage, uuid } from "../_shared/telegram-domain-contract.ts";
import {
  deliverTelegramDomainNotification,
  isTrustedSupabaseStorageUrl,
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

function roleLabel(roles: string[]): string {
  if (roles.includes("admin")) return "Администратор";
  if (roles.includes("organization")) return "Организация";
  if (roles.includes("student")) return "Ученик";
  return "Пользователь";
}

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
  if (!requestId) return json({ ok: false, error: "invalid_request_id" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [requestResult, profileResult, rolesResult] = await Promise.all([
    admin
      .from("support_requests")
      .select("id, user_id, organization_id, description, contact_phone, screenshot_url, browser_info, page_url, error_logs")
      .eq("id", requestId)
      .eq("user_id", authData.user.id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name, email, organization_id")
      .eq("user_id", authData.user.id)
      .maybeSingle(),
    admin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id),
  ]);
  if (requestResult.error || !requestResult.data) {
    return json({ ok: false, error: "support_request_not_found" }, 404);
  }
  if (profileResult.error || !profileResult.data) {
    return json({ ok: false, error: "profile_not_found" }, 404);
  }

  const supportRequest = requestResult.data;
  const profile = profileResult.data;
  if ((supportRequest.organization_id || null) !== (profile.organization_id || null)) {
    return json({ ok: false, error: "organization_mismatch" }, 403);
  }

  const screenshotUrl = isTrustedSupabaseStorageUrl(supportRequest.screenshot_url, url)
    ? supportRequest.screenshot_url
    : null;
  const delivery = await deliverTelegramDomainNotification(admin, {
    action: "support_request",
    entityId: supportRequest.id,
    actorKey: authData.user.id,
    maxRequests: 5,
    windowSeconds: 900,
    targetChatId: supportTelegramChatId(),
    message: buildSupportRequestMessage({
      userName: profile.full_name,
      userEmail: profile.email || authData.user.email || null,
      role: roleLabel((rolesResult.data || []).map((row) => String(row.role))),
      organizationId: profile.organization_id,
      description: supportRequest.description,
      contactPhone: supportRequest.contact_phone,
      browserInfo: supportRequest.browser_info,
      pageUrl: supportRequest.page_url,
      errorLogs: supportRequest.error_logs,
      screenshotUrl,
    }),
    photoUrl: screenshotUrl,
  });

  return json({ ok: true, request_id: supportRequest.id, stored: true, delivery });
});
