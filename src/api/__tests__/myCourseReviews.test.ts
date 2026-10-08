import { describe, expect, it, vi } from "vitest";
import { activeCourseReviews } from "../myCourseReviews";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
const card = { course_id: "7630559a-6caf-42e7-97f9-1cd0e4598c39", title: "ЦСЗ", duration: "162 часа", grant_expires_at: "infinity" };
describe("review card projection", () => {
  it("allows a nonexpiring grant and excludes expired/invalid dates", () => {
    expect(activeCourseReviews([card, { ...card, grant_expires_at: "2026-10-08T00:00:00Z" }, { ...card, grant_expires_at: "invalid" }], Date.parse("2026-10-08T00:00:00Z"))).toEqual([card]);
  });
  it("does not accept learner data or answer keys in the card projection", () => {
    expect(() => activeCourseReviews([{ ...card, questions: [{ correct_answer: 0 }] }])).toThrow();
  });
});
