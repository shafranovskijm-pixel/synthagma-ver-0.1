import {
  isServiceRoleBearer,
  readJsonBodyWithLimit,
  readTelegramRelayAuthConfig,
  readTelegramRelayDeliveryConfig,
  resolveTelegramChatId,
  TelegramRelayContractError,
  truncateTelegramCaption,
  validateTelegramRelayPayload,
  type EnvReader,
  type TelegramRelayDeliveryConfig,
  type TelegramRelayPayload,
} from "./contract.ts";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

interface TelegramApiResult {
  ok?: unknown;
  result?: {
    message_id?: unknown;
  };
}

interface TelegramDeliveryResult {
  delivered: boolean;
  messageId?: number;
}

export interface TelegramRelayDependencies {
  env: EnvReader;
  fetch: typeof fetch;
  subtle?: SubtleCrypto;
}

function jsonResponse(body: Record<string, unknown>, status: number, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function validMessageId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

async function callTelegramApi(
  dependencies: TelegramRelayDependencies,
  config: TelegramRelayDeliveryConfig,
  method: "sendMessage" | "sendPhoto",
  body: Record<string, unknown>,
): Promise<TelegramDeliveryResult> {
  let response: Response;
  try {
    response = await dependencies.fetch(
      `https://api.telegram.org/bot${config.botToken}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch {
    return { delivered: false };
  }

  let result: TelegramApiResult;
  try {
    result = await response.json() as TelegramApiResult;
  } catch {
    return { delivered: false };
  }

  const messageId = result.result?.message_id;
  if (!response.ok || result.ok !== true || !validMessageId(messageId)) {
    return { delivered: false };
  }

  return { delivered: true, messageId };
}

async function deliverTelegramNotification(
  dependencies: TelegramRelayDependencies,
  config: TelegramRelayDeliveryConfig,
  payload: TelegramRelayPayload,
  chatId: string,
): Promise<TelegramDeliveryResult> {
  if (payload.photoUrl) {
    const photoDelivery = await callTelegramApi(dependencies, config, "sendPhoto", {
      chat_id: chatId,
      photo: payload.photoUrl,
      caption: truncateTelegramCaption(payload.message),
      parse_mode: "HTML",
    });
    if (photoDelivery.delivered) return photoDelivery;
  }

  return callTelegramApi(dependencies, config, "sendMessage", {
    chat_id: chatId,
    text: payload.message,
    parse_mode: "HTML",
  });
}

export function createTelegramRelayHandler(
  dependencies: TelegramRelayDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "method_not_allowed" }, 405, { Allow: "POST" });
    }

    let serviceRoleKey: string;
    try {
      serviceRoleKey = readTelegramRelayAuthConfig(dependencies.env).serviceRoleKey;
    } catch (error) {
      if (error instanceof TelegramRelayContractError) {
        return jsonResponse({ success: false, error: error.code }, error.status);
      }
      return jsonResponse({ success: false, error: "relay_configuration_error" }, 500);
    }

    let authorized = false;
    try {
      authorized = await isServiceRoleBearer(
        request.headers.get("authorization"),
        serviceRoleKey,
        dependencies.subtle,
      );
    } catch {
      return jsonResponse({ success: false, error: "relay_authentication_error" }, 500);
    }
    if (!authorized) {
      return jsonResponse({ success: false, error: "unauthorized" }, 401);
    }

    try {
      const config = readTelegramRelayDeliveryConfig(dependencies.env);
      const requestBody = await readJsonBodyWithLimit(request);
      const payload = validateTelegramRelayPayload(requestBody);
      const chatId = resolveTelegramChatId(payload, config);
      const delivery = await deliverTelegramNotification(dependencies, config, payload, chatId);

      if (!delivery.delivered) {
        return jsonResponse({ success: false, error: "telegram_delivery_failed" }, 502);
      }

      return jsonResponse({ success: true, message_id: delivery.messageId }, 200);
    } catch (error) {
      if (error instanceof TelegramRelayContractError) {
        return jsonResponse({ success: false, error: error.code }, error.status);
      }
      return jsonResponse({ success: false, error: "internal_error" }, 500);
    }
  };
}
