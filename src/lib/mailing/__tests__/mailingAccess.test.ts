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
});
