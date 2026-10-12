import { describe, expect, it } from "vitest";
import { campaignRunFeedback, campaignPauseFeedback, readCampaignRunFeedback } from "../campaignRunFeedback";

describe("truthful campaign run responses", () => {
  it("recognizes an explicit started batch without promising final delivery", () => {
    const feedback = campaignRunFeedback({ ok: true, started: 25, deferred: true });
    expect(feedback).toMatchObject({ level: "success", started: true });
    expect(feedback.message).toContain("партии: 25");
    expect(feedback.message).toContain("остаются в очереди");
  });
  it("never announces launch after HTTP-200 quota denial", () => {
    expect(campaignRunFeedback({ ok: false, quotaExceeded: true, remaining: 0 })).toMatchObject({ level: "warning", started: false });
  });
  it("does not mislabel a sender disabled during reservation as daily quota exhaustion", () => {
    const result = campaignRunFeedback({ ok: false, quotaExceeded: true, reason: "sender_inactive" });
    expect(result).toMatchObject({ level: "error", started: false });
    expect(result.message).toContain("отключён");
    expect(result.message).not.toContain("квота");
  });
  it.each([null, {}, { ok: true }, { ok: false }, { ok: true, started: "25" }])("does not invent success from an ambiguous response %j", data => {
    expect(campaignRunFeedback(data)).toMatchObject({ level: "error", started: false });
  });
  it("distinguishes no new work from dispatch", () => {
    expect(campaignRunFeedback({ ok: true, message: "Нет получателей в очереди" })).toMatchObject({ level: "info", started: false });
  });
  it("reads a durable claim rejection from an HTTP error response", async () => {
    const feedback = await readCampaignRunFeedback(null, { context: new Response(JSON.stringify({ ok: false, reason: "manual_reconciliation_required" }), { status: 409 }) });
    expect(feedback.started).toBe(false);
    expect(feedback.message).toContain("Повторная отправка не выполнялась");
  });
  it("does not claim launch on a non-JSON proxy error", async () => {
    expect(await readCampaignRunFeedback(null, { context: new Response("Bad gateway", { status: 502 }) })).toMatchObject({ level: "error", started: false });
  });
});

describe("pause reasons and manual review", () => {
  it("keeps quota pauses resumable without a five-minute promise", () => {
    const state = campaignPauseFeedback("quota");
    expect(state.canResume).toBe(true);
    expect(state.description).toContain("точное время не подтверждено");
  });
  it.each(["ordinary_manual_reconciliation_required", "quota_unknown", "pending_recipients_remain", "ordinary_ab_wait"])("does not offer blind resume for %s", reason => {
    expect(campaignPauseFeedback(reason).canResume).toBe(false);
  });
  it("keeps an explicit user pause manually resumable", () => {
    expect(campaignPauseFeedback("user_paused", true)).toMatchObject({ canResume: true, label: "Приостановлена пользователем" });
  });
});
