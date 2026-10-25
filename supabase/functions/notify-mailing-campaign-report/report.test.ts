import { describe, expect, it, vi } from "vitest";
import { buildMailingReport, deliverMailingReport } from "./report";

const campaignId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const token = "33333333-3333-4333-8333-333333333333";
const chatId = "-1001234567890";
const payload = () => ({
  campaign_id: campaignId, campaign_name: "Приглашение автошкол", status: "completed",
  counts: { total: 11, pending: 0, sent: 10, failed: 1, unresolved: 0 },
  senders: [{ from_email: "sender@example.invalid" }], occurred_at: "2026-09-08T00:00:00Z",
});
const claimed = (overrides: Record<string, any> = {}) => ({
  claimed: true, event_id: eventId, claim_token: token, target_chat_id: chatId,
  kind: "run_report", payload: payload(), ...overrides,
});

describe("mailing Telegram report content, fixture payloads only", () => {
  it("labels SMTP acceptance without presenting it as inbox delivery, a read or a lead", () => {
    const text = buildMailingReport("run_report", payload());
    expect(text).toContain("Принято почтовым сервером: 10");
    expect(text).toContain("Не отправлено (зафиксирован отказ): 1");
    expect(text).toContain("Приём SMTP не подтверждает попадание во «Входящие», прочтение или заявку.");
    expect(text).toContain("Фактический From: sender@example.invalid");
    expect(text).not.toContain("Доставлено во Входящие");
  });
  it("distinguishes an uncertain attempt and does not promise an automatic retry", () => {
    const text = buildMailingReport("run_report", { ...payload(), status: "paused", counts: { total: 11, pending: 1, sent: 10, failed: 0, unresolved: 1 } });
    expect(text).toContain("На паузе");
    expect(text).toContain("В очереди, включая требующие сверки: 1");
    expect(text).toContain("Неопределённые попытки автоматически не повторяются.");
  });
  it("escapes external content and caps expanded HTML, including sender and campaign labels", () => {
    const text = buildMailingReport("run_report", {
      ...payload(), campaign_name: "<script>&\u0000".repeat(1000),
      senders: Array.from({ length: 9 }, (_, n) => ({ from_email: `${n}<>&`.repeat(1000) })),
    });
    expect(text).not.toContain("<script>");
    expect(text).not.toContain("\u0000");
    expect(text).toContain("&lt;script&gt;&amp;");
    expect(text).toContain("и другие");
    expect(text.length).toBeLessThanOrEqual(3900);
  });
  it("deduplicates actual From and explains when no SMTP sender was recorded", () => {
    const duplicate = buildMailingReport("run_report", { ...payload(), senders: [{ from_email: "one@example.invalid" }, { from_email: "one@example.invalid" }] });
    expect(duplicate.match(/one@example\.invalid/g)).toHaveLength(1);
    expect(buildMailingReport("run_report", { ...payload(), senders: [] })).toContain("SMTP-отправитель ещё не зафиксирован");
  });
  it.each([undefined, -1, 1.5, "11", Number.MAX_SAFE_INTEGER + 1])("rejects invalid counter %s", (total) => {
    expect(() => buildMailingReport("run_report", { ...payload(), counts: { ...payload().counts, total } })).toThrow("invalid_report_counts");
  });
  it.each(["bad-id", "", "<b>injection</b>"])("rejects invalid campaign identity %s", (campaign_id) => {
    expect(() => buildMailingReport("run_report", { ...payload(), campaign_id })).toThrow("invalid_report_payload");
  });
  it("rejects an absent campaign label and unknown event kind", () => {
    expect(() => buildMailingReport("run_report", { ...payload(), campaign_name: " " })).toThrow("invalid_report_payload");
    expect(() => buildMailingReport("client_provided_text", payload())).toThrow("unknown_report_kind");
  });
  it("labels a correlated reply without counting it as a purchase and escapes all reply fields", () => {
    const text = buildMailingReport("reply", { ...payload(), reply: {
      from_email: "<sender@example.invalid>", from_name: "<Имя>&", subject: "<Тема>&",
      text: "<b>Хочу тест</b>&", received_at: "2026-09-08T00:00:00Z", classification: "human_reply",
    } });
    expect(text).toContain("Ответ на рассылку СИНТАГМА");
    expect(text).toContain("&lt;b&gt;Хочу тест&lt;/b&gt;&amp;");
    expect(text).not.toContain("<b>Хочу тест</b>");
    expect(text).toContain("Связь подтверждена заголовками ответа. Это не подтверждение покупки.");
  });
  it("labels auto-replies separately and replaces overlong escaped excerpts safely", () => {
    const text = buildMailingReport("reply", { ...payload(), reply: {
      from_email: "fixture@example.invalid", text: "&".repeat(12000), classification: "auto_reply",
    } });
    expect(text).toContain("Автоматический ответ");
    expect(text).toContain("Текст длинный — откройте письмо в переписках СИНТАГМЫ.");
    expect(text.length).toBeLessThanOrEqual(3900);
  });
  it("rejects reply payload without sender", () => {
    expect(() => buildMailingReport("reply", { ...payload(), reply: {} })).toThrow("invalid_reply_payload");
  });
});

describe("durably claimed report delivery, fake relay only", () => {
  function fixture(overrides: { claim?: any; relay?: any; finish?: any } = {}) {
    const store = {
      claim: vi.fn(async () => overrides.claim ?? claimed()),
      finish: vi.fn(async (_id, _token, state) => overrides.finish ?? ({ finished: true, state })),
    };
    const relay = vi.fn(async () => overrides.relay ?? ({ data: { success: true, message_id: 42 } }));
    const run = () => deliverMailingReport({ eventId, token, chatId, store, relay });
    return { store, relay, run };
  }
  it("persists the relay message ID against the exact event and owner token", async () => {
    const f = fixture();
    expect(await f.run()).toBe("sent");
    expect(f.store.claim).toHaveBeenCalledWith(eventId, token, chatId);
    expect(f.relay).toHaveBeenCalledTimes(1);
    expect(f.relay).toHaveBeenCalledWith(chatId, expect.stringContaining("Отчёт о рассылке"));
    expect(f.store.finish).toHaveBeenCalledWith(eventId, token, "sent", 42, null);
  });
  it.each([
    { claimed: false }, claimed({ claim_token: "wrong" }), claimed({ event_id: "wrong" }), claimed({ target_chat_id: "-999999" }),
  ])("does not invoke relay for a lost or mismatched claim", async (claim) => {
    const f = fixture({ claim });
    expect(await f.run()).toBe("not_claimed");
    expect(f.relay).not.toHaveBeenCalled();
    expect(f.store.finish).not.toHaveBeenCalled();
  });
  it("does not retry or finalize an unconfirmed claim", async () => {
    const f = fixture();
    f.store.claim.mockRejectedValueOnce(new Error("fixture claim timeout"));
    expect(await f.run()).toBe("claim_unknown");
    expect(f.store.claim).toHaveBeenCalledTimes(1);
    expect(f.relay).not.toHaveBeenCalled();
    expect(f.store.finish).not.toHaveBeenCalled();
  });
  it.each([
    {}, { data: { success: true } }, { data: { success: true, message_id: "42" } },
    { data: { success: true, message_id: 0 } },
    { data: { success: false, message_id: 42 } }, { data: { success: true, message_id: 42 }, error: new Error("ambiguous") },
  ])("marks ambiguous relay response uncertain without a second invocation", async (relay) => {
    const f = fixture({ relay });
    expect(await f.run()).toBe("uncertain");
    expect(f.relay).toHaveBeenCalledTimes(1);
    expect(f.store.finish).toHaveBeenCalledWith(eventId, token, "uncertain", null, "telegram_result_unknown");
  });
  it("a thrown relay error is uncertain, never a known delivery failure", async () => {
    const f = fixture();
    f.relay.mockRejectedValueOnce(new Error("fixture relay timeout"));
    expect(await f.run()).toBe("uncertain");
    expect(f.relay).toHaveBeenCalledTimes(1);
    expect(f.store.finish).toHaveBeenCalledWith(eventId, token, "uncertain", null, "telegram_result_unknown");
  });
  it.each([{ finished: false }, { finished: true, state: "failed" }])("never resends after unconfirmed finalization", async (finish) => {
    const f = fixture({ finish });
    expect(await f.run()).toBe("finalization_unknown");
    expect(f.relay).toHaveBeenCalledTimes(1);
    expect(f.store.finish).toHaveBeenCalledTimes(1);
  });
  it("never resends when finalization throws after Telegram acceptance", async () => {
    const f = fixture();
    f.store.finish.mockRejectedValueOnce(new Error("fixture DB timeout"));
    expect(await f.run()).toBe("finalization_unknown");
    expect(f.relay).toHaveBeenCalledTimes(1);
    expect(f.store.finish).toHaveBeenCalledTimes(1);
  });
  it("stores malformed payload as a known pre-relay failure without calling Telegram", async () => {
    const f = fixture({ claim: claimed({ payload: {} }) });
    expect(await f.run()).toBe("failed");
    expect(f.relay).not.toHaveBeenCalled();
    expect(f.store.finish).toHaveBeenCalledWith(eventId, token, "failed", null, "invalid_report_payload");
  });
});
