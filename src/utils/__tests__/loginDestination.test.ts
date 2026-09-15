import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("@/api/courseReviewer", () => ({ fetchCourseReviewSnapshot: mocks.snapshot }));

import { resolveLoginDestination } from "@/utils/loginDestination";

const reviewerId = "5061292a-7614-489e-b908-3a7160103809";
const courseId = "7630559a-6caf-42e7-97f9-1cd0e4598c39";

describe("login destination for the existing CSZ reviewer", () => {
  beforeEach(() => { mocks.snapshot.mockReset(); });

  it("opens the granted 178-hour course after an ordinary login", async () => {
    mocks.snapshot.mockResolvedValue({ course: { id: courseId }, grant_expires_at: "infinity" });
    await expect(resolveLoginDestination(reviewerId, "student", null))
      .resolves.toBe(`/review/course/${courseId}`);
    expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(courseId);
  });

  it.each(["expired grant", "revoked grant", "missing grant", "network error"])(
    "keeps the ordinary destination when the protected RPC rejects: %s", async (reason) => {
      mocks.snapshot.mockRejectedValue(new Error(reason));
      await expect(resolveLoginDestination(reviewerId, "student", null)).resolves.toBe("/student");
    },
  );

  it("does not use a snapshot of a different course", async () => {
    mocks.snapshot.mockResolvedValue({ course: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } });
    await expect(resolveLoginDestination(reviewerId, "student", null)).resolves.toBe("/student");
  });

  it("preserves an explicit safe destination without probing the reviewer grant", async () => {
    await expect(resolveLoginDestination(reviewerId, "student", "/student?tab=library"))
      .resolves.toBe("/student?tab=library");
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("rejects an external next URL and still checks the exact grant", async () => {
    mocks.snapshot.mockResolvedValue({ course: { id: courseId } });
    await expect(resolveLoginDestination(reviewerId, "student", "//outside.example"))
      .resolves.toBe(`/review/course/${courseId}`);
    expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(courseId);
  });

  it.each([
    ["student", "/student"], ["admin", "/admin"], ["organization", "/organization"],
    ["company", "/company"], ["sales_manager", "/sales"],
  ])("preserves the %s destination for other accounts", async (role, target) => {
    await expect(resolveLoginDestination("other-user", role, null)).resolves.toBe(target);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("does not override the reviewer's role if it changes", async () => {
    await expect(resolveLoginDestination(reviewerId, "organization", null)).resolves.toBe("/organization");
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
