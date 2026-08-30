import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type NotificationDelivery,
  notificationInvokeSucceeded,
} from "./contract.ts";

export const DEMO_NOTIFICATION_TYPE = "demo_request_delivery";
export const DEMO_NOTIFICATION_KIND = "demo_request_telegram";
export const DEMO_FORCE_RETRY_CONFIRMATION = "telegram_delivery_may_duplicate";

export type DemoTelegramStatus = "pending" | "sending" | "sent" | "failed";

export interface DemoTelegramMetadata {
  kind: typeof DEMO_NOTIFICATION_KIND;
  request_id: string;
  telegram_status: DemoTelegramStatus;
  telegram_message: string;
  attempt_count: number;
  last_attempt_at: string | null;
  delivered_at: string | null;
  failure_code: string | null;
}

interface DemoNotificationRecord {
  id: string;
  related_entity_id: string | null;
  type: string;
  metadata: unknown;
}

export type DemoForceReclaimResult =
  | { status: "claimed"; claim_key: string }
  | { status: "busy" }
  | { status: "failed" };

interface DemoTelegramAttemptOptions {
  preclaimedKey?: string;
}

export function createDemoTelegramMetadata(
  requestId: string,
  telegramMessage: string,
): DemoTelegramMetadata {
  return {
    kind: DEMO_NOTIFICATION_KIND,
    request_id: requestId,
    telegram_status: "pending",
    telegram_message: telegramMessage,
    attempt_count: 0,
    last_attempt_at: null,
    delivered_at: null,
    failure_code: null,
  };
}

export function createSentDemoTelegramMetadata(
  metadata: DemoTelegramMetadata,
  deliveredAt = new Date().toISOString(),
): DemoTelegramMetadata {
  return {
    ...metadata,
    telegram_status: "sent",
    telegram_message: "",
    delivered_at: deliveredAt,
    failure_code: null,
  };
}

export function parseDemoTelegramMetadata(
  value: unknown,
): DemoTelegramMetadata | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const status = raw.telegram_status;
  if (
    raw.kind !== DEMO_NOTIFICATION_KIND ||
    typeof raw.request_id !== "string" ||
    typeof raw.telegram_message !== "string" ||
    !["pending", "sending", "sent", "failed"].includes(String(status))
  ) {
    return null;
  }

  return {
    kind: DEMO_NOTIFICATION_KIND,
    request_id: raw.request_id,
    telegram_status: status as DemoTelegramStatus,
    telegram_message: raw.telegram_message,
    attempt_count:
      Number.isInteger(raw.attempt_count) && Number(raw.attempt_count) >= 0
        ? Number(raw.attempt_count)
        : 0,
    last_attempt_at: typeof raw.last_attempt_at === "string"
      ? raw.last_attempt_at
      : null,
    delivered_at: typeof raw.delivered_at === "string"
      ? raw.delivered_at
      : null,
    failure_code: typeof raw.failure_code === "string"
      ? raw.failure_code
      : null,
  };
}

export function isDemoNotificationRecord(
  record: DemoNotificationRecord,
): boolean {
  const metadata = parseDemoTelegramMetadata(record.metadata);
  return Boolean(
    metadata &&
      record.type === DEMO_NOTIFICATION_TYPE &&
      record.related_entity_id === metadata.request_id &&
      record.id === metadata.request_id,
  );
}

export function demoNotificationMessage(status: DemoTelegramStatus): string {
  if (status === "failed") {
    return "Лид сохранён в разделе «Продажи». Telegram не доставил уведомление — нажмите «Повторить Telegram».";
  }
  if (status === "sent") {
    return "Лид сохранён в разделе «Продажи». Telegram-уведомление доставлено.";
  }
  if (status === "sending") {
    return "Лид сохранён в разделе «Продажи». Статус Telegram пока не подтверждён. Перед принудительным повтором проверьте чат: повтор может создать дубль.";
  }
  return "Лид сохранён в разделе «Продажи». Статус Telegram не подтверждён. Перед принудительным повтором проверьте чат: повтор может создать дубль.";
}

export function demoTelegramForceRetryKey(
  metadata: DemoTelegramMetadata,
): string {
  return `demo-telegram:${metadata.request_id}:force-retry:${
    metadata.attempt_count + 1
  }`;
}

function sameDemoTelegramMetadata(
  left: DemoTelegramMetadata,
  right: DemoTelegramMetadata,
): boolean {
  return left.kind === right.kind &&
    left.request_id === right.request_id &&
    left.telegram_status === right.telegram_status &&
    left.telegram_message === right.telegram_message &&
    left.attempt_count === right.attempt_count &&
    left.last_attempt_at === right.last_attempt_at &&
    left.delivered_at === right.delivered_at &&
    left.failure_code === right.failure_code;
}

async function updateNotification(
  supabase: SupabaseClient,
  notificationId: string,
  metadata: DemoTelegramMetadata,
  title: string,
  isRead = false,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("admin_notifications")
    .update({
      type: DEMO_NOTIFICATION_TYPE,
      title,
      message: demoNotificationMessage(metadata.telegram_status),
      metadata,
      is_read: isRead,
    })
    .eq("id", notificationId)
    .eq("related_entity_id", metadata.request_id)
    .select("id, related_entity_id, type, metadata")
    .maybeSingle();

  const storedMetadata = data ? parseDemoTelegramMetadata(data.metadata) : null;
  if (
    error ||
    !data ||
    !isDemoNotificationRecord(data) ||
    !storedMetadata ||
    !sameDemoTelegramMetadata(storedMetadata, metadata)
  ) {
    console.error("demo Telegram: notification state update failed", {
      code: error?.code || "row_not_confirmed",
    });
    return false;
  }
  return true;
}

export async function confirmDemoTelegramDelivery(
  supabase: SupabaseClient,
  record: DemoNotificationRecord,
): Promise<boolean> {
  const metadata = parseDemoTelegramMetadata(record.metadata);
  if (!metadata || !isDemoNotificationRecord(record)) return false;
  if (metadata.telegram_status === "sent") return true;
  return updateNotification(
    supabase,
    record.id,
    createSentDemoTelegramMetadata(metadata),
    "Новая заявка на демо",
  );
}

export async function forceReclaimDemoTelegramClaim(
  supabase: SupabaseClient,
  metadata: DemoTelegramMetadata,
): Promise<DemoForceReclaimResult> {
  const claimKey = demoTelegramForceRetryKey(metadata);
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_notification_dedup",
    { _key: claimKey },
  );
  if (claimError) {
    console.error("demo Telegram: force claim failed", {
      code: claimError.code || "unknown",
    });
    return { status: "failed" };
  }
  return claimed === true
    ? { status: "claimed", claim_key: claimKey }
    : { status: "busy" };
}

export async function attemptDemoTelegramDelivery(
  supabase: SupabaseClient,
  record: DemoNotificationRecord,
  options: DemoTelegramAttemptOptions = {},
): Promise<NotificationDelivery> {
  const metadata = parseDemoTelegramMetadata(record.metadata);
  if (!metadata || !isDemoNotificationRecord(record)) return "failed";
  if (metadata.telegram_status === "sent") return "sent";

  const forceRetryKey = demoTelegramForceRetryKey(metadata);
  if (options.preclaimedKey && options.preclaimedKey !== forceRetryKey) {
    return "failed";
  }
  // Начальная отправка и ручной повтор одного и того же номера попытки
  // используют один key: параллельный клик администратора не создаст дубль.
  const activeClaimKey = forceRetryKey;

  if (!options.preclaimedKey) {
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_notification_dedup",
      { _key: activeClaimKey },
    );

    if (claimError) {
      const failedMetadata: DemoTelegramMetadata = {
        ...metadata,
        telegram_status: "failed",
        failure_code: "delivery_claim_failed",
      };
      await updateNotification(
        supabase,
        record.id,
        failedMetadata,
        "Telegram не доставил заявку на демо",
      );
      return "failed";
    }

    if (claimed !== true) {
      return "pending";
    }
  }

  const attemptStartedAt = new Date().toISOString();
  const sendingMetadata: DemoTelegramMetadata = {
    ...metadata,
    telegram_status: "sending",
    attempt_count: metadata.attempt_count + 1,
    last_attempt_at: attemptStartedAt,
    failure_code: null,
  };

  const sendingStateStored = await updateNotification(
    supabase,
    record.id,
    sendingMetadata,
    "Доставляем заявку на демо в Telegram",
  );
  if (!sendingStateStored) {
    // Внешний вызов ещё не начался, поэтому этот claim можно безопасно снять.
    // После начала invoke claim никогда не освобождается: результат может быть неизвестен.
    const { error: releaseError } = await supabase
      .from("notification_dedup_log")
      .delete()
      .eq("key", activeClaimKey);
    if (releaseError) {
      console.error("demo Telegram: pre-invoke claim release failed", {
        code: releaseError.code || "unknown",
      });
    }
    return "pending";
  }

  let invokeSucceeded = false;
  try {
    const supportChatId = Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID")?.trim();
    const telegramBody: Record<string, string> = {
      message: metadata.telegram_message,
    };
    if (supportChatId) telegramBody.chat_id = supportChatId;

    const { data, error } = await supabase.functions.invoke(
      "send-telegram-notification",
      { body: telegramBody },
    );
    invokeSucceeded = !error && notificationInvokeSucceeded(data);
  } catch {
    invokeSucceeded = false;
  }

  if (invokeSucceeded) {
    const sentMetadata = createSentDemoTelegramMetadata(sendingMetadata);
    const sentStateStored = await updateNotification(
      supabase,
      record.id,
      sentMetadata,
      "Новая заявка на демо",
    );
    // Claim остаётся навсегда и блокирует повторную доставку по тому же request_id.
    return sentStateStored ? "sent" : "pending";
  }

  const unknownMetadata: DemoTelegramMetadata = {
    ...sendingMetadata,
    telegram_status: "pending",
    failure_code: "telegram_delivery_outcome_unknown",
  };
  await updateNotification(
    supabase,
    record.id,
    unknownMetadata,
    "Проверьте доставку заявки в Telegram",
  );
  // Любой неуспех nested invoke имеет неоднозначный результат: Telegram мог
  // принять сообщение, а ответ мог потеряться. Claim сохраняется; повтор
  // возможен только администратором после явного подтверждения риска дубля.
  return "pending";
}
