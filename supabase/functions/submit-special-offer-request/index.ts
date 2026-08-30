import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildSpecialOfferMessage,
  isReasonablePhone,
  phoneDigits,
  trimmed,
  uuid,
} from "../_shared/telegram-domain-contract.ts";
import {
  clientAddress,
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const requestId = uuid(body.request_id);
  const popupId = uuid(body.popup_id);
  const name = trimmed(body.name, 200);
  const phone = trimmed(body.phone, 64);
  if (!requestId || !popupId || name.length < 2 || !isReasonablePhone(phone)) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: popup, error: popupError } = await admin
    .from("landing_popups")
    .select("id, title, source_tag")
    .eq("id", popupId)
    .eq("enabled", true)
    .maybeSingle();
  if (popupError) return json({ ok: false, error: "popup_lookup_failed" }, 500);
  if (!popup) return json({ ok: false, error: "popup_not_available" }, 404);

  const leadPayload = {
    id: requestId,
    full_name: name,
    phone,
    email: `special-offer+${requestId}@lead.local`,
    plan: trimmed(popup.source_tag, 100) || "special_offer",
    status: "new",
  };
  const { data: inserted, error: insertError } = await admin
    .from("plan_requests")
    .insert(leadPayload)
    .select("id, full_name, phone, email, plan")
    .maybeSingle();

  let stored = inserted;
  let replay = false;
  if (insertError?.code === "23505") {
    const { data: existing, error: existingError } = await admin
      .from("plan_requests")
      .select("id, full_name, phone, email, plan")
      .eq("id", requestId)
      .maybeSingle();
    const exactReplay = Boolean(
      existing &&
      existing.full_name === leadPayload.full_name &&
      existing.phone === leadPayload.phone &&
      existing.email === leadPayload.email &&
      existing.plan === leadPayload.plan,
    );
    if (existingError || !exactReplay) {
      return json({ ok: false, error: "request_id_conflict" }, 409);
    }
    stored = existing;
    replay = true;
  } else if (insertError) {
    console.error("special offer persistence failed", { code: insertError.code || "unknown" });
    return json({ ok: false, error: "persistence_failed" }, 500);
  }

  if (!stored?.id) return json({ ok: false, error: "persistence_failed" }, 500);

  const address = clientAddress(req);
  const actorKey = address === "unknown" ? `phone:${phoneDigits(phone)}` : `ip:${address}`;
  const delivery = await deliverTelegramDomainNotification(admin, {
    action: "special_offer_request",
    entityId: stored.id,
    actorKey,
    maxRequests: 3,
    windowSeconds: 3_600,
    targetChatId: supportTelegramChatId(),
    message: buildSpecialOfferMessage({
      name: stored.full_name,
      phone: stored.phone,
      popupTitle: trimmed(popup.title, 300),
      sourceTag: stored.plan,
    }),
  });

  return json({
    ok: true,
    request_id: stored.id,
    stored: true,
    replay,
    delivery,
  });
});
