import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const expected = Deno.env.get("MAILING_CAMPAIGN_CRON_SECRET") || "";
  const supplied = req.headers.get("X-Cron-Secret") || "";
  if (expected.length < 24 || supplied !== expected) return json({ error: "Unauthorized" }, 401);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    // SMTP outcome is uncertain if a function stopped after DATA was accepted.
    // Never retry such work automatically; park it for operator review.
    await admin.from("mailing_send_jobs").update({
      status: "uncertain",
      last_error_category: "dispatch_timeout",
      last_error: "Требуется ручная сверка: результат SMTP не подтверждён",
    }).eq("status", "dispatching").lt("claimed_at", new Date(Date.now() - 60 * 60_000).toISOString());

    const { data: activeCampaigns, error: activeCampaignsError } = await admin.from("email_campaigns")
      .select("id,organization_id,scheduled_at,operator_attested_at")
      .eq("delivery_mode", "fast_2_day")
      .in("status", ["scheduled", "sending"])
      .is("paused_reason", null);
    if (activeCampaignsError) return json({ error: "campaign_monitor_unavailable" }, 503);
    for (const campaign of activeCampaigns || []) {
      const { data: campaignJobs, error: campaignJobsError } = await admin.from("mailing_send_jobs")
        .select("sender_id")
        .eq("campaign_id", campaign.id);
      if (campaignJobsError) {
        await admin.from("email_campaigns").update({
          status: "paused",
          paused_reason: "campaign_monitor_unavailable",
        }).eq("id", campaign.id);
        continue;
      }
      const senderIds = [...new Set((campaignJobs || []).map((job) => job.sender_id))];
      if (!senderIds.length) continue;
      const { data: currentSenders, error: currentSendersError } = await admin.from("mailing_senders")
        .select("id,is_active,smtp_status,imap_status")
        .in("id", senderIds);
      const senderPoolDegraded = currentSendersError || currentSenders?.length !== senderIds.length ||
        (currentSenders || []).some((sender) =>
          !sender.is_active || sender.smtp_status !== "ok" || sender.imap_status !== "ok"
        );
      if (senderPoolDegraded) {
        await admin.from("email_campaigns").update({
          status: "paused",
          paused_reason: currentSendersError ? "campaign_monitor_unavailable" : "sender_pool_degraded",
        }).eq("id", campaign.id);
        continue;
      }
      // Replies are distributed across the actual From mailboxes. Require a
      // read-only IMAP UID baseline immediately before launch, otherwise the
      // collector could either miss a response or ingest historic mail.
      const scheduledMs = campaign.scheduled_at ? Date.parse(campaign.scheduled_at) : Number.NaN;
      const replyReadinessIsDue = !Number.isFinite(scheduledMs) || scheduledMs <= Date.now() + 5 * 60_000;
      if (replyReadinessIsDue) {
        const { data: replyStates, error: replyStatesError } = await admin
          .from("mailing_reply_scan_state")
          .select("sender_id,baseline_completed")
          .in("sender_id", senderIds)
          .eq("baseline_completed", true);
        const readySenderIds = new Set((replyStates || []).map((state) => state.sender_id));
        if (replyStatesError || senderIds.some((senderId) => !readySenderIds.has(senderId))) {
          await admin.from("email_campaigns").update({
            status: "paused",
            paused_reason: replyStatesError ? "reply_monitor_unavailable" : "reply_monitor_not_ready",
          }).eq("id", campaign.id);
          continue;
        }
      }
      const { count: degraded, error: degradedError } = await admin.from("mailing_deliverability_checks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", campaign.organization_id)
        .in("sender_id", senderIds)
        .in("status", ["spam", "missing", "failed"])
        .gte("created_at", campaign.operator_attested_at || campaign.scheduled_at || new Date(0).toISOString());
      if (degradedError) {
        await admin.from("email_campaigns").update({
          status: "paused",
          paused_reason: "campaign_monitor_unavailable",
        }).eq("id", campaign.id);
        continue;
      }
      if ((degraded || 0) > 0) {
        await admin.from("email_campaigns").update({
          status: "paused",
          paused_reason: "deliverability_degraded",
        }).eq("id", campaign.id);
      }
    }

    // One job per minute is sufficient for 406 jobs in the 11-hour window and
    // prevents a worker invocation from creating an SMTP burst.
    const { data: claimed, error: claimError } = await admin.rpc("claim_due_mailing_send_jobs", {
      p_batch_size: 1,
      p_stale_after: "15 minutes",
    });
    if (claimError) return json({ error: "claim_failed" }, 500);
    const jobs = Array.isArray(claimed) ? claimed : [];
    if (!jobs.length) return json({ success: true, claimed: 0, sent: 0 });

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const job of jobs) {
      await admin.from("email_campaigns").update({ status: "sending" }).eq("id", job.campaign_id);
      const { data, error } = await admin.functions.invoke("send-campaign-email", {
        body: {
          campaignId: job.campaign_id,
          recipientId: job.recipient_id,
          jobId: job.id,
          claimToken: job.claim_token,
        },
      });
      if (!error && data?.success === true) sent += 1;
      else if (!error && data?.suppressed === true) skipped += 1;
      else {
        failed += 1;
        await admin.from("email_campaigns").update({
          status: "paused",
          paused_reason: data?.error_category || "send_failed",
        }).eq("id", job.campaign_id);
      }

      const { count: remaining } = await admin.from("mailing_send_jobs")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", job.campaign_id)
        .in("status", ["pending", "claimed", "dispatching"]);
      if ((remaining || 0) === 0 && failed === 0) {
        await admin.from("email_campaigns").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", job.campaign_id);
      }
    }
    return json({ success: true, claimed: jobs.length, sent, skipped, failed });
  } catch {
    return json({ error: "worker_failed" }, 500);
  }
});
