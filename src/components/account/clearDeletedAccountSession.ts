import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearPendingDeletion } from "./pendingDeletion";

function removeIndexedRows(database: string, store: string, belongsToAccount: (row: Record<string, unknown>) => boolean): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database);
    let missing = false;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; reject(new Error("Local cache is busy")); }, 5000);
    const done = () => { clearTimeout(timeout); resolve(); };
    const failed = (error: unknown) => { clearTimeout(timeout); reject(error); };
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort(); };
    request.onerror = () => missing ? done() : failed(request.error);
    request.onblocked = () => failed(new Error("Local cache is busy"));
    request.onsuccess = () => {
      const db = request.result;
      if (timedOut) { db.close(); return; }
      if (!db.objectStoreNames.contains(store)) { db.close(); done(); return; }
      const transaction = db.transaction(store, "readwrite");
      const cursor = transaction.objectStore(store).openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        if (belongsToAccount(row.value as Record<string, unknown>)) row.delete();
        row.continue();
      };
      transaction.oncomplete = () => { db.close(); done(); };
      transaction.onerror = transaction.onabort = () => { db.close(); failed(transaction.error); };
    };
  });
}

const inFlight = new Map<string, Promise<boolean>>();
const outcomes = new Map<string, boolean>();
export const deletionCleanupEvent = "sintagma-account-deletion-local-cleanup";
export const getDeletionCleanupOutcome = (requestId: string) => outcomes.get(requestId);
/** Runs independently of a mounted page after a verified terminal server status. */
export function clearDeletedAccountSession(accountId: string, requestId: string, queryClient: QueryClient): Promise<boolean> {
  const existing = inFlight.get(requestId);
  if (existing) return existing;
  const clearing = (async () => {
    let complete = true;
    try { await queryClient.cancelQueries(); queryClient.clear(); } catch { complete = false; }
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) complete = false;
      // Deletion of a previous account must not sign out a newly authenticated user.
      if (!data.session || data.session.user.id === accountId) {
        const { error: logoutError } = await supabase.auth.signOut({ scope: "local" });
        if (logoutError) complete = false;
        for (const key of ["adminViewAsStudent", "adminViewAsSalesManager", "adminViewAsOrg", "orgViewAsCompany", "user_role", "sintagma_support_guest_token", "sintagma_support_conv_id"]) localStorage.removeItem(key);
      }
    } catch { complete = false; }
    const cacheResults = await Promise.allSettled([
      removeIndexedRows("sigma-course-cache", "dashboard", row => row.key === accountId),
      // Course entries have no owner key and may contain a learner's progress. This is a recoverable cache.
      removeIndexedRows("sigma-course-cache", "courses", () => true),
      removeIndexedRows("sigma-test-queue", "pending", row => row.userId === accountId),
      removeIndexedRows("sigma-offline-sync", "sync_queue", row => !!row.data && typeof row.data === "object" && (row.data as Record<string, unknown>).user_id === accountId),
    ]);
    if (cacheResults.some(result => result.status === "rejected")) complete = false;
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(`test-draft:${accountId}:`) || key.startsWith(`test-start-request:${accountId}:`)) sessionStorage.removeItem(key);
      }
      if (typeof caches !== "undefined") {
        for (const name of await caches.keys()) if (name.endsWith("-api-cache") || name.endsWith("-images-cache")) await caches.delete(name);
      }
    } catch { complete = false; }
    if (complete) { try { clearPendingDeletion(requestId); } catch { complete = false; } }
    return complete;
  })().then(complete => {
    outcomes.set(requestId, complete);
    window.dispatchEvent(new Event(deletionCleanupEvent));
    return complete;
  }).finally(() => inFlight.delete(requestId));
  inFlight.set(requestId, clearing);
  return clearing;
}
