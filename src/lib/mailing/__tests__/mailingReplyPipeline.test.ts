import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyMailingReply,
  extractLatestReplyText,
} from "../../../../supabase/functions/_shared/mailing-reply-classifier";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const worker = read("supabase/functions/mailing-reply-worker/index.ts");
const imap = read("supabase/functions/_shared/imap-mini.ts");
const sender = read("supabase/functions/send-campaign-email/index.ts");
const campaignWorker = read("supabase/functions/mailing-campaign-worker/index.ts");
const migration = read("supabase/migrations/20260812210000_mailing_campaign_reply_pipeline.sql");
const rlsMigration = read("supabase/migrations/20260812235500_mailing_reply_rls_org_access.sql");
const repliesUi = read("src/components/mailing/MailingRepliesTab.tsx");

describe("campaign reply classifier", () => {
  it("recognizes the campaign's exact one-word CTA as interest", () => {
    expect(classifyMailingReply({ bodyText: "Программа" })).toMatchObject({
      classification: "interested",
      interestHours: null,
      directText: "Программа",
    });
    expect(classifyMailingReply({ bodyText: "ПРОГРАММУ!" }).classification).toBe("interested");
    expect(classifyMailingReply({ bodyText: "Программа не нужна." }).classification).toBe("not_interested");
  });

  it("recognizes interest and the requested duration", () => {
    expect(classifyMailingReply({ bodyText: "Добрый день! Нам подходит программа 150 часов." })).toMatchObject({
      classification: "interested",
      interestHours: 150,
    });
  });

  it("treats an explicit not-actual answer as an unsubscribe", () => {
    expect(classifyMailingReply({ bodyText: "Неактуально, пожалуйста, отпишите нас." }).classification)
      .toBe("unsubscribe");
  });

  it("separates a polite refusal from a lead", () => {
    expect(classifyMailingReply({ bodyText: "Нет, спасибо, обучение не нужно." }).classification)
      .toBe("not_interested");
  });

  it("detects automatic replies before keyword classification", () => {
    expect(classifyMailingReply({
      subject: "Автоответ: стоимость обучения",
      bodyText: "Ответим позже",
      rawHeaders: "Auto-Submitted: auto-replied",
    }).classification).toBe("auto_reply");
  });

  it("keeps only the newly written part and removes quoted history", () => {
    expect(extractLatestReplyText("Интересно, пришлите КП.\n\n> Предыдущее письмо\n> 50 / 150 / 250"))
      .toBe("Интересно, пришлите КП.");
  });
});

describe("campaign reply pipeline hardening", () => {
  it("requires the cron secret before creating a service client", () => {
    expect(worker.indexOf('supplied !== expected')).toBeGreaterThan(-1);
    expect(worker.indexOf('createClient(url, serviceKey)')).toBeGreaterThan(worker.indexOf('supplied !== expected'));
  });

  it("baselines every mailbox before fetching and uses read-only IMAP operations", () => {
    expect(worker).toContain("highestInboxUid(conn)");
    expect(worker).toContain("if (!state.baseline_completed)");
    expect(imap).toContain('await examineFolder(c, "INBOX")');
    expect(imap).toContain("BODY.PEEK[]");
  });

  it("stores a deterministic Message-ID and blocks launch without reply readiness", () => {
    expect(sender).toContain("smtp_message_id: smtpMessageId");
    expect(sender).toContain("messageId: queuedMessageId");
    expect(campaignWorker).toContain("reply_monitor_not_ready");
    expect(campaignWorker).toContain("baseline_completed");
  });

  it("keeps tables service-written and RPCs service-only", () => {
    expect(migration).toContain("GRANT SELECT ON public.mailing_campaign_replies TO authenticated");
    expect(migration).toContain("GRANT UPDATE (review_status, interest_hours)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.claim_mailing_reply_scan_senders");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.match_mailing_campaign_reply");
    expect(migration).toContain("TO service_role");
  });

  it("deduplicates by IMAP UID, suppresses refusals, and never logs reply bodies", () => {
    expect(migration).toContain("UNIQUE (sender_id, imap_uid)");
    expect(worker).toContain('from("email_suppressions").upsert');
    expect(worker).not.toMatch(/console\.(?:log|info|warn|error)/);
  });

  it("chunks sender ids so readiness queries stay below proxy URL limits", () => {
    expect(repliesUi).toContain("Math.ceil(senderIds.length / 50)");
    expect(repliesUi).not.toContain('.in("sender_id", senderIds)');
  });

  it("lets organization users read only reply data for their current organization", () => {
    expect(rlsMigration).toContain("s.organization_id = public.current_organization_id()");
    expect(rlsMigration).toContain("organization_id = public.current_organization_id()");
    expect(rlsMigration).toContain("public.can_access_organization(organization_id, 'email.manage')");
  });
});
