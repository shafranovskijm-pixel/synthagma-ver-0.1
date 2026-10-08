import { supabase } from "@/integrations/supabase/client";

export type DeletionAction = "delete" | "anonymize" | "retain" | "block";
export const deletionConsentVersion = "full-personal-data-v1" as const;
export interface DeletionPreview {
  revision: "account-deletion-v2";
  consentVersion: typeof deletionConsentVersion;
  warning: string;
  canDelete: boolean;
  planToken: string | null;
  expiresAt: string | null;
  requestId: string | null;
  statusToken: string | null;
  categories: { key: string; label: string; count: number; action: DeletionAction }[];
  blockers: { code: string; message: string; actionHref?: string }[];
}
export interface DeletionReceipt { status: "deleted"; requestId: string; completedAt: string }
export interface DeletionPending { status: "cleanup_pending"; requestId: string; message: string }
export interface DeletionPlanned { status: "planned"; requestId: string; message?: string }
export type DeletionStatus = DeletionReceipt | DeletionPending | DeletionPlanned;
export interface StatusCapability { requestId: string; statusToken: string }

export class AccountDeletionError extends Error {
  constructor(public code: string, message: string, public outcome: "rejected" | "unknown" = "rejected") {
    super(message);
    this.name = "AccountDeletionError";
  }
}

const rejectionCodes = new Set([
  "AUTH_REQUIRED", "REAUTH_FAILED", "MFA_REAUTH_REQUIRED", "PLAN_EXPIRED", "PLAN_CHANGED",
  "OWNERSHIP_TRANSFER_REQUIRED", "RETENTION_POLICY_REQUIRED", "CONSENT_REQUIRED", "DELETION_UNAVAILABLE",
]);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const validDate = (value: unknown): value is string => nonempty(value) && Number.isFinite(Date.parse(value));

export function isDeletionReceipt(value: unknown): value is DeletionReceipt {
  return isObject(value) && value.status === "deleted" && nonempty(value.requestId) && validDate(value.completedAt);
}

async function callDeletion(body: Record<string, unknown>, confirming = false): Promise<unknown> {
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke("account-deletion", { body });
  } catch {
    throw new AccountDeletionError("CONNECTION_ERROR", confirming
      ? "Ответ сервера не получен. Результат удаления пока неизвестен. Не повторяйте операцию до проверки."
      : "Не удалось проверить возможность удаления. Попробуйте ещё раз.", confirming ? "unknown" : "rejected");
  }
  if (!result.error) return result.data;
  const response = result.response ?? (result.error as { context?: Response }).context;
  let details: unknown;
  try { details = await response?.clone().json(); } catch { /* An HTML/network error is not a deletion result. */ }
  if (confirming && isObject(details) && details.status === "cleanup_pending"
    && nonempty(details.requestId) && nonempty(details.message)) return details;
  if (isObject(details) && nonempty(details.code) && rejectionCodes.has(details.code) && nonempty(details.message)) {
    throw new AccountDeletionError(details.code, details.message,
      confirming && details.code === "DELETION_UNAVAILABLE" ? "unknown" : "rejected");
  }
  throw new AccountDeletionError("UNCONFIRMED_RESPONSE", confirming
    ? "Сервер не подтвердил результат удаления. Не повторяйте операцию до проверки."
    : "Не удалось получить условия удаления аккаунта. Попробуйте ещё раз.", confirming ? "unknown" : "rejected");
}

export async function getDeletionPreview(): Promise<DeletionPreview> {
  const data = await callDeletion({ action: "preview" });
  if (!isObject(data) || data.revision !== "account-deletion-v2" || data.consentVersion !== deletionConsentVersion
    || !nonempty(data.warning) || !data.warning.trim() || typeof data.canDelete !== "boolean"
    || !Array.isArray(data.categories) || !Array.isArray(data.blockers)
    || !(data.planToken === null || nonempty(data.planToken))
    || !(data.expiresAt === null || validDate(data.expiresAt))
    || !(data.requestId === null || nonempty(data.requestId))
    || !(data.statusToken === null || nonempty(data.statusToken))
    || !data.categories.every(c => isObject(c) && nonempty(c.key) && nonempty(c.label)
      && typeof c.count === "number" && Number.isInteger(c.count) && c.count >= 0
      && ["delete", "anonymize", "retain", "block"].includes(c.action as string))
    || !data.blockers.every(b => isObject(b) && nonempty(b.code) && nonempty(b.message)
      && (b.actionHref === undefined || typeof b.actionHref === "string"))
    || (data.canDelete && (!data.planToken || !data.expiresAt || !data.requestId || !data.statusToken || data.blockers.length > 0
      || data.categories.length === 0 || data.categories.some(c => c.action === "block")))) {
    throw new AccountDeletionError("INVALID_PREVIEW", "Сервер не подтвердил условия удаления. Обновите проверку или обратитесь в поддержку.");
  }
  return data as unknown as DeletionPreview;
}

export async function getDeletionStatus(capability: StatusCapability): Promise<DeletionStatus> {
  const data = await callDeletion({ action: "status", requestId: capability.requestId, statusToken: capability.statusToken });
  if (isObject(data) && data.requestId === capability.requestId) {
    if (isDeletionReceipt(data)) return data;
    if (data.status === "planned") return { status: "planned", requestId: capability.requestId };
    if (data.status === "cleanup_pending") return { status: "cleanup_pending", requestId: capability.requestId,
      message: nonempty(data.message) ? data.message : "Обработка удаления ещё не завершена." };
  }
  throw new AccountDeletionError("UNCONFIRMED_STATUS", "Не удалось подтвердить текущее состояние операции. Попробуйте проверить статус ещё раз.", "unknown");
}

export async function confirmAccountDeletion(planToken: string, password: string, capability: StatusCapability, consentVersion: typeof deletionConsentVersion): Promise<DeletionStatus> {
  if (consentVersion !== deletionConsentVersion) throw new AccountDeletionError("INVALID_CONSENT", "Условия удаления изменились. Обновите проверку и ознакомьтесь с последствиями заново.");
  try {
    await callDeletion({ action: "confirm", planToken, password, consentVersion, confirmation: "DELETE_MY_ACCOUNT_AND_PERSONAL_DATA" }, true);
  } catch (cause) {
    if (cause instanceof AccountDeletionError && cause.outcome === "rejected") throw cause;
    // A lost confirmation reply may still mean the operation started. Only read its status.
  }
  try { return await getDeletionStatus(capability); }
  catch { throw new AccountDeletionError("UNCONFIRMED_RESPONSE", "Удаление аккаунта пока не подтверждено. Проверьте статус операции; повторное удаление не отправляется.", "unknown"); }
}

export async function resumeAccountDeletion(capability: StatusCapability): Promise<DeletionStatus> {
  try { await callDeletion({ action: "resume", requestId: capability.requestId, statusToken: capability.statusToken }, true); }
  catch { /* The resume reply can also be lost; status is authoritative. */ }
  return getDeletionStatus(capability);
}
