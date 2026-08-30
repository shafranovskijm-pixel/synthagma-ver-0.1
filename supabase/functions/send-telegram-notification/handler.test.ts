import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TELEGRAM_REQUEST_BODY_MAX_BYTES } from "./contract";
import { createTelegramRelayHandler, type TelegramRelayDependencies } from "./handler";

const SERVICE_ROLE_KEY = `service-role-${"s".repeat(64)}`;
const AUTHENTICATED_USER_JWT = `user-jwt-${"u".repeat(64)}`;
const BOT_TOKEN = `123456789:${"b".repeat(35)}`;
const SUPPORT_CHAT_ID = "-1001234567890";
const subtle = webcrypto.subtle as SubtleCrypto;

function dependencies(
  fetchImpl: typeof fetch,
  overrides: Record<string, string | undefined> = {},
): TelegramRelayDependencies {
  const values: Record<string, string | undefined> = {
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_SUPPORT_CHAT_ID: SUPPORT_CHAT_ID,
    ...overrides,
  };
  return {
    env: (name) => values[name],
    fetch: fetchImpl,
    subtle,
  };
}

function postRequest(
  body: unknown,
  authorization = `Bearer ${SERVICE_ROLE_KEY}`,
  contentType = "application/json",
): Request {
  return new Request("https://edge.example.test/functions/v1/send-telegram-notification", {
    method: "POST",
    headers: {
      authorization,
      "content-type": contentType,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function telegramResponse(ok: boolean, messageId = 123): Response {
  return new Response(JSON.stringify({
    ok,
    ...(ok ? { result: { message_id: messageId } } : { description: "delivery rejected" }),
  }), {
    status: ok ? 200 : 400,
    headers: { "content-type": "application/json" },
  });
}

describe("send-telegram-notification handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is POST-only, including no browser preflight exception", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const handler = createTelegramRelayHandler(dependencies(fetchMock));

    for (const method of ["GET", "OPTIONS", "PUT", "DELETE"]) {
      const response = await handler(new Request("https://edge.example.test", { method }));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      await expect(response.json()).resolves.toEqual({ success: false, error: "method_not_allowed" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("denies missing, malformed, anon, and authenticated-user bearer tokens before payload processing", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const handler = createTelegramRelayHandler(dependencies(fetchMock));

    for (const authorization of [
      "",
      "Basic abc",
      "Bearer anon-key",
      `Bearer ${AUTHENTICATED_USER_JWT}`,
      `Bearer ${SERVICE_ROLE_KEY} extra`,
    ]) {
      const response = await handler(postRequest("not-json", authorization));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ success: false, error: "unauthorized" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed on missing auth or Telegram configuration without exposing secrets", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const missingAuth = createTelegramRelayHandler(dependencies(fetchMock, {
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    }));
    const authResponse = await missingAuth(postRequest({ message: "secret payload" }));
    expect(authResponse.status).toBe(500);
    const authBody = JSON.stringify(await authResponse.json());
    expect(authBody).toContain("relay_auth_not_configured");
    expect(authBody).not.toContain(SERVICE_ROLE_KEY);
    expect(authBody).not.toContain("secret payload");

    const missingTelegram = createTelegramRelayHandler(dependencies(fetchMock, {
      TELEGRAM_BOT_TOKEN: undefined,
    }));
    const telegramResponseResult = await missingTelegram(postRequest({ message: "secret payload" }));
    expect(telegramResponseResult.status).toBe(500);
    const telegramBody = JSON.stringify(await telegramResponseResult.json());
    expect(telegramBody).toContain("telegram_not_configured");
    expect(telegramBody).not.toContain(SERVICE_ROLE_KEY);
    expect(telegramBody).not.toContain("secret payload");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces JSON media type, byte cap, and strict payload validation before Telegram", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const handler = createTelegramRelayHandler(dependencies(fetchMock));

    const wrongMedia = await handler(postRequest({ message: "ok" }, `Bearer ${SERVICE_ROLE_KEY}`, "text/plain"));
    expect(wrongMedia.status).toBe(415);
    await expect(wrongMedia.json()).resolves.toMatchObject({ error: "unsupported_media_type" });

    const oversized = await handler(postRequest(`{"message":"${"x".repeat(TELEGRAM_REQUEST_BODY_MAX_BYTES)}"}`));
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({ error: "payload_too_large" });

    const unknownField = await handler(postRequest({ message: "ok", organization_id: "org" }));
    expect(unknownField.status).toBe(400);
    await expect(unknownField.json()).resolves.toMatchObject({ error: "invalid_payload" });

    const insecurePhoto = await handler(postRequest({ message: "ok", photo_url: "http://example.test/photo.png" }));
    expect(insecurePhoto.status).toBe(400);
    await expect(insecurePhoto.json()).resolves.toMatchObject({ error: "invalid_photo_url" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves service-role Edge-to-Edge delivery with the configured support chat", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(telegramResponse(true, 456));
    const handler = createTelegramRelayHandler(dependencies(fetchMock));

    const response = await handler(postRequest({ message: "<b>Новая заявка</b>" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, message_id: 456 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
    expect(JSON.parse(String(options?.body))).toEqual({
      chat_id: SUPPORT_CHAT_ID,
      text: "<b>Новая заявка</b>",
      parse_mode: "HTML",
    });
  });

  it("uses HTTPS sendPhoto and falls back to text without returning Telegram error details", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(telegramResponse(false))
      .mockResolvedValueOnce(telegramResponse(true, 789));
    const handler = createTelegramRelayHandler(dependencies(fetchMock));

    const response = await handler(postRequest({
      chat_id: "@valid_chat",
      message: "Скриншот ошибки",
      photo_url: "https://cdn.example.test/photo.png",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, message_id: 789 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/sendPhoto");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/sendMessage");
  });

  it("returns a stable 502 and emits no console payload or secret logs when Telegram fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(telegramResponse(false));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handler = createTelegramRelayHandler(dependencies(fetchMock));

    const response = await handler(postRequest({ message: "private lead payload" }));

    expect(response.status).toBe(502);
    const body = JSON.stringify(await response.json());
    expect(body).toBe(JSON.stringify({ success: false, error: "telegram_delivery_failed" }));
    expect(body).not.toContain("private lead payload");
    expect(body).not.toContain(BOT_TOKEN);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
