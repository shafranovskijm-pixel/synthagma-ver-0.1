import { telegramHtmlValue } from "../_shared/telegram-html.ts";

export const REGISTRATION_ATTEMPT_BODY_MAX_BYTES = 16 * 1024;
export const REGISTRATION_ATTEMPT_RATE_MAX = 30;
export const REGISTRATION_ATTEMPT_RATE_WINDOW_SECONDS = 60;
export const REGISTRATION_ATTEMPT_GLOBAL_RATE_MAX = 300;
export const REGISTRATION_FAILURE_RATE_MAX = 5;
export const REGISTRATION_FAILURE_RATE_WINDOW_SECONDS = 5 * 60;
export const REGISTRATION_FAILURE_GLOBAL_RATE_MAX = 30;
export const REGISTRATION_FAILURE_GLOBAL_RATE_WINDOW_SECONDS = 60;
export const REGISTRATION_FAILURE_WINDOW_SECONDS = 60 * 60;

const ALLOWED_KEYS = new Set([
  "attempt_id",
  "step",
  "email",
  "phone",
  "org_name",
  "contact_name",
  "inn",
  "selected_plan",
  "promo_code",
  "ref_code",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "page_url",
  "referrer",
  "error_message",
  "user_id",
  "organization_id",
]);

const FIELD_CAPS = {
  email: 254,
  phone: 64,
  org_name: 255,
  contact_name: 255,
  inn: 32,
  selected_plan: 64,
  promo_code: 64,
  ref_code: 64,
  utm_source: 128,
  utm_medium: 128,
  utm_campaign: 128,
  utm_term: 128,
  utm_content: 128,
  page_url: 1024,
  referrer: 1024,
  error_message: 2000,
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function hasUnsupportedControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 8 ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 127
    ) return true;
  }
  return false;
}

export type RegistrationAttemptStep = "submitted" | "success" | "failed";

export interface RegistrationAttemptPayload {
  attempt_id?: string;
  step: RegistrationAttemptStep;
  email?: string;
  phone?: string;
  org_name?: string;
  contact_name?: string;
  inn?: string;
  selected_plan?: string;
  promo_code?: string;
  ref_code?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  page_url?: string;
  referrer?: string;
  error_message?: string;
  user_id?: string;
  organization_id?: string;
}

export class RegistrationAttemptContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "RegistrationAttemptContractError";
    this.code = code;
    this.status = status;
  }
}

function optionalString(
  record: Record<string, unknown>,
  key: keyof typeof FIELD_CAPS,
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new RegistrationAttemptContractError(`invalid_${key}`, 400);
  }

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    Array.from(trimmed).length > FIELD_CAPS[key] ||
    hasUnsupportedControlCharacters(trimmed)
  ) {
    throw new RegistrationAttemptContractError(`invalid_${key}`, 400);
  }
  return trimmed;
}

function optionalUuid(record: Record<string, unknown>, key: "attempt_id" | "user_id" | "organization_id") {
  const value = record[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new RegistrationAttemptContractError(`invalid_${key}`, 400);
  }
  return value.trim().toLowerCase();
}

export function parseRegistrationAttemptPayload(value: unknown): RegistrationAttemptPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegistrationAttemptContractError("invalid_payload", 400);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new RegistrationAttemptContractError("invalid_payload", 400);
    }
  }

  if (record.step !== "submitted" && record.step !== "success" && record.step !== "failed") {
    throw new RegistrationAttemptContractError("invalid_step", 400);
  }

  return {
    attempt_id: optionalUuid(record, "attempt_id"),
    step: record.step,
    email: optionalString(record, "email"),
    phone: optionalString(record, "phone"),
    org_name: optionalString(record, "org_name"),
    contact_name: optionalString(record, "contact_name"),
    inn: optionalString(record, "inn"),
    selected_plan: optionalString(record, "selected_plan"),
    promo_code: optionalString(record, "promo_code"),
    ref_code: optionalString(record, "ref_code"),
    utm_source: optionalString(record, "utm_source"),
    utm_medium: optionalString(record, "utm_medium"),
    utm_campaign: optionalString(record, "utm_campaign"),
    utm_term: optionalString(record, "utm_term"),
    utm_content: optionalString(record, "utm_content"),
    page_url: optionalString(record, "page_url"),
    referrer: optionalString(record, "referrer"),
    error_message: optionalString(record, "error_message"),
    user_id: optionalUuid(record, "user_id"),
    organization_id: optionalUuid(record, "organization_id"),
  };
}

export async function readRegistrationAttemptBody(request: Request): Promise<RegistrationAttemptPayload> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json" && contentType !== "text/plain") {
    throw new RegistrationAttemptContractError("unsupported_media_type", 415);
  }

  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength !== null) {
    const contentLength = Number(rawContentLength);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new RegistrationAttemptContractError("invalid_content_length", 400);
    }
    if (contentLength > REGISTRATION_ATTEMPT_BODY_MAX_BYTES) {
      throw new RegistrationAttemptContractError("payload_too_large", 413);
    }
  }

  if (!request.body) throw new RegistrationAttemptContractError("invalid_json", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > REGISTRATION_ATTEMPT_BODY_MAX_BYTES) {
        await reader.cancel();
        throw new RegistrationAttemptContractError("payload_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) throw new RegistrationAttemptContractError("invalid_json", 400);
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RegistrationAttemptContractError("invalid_json", 400);
  }

  try {
    return parseRegistrationAttemptPayload(JSON.parse(decoded));
  } catch (error) {
    if (error instanceof RegistrationAttemptContractError) throw error;
    throw new RegistrationAttemptContractError("invalid_json", 400);
  }
}

export function registrationClientAddress(request: Request): string {
  const candidate = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || request.headers.get("x-real-ip")
    || "unknown";
  return Array.from(candidate.trim()).slice(0, 64).join("") || "unknown";
}

export async function hmacSha256Hex(
  value: string,
  secret: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function oneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function buildRegistrationFailureMessage(
  payload: RegistrationAttemptPayload,
  ipAddress: string,
): string {
  const utm = [payload.utm_source, payload.utm_medium, payload.utm_campaign]
    .map((value) => telegramHtmlValue(oneLine(value), 128, ""))
    .filter(Boolean)
    .join(" / ");
  const ip = telegramHtmlValue(oneLine(ipAddress), 64, "");

  return `⚠️ <b>ОШИБКА регистрации организации</b>\n\n` +
    `<b>Организация:</b> ${telegramHtmlValue(oneLine(payload.org_name), 200)}\n` +
    `<b>Контакт:</b> ${telegramHtmlValue(oneLine(payload.contact_name), 200)}\n` +
    `<b>Email:</b> ${telegramHtmlValue(oneLine(payload.email), 254)}\n` +
    `<b>Телефон:</b> ${telegramHtmlValue(oneLine(payload.phone), 64)}\n` +
    `<b>ИНН:</b> ${telegramHtmlValue(oneLine(payload.inn), 32)}\n` +
    `<b>Тариф:</b> ${telegramHtmlValue(oneLine(payload.selected_plan), 64)}\n` +
    (utm ? `<b>Источник:</b> ${utm}\n` : "") +
    (ip ? `<b>IP:</b> ${ip}\n` : "") +
    `\n<b>Ошибка:</b> ${telegramHtmlValue(oneLine(payload.error_message), 800)}\n\n` +
    `📞 Перезвоните клиенту — он не смог зарегистрироваться сам!`;
}
