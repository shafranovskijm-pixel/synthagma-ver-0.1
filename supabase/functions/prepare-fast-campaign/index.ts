import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildFastCampaignSchedule, summarizeFastCampaignSchedule } from "../_shared/fast-campaign-schedule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type PrepareStage =
  | "request"
  | "campaign"
  | "authorization"
  | "queue_lookup"
  | "recipients"
  | "senders"
  | "deliverability"
  | "schedule"
  | "queue_insert"
  | "campaign_update";

const jsonError = (requestId: string, stage: PrepareStage, error: string, status: number, details: Record<string, unknown> = {}) => {
  console.error(JSON.stringify({ event: "prepare_fast_campaign_error", request_id: requestId, stage, error, ...details }));
  return json({ error, request_id: requestId }, status);
};

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const BUILTIN_VALUES = new Set([
  "first_name", "last_name", "organization", "position", "city", "email",
  "name", "recipient_name", "company", "unsubscribe_url",
]);

function templateKeys(...templates: string[]) {
  const keys = new Set<string>();
  for (const template of templates) {
    for (const match of String(template || "").matchAll(TOKEN_RE)) keys.add(match[1]);
  }
  return [...keys];
}

function valueFor(recipient: Record<string, unknown>, key: string) {
  if (key === "unsubscribe_url") return "dynamic";
  if (key === "name" || key === "recipient_name") {
    return String(recipient.recipient_name || [recipient.first_name, recipient.last_name].filter(Boolean).join(" ") || "").trim();
  }
  if (key === "company") return String(recipient.organization || recipient.recipient_name || "").trim();
  if (BUILTIN_VALUES.has(key)) return String(recipient[key] || "").trim();
  const custom = recipient.custom_data && typeof recipient.custom_data === "object"
    ? recipient.custom_data as Record<string, unknown>
    : {};
  return String(custom[key] ?? "").trim();
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  let stage: PrepareStage = "request";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData?.user) return jsonError(requestId, stage, "Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id : "";
    const startDateMsk = typeof body?.start_date_msk === "string" ? body.start_date_msk : "";
    if (!campaignId || !/^\d{4}-\d{2}-\d{2}$/.test(startDateMsk)) {
      return jsonError(requestId, stage, "campaign_id and start_date_msk are required", 400);
    }

    stage = "campaign";
    const admin = createClient(url, serviceKey);
    const { data: campaign, error: campaignError } = await admin
      .from("email_campaigns")
      .select("id,organization_id,status,campaign_mode,operator_attested_at,subject,html_body")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignError || !campaign?.organization_id) return jsonError(requestId, stage, "campaign_not_found", 404);

    stage = "authorization";
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: authData.user.id,
      _role: "admin",
    });
    let allowed = isAdmin === true;
    if (!allowed) {
      const { data: canAccess } = await userClient.rpc("can_access_organization", {
        _organization_id: campaign.organization_id,
        _permission: "email.manage",
      });
      allowed = canAccess === true;
    }
    if (!allowed) return jsonError(requestId, stage, "Forbidden", 403);
    if (campaign.campaign_mode !== "cold_outreach" || !campaign.operator_attested_at) {
      return jsonError(requestId, stage, "cold_outreach_attestation_required", 400);
    }
    if (!["draft", "paused"].includes(campaign.status)) {
      return jsonError(requestId, stage, "campaign_must_be_draft_or_paused", 409);
    }

    stage = "queue_lookup";
    const { count: existingJobs, error: jobsError } = await admin
      .from("mailing_send_jobs").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
    if (jobsError) return jsonError(requestId, stage, "queue_lookup_failed", 500);
    if ((existingJobs || 0) > 0) return jsonError(requestId, stage, "campaign_queue_already_exists", 409, { jobs: existingJobs });

    stage = "recipients";
    const { data: recipients, error: recipientsError } = await admin
      .from("email_campaign_recipients")
      .select("id,email,recipient_name,first_name,last_name,organization,position,city,custom_data,status")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("id", { ascending: true });
    if (recipientsError || !recipients?.length) return jsonError(requestId, stage, "no_pending_recipients", 400);

    const keys = templateKeys(campaign.subject, campaign.html_body);
    const invalidRecipients = recipients.filter((recipient) => keys.some((key) => !valueFor(recipient, key)));
    if (invalidRecipients.length) {
      return jsonError(requestId, stage, "unresolved_recipient_variables", 400, { count: invalidRecipients.length });
    }

    stage = "senders";
    const { data: senders, error: sendersError } = await admin
      .from("mailing_senders")
      .select("id,from_email")
      .eq("organization_id", campaign.organization_id)
      .eq("is_active", true)
      .eq("smtp_status", "ok")
      .eq("imap_status", "ok")
      .order("from_email", { ascending: true });
    if (sendersError) return jsonError(requestId, stage, "sender_lookup_failed", 500);
    const campaignSenders = senders || [];
    const hasForeignDomain = campaignSenders.some((sender) =>
      sender.from_email.trim().toLowerCase().split("@").pop() !== "torgi.com.ru"
    );
    if (campaignSenders.length !== 203 || hasForeignDomain) {
      return jsonError(requestId, stage, "exactly_203_verified_active_senders_required", 400, { ready: senders?.length || 0 });
    }
    if (recipients.length !== 812) {
      return jsonError(requestId, stage, "exactly_812_unique_recipients_required", 400, { ready: recipients.length });
    }
    const normalizedEmails = recipients.map((recipient) => recipient.email.trim().toLowerCase());
    if (new Set(normalizedEmails).size !== 812) {
      return jsonError(requestId, stage, "exactly_812_unique_recipients_required", 400, { ready: new Set(normalizedEmails).size });
    }

    const orderedRecipients = recipients.map((recipient) => {
      const custom = recipient.custom_data && typeof recipient.custom_data === "object"
        ? recipient.custom_data as Record<string, unknown>
        : {};
      return { recipient, sendOrder: Number(custom.send_order) };
    });
    const sendOrders = orderedRecipients.map((entry) => entry.sendOrder);
    if (
      sendOrders.some((value) => !Number.isInteger(value) || value < 1 || value > 812) ||
      new Set(sendOrders).size !== 812
    ) {
      return jsonError(requestId, stage, "unique_send_order_1_to_812_required", 400);
    }
    orderedRecipients.sort((left, right) => left.sendOrder - right.sendOrder);

    stage = "deliverability";
    const campaignSenderIds = campaignSenders.map((sender) => sender.id);
    const { data: cleanCheck, error: cleanCheckError } = await admin
      .from("mailing_deliverability_checks")
      .select("id,status,placement,created_at")
      .eq("organization_id", campaign.organization_id)
      .in("sender_id", campaignSenderIds)
      .or("status.eq.inbox,placement.eq.inbox")
      .gte("created_at", new Date(Date.now() - 36 * 60 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cleanCheckError) return jsonError(requestId, stage, "deliverability_check_unavailable", 503);
    if (!cleanCheck) return jsonError(requestId, stage, "fresh_inbox_seed_required", 400);
    const { count: badAfterClean, error: badAfterCleanError } = await admin
      .from("mailing_deliverability_checks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", campaign.organization_id)
      .in("sender_id", campaignSenderIds)
      .in("status", ["spam", "missing", "failed"])
      .gt("created_at", cleanCheck.created_at);
    if (badAfterCleanError) return jsonError(requestId, stage, "deliverability_check_unavailable", 503);
    if ((badAfterClean || 0) > 0) return jsonError(requestId, stage, "deliverability_degraded_after_clean_seed", 400);

    stage = "schedule";
    const schedule = buildFastCampaignSchedule({
      emails: orderedRecipients.map(({ recipient }) => recipient.email),
      senderCount: campaignSenders.length,
      startDateMsk,
    });
    if (Date.parse(schedule[0].notBefore) < Date.now() + 5 * 60_000) {
      return jsonError(requestId, stage, "schedule_must_start_in_the_future", 400);
    }
    const recipientByEmail = new Map(orderedRecipients.map(({ recipient }) => [recipient.email.trim().toLowerCase(), recipient.id]));
    const jobs = schedule.map((slot) => ({
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      recipient_id: recipientByEmail.get(slot.email)!,
      sender_id: campaignSenders[slot.senderIndex].id,
      step_no: 1,
      not_before: slot.notBefore,
      status: "pending",
    }));
    stage = "queue_insert";
    const insertedJobIds: string[] = [];
    const cleanupInsertedJobs = async () => {
      for (let index = 0; index < insertedJobIds.length; index += 200) {
        await admin.from("mailing_send_jobs").delete().in("id", insertedJobIds.slice(index, index + 200));
      }
    };
    for (let index = 0; index < jobs.length; index += 500) {
      const chunk = jobs.slice(index, index + 500);
      const { error } = await admin.from("mailing_send_jobs").insert(chunk);
      if (error) {
        await cleanupInsertedJobs();
        return jsonError(requestId, stage, "queue_insert_failed", 500, { db_code: error.code || null });
      }
      insertedJobIds.push(...chunk.map((job) => job.id));
    }

    stage = "campaign_update";
    const { error: updateError } = await admin.from("email_campaigns").update({
      status: "scheduled",
      delivery_mode: "fast_2_day",
      domain_daily_limit: 406,
      scheduled_at: schedule[0].notBefore,
      paused_reason: null,
      completed_at: null,
    }).eq("id", campaignId);
    if (updateError) {
      await cleanupInsertedJobs();
      return jsonError(requestId, stage, "campaign_update_failed", 500, { db_code: updateError.code || null });
    }

    console.log(JSON.stringify({ event: "prepare_fast_campaign_ready", request_id: requestId, jobs: jobs.length }));
    return json({ success: true, request_id: requestId, ...summarizeFastCampaignSchedule(schedule), starts_at: schedule[0].notBefore });
  } catch (error) {
    return jsonError(requestId, stage, "prepare_fast_campaign_failed", 500, {
      exception: error instanceof Error ? error.name : "unknown",
    });
  }
});
