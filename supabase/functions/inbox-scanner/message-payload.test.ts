import { describe, expect, it } from "vitest";
import { parseRfc822 } from "../_shared/imap-mini";
import { inboxMessagePayload, messageIds } from "./message-payload";

const message = (headers = "", body = "Reply") => `From: School <school@example.com>\r\nTo: list@example.com\r\nSubject: Re: same subject\r\n${headers}\r\n\r\n${body}`;
describe("inbox header-only attribution payload", () => {
  it("does not invent message identifiers from subject/body/remote address", () => {
    const payload = inboxMessagePayload(message("", "<outgoing@fixture.invalid>"), "sender@example.com", parseRfc822);
    expect(payload.in_reply_to).toBeNull(); expect(payload.references_ids).toEqual([]);
  });
  it("unfolds References, retains exact ID case, deduplicates, includes multi-ID In-Reply-To", () => {
    const payload = inboxMessagePayload(message("References: <Case@example.com>\r\n <other@example.com> <Case@example.com>\r\nIn-Reply-To: <latest@example.com> <other@example.com>"), "sender@example.com", parseRfc822);
    expect(payload.references_ids).toEqual(["<Case@example.com>", "<other@example.com>", "<latest@example.com>"]);
    expect(payload.in_reply_to).toBe("<latest@example.com>");
  });
  it("a warmup-looking line in the body cannot hide a real reply", () => {
    expect(inboxMessagePayload(message("", "X-Warmup-Id: body text"), "sender@example.com", parseRfc822).ignored_reason).toBeNull();
  });
  it("marks a prefix/large body as partial while keeping complete header attribution", () => {
    const payload = inboxMessagePayload(message("In-Reply-To: <exact@example.com>", "x".repeat(90000)), "sender@example.com", parseRfc822, true);
    expect(payload.body_truncated).toBe(true); expect(payload.body_text.length).toBeLessThanOrEqual(60000);
    expect(payload.body_text).toContain("Письмо показано частично"); expect(payload.references_ids).toEqual(["<exact@example.com>"]);
  });
  it("overlarge References degrade to unattributed instead of partial potentially false attribution", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `<id${i}@example.com>`).join(" ");
    const payload = inboxMessagePayload(message(`References: ${ids}`), "sender@example.com", parseRfc822);
    expect(payload.attribution_limited).toBe(true); expect(payload.references_ids).toEqual([]); expect(payload.in_reply_to).toBeNull();
  });
  it("rejects missing header boundary and ignores malformed IDs", () => {
    expect(() => inboxMessagePayload("From: x@example.com", "sender@example.com", parseRfc822)).toThrow();
    expect(messageIds("arbitrary <> <in valid@example.com> <ok@example.com>")).toEqual(["<ok@example.com>"]);
  });
});
