/**
 * IndexedDB-backed queue for test answer submissions that failed
 * to reach the server (e.g. corporate firewall blocked the edge function).
 *
 * On enqueue we attempt sendBeacon as a last-ditch immediate delivery,
 * because Beacon API uses a separate browser network stack that often
 * succeeds where fetch() is blocked. The queue is then flushed on:
 *   - browser online event
 *   - app boot
 *   - explicit retry button
 */

import { supabase } from '@/integrations/supabase/client';
import { safeInvoke } from '@/utils/safeInvoke';

const DB_NAME = 'sigma-test-queue';
const STORE = 'pending';
const VERSION = 1;

export interface PendingTestSubmission {
  id: string;
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

export async function enqueueTestSubmission(payload: Omit<PendingTestSubmission, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
  const id = `${payload.lessonId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: PendingTestSubmission = { ...payload, id, createdAt: Date.now(), attempts: 0 };
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.warn('[testAnswerQueue] Failed to persist', e);
  }
  // Fire-and-forget Beacon — может пройти через антивирус, который режет fetch
  trySendBeacon(item);
  return id;
}

function trySendBeacon(item: PendingTestSubmission): boolean {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grade-test`;
    const sessionStr = localStorage.getItem(`sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`);
    let token: string | null = null;
    try {
      const parsed = sessionStr ? JSON.parse(sessionStr) : null;
      token = parsed?.access_token ?? null;
    } catch { /* noop */ }
    if (!token) return false;

    const blob = new Blob(
      [JSON.stringify({
        lesson_id: item.lessonId,
        answers: item.answers,
        shown_question_ids: item.shownQuestionIds,
        // sendBeacon не позволяет ставить custom headers — токен передаём как поле
        _auth: token,
        _queued_id: item.id,
      })],
      { type: 'application/json' },
    );
    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
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
export async function flushPendingSubmissions(): Promise<{ sent: number; failed: number }> {
  const items = await listPendingSubmissions();
  let sent = 0, failed = 0;
  for (const item of items) {
    // если у нас вообще нет сессии — нет смысла пытаться
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session) { failed++; continue; }

    const { data, error } = await safeInvoke('grade-test', {
      body: { lesson_id: item.lessonId, answers: item.answers, shown_question_ids: item.shownQuestionIds },
    });
    if (!error && data) {
      await removePendingSubmission(item.id);
      sent++;
    } else {
      await bumpAttempts(item);
      failed++;
    }
  }
  return { sent, failed };
}

let listenersInstalled = false;
export function installTestQueueListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  window.addEventListener('online', () => { void flushPendingSubmissions(); });
  // первая попытка через 5 секунд после загрузки
  setTimeout(() => { void flushPendingSubmissions(); }, 5000);
}
