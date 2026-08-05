/**
 * Отчёт по тестовым (seed) отправкам.
 *
 * Безопасность: из public.mailing_seed_ledger читаются ТОЛЬКО агрегированные
 * счётчики и время. Seed-адреса, тема/HTML письма, пароли, текст ошибок и любые
 * PII получателей не запрашиваются и не выводятся. Выборка всегда ограничена
 * организацией (плюс tenant RLS на стороне БД).
 */

/** Разрешённые к чтению колонки журнала (allowlist). */
export const SEED_LEDGER_SAFE_COLUMNS = [
  "id",
  "created_at",
  "seed_count",
  "sent_count",
  "failed_count",
] as const;

/** Разрешённые к чтению поля связанных сущностей. */
export const SEED_LEDGER_SAFE_RELATIONS = {
  email_campaigns: ["name"],
  mailing_senders: ["label", "from_email"],
} as const;

/** Колонки, которые запрещено запрашивать и показывать. */
export const SEED_LEDGER_FORBIDDEN = [
  "seed_emails",
  "subject",
  "html",
  "html_body",
  "password",
  "password_encrypted",
  "last_error",
  "error_message",
  "recipient_email",
  "requested_by",
] as const;

export const SEED_REPORT_SELECT =
  "id, created_at, seed_count, sent_count, failed_count, email_campaigns(name), mailing_senders(label, from_email)";

export const SEED_REPORT_LIMIT = 50;

export interface SeedLedgerRawRow {
  id: string;
  created_at: string;
  seed_count: number;
  sent_count: number;
  failed_count: number;
  email_campaigns?: { name: string | null } | null;
  mailing_senders?: { label: string | null; from_email: string | null } | null;
}

export interface SeedReportRow {
  id: string;
  created_at: string;
  campaign: string;
  sender: string;
  requested: number;
  accepted: number;
  failed: number;
  status: "ok" | "partial" | "failed" | "pending";
}

export function seedRowStatus(row: {
  seed_count: number;
  sent_count: number;
  failed_count: number;
}): SeedReportRow["status"] {
  if (row.sent_count === 0 && row.failed_count === 0) return "pending";
  if (row.failed_count === 0 && row.sent_count >= row.seed_count) return "ok";
  if (row.sent_count === 0) return "failed";
  return "partial";
}

export const SEED_STATUS_LABEL: Record<SeedReportRow["status"], string> = {
  ok: "Принято SMTP",
  partial: "Частично",
  failed: "Ошибка",
  pending: "В процессе",
};

export function mapSeedLedgerRow(raw: SeedLedgerRawRow): SeedReportRow {
  return {
    id: raw.id,
    created_at: raw.created_at,
    campaign: (raw.email_campaigns?.name || "").trim() || "Без названия",
    sender:
      (raw.mailing_senders?.label || "").trim() ||
      (raw.mailing_senders?.from_email || "").trim() ||
      "—",
    requested: raw.seed_count ?? 0,
    accepted: raw.sent_count ?? 0,
    failed: raw.failed_count ?? 0,
    status: seedRowStatus({
      seed_count: raw.seed_count ?? 0,
      sent_count: raw.sent_count ?? 0,
      failed_count: raw.failed_count ?? 0,
    }),
  };
}

/** Tenant-scoped запрос последних seed-отправок организации. */
export function buildSeedLedgerQuery(client: any, organizationId: string) {
  return client
    .from("mailing_seed_ledger")
    .select(SEED_REPORT_SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(SEED_REPORT_LIMIT);
}

const csvCell = (v: string | number) => {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV только из безопасных колонок. */
export function seedReportToCsv(rows: SeedReportRow[]): string {
  const header = ["Время", "Кампания", "Отправитель", "Запрошено", "Принято SMTP", "Ошибок", "Статус"];
  const lines = rows.map((r) =>
    [
      new Date(r.created_at).toLocaleString("ru-RU"),
      r.campaign,
      r.sender,
      r.requested,
      r.accepted,
      r.failed,
      SEED_STATUS_LABEL[r.status],
    ]
      .map(csvCell)
      .join(";"),
  );
  return [header.join(";"), ...lines].join("\n");
}
