import { describe, expect, it } from "vitest";
import { buildUniqueReplyCandidates, summarizeReplyContacts } from "../replyCandidates";

const reply = (overrides: Partial<{
  id: string;
  remote_email: string;
  received_at: string;
  updated_at: string;
  classification: "interested" | "not_interested" | "unsubscribe" | "auto_reply" | "needs_review";
  review_status: "new" | "qualified" | "contacted" | "enrolled" | "closed";
}> = {}) => ({
  id: "r1",
  remote_email: "person@example.com",
  received_at: "2026-08-13T06:00:00.000Z",
  updated_at: "2026-08-13T06:00:00.000Z",
  classification: "interested" as const,
  review_status: "new" as const,
  ...overrides,
});

describe("reply candidate aggregation", () => {
  it("exports one candidate for repeated replies from the same normalized email", () => {
    const rows = [
      reply({ id: "old", remote_email: "Person@Example.com", received_at: "2026-08-13T06:00:00.000Z" }),
      reply({ id: "new", remote_email: " person@example.com ", received_at: "2026-08-13T07:00:00.000Z" }),
    ];

    expect(buildUniqueReplyCandidates(rows).map((row) => row.id)).toEqual(["new"]);
    expect(summarizeReplyContacts(rows).interested).toBe(1);
  });

  it("excludes an address after an unsubscribe or refusal", () => {
    const rows = [
      reply({ id: "interest" }),
      reply({
        id: "stop",
        received_at: "2026-08-13T07:00:00.000Z",
        classification: "unsubscribe",
      }),
    ];

    expect(buildUniqueReplyCandidates(rows)).toEqual([]);
    expect(summarizeReplyContacts(rows)).toMatchObject({ interested: 0, stopped: 1 });
  });

  it("uses the most recently reviewed interested reply for group status", () => {
    const rows = [
      reply({ id: "newer-message", received_at: "2026-08-13T07:00:00.000Z" }),
      reply({
        id: "reviewed",
        received_at: "2026-08-13T06:00:00.000Z",
        updated_at: "2026-08-13T08:00:00.000Z",
        review_status: "enrolled",
      }),
    ];

    const summary = summarizeReplyContacts(rows);
    expect(summary.candidates.map((row) => row.id)).toEqual(["reviewed"]);
    expect(summary.enrolled).toBe(1);
  });

  it("does not inflate review counts with several messages from one contact", () => {
    const rows = [
      reply({ id: "first", classification: "needs_review" }),
      reply({
        id: "latest",
        received_at: "2026-08-13T07:00:00.000Z",
        classification: "needs_review",
      }),
    ];

    expect(summarizeReplyContacts(rows).needsReview).toBe(1);
  });
});
