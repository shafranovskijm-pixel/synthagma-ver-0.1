import { describe, expect, it } from "vitest";
import { ordinaryMessageFacts } from "./ordinary-message";

const input = {
  smtp: { host: "smtp.fixture.invalid", port: 465, username: "sender@example.com", password: "fixture-only", from_email: "sender@example.com", from_name: "Mailbox" },
  senderKind: "pool" as const, senderPoolId: "00000000-0000-4000-8000-000000000001",
  messageId: "<attempt@fixture.invalid>", subject: "Hello school", html: "<p>Personalized invitation</p>",
};

describe("ordinary immutable actual message facts", () => {
  it("contains the pool mailbox, not SMTP credentials or an invented sender FK", () => {
    const facts = ordinaryMessageFacts(input);
    expect(facts).toMatchObject({ from_email: "sender@example.com", from_name: "Mailbox", sender_pool_id: input.senderPoolId, mailing_sender_id: null });
    expect(JSON.stringify(facts)).not.toContain("fixture-only");
    expect(Object.isFrozen(facts)).toBe(true);
    expect(facts.html_body).toContain("<html");
  });
  it("rejects unsupported external Reply-To for selected inbox rather than lose tracked replies", () => {
    expect(() => ordinaryMessageFacts({ ...input, replyTo: "elsewhere@example.com" })).toThrow("different Reply-To");
    expect(ordinaryMessageFacts({ ...input, replyTo: "SENDER@example.com" }).reply_to).toBe("SENDER@example.com");
  });
  it.each(["Fake <other@example.com>", "Fake\r\nFrom: other@example.com"])("rejects From-name injection %s", fromName => {
    expect(() => ordinaryMessageFacts({ ...input, fromName })).toThrow();
  });
  it("fails instead of persisting truncated bodies but sending their longer original", () => {
    expect(() => ordinaryMessageFacts({ ...input, html: "x".repeat(200001) })).toThrow("history limits");
    expect(() => ordinaryMessageFacts({ ...input, html: "x".repeat(60001) })).toThrow("history limits");
  });
  it("keeps non-pool legacy facts explicit without inventing Unibox attribution", () => {
    const facts = ordinaryMessageFacts({ ...input, senderKind: "org_legacy", senderPoolId: null, replyTo: "help@example.com" });
    expect(facts).toMatchObject({ sender_kind: "org_legacy", sender_pool_id: null, reply_to: "help@example.com" });
  });
});
