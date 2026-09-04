import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  clearAcknowledgedPackageOperation, isStoredPackageOperationAcknowledged, packageOperationStorageKey, persistPackageOperation, readStoredPackageOperation,
  type PackageOperationScope,
} from "@/lib/group-docs/packageOperationStorage";

export interface GroupDocumentPackageGate {
  busy: boolean;
  requiresReload: boolean;
  revision: number;
  operationId: string | null;
  storageError: string | null;
}
interface Entry extends GroupDocumentPackageGate {
  snapshot: number;
  listeners: Set<() => void>;
}

// Memory retains only operation flags. localStorage retains UUIDs: a scope index
// plus immutable exact-ID ACK markers; no documents or personal data.
const entries = new Map<string, Entry>();
function entryFor(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { busy: false, requiresReload: false, revision: 0, operationId: null, storageError: null, snapshot: 0, listeners: new Set() };
    entries.set(key, entry);
  }
  return entry;
}
function pruneWhenUnused(key: string, entry: Entry) {
  // Keep the same entry through React StrictMode's immediate resubscription.
  queueMicrotask(() => {
    if (!entry.listeners.size && !entry.busy && !entry.requiresReload && entries.get(key) === entry) entries.delete(key);
  });
}

function syncStoredOperation(entry: Entry, scope: PackageOperationScope) {
  try {
    const stored = readStoredPackageOperation(scope);
    // Removing the index alone is not proof. Only its exact UUID-scoped ACK
    // (written after a server receipt) may settle an in-memory unknown operation.
    if (stored) entry.operationId = stored;
    else if (entry.operationId && isStoredPackageOperationAcknowledged(scope, entry.operationId)) entry.operationId = null;
    entry.storageError = null;
    entry.requiresReload = Boolean(entry.operationId);
  } catch (error) {
    entry.storageError = error instanceof Error ? error.message : "Хранилище операции недоступно.";
    entry.requiresReload = true;
  }
}

export function useGroupDocumentPackageGate(organizationId: string, groupId: string, enabled = true) {
  const scope = useMemo(() => ({ organizationId, groupId }), [organizationId, groupId]);
  const key = JSON.stringify([organizationId, groupId]);
  const entry = useMemo(() => {
    const current = entryFor(key);
    if (enabled) syncStoredOperation(current, scope);
    return current;
  }, [key, scope, enabled]);
  const subscribe = useCallback((listener: () => void) => {
    // A remount before the cleanup microtask reuses the same scoped entry.
    if (!entries.has(key)) entries.set(key, entry);
    entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); pruneWhenUnused(key, entry); };
  }, [entry, key]);
  const getSnapshot = useCallback(() => entry.snapshot, [entry]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const notify = useCallback(() => {
    entry.snapshot += 1;
    for (const listener of entry.listeners) listener();
    pruneWhenUnused(key, entry);
  }, [entry, key]);
  useEffect(() => {
    if (!enabled) return;
    const changed = (event: StorageEvent) => {
      const baseKey = packageOperationStorageKey(scope);
      if (event.key !== null && event.key !== baseKey && !event.key.startsWith(`${baseKey}:ack:`)) return;
      syncStoredOperation(entry, scope);
      notify();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [enabled, entry, scope, notify]);
  const beginOperation = useCallback((retry: boolean): string => {
    if (!enabled) throw new Error("Этот путь сохранения доступен только для клиентского пакета.");
    syncStoredOperation(entry, scope);
    if (entry.storageError) { notify(); throw new Error(entry.storageError); }
    if (entry.operationId && !retry) { notify(); throw new Error("Сначала проверьте незавершённую операцию сохранения."); }
    if (!entry.operationId && retry) throw new Error("Идентификатор повторяемой операции не найден. Новая запись не отправлена.");
    try {
      const operationId = entry.operationId ?? crypto.randomUUID();
      entry.operationId = operationId;
      entry.requiresReload = true;
      persistPackageOperation(scope, operationId);
      entry.storageError = null;
      notify();
      return operationId;
    } catch (error) {
      entry.storageError = error instanceof Error ? error.message : "Не удалось сохранить идентификатор операции.";
      entry.requiresReload = true;
      notify();
      throw error;
    }
  }, [enabled, entry, scope, notify]);
  const acknowledgeOperation = useCallback((operationId: string): boolean => {
    if (entry.operationId !== operationId) return false;
    try {
      if (!clearAcknowledgedPackageOperation(scope, operationId)) {
        syncStoredOperation(entry, scope); notify(); return false;
      }
      entry.operationId = null;
      entry.storageError = null;
      entry.requiresReload = false;
      notify();
      return true;
    } catch (error) {
      entry.storageError = error instanceof Error ? error.message : "Подтверждение операции не сохранено.";
      entry.requiresReload = true;
      notify();
      return false;
    }
  }, [entry, scope, notify]);
  return { gate: entry as GroupDocumentPackageGate, notify, beginOperation, acknowledgeOperation };
}
