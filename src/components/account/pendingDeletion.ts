export interface PendingDeletion { accountId: string; requestId: string; statusToken: string }
const key = "sintagma-account-deletion-pending-v1";
export const pendingDeletionEvent = "sintagma-account-deletion-pending";

export function loadPendingDeletion(): PendingDeletion | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    return ["accountId", "requestId", "statusToken"].every(field => typeof record[field] === "string" && record[field])
      ? record as unknown as PendingDeletion : null;
  } catch { return null; }
}

export function savePendingDeletion(value: PendingDeletion): void {
  // The opaque capability stays on this device; never put it in a URL or analytics event.
  const existing = loadPendingDeletion();
  if (existing && existing.requestId !== value.requestId) throw new Error("Сначала проверьте результат предыдущего удаления.");
  localStorage.setItem(key, JSON.stringify(value));
  if (loadPendingDeletion()?.statusToken !== value.statusToken) throw new Error("Не удалось сохранить данные для проверки результата. Удаление не отправлено.");
  window.dispatchEvent(new Event(pendingDeletionEvent));
}

export function clearPendingDeletion(requestId: string): void {
  if (loadPendingDeletion()?.requestId !== requestId) return;
  localStorage.removeItem(key);
  window.dispatchEvent(new Event(pendingDeletionEvent));
}
