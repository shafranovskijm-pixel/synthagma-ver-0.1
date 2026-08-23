import { describe, expect, it } from "vitest";
import {
  buildEmailHtml,
  buildEmailSubject,
  buildTelegramMessage,
  isReasonablePhone,
  normalizeDemoRequestInput,
  notificationInvokeSucceeded,
} from "./contract";

describe("submit-demo-request notification contract", () => {
  it("normalizes public form input and applies the safe source default", () => {
    expect(normalizeDemoRequestInput({
      name: "  Максим  ",
      phone: " +7 900 000-00-00 ",
      source: "   ",
      message: 42,
    })).toEqual({
      name: "Максим",
      organization: "",
      phone: "+7 900 000-00-00",
      email: "",
      slot: "",
      message: "",
      source: "demonstration_page",
    });
  });

  it("escapes every dynamic Telegram and email HTML value", () => {
    const input = normalizeDemoRequestInput({
      name: '<script>alert("x")</script>',
      organization: "A&B",
      phone: "<b>+7</b>",
      email: "a'b@example.test",
      slot: "Пн > Вт",
      message: "строка 1\n<img src=x>",
      source: "<source>",
    });

    const telegram = buildTelegramMessage(input);
    const email = buildEmailHtml(input);

    for (const html of [telegram, email]) {
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img src=x>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("A&amp;B");
      expect(html).toContain("a&#39;b@example.test");
      expect(html).toContain("&lt;img src=x&gt;");
    }
    expect(telegram).toContain("строка 1\n&lt;img src=x&gt;");
    expect(telegram).not.toContain("<br>");
    expect(email).toContain("строка 1<br>&lt;img src=x&gt;");
  });

  it("removes user-controlled newlines from the email subject", () => {
    const input = normalizeDemoRequestInput({
      name: "Максим\r\nBcc: attacker@example.test",
      organization: "ООО Тест\nInjected",
      phone: "+7",
    });

    expect(buildEmailSubject(input)).toBe(
      "Новая заявка на демо: Максим Bcc: attacker@example.test (ООО Тест Injected)",
    );
  });

  it("accepts only an explicit success result from nested notification functions", () => {
    expect(notificationInvokeSucceeded({ success: true })).toBe(true);
    expect(notificationInvokeSucceeded({ success: false })).toBe(false);
    expect(notificationInvokeSucceeded({ ok: true })).toBe(false);
    expect(notificationInvokeSucceeded(null)).toBe(false);
  });

  it("rejects the untouched +7 placeholder and unreasonable phone lengths", () => {
    expect(isReasonablePhone("+7 ")).toBe(false);
    expect(isReasonablePhone("+7 (999) 123-45-67")).toBe(true);
    expect(isReasonablePhone("+123456789012345")).toBe(true);
    expect(isReasonablePhone("+1234567890123456")).toBe(false);
  });
});
