import { describe, it, expect } from "vitest";
import { getPlanInfo, formatStorageSize, getMinPlanForCategory, SUBSCRIPTION_PLANS } from "../subscriptionPlans";

describe("getPlanInfo", () => {
  it("returns correct plan by id", () => {
    expect(getPlanInfo("free").name).toBe("Бесплатный");
    expect(getPlanInfo("start").price).toBe(4490);
    expect(getPlanInfo("maximum").limits.maxCourses).toBe(-1);
  });

  it("falls back to free for unknown plan", () => {
    expect(getPlanInfo("unknown" as any).id).toBe("free");
  });
});

describe("formatStorageSize", () => {
  it("formats bytes to MB", () => {
    expect(formatStorageSize(104857600)).toBe("100 МБ");
  });

  it("formats bytes to GB", () => {
    expect(formatStorageSize(3221225472)).toBe("3 ГБ");
    expect(formatStorageSize(107374182400)).toBe("100 ГБ");
  });
});

describe("getMinPlanForCategory", () => {
  it("returns free for courses", () => {
    expect(getMinPlanForCategory("courses")?.id).toBe("free");
  });

  it("returns professional for webinars", () => {
    expect(getMinPlanForCategory("webinars")?.id).toBe("professional");
  });

  it("returns professional for 3d_trainers", () => {
    expect(getMinPlanForCategory("3d_trainers")?.id).toBe("professional");
  });

  it("returns null for non-existent category", () => {
    expect(getMinPlanForCategory("nonexistent")).toBeNull();
  });
});

describe("SUBSCRIPTION_PLANS structure", () => {
  it("has 5 plans", () => {
    expect(Object.keys(SUBSCRIPTION_PLANS)).toHaveLength(5);
  });

  it("plans are ordered by price", () => {
    const prices = ["free", "start", "standard", "professional", "maximum"].map(
      p => SUBSCRIPTION_PLANS[p as keyof typeof SUBSCRIPTION_PLANS].price
    );
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });
});
