import { describe, expect, it } from "vitest";
import {
  buildAttributionLines,
  buildEmailHtml,
  buildEmailSubject,
  buildTelegramMessage,
  isReasonablePhone,
  normalizeDemoRequestInput,
  notificationInvokeSucceeded,
  TELEGRAM_MESSAGE_MAX_LENGTH,
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
      tracking: {
        utm_source: "",
        utm_medium: "",
        utm_campaign: "",
        utm_term: "",
        utm_content: "",
        yclid: "",
        page_url: "",
        referrer: "",
      },
    });
  });

  it("normalizes only supported attribution fields and limits their size", () => {
    const input = normalizeDemoRequestInput({
      name: "Максим",
      phone: "+7 900 000-00-00",
      tracking: {
        utm_source: "  yandex  ",
        utm_campaign: "search",
        yclid: `  ${"x".repeat(160)}  `,
        page_url: "https://sintagma.com.ru/demonstration",
        saved_at: 123,
        unexpected: "must-not-pass",
      },
    });

    expect(input.tracking.utm_source).toBe("yandex");
    expect(input.tracking.yclid).toHaveLength(128);
    expect(input.tracking).not.toHaveProperty("saved_at");
    expect(input.tracking).not.toHaveProperty("unexpected");
    expect(buildAttributionLines(input.tracking)).toEqual([
      "UTM source: yandex",
      "UTM campaign: search",
      `Yandex click ID: ${"x".repeat(128)}`,
      "Посадочная страница: https://sintagma.com.ru/demonstration",
    ]);
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
      tracking: {
        utm_campaign: '<campaign & "x">',
        yclid: "click-<123>",
      },
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
      expect(html).toContain("&lt;campaign &amp; &quot;x&quot;&gt;");
      expect(html).toContain("click-&lt;123&gt;");
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

  it("keeps the Telegram HTML payload within the delivery limit", () => {
    const input = normalizeDemoRequestInput({
      name: "<&".repeat(1_000),
      organization: "<&".repeat(1_000),
      phone: "+7 900 000-00-00",
      email: "<&".repeat(1_000),
      slot: "<&".repeat(1_000),
      message: "<&".repeat(5_000),
      source: "<&".repeat(1_000),
      tracking: {
        utm_source: "<&".repeat(1_000),
        utm_medium: "<&".repeat(1_000),
        utm_campaign: "<&".repeat(1_000),
        yclid: "<&".repeat(1_000),
        page_url: "<&".repeat(2_000),
        referrer: "<&".repeat(2_000),
      },
    });

    const telegram = buildTelegramMessage(input);

    expect(telegram.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX_LENGTH);
    expect(telegram).toContain("<b>Телефон:</b> +7 900 000-00-00");
    expect(telegram).toContain("<b>Атрибуция:</b>");
    expect(telegram).not.toMatch(/&(?:a|am|amp|l|lt|g|gt|q|qu|quo|quot)?$/);
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
