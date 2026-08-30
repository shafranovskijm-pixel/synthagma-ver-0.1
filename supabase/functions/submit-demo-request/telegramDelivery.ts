import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { notificationInvokeSucceeded, type NotificationDelivery } from "./contract.ts";

export const DEMO_NOTIFICATION_TYPE = "demo_request_delivery";
export const DEMO_NOTIFICATION_KIND = "demo_request_telegram";

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

export function parseDemoTelegramMetadata(value: unknown): DemoTelegramMetadata | null {
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
    attempt_count: Number.isInteger(raw.attempt_count) && Number(raw.attempt_count) >= 0
      ? Number(raw.attempt_count)
      : 0,
    last_attempt_at: typeof raw.last_attempt_at === "string" ? raw.last_attempt_at : null,
    delivered_at: typeof raw.delivered_at === "string" ? raw.delivered_at : null,
    failure_code: typeof raw.failure_code === "string" ? raw.failure_code : null,
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
    return "Лид сохранён в разделе «Продажи». Доставка в Telegram выполняется.";
  }
  return "Лид сохранён в разделе «Продажи». Доставка в Telegram ожидает повторной попытки.";
}

async function updateNotification(
  supabase: SupabaseClient,
  notificationId: string,
  metadata: DemoTelegramMetadata,
  title: string,
  isRead = false,
): Promise<boolean> {
  const { error } = await supabase
    .from("admin_notifications")
    .update({
      type: DEMO_NOTIFICATION_TYPE,
      title,
      message: demoNotificationMessage(metadata.telegram_status),
      metadata,
      is_read: isRead,
    })
    .eq("id", notificationId)
    .eq("related_entity_id", metadata.request_id);

  if (error) {
    console.error("demo Telegram: notification state update failed", {
      code: error.code || "unknown",
    });
    return false;
  }
  return true;
}

export async function attemptDemoTelegramDelivery(
  supabase: SupabaseClient,
  record: DemoNotificationRecord,
): Promise<NotificationDelivery> {
  const metadata = parseDemoTelegramMetadata(record.metadata);
  if (!metadata || !isDemoNotificationRecord(record)) return "failed";
  if (metadata.telegram_status === "sent") return "sent";

  const dedupKey = `demo-telegram:${metadata.request_id}`;
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_notification_dedup",
    { _key: dedupKey },
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
    // Не освобождаем claim: состояние отправки неизвестно, повтор может дать дубль.
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
    const sentMetadata: DemoTelegramMetadata = {
      ...sendingMetadata,
      telegram_status: "sent",
      delivered_at: new Date().toISOString(),
      failure_code: null,
    };
    const sentStateStored = await updateNotification(
      supabase,
      record.id,
      sentMetadata,
      "Новая заявка на демо",
    );
    // Claim остаётся навсегда и блокирует повторную доставку по тому же request_id.
    return sentStateStored ? "sent" : "pending";
  }

  const failedMetadata: DemoTelegramMetadata = {
    ...sendingMetadata,
    telegram_status: "failed",
    failure_code: "telegram_invoke_failed",
  };
  const failureStored = await updateNotification(
    supabase,
    record.id,
    failedMetadata,
    "Telegram не доставил заявку на демо",
  );

  if (failureStored) {
    // Освобождаем claim только после durable-записи явного отказа.
    const { error: releaseError } = await supabase
      .from("notification_dedup_log")
      .delete()
      .eq("key", dedupKey);
    if (releaseError) {
      console.error("demo Telegram: delivery claim release failed", {
        code: releaseError.code || "unknown",
      });
    }
  }

  return "failed";
}
