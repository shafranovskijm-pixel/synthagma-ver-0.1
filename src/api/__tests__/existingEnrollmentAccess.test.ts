import { describe, expect, it } from "vitest";

import { isEnrollmentAccessExpired } from "../../../supabase/functions/_shared/enrollment-access";

const NOW = new Date("2026-08-27T12:00:00.000Z");

describe("existing enrollment learner access", () => {
  it("marks an active enrollment with a past expiry as blocked", () => {
    expect(isEnrollmentAccessExpired({
      status: "active",
      expires_at: "2026-08-27T11:59:59.999Z",
    }, NOW)).toBe(true);
  });

  it("keeps the learner-gate semantics for unlimited, future, and completed access", () => {
    expect(isEnrollmentAccessExpired({
      status: "active",
      expires_at: null,
    }, NOW)).toBe(false);

    expect(isEnrollmentAccessExpired({
      status: "active",
      expires_at: NOW.toISOString(),
    }, NOW)).toBe(false);

    expect(isEnrollmentAccessExpired({
      status: "active",
      expires_at: "2026-08-27T12:00:00.001Z",
    }, NOW)).toBe(false);

    expect(isEnrollmentAccessExpired({
      status: "completed",
      expires_at: "2026-08-20T00:00:00.000Z",
    }, NOW)).toBe(false);
  });
});
