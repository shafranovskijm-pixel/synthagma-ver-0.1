import { describe, it, expect } from "vitest";
import {
  TORGI_PRESET,
  SENDER_PRESETS,
  applyPreset,
  emptySenderDraft,
  parseSeedEmails,
  presetHasNoSecrets,
  toSenderRow,
  validateSeedTest,
  validateSenderDraft,
  validateStep,
  MAX_SEED_EMAILS,
} from "@/lib/mailing/senderPresets";
import { validateDraft, validateSend } from "@/lib/mailing/campaignDraftGate";

describe("пресет torgi.com.ru", () => {
  it("содержит корректные хосты/порты и не содержит секретов", () => {
    expect(TORGI_PRESET.smtp_host).toBe("mail.torgi.com.ru");
    expect(TORGI_PRESET.smtp_port).toBe(465);
    expect(TORGI_PRESET.smtp_security).toBe("ssl");
    expect(TORGI_PRESET.imap_host).toBe("mail.torgi.com.ru");
    expect(TORGI_PRESET.imap_port).toBe(993);
    expect(TORGI_PRESET.imap_security).toBe("ssl");
    for (const p of SENDER_PRESETS) expect(presetHasNoSecrets(p)).toBe(true);
    expect(JSON.stringify(SENDER_PRESETS)).not.toMatch(/password|secret/i);
  });

  it("применение пресета заполняет только транспорт", () => {
    const d = applyPreset({ ...emptySenderDraft(), smtpUsername: "a@b.ru" }, "torgi.com.ru");
    expect(d.smtpHost).toBe("mail.torgi.com.ru");
    expect(d.imapPort).toBe(993);
    expect(d.password).toBe("");
    expect(d.smtpUsername).toBe("a@b.ru");
  });
});

describe("мастер отправителя", () => {
  const full = () => ({
    ...emptySenderDraft(),
    label: "Торги",
    fromEmail: "info@torgi.com.ru",
    smtpUsername: "info@torgi.com.ru",
    password: "not-a-real-password",
  });

  it("блокирует шаги без обязательных полей", () => {
    expect(validateStep("identity", emptySenderDraft()).ok).toBe(false);
    expect(validateStep("smtp", { ...full(), password: "" }, true).ok).toBe(false);
    expect(validateStep("smtp", { ...full(), password: "" }, false).ok).toBe(true);
  });

  it("валидный черновик проходит целиком", () => {
    expect(validateSenderDraft(full()).ok).toBe(true);
  });

  it("строка для БД не содержит plaintext-пароля", () => {
    const row = toSenderRow(full(), "org-1") as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain("not-a-real-password");
    expect(Object.keys(row)).not.toContain("password");
    expect(Object.keys(row)).not.toContain("password_encrypted");
    expect(row.organization_id).toBe("org-1");
    expect(row.from_email).toBe("info@torgi.com.ru");
  });
});

describe("seed-адреса", () => {
  it("парсит, нормализует и дедуплицирует", () => {
    const r = parseSeedEmails("A@b.ru, a@b.ru; c@d.ru\n bad");
    expect(r.emails).toEqual(["a@b.ru", "c@d.ru"]);
    expect(r.invalid).toEqual(["bad"]);
  });

  it("требует успешный SMTP-тест и выбранного отправителя", () => {
    expect(validateSeedTest({ senderAccountId: null, smtpStatus: "ok", seedRaw: "a@b.ru" }).ok).toBe(false);
    expect(validateSeedTest({ senderAccountId: "s1", smtpStatus: "untested", seedRaw: "a@b.ru" }).ok).toBe(false);
    expect(validateSeedTest({ senderAccountId: "s1", smtpStatus: "error", seedRaw: "a@b.ru" }).ok).toBe(false);
    expect(validateSeedTest({ senderAccountId: "s1", smtpStatus: "ok", seedRaw: "a@b.ru" }).ok).toBe(true);
  });

  it("ограничивает 1–5 адресами и не берёт список кампании", () => {
    expect(validateSeedTest({ senderAccountId: "s1", smtpStatus: "ok", seedRaw: "" }).ok).toBe(false);
    const many = Array.from({ length: MAX_SEED_EMAILS + 1 }, (_, i) => `s${i}@b.ru`).join(",");
    expect(validateSeedTest({ senderAccountId: "s1", smtpStatus: "ok", seedRaw: many }).ok).toBe(false);
    // Единственный источник адресов — введённая строка формы.
    const res = validateSeedTest({ senderAccountId: "s1", smtpStatus: "ok", seedRaw: "seed@b.ru" });
    expect(res.emails).toEqual(["seed@b.ru"]);
  });
});

describe("гейт кампании с отправителем", () => {
  const content = { name: "К", subject: "Т", html: "<p>x</p>" };

  it("черновик сохраняется без отправителя", () => {
    expect(validateDraft(content).ok).toBe(true);
  });

  it("запуск без отправителя заблокирован", () => {
    const r = validateSend({
      ...content,
      consent: true,
      recipientCount: 10,
      variablesOk: true,
      senderAccountId: null,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/отправител/i);
  });

  it("запуск с отправителем, но без согласия/получателей — заблокирован", () => {
    expect(
      validateSend({ ...content, consent: false, recipientCount: 10, variablesOk: true, senderAccountId: "s1" }).ok,
    ).toBe(false);
    expect(
      validateSend({ ...content, consent: true, recipientCount: 0, variablesOk: true, senderAccountId: "s1" }).ok,
    ).toBe(false);
    expect(
      validateSend({ ...content, consent: true, recipientCount: 5, variablesOk: false, senderAccountId: "s1" }).ok,
    ).toBe(false);
  });

  it("полный набор условий разрешает запуск", () => {
    expect(
      validateSend({ ...content, consent: true, recipientCount: 5, variablesOk: true, senderAccountId: "s1" }).ok,
    ).toBe(true);
  });
});
