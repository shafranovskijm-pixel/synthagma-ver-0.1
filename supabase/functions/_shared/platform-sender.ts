import type { SmtpConfig } from "./smtp-sender.ts";

/** The selected pool id is campaign metadata, never an SMTP address/secret supplied by a caller. */
export function platformSenderId(scope: string, filter: unknown): string | null {
  const id = filter && typeof filter === "object"
    ? (filter as Record<string, unknown>).platform_sender_pool_id : undefined;
  if (id == null || id === "") return null; // Existing campaigns keep their explicit legacy path.
  if (scope !== "platform") throw new Error("Пул отправителей доступен только кампании платформы");
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Некорректный идентификатор отправителя платформы");
  }
  return id;
}

export interface PlatformSenderRow {
  id: string; email: string; app_password: string | null; host: string; port: number;
  encryption: string; from_name: string | null; is_active: boolean;
  daily_limit: number; sends_today: number; sends_reset_at: string; total_sent: number; updated_at: string;
}

export function platformSmtp(row: PlatformSenderRow | null, fromName?: string | null): SmtpConfig {
  if (!row) throw new Error("Выбранный отправитель не найден");
  if (!row.is_active) throw new Error("Выбранный отправитель отключён");
  if (!row.app_password || !row.host || !Number.isInteger(row.port) || row.port < 1 || row.port > 65535) {
    throw new Error("SMTP выбранного отправителя не настроен");
  }
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(row.email) || /[\r\n]/.test(row.host)) {
    throw new Error("Некорректная конфигурация SMTP отправителя");
  }
  if (!["ssl", "tls", "starttls"].includes(row.encryption)) throw new Error("Требуется защищённый SMTP");
  const effectiveName = fromName || row.from_name || "СИНТАГМА";
  // The shared SMTP parser extracts the first <address> from the display header.
  // A display name must never be able to replace the verified envelope sender.
  if (/[<>\x00-\x1f\x7f]/.test(effectiveName)) throw new Error("Недопустимые символы в имени отправителя");
  return {
    host: row.host, port: row.port, username: row.email, password: row.app_password,
    encryption: row.encryption, from_email: row.email,
    from_name: effectiveName,
  };
}

export interface PlatformSenderStore {
  read(id: string): Promise<PlatformSenderRow | null>;
  /** Compare all quota/config versions atomically; false means a concurrent update, not a reservation. */
  reserve(previous: PlatformSenderRow, next: { sends_today: number; sends_reset_at: string; total_sent: number; last_used_at: string }): Promise<boolean>;
}

/** Conservative quota: a reserved/uncertain SMTP attempt is not automatically refunded. */
export async function reservePlatformSender(
  store: PlatformSenderStore, id: string, fromName?: string | null, now = new Date(),
): Promise<SmtpConfig> {
  const today = now.toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await store.read(id);
    const smtp = platformSmtp(row, fromName);
    if (!row) throw new Error("Выбранный отправитель не найден");
    const resetDay = row.sends_reset_at.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resetDay) || resetDay > today) throw new Error("Не удалось проверить дату квоты отправителя");
    const used = resetDay < today ? 0 : row.sends_today;
    if (![used, row.daily_limit, row.total_sent].every(Number.isSafeInteger) || used < 0 || row.total_sent < 0 || used >= row.daily_limit) {
      throw new Error("Исчерпан суточный лимит выбранного отправителя");
    }
    if (await store.reserve(row, {
      sends_today: used + 1, sends_reset_at: today, total_sent: row.total_sent + 1, last_used_at: now.toISOString(),
    })) return smtp;
  }
  throw new Error("Квота отправителя занята; отправка не выполнялась");
}
