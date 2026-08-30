export const TELEGRAM_REQUEST_BODY_MAX_BYTES = 16 * 1024;
export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;
export const TELEGRAM_PHOTO_CAPTION_MAX_LENGTH = 1024;
export const TELEGRAM_PHOTO_URL_MAX_LENGTH = 2048;
export const TELEGRAM_CHAT_ID_MAX_LENGTH = 128;

const SERVICE_ROLE_KEY_MIN_LENGTH = 32;
const SERVICE_ROLE_KEY_MAX_LENGTH = 8192;
const TELEGRAM_BOT_TOKEN_PATTERN = /^\d{5,20}:[A-Za-z0-9_-]{20,128}$/;
const TELEGRAM_CHAT_ID_PATTERN = /^(?:-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
const UNSUPPORTED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ALLOWED_PAYLOAD_KEYS = new Set(["chat_id", "message", "photo_url"]);

export type EnvReader = (name: string) => string | undefined;

export interface TelegramRelayAuthConfig {
  serviceRoleKey: string;
}

export interface TelegramRelayDeliveryConfig {
  botToken: string;
  supportChatId?: string;
}

export interface TelegramRelayPayload {
  chatId?: string;
  message: string;
  photoUrl?: string;
}

export class TelegramRelayContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "TelegramRelayContractError";
    this.code = code;
    this.status = status;
  }
}

function trimmedEnv(env: EnvReader, name: string): string {
  return env(name)?.trim() ?? "";
}

function validateChatId(
  value: unknown,
  errorCode = "invalid_chat_id",
  status = 400,
): string {
  if (typeof value !== "string") {
    throw new TelegramRelayContractError(errorCode, status);
  }

  const chatId = value.trim();
  if (
    chatId.length === 0 ||
    chatId.length > TELEGRAM_CHAT_ID_MAX_LENGTH ||
    !TELEGRAM_CHAT_ID_PATTERN.test(chatId)
  ) {
    throw new TelegramRelayContractError(errorCode, status);
  }

  return chatId;
}

export function readTelegramRelayAuthConfig(env: EnvReader): TelegramRelayAuthConfig {
  const serviceRoleKey = trimmedEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (
    serviceRoleKey.length < SERVICE_ROLE_KEY_MIN_LENGTH ||
    serviceRoleKey.length > SERVICE_ROLE_KEY_MAX_LENGTH ||
    /\s/.test(serviceRoleKey)
  ) {
    throw new TelegramRelayContractError("relay_auth_not_configured", 500);
  }

  return { serviceRoleKey };
}

export function readTelegramRelayDeliveryConfig(env: EnvReader): TelegramRelayDeliveryConfig {
  const botToken = trimmedEnv(env, "TELEGRAM_BOT_TOKEN");
  if (!TELEGRAM_BOT_TOKEN_PATTERN.test(botToken)) {
    throw new TelegramRelayContractError("telegram_not_configured", 500);
  }

  const rawSupportChatId = trimmedEnv(env, "TELEGRAM_SUPPORT_CHAT_ID");
  const supportChatId = rawSupportChatId
    ? validateChatId(rawSupportChatId, "telegram_not_configured", 500)
    : undefined;

  return { botToken, supportChatId };
}

function parseBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer ([^\s,]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

async function sha256(value: string, subtle: SubtleCrypto): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await subtle.digest("SHA-256", bytes));
}

export async function constantTimeSecretEquals(
  candidate: string,
  expected: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<boolean> {
  const [candidateDigest, expectedDigest] = await Promise.all([
    sha256(candidate, subtle),
    sha256(expected, subtle),
  ]);

  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= candidateDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

export async function isServiceRoleBearer(
  authorization: string | null,
  serviceRoleKey: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<boolean> {
  const bearerToken = parseBearerToken(authorization);
  if (!bearerToken) return false;
  return constantTimeSecretEquals(bearerToken, serviceRoleKey, subtle);
}

function validateMessage(value: unknown): string {
  if (typeof value !== "string") {
    throw new TelegramRelayContractError("invalid_message", 400);
  }
  if (
    value.trim().length === 0 ||
    value.length > TELEGRAM_MESSAGE_MAX_LENGTH ||
    UNSUPPORTED_CONTROL_CHARACTERS.test(value)
  ) {
    throw new TelegramRelayContractError("invalid_message", 400);
  }
  return value;
}

function validatePhotoUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new TelegramRelayContractError("invalid_photo_url", 400);
  }

  const photoUrl = value.trim();
  if (photoUrl.length === 0 || photoUrl.length > TELEGRAM_PHOTO_URL_MAX_LENGTH) {
    throw new TelegramRelayContractError("invalid_photo_url", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(photoUrl);
  } catch {
    throw new TelegramRelayContractError("invalid_photo_url", 400);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hostname === ""
  ) {
    throw new TelegramRelayContractError("invalid_photo_url", 400);
  }

  return parsed.href;
}

export function validateTelegramRelayPayload(value: unknown): TelegramRelayPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TelegramRelayContractError("invalid_payload", 400);
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
      throw new TelegramRelayContractError("invalid_payload", 400);
    }
  }

  return {
    chatId: record.chat_id === undefined ? undefined : validateChatId(record.chat_id),
    message: validateMessage(record.message),
    photoUrl: record.photo_url === undefined ? undefined : validatePhotoUrl(record.photo_url),
  };
}

export function resolveTelegramChatId(
  payload: TelegramRelayPayload,
  config: TelegramRelayDeliveryConfig,
): string {
  const chatId = payload.chatId ?? config.supportChatId;
  if (!chatId) {
    throw new TelegramRelayContractError("chat_id_required", 400);
  }
  return chatId;
}

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes = TELEGRAM_REQUEST_BODY_MAX_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new TelegramRelayContractError("unsupported_media_type", 415);
  }

  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength !== null) {
    const contentLength = Number(rawContentLength);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new TelegramRelayContractError("invalid_content_length", 400);
    }
    if (contentLength > maxBytes) {
      throw new TelegramRelayContractError("payload_too_large", 413);
    }
  }

  if (!request.body) {
    throw new TelegramRelayContractError("invalid_json", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new TelegramRelayContractError("payload_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new TelegramRelayContractError("invalid_json", 400);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new TelegramRelayContractError("invalid_json", 400);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new TelegramRelayContractError("invalid_json", 400);
  }
}

export function truncateTelegramCaption(message: string): string {
  return Array.from(message).slice(0, TELEGRAM_PHOTO_CAPTION_MAX_LENGTH).join("");
}
