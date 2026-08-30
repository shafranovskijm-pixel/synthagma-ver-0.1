import { describe, expect, it } from "vitest";
import {
  buildOrganizationRegistrationMessage,
  buildOrganizationTelegramTestMessage,
  buildSpecialOfferMessage,
  buildSubscriptionUpgradeMessage,
  buildSupportRequestMessage,
  escapeTelegramHtml,
  isReasonablePhone,
  normalizeSubscriptionPlan,
  TELEGRAM_TEXT_LIMIT,
  uuid,
} from "./telegram-domain-contract";

describe("telegram domain message contracts", () => {
  it("escapes untrusted HTML in every domain message", () => {
    const hostile = '<script>alert("x")</script>&';
    const messages = [
      buildSpecialOfferMessage({ name: hostile, phone: "+7 999 123-45-67", popupTitle: hostile, sourceTag: hostile }),
      buildOrganizationRegistrationMessage({
        name: hostile,
        contactName: hostile,
        email: hostile,
        phone: hostile,
        inn: hostile,
        requestedPlan: hostile,
        promoCode: hostile,
      }),
      buildSupportRequestMessage({
        userName: hostile,
        userEmail: hostile,
        role: hostile,
        organizationId: null,
        description: hostile,
        contactPhone: hostile,
        browserInfo: hostile,
        pageUrl: hostile,
        errorLogs: hostile,
        screenshotUrl: hostile,
      }),
      buildOrganizationTelegramTestMessage(hostile),
      buildSubscriptionUpgradeMessage({
        organizationName: hostile,
        contactName: hostile,
        email: hostile,
        phone: hostile,
        currentPlan: hostile,
        requestedPlan: hostile,
        requestedPlanName: hostile,
        monthlyPrice: 4_490,
        comment: hostile,
      }),
    ];

    for (const message of messages) {
      expect(message).not.toContain("<script>");
      expect(message).toContain("&lt;script&gt;");
      expect(message.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
    }
  });

  it("accepts only canonical UUIDs, phones and subscription plans", () => {
    expect(uuid("e8d44487-85e4-4a16-b143-e5319065e8b0")).toBe("e8d44487-85e4-4a16-b143-e5319065e8b0");
    expect(uuid("not-an-id")).toBe("");
    expect(isReasonablePhone("+7 (999) 123-45-67")).toBe(true);
    expect(isReasonablePhone("123")) .toBe(false);
    expect(normalizeSubscriptionPlan("professional")).toBe("professional");
    expect(normalizeSubscriptionPlan("enterprise")).toBeNull();
  });

  it("escapes all Telegram HTML metacharacters", () => {
    expect(escapeTelegramHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
});
