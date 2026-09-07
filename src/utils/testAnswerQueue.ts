/** Durable retries use the original server attempt and authenticated owner. */

import { supabase } from '@/integrations/supabase/client';


const DB_NAME = 'sigma-test-queue';
const STORE = 'pending';
const VERSION = 1;

export interface PendingTestSubmission {
  id: string;
  attemptId?: string;
  userId?: string;
  lessonId: string;
  answers: Record<string, number>;
  shownQuestionIds: string[];
  createdAt: number;
  attempts: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isRetryableTestError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return !code || code.startsWith('08') || code === '57014';
}
export async function enqueueTestSubmission(payload: Omit<PendingTestSubmission, 'id' | 'createdAt' | 'attempts'> & { attemptId: string; userId: string }): Promise<string> {
  const id = payload.userId + ':' + payload.attemptId;
  const item: PendingTestSubmission = { ...payload, id, createdAt: Date.now(), attempts: 0 };
  const db = await openDB();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  } finally { db.close(); }
  return id;
}

export async function listPendingSubmissions(): Promise<PendingTestSubmission[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    const result = await new Promise<PendingTestSubmission[]>((res, rej) => {
      req.onsuccess = () => res((req.result as PendingTestSubmission[]) ?? []);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

export async function removePendingSubmission(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* noop */ }
}

async function bumpAttempts(item: PendingTestSubmission): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...item, attempts: item.attempts + 1 });
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* noop */ }
}

/** Try to flush all pending submissions through normal edge function. */
async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const items = await listPendingSubmissions();
  let sent = 0, failed = 0;
  for (const item of items) {
    // если у нас вообще нет сессии — нет смысла пытаться
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session || !item.attemptId || !item.userId || session.session.user.id !== item.userId) { failed++; continue; }

    const { data, error } = await supabase.rpc('submit_test_attempt' as never, {
      p_attempt_id: item.attemptId, p_answers: item.answers,
    } as never);
    if (!error && data) {
      await removePendingSubmission(item.id);
      sent++;
      window.dispatchEvent(new Event('test-submission-synced'));
    } else {
      await bumpAttempts(item);
      failed++;
    }
  }
  return { sent, failed };
}

let pendingFlush: Promise<{ sent: number; failed: number }> | null = null;
export function flushPendingSubmissions(): Promise<{ sent: number; failed: number }> {
  if (!pendingFlush) pendingFlush = flushQueue().finally(() => { pendingFlush = null; });
  return pendingFlush;
}
let listenersInstalled = false;
export function installTestQueueListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  window.addEventListener('online', () => { void flushPendingSubmissions(); });
  // первая попытка через 5 секунд после загрузки
  setTimeout(() => { void flushPendingSubmissions(); }, 5000);
}
