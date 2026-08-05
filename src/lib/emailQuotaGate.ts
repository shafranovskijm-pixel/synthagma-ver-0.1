import type { WarmupStatus } from "@/hooks/useEmailWarmup";
import type { UserFacingErrorKind } from "@/utils/isTransientNetworkError";

export interface QuotaGateInput {
  scope: "platform" | "org";
  organizationId: string | null;
  status: WarmupStatus | null;
  loading: boolean;
  errorKind: UserFacingErrorKind | null;
  /**
   * Выбран активный отправитель из mailing_senders со smtp_status='ok'.
   * В этом случае квоту проверяет сервер (reserve_mailing_campaign_quota),
   * а legacy organization SMTP не требуется.
   */
  senderVerified?: boolean;
}

export interface QuotaGate {
  blocksLaunch: boolean;
  reason: string | null;
}

/**
 * Phase 5C.1.c.2 — single source of truth for "may we launch this campaign now?".
 *
 * org scope blocks while the quota is unknown: no organizationId, no status yet
 * (initial load or initial error), or SMTP not configured. A background refetch
 * that failed while a status is already known does NOT block.
 * Platform scope keeps the previous behaviour.
 *
 * Новый путь: если выбран проверенный mailing_sender, legacy-квота не
 * блокирует запуск — лимит атомарно резервирует сервер.
 */
export function computeQuotaGate({
  scope,
  organizationId,
  status,
  loading,
  errorKind,
  senderVerified,
}: QuotaGateInput): QuotaGate {
  const orgMissingId = scope === "org" && !organizationId;
  if (scope === "org" && senderVerified && !orgMissingId) {
    return { blocksLaunch: false, reason: null };
  }
  const quotaUnknown =
    scope === "org" ? orgMissingId || !status : !status && (loading || !!errorKind);
  const quotaNotConfigured = scope === "org" && !!status && status.configured === false;

  const reason = orgMissingId
    ? "Организация не выбрана — рассылку запустить нельзя."
    : quotaUnknown
      ? errorKind
        ? "Не удалось получить данные о лимите отправителя. Повторите загрузку."
        : "Проверяем лимит отправителя…"
      : quotaNotConfigured
        ? "SMTP этой организации не настроен — рассылку запустить нельзя."
        : null;

  return { blocksLaunch: quotaUnknown || quotaNotConfigured, reason };
}

