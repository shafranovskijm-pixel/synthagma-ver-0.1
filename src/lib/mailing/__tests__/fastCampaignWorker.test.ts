import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const worker = read("supabase/functions/mailing-campaign-worker/index.ts");
const sender = read("supabase/functions/send-campaign-email/index.ts");
const prepare = read("supabase/functions/prepare-fast-campaign/index.ts");
const manager = read("src/components/admin/broadcast/CampaignsManager.tsx");
const contactsDialog = read("src/components/mailing/ImportContactsDialog.tsx");

describe("fast campaign worker", () => {
  it("orders pending recipients by an existing stable column", () => {
    expect(prepare).toContain('.order("id", { ascending: true })');
    expect(prepare).not.toContain("custom_data,status,created_at");
  });

  it("requires a dedicated cron secret and claims only one job per minute", () => {
    expect(worker).toContain("MAILING_CAMPAIGN_CRON_SECRET");
    expect(worker).toContain("p_batch_size: 1");
  });

  it("parks uncertain dispatches instead of retrying them", () => {
    expect(worker).toContain('status: "uncertain"');
    expect(worker).toContain('eq("status", "dispatching")');
  });

  it("binds the claimed job to campaign, recipient, sender and claim token", () => {
    expect(sender).toContain('from("mailing_send_jobs")');
    expect(sender).toContain('job.campaign_id !== campaignId');
    expect(sender).toContain('job.recipient_id !== recipientId');
    expect(sender).toContain('job.claim_token !== claimToken');
    expect(sender).toContain('queuedSenderId = job.sender_id');
    expect(sender).toContain('.update({ status: "dispatching", smtp_message_id: smtpMessageId })');
    expect(sender).toContain("if (!jobId) {");
  });

  it("requires the exact verified sender and recipient set plus a fresh inbox seed", () => {
    expect(prepare).toContain("exactly_203_verified_active_senders_required");
    expect(prepare).toContain("exactly_812_unique_recipients_required");
    expect(prepare).toContain("fresh_inbox_seed_required");
    expect(prepare).toContain("unresolved_recipient_variables");
    expect(prepare).toContain("unique_send_order_1_to_812_required");
    expect(prepare).toContain("custom.send_order");
    expect(prepare).toContain("new Set(normalizedEmails).size !== 812");
    expect(prepare).toContain('.in("sender_id", campaignSenderIds)');
    expect(prepare).toContain('!== "torgi.com.ru"');
    expect(prepare).toContain("deliverability_check_unavailable");
    expect(prepare).toContain("insertedJobIds");
    expect(prepare).not.toContain('.delete().eq("campaign_id", campaignId)');
    expect(worker).toContain("campaign.operator_attested_at || campaign.scheduled_at");
    expect(worker).toContain('.in("sender_id", senderIds)');
    expect(worker).toContain("sender_pool_degraded");
    expect(worker).toContain("campaign_monitor_unavailable");
  });

  it("skips suppressed recipients without stopping the remaining queue", () => {
    expect(worker).toContain("data?.suppressed === true");
    expect(worker).toContain("let skipped = 0");
  });

  it("shows an explicit two-day operator attestation before queue creation", () => {
    expect(manager).toContain("203 ящика × 2 письма в день × 2 дня = 812 писем");
    expect(manager).toContain("fast-campaign-attestation");
    expect(manager).toContain('rpc("attest_cold_outreach_campaign"');
    expect(manager).toContain('invoke("prepare-fast-campaign"');
  });

  it("allows the 812-row contact import without browser file upload", () => {
    expect(contactsDialog).toContain("import-contacts-paste");
    expect(contactsDialog).toContain("parseCsv(pastedText)");
    expect(contactsDialog).toContain('setPastedText("")');
  });
});
