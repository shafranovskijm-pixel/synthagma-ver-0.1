// Этап 3 — пресеты и валидация мастера подключения отправителей.
// В пресетах НЕТ и не может быть секретов: только хосты/порты/шифрование.

export type MailSecurity = "ssl" | "starttls" | "none";

export interface SenderPreset {
  key: string;
  label: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: MailSecurity;
  imap_host: string;
  imap_port: number;
  imap_security: MailSecurity;
  /** Подсказка по логину, без пароля. */
  hint?: string;
}

export const TORGI_PRESET: SenderPreset = {
  key: "torgi.com.ru",
  label: "torgi.com.ru",
  smtp_host: "mail.torgi.com.ru",
  smtp_port: 465,
  smtp_security: "ssl",
  imap_host: "mail.torgi.com.ru",
  imap_port: 993,
  imap_security: "ssl",
  hint: "Логин — полный адрес ящика. Пароль вводится один раз и хранится только в зашифрованном виде.",
};

export const CUSTOM_PRESET: SenderPreset = {
  key: "custom",
  label: "Другой провайдер (вручную)",
  smtp_host: "",
  smtp_port: 465,
  smtp_security: "ssl",
  imap_host: "",
  imap_port: 993,
  imap_security: "ssl",
};

export const SENDER_PRESETS: SenderPreset[] = [TORGI_PRESET, CUSTOM_PRESET];

export function getSenderPreset(key: string): SenderPreset | null {
  return SENDER_PRESETS.find((p) => p.key === key) ?? null;
}

/** Пресет не содержит полей пароля/секрета ни под каким именем. */
export function presetHasNoSecrets(preset: SenderPreset): boolean {
  return !Object.keys(preset).some((k) => /pass|secret|token|credential/i.test(k));
}

export type WizardStep = "preset" | "identity" | "smtp" | "imap" | "tests";

export interface SenderDraft {
  presetKey: string;
  label: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  smtpUsername: string;
  /** Пароль существует только в памяти формы до отправки на сервер. */
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  imapUsername: string;
  dailyLimit: number;
}

export function emptySenderDraft(): SenderDraft {
  return {
    presetKey: TORGI_PRESET.key,
    label: "",
    fromName: "",
    fromEmail: "",
    smtpHost: TORGI_PRESET.smtp_host,
    smtpPort: TORGI_PRESET.smtp_port,
    smtpSecurity: TORGI_PRESET.smtp_security,
    smtpUsername: "",
    password: "",
    imapHost: TORGI_PRESET.imap_host,
    imapPort: TORGI_PRESET.imap_port,
    imapSecurity: TORGI_PRESET.imap_security,
    imapUsername: "",
    dailyLimit: 200,
  };
}

export function applyPreset(draft: SenderDraft, presetKey: string): SenderDraft {
  const preset = getSenderPreset(presetKey) ?? CUSTOM_PRESET;
  return {
    ...draft,
    presetKey: preset.key,
    smtpHost: preset.smtp_host || draft.smtpHost,
    smtpPort: preset.smtp_port,
    smtpSecurity: preset.smtp_security,
    imapHost: preset.imap_host || draft.imapHost,
    imapPort: preset.imap_port,
    imapSecurity: preset.imap_security,
  };
}

export interface GateResult {
  ok: boolean;
  reason?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function validateStep(step: WizardStep, draft: SenderDraft, isNew = true): GateResult {
  if (step === "preset") {
    if (!getSenderPreset(draft.presetKey)) return { ok: false, reason: "Выберите пресет" };
    return { ok: true };
  }
  if (step === "identity") {
    if (!draft.label.trim()) return { ok: false, reason: "Укажите название аккаунта" };
    if (!isEmail(draft.fromEmail)) return { ok: false, reason: "Некорректный адрес отправителя" };
    return { ok: true };
  }
  if (step === "smtp") {
    if (!draft.smtpHost.trim()) return { ok: false, reason: "Укажите SMTP-хост" };
    if (!draft.smtpPort || draft.smtpPort < 1 || draft.smtpPort > 65535) {
      return { ok: false, reason: "Некорректный SMTP-порт" };
    }
    if (!draft.smtpUsername.trim()) return { ok: false, reason: "Укажите SMTP-логин" };
    if (isNew && !draft.password) return { ok: false, reason: "Укажите пароль ящика" };
    return { ok: true };
  }
  if (step === "imap") {
    if (draft.imapHost.trim() && (!draft.imapPort || draft.imapPort < 1 || draft.imapPort > 65535)) {
      return { ok: false, reason: "Некорректный IMAP-порт" };
    }
    return { ok: true };
  }
  return { ok: true };
}

/** Мастер целиком: все шаги должны быть валидны. */
export function validateSenderDraft(draft: SenderDraft, isNew = true): GateResult {
  for (const step of ["preset", "identity", "smtp", "imap"] as WizardStep[]) {
    const r = validateStep(step, draft, isNew);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/**
 * Строка для записи в БД. Пароль передаётся отдельным полем и шифруется
 * триггером на сервере; plaintext никогда не хранится и не логируется.
 */
export function toSenderRow(draft: SenderDraft, organizationId: string) {
  return {
    organization_id: organizationId,
    preset_key: draft.presetKey,
    label: draft.label.trim(),
    from_name: draft.fromName.trim() || null,
    from_email: draft.fromEmail.trim().toLowerCase(),
    smtp_host: draft.smtpHost.trim(),
    smtp_port: draft.smtpPort,
    smtp_security: draft.smtpSecurity,
    smtp_username: draft.smtpUsername.trim(),
    imap_host: draft.imapHost.trim() || null,
    imap_port: draft.imapHost.trim() ? draft.imapPort : null,
    imap_security: draft.imapHost.trim() ? draft.imapSecurity : null,
    imap_username: draft.imapUsername.trim() || null,
    daily_limit: draft.dailyLimit,
  };
}

export const MAX_SEED_EMAILS = 5;

export interface SeedParseResult {
  emails: string[];
  invalid: string[];
}

/** Seed-адреса вводятся только вручную и никогда не берутся из базы кампании. */
export function parseSeedEmails(raw: string): SeedParseResult {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (!isEmail(lower)) {
      invalid.push(p);
      continue;
    }
    if (!emails.includes(lower)) emails.push(lower);
  }
  return { emails, invalid };
}

export interface SeedTestGateInput {
  senderAccountId: string | null;
  smtpStatus: string | null;
  seedRaw: string;
}

/** Гейт «Тестовой отправки»: явный отправитель + успешный SMTP-тест + 1–5 seed-адресов. */
export function validateSeedTest(input: SeedTestGateInput): GateResult & { emails?: string[] } {
  if (!input.senderAccountId) return { ok: false, reason: "Выберите отправителя" };
  if (input.smtpStatus !== "ok") return { ok: false, reason: "Сначала выполните успешный SMTP-тест отправителя" };
  const { emails, invalid } = parseSeedEmails(input.seedRaw);
  if (invalid.length) return { ok: false, reason: `Некорректные адреса: ${invalid.join(", ")}` };
  if (emails.length < 1) return { ok: false, reason: "Введите от 1 до 5 seed-адресов" };
  if (emails.length > MAX_SEED_EMAILS) return { ok: false, reason: `Не более ${MAX_SEED_EMAILS} seed-адресов` };
  return { ok: true, emails };
}
