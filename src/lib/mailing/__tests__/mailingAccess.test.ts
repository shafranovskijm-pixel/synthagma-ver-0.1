import { describe, expect, it } from "vitest";
import { isMailingEnabled } from "@/lib/mailing/mailingAccess";

describe("isMailingEnabled", () => {
  it.each(["start", "standard", "professional", "maximum"])(
    "allows %s only with the backend feature flag",
    (plan) => {
      expect(isMailingEnabled(plan, true)).toBe(true);
      expect(isMailingEnabled(plan, false)).toBe(false);
    },
  );

  it("never unlocks Free or an unknown plan with a stale custom flag", () => {
    expect(isMailingEnabled("free", true)).toBe(false);
    expect(isMailingEnabled(undefined, true)).toBe(false);
    expect(isMailingEnabled("legacy", true)).toBe(false);
  });
  it("allows confirmed postpaid with the preserved free plan and base-mailing flag", () => {
    expect(isMailingEnabled("free", true, { loading: false, error: null, isPostpaid: true })).toBe(true);
    expect(isMailingEnabled("free", false, { loading: false, error: null, isPostpaid: true })).toBe(false);
    expect(isMailingEnabled("free", true, { loading: false, error: null, isPostpaid: false })).toBe(false);
  });
  it.each([
    { loading: true, error: null, isPostpaid: true },
    { loading: false, error: new Error("unconfirmed"), isPostpaid: true },
    { error: null, isPostpaid: true },
  ])("keeps unconfirmed access closed even when an old paid entitlement is present: %j", access => {
    expect(isMailingEnabled("free", true, access)).toBe(false);
    expect(isMailingEnabled("maximum", true, access)).toBe(false);
  });
});
