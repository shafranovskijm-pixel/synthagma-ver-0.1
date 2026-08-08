import { describe, it, expect } from "vitest";
import {
  assertSmtpCode,
  buildRawEmail,
  dotStuff,
  isCompleteSmtpResponse,
  parseSmtpResponse,
  SMTP_EXPECTED,
} from "../../../../supabase/functions/_shared/smtp-protocol";

describe("SMTP response parser", () => {
  it("rejects empty/EOF response", () => {
    expect(() => parseSmtpResponse("", "DATA body")).toThrow(/EOF/);
    expect(() => parseSmtpResponse("   \r\n", "DATA body")).toThrow();
  });

  it("rejects code 0 / unparseable response", () => {
    expect(() => parseSmtpResponse("0 ok\r\n", "DATA body")).toThrow();
    expect(() => parseSmtpResponse("garbage\r\n", "DATA body")).toThrow(/непарсируемый/);
  });

  it("treats unterminated multi-line as incomplete", () => {
    expect(isCompleteSmtpResponse("250-PIPELINING\r\n")).toBe(false);
    expect(() => parseSmtpResponse("250-PIPELINING\r\n", "EHLO")).toThrow(/незавершённый/);
  });

  it("parses multi-line 250 EHLO", () => {
    const raw = "250-mail.example.com\r\n250-PIPELINING\r\n250 SIZE 52428800\r\n";
    expect(isCompleteSmtpResponse(raw)).toBe(true);
    expect(parseSmtpResponse(raw, "EHLO").code).toBe(250);
    expect(assertSmtpCode(raw, [...SMTP_EXPECTED.ehlo], "EHLO").code).toBe(250);
  });

  it("rejects wrong code at DATA body", () => {
    expect(() => assertSmtpCode("354 go ahead\r\n", [...SMTP_EXPECTED.dataBody], "DATA body")).toThrow(/DATA body/);
    expect(() => assertSmtpCode("", [...SMTP_EXPECTED.dataBody], "DATA body")).toThrow();
    expect(assertSmtpCode("250 2.0.0 Ok: queued\r\n", [...SMTP_EXPECTED.dataBody], "DATA body").code).toBe(250);
  });
});

describe("SMTP message builder", () => {
  const base = {
    from: "Тест <a@torgi.com.ru>",
    fromEmail: "a@torgi.com.ru",
    to: "b@example.com",
    subject: "Тема",
    html: "<p>hi</p>",
  };

  it("adds Date and unique Message-ID", () => {
    const m1 = buildRawEmail(base);
    const m2 = buildRawEmail(base);
    expect(m1.raw).toMatch(/\r\nDate: .+\+0000\r\n/);
    expect(m1.raw).toContain(`Message-ID: ${m1.messageId}`);
    expect(m1.messageId).toMatch(/^<[^<>@]+@torgi\.com\.ru>$/);
    expect(m1.messageId).not.toBe(m2.messageId);
    expect(m1.raw).toContain("MIME-Version: 1.0");
    expect(m1.raw).toContain("=?UTF-8?B?");
  });

  it("dot-stuffs lines starting with a dot", () => {
    expect(dotStuff(".hidden\r\nnormal\r\n.")).toBe("..hidden\r\nnormal\r\n..");
    const { raw } = buildRawEmail({ ...base, extraHeaders: { "X-T": "v" } });
    expect(raw.split("\r\n").every((l) => !/^\.[^.]/.test(l))).toBe(true);
  });

  it("rejects CR/LF header injection", () => {
    expect(() => buildRawEmail({ ...base, subject: "a\r\nBcc: x@y.z" })).toThrow();
    expect(() => buildRawEmail({ ...base, to: "b@example.com\r\nRCPT TO:<c@d.e>" })).toThrow();
    const { raw } = buildRawEmail({ ...base, extraHeaders: { "List-Unsubscribe": "a\r\nX-Evil: 1" } });
    expect(raw).not.toContain("X-Evil");
  });
});
