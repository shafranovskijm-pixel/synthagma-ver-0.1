import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  constantTimeSecretEquals,
  isServiceRoleBearer,
  readTelegramRelayAuthConfig,
  readTelegramRelayDeliveryConfig,
  resolveTelegramChatId,
  TELEGRAM_CHAT_ID_MAX_LENGTH,
  TELEGRAM_MESSAGE_MAX_LENGTH,
  TELEGRAM_PHOTO_URL_MAX_LENGTH,
  TelegramRelayContractError,
  validateTelegramRelayPayload,
  type EnvReader,
} from "./contract";

const SERVICE_ROLE_KEY = `service-role-${"s".repeat(64)}`;
const BOT_TOKEN = `123456789:${"b".repeat(35)}`;
const subtle = webcrypto.subtle as SubtleCrypto;

function env(values: Record<string, string | undefined>): EnvReader {
  return (name) => values[name];
}

function expectContractError(action: () => unknown, code: string, status: number): void {
  try {
    action();
    throw new Error("Expected TelegramRelayContractError");
  } catch (error) {
    expect(error).toBeInstanceOf(TelegramRelayContractError);
    expect(error).toMatchObject({ code, status });
  }
}

describe("send-telegram-notification authorization contract", () => {
  it("accepts only an exact service-role bearer token", async () => {
    await expect(isServiceRoleBearer(`Bearer ${SERVICE_ROLE_KEY}`, SERVICE_ROLE_KEY, subtle)).resolves.toBe(true);
    await expect(isServiceRoleBearer(`bearer ${SERVICE_ROLE_KEY}`, SERVICE_ROLE_KEY, subtle)).resolves.toBe(true);
    await expect(isServiceRoleBearer(`Bearer ${SERVICE_ROLE_KEY}x`, SERVICE_ROLE_KEY, subtle)).resolves.toBe(false);
    await expect(isServiceRoleBearer("Bearer authenticated-user-jwt", SERVICE_ROLE_KEY, subtle)).resolves.toBe(false);
    await expect(isServiceRoleBearer(null, SERVICE_ROLE_KEY, subtle)).resolves.toBe(false);
    await expect(isServiceRoleBearer(`Bearer ${SERVICE_ROLE_KEY},Bearer extra`, SERVICE_ROLE_KEY, subtle)).resolves.toBe(false);
  });

  it("compares fixed-size SHA-256 digests without an early length branch", async () => {
    await expect(constantTimeSecretEquals(SERVICE_ROLE_KEY, SERVICE_ROLE_KEY, subtle)).resolves.toBe(true);
    await expect(constantTimeSecretEquals("short", SERVICE_ROLE_KEY, subtle)).resolves.toBe(false);
    await expect(constantTimeSecretEquals(`${SERVICE_ROLE_KEY.slice(0, -1)}x`, SERVICE_ROLE_KEY, subtle)).resolves.toBe(false);
  });

  it("fails closed when the service-role secret is absent, short, or whitespace-polluted", () => {
    expectContractError(() => readTelegramRelayAuthConfig(env({})), "relay_auth_not_configured", 500);
    expectContractError(
      () => readTelegramRelayAuthConfig(env({ SUPABASE_SERVICE_ROLE_KEY: "too-short" })),
      "relay_auth_not_configured",
      500,
    );
    expectContractError(
      () => readTelegramRelayAuthConfig(env({ SUPABASE_SERVICE_ROLE_KEY: `${"x".repeat(40)} bad` })),
      "relay_auth_not_configured",
      500,
    );
  });
});

describe("send-telegram-notification configuration contract", () => {
  it("loads only a well-formed bot token and optional support chat", () => {
    expect(readTelegramRelayDeliveryConfig(env({
      TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      TELEGRAM_SUPPORT_CHAT_ID: " -1001234567890 ",
    }))).toEqual({
      botToken: BOT_TOKEN,
      supportChatId: "-1001234567890",
    });
  });

  it("reports malformed secrets and support chat as configuration errors", () => {
    expectContractError(
      () => readTelegramRelayDeliveryConfig(env({ TELEGRAM_BOT_TOKEN: "bad-token" })),
      "telegram_not_configured",
      500,
    );
    expectContractError(
      () => readTelegramRelayDeliveryConfig(env({
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
        TELEGRAM_SUPPORT_CHAT_ID: "not a chat",
      })),
      "telegram_not_configured",
      500,
    );
  });
});

describe("send-telegram-notification payload contract", () => {
  it("normalizes the supported payload without changing the message", () => {
    expect(validateTelegramRelayPayload({
      chat_id: " -1001234567890 ",
      message: "<b>Новая заявка</b>\nТелефон: +7",
      photo_url: " https://cdn.example.test/evidence/photo.png ",
    })).toEqual({
      chatId: "-1001234567890",
      message: "<b>Новая заявка</b>\nТелефон: +7",
      photoUrl: "https://cdn.example.test/evidence/photo.png",
    });
  });

  it("rejects arrays, unknown fields, wrong types, control characters, and cap overflow", () => {
    expectContractError(() => validateTelegramRelayPayload([]), "invalid_payload", 400);
    expectContractError(
      () => validateTelegramRelayPayload({ message: "ok", organization_id: "org" }),
      "invalid_payload",
      400,
    );
    expectContractError(() => validateTelegramRelayPayload({ message: 42 }), "invalid_message", 400);
    expectContractError(() => validateTelegramRelayPayload({ message: " \n " }), "invalid_message", 400);
    expectContractError(() => validateTelegramRelayPayload({ message: "bad\u0000value" }), "invalid_message", 400);
    expectContractError(
      () => validateTelegramRelayPayload({ message: "x".repeat(TELEGRAM_MESSAGE_MAX_LENGTH + 1) }),
      "invalid_message",
      400,
    );
    expectContractError(
      () => validateTelegramRelayPayload({ message: "ok", chat_id: "x".repeat(TELEGRAM_CHAT_ID_MAX_LENGTH + 1) }),
      "invalid_chat_id",
      400,
    );
  });

  it("allows only credential-free HTTPS photo URLs inside the cap", () => {
    for (const photo_url of [
      "http://cdn.example.test/photo.png",
      "https://user:password@cdn.example.test/photo.png",
      "not-a-url",
      `https://cdn.example.test/${"x".repeat(TELEGRAM_PHOTO_URL_MAX_LENGTH)}`,
    ]) {
      expectContractError(
        () => validateTelegramRelayPayload({ message: "ok", photo_url }),
        "invalid_photo_url",
        400,
      );
    }
  });

  it("uses the explicit chat first and then the configured support chat", () => {
    const explicit = validateTelegramRelayPayload({ message: "ok", chat_id: "@valid_chat" });
    expect(resolveTelegramChatId(explicit, { botToken: BOT_TOKEN, supportChatId: "-1001" })).toBe("@valid_chat");

    const fallback = validateTelegramRelayPayload({ message: "ok" });
    expect(resolveTelegramChatId(fallback, { botToken: BOT_TOKEN, supportChatId: "-1001" })).toBe("-1001");
    expectContractError(
      () => resolveTelegramChatId(fallback, { botToken: BOT_TOKEN }),
      "chat_id_required",
      400,
    );
  });
});
