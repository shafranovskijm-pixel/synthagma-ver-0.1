/**
 * Offline sync queue: stores lesson progress and test answers locally
 * when the database is unavailable, then syncs when connection is restored.
 */

import { supabase } from "@/integrations/supabase/client";
import { fetchOwnLearningProgress, isLearningProgressEpoch, isLearningProgressReset, saveOwnLearningProgress, snapshotRun } from '@/lib/learningProgress';
import { getOfflineScope, isOfflineScopeCurrent, type OfflineScope } from './courseCache';

const DB_NAME = 'sigma-offline-sync';
const DB_VERSION = 1;
const QUEUE_STORE = 'sync_queue';

export interface SyncAction {
  id: string;
  type: 'lesson_progress' | 'enrollment_update';
  data: any;
  createdAt: number;
  owner?: Omit<OfflineScope, 'authRevision'>;
  courseId?: string;
  enrollmentId?: string;
  learningProgressEpoch?: string;
  superseded?: boolean;
}

function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addToSyncQueue(action: Omit<SyncAction, 'id' | 'createdAt' | 'owner' | 'courseId'>, scope: OfflineScope, courseId: string): Promise<void> {
  if (!action.enrollmentId || !isLearningProgressEpoch(action.learningProgressEpoch)) return;
  if (!isOfflineScopeCurrent(scope) || scope.resource !== courseId || scope.mode !== 'learner' || scope.actorId !== scope.effectiveUserId || !courseId) return;
  const { authRevision: _revision, ...owner } = scope;
  try {
    const db = await openSyncDB();
    if (!isOfflineScopeCurrent(scope)) { db.close(); return; }
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const entry: SyncAction = {
      ...action,
      owner, courseId,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    tx.objectStore(QUEUE_STORE).put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
  }
}

async function getAllFromQueue(): Promise<SyncAction[]> {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).getAll();
    const result = await new Promise<SyncAction[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch (e) {
    return [];
  }
}

async function removeFromQueue(id: string, current: () => boolean): Promise<boolean> {
  try {
    const db = await openSyncDB();
    if (!current()) { db.close(); return false; }
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Attempt to sync all queued actions to the database.
 * Returns the number of successfully synced items.
 */
async function syncOwnedQueue(expectedScope: OfflineScope, courseId: string, contextCurrent: () => boolean): Promise<number> {
  const batchCurrent = () => contextCurrent() && isOfflineScopeCurrent(expectedScope) && expectedScope.mode === 'learner'
    && expectedScope.actorId === expectedScope.effectiveUserId
    && getOfflineScope(expectedScope.actorId, expectedScope.effectiveUserId, 'learner', courseId) === expectedScope;
  if (!batchCurrent()) return 0;
  const queue = await getAllFromQueue();
  if (!batchCurrent()) return 0;
  if (queue.length === 0) return 0;

  let synced = 0;
  // Sort by creation time
  queue.sort((a, b) => a.createdAt - b.createdAt);

  for (const action of queue) {
    try {
      if (!batchCurrent()) break;
      if (action.superseded) continue;
      const owner = action.owner;
      // Old unowned entries remain pending. Never assign them to whoever logs in next.
      if (!owner || owner.actorId !== expectedScope.actorId || owner.organizationId !== expectedScope.organizationId
        || owner.mode !== 'learner' || owner.actorId !== owner.effectiveUserId || action.courseId !== courseId) continue;
      const scope = getOfflineScope(owner.actorId, owner.effectiveUserId, 'learner', action.courseId);
      if (!scope || scope.organizationId !== owner.organizationId) continue;
      const current = () => batchCurrent() && isOfflineScopeCurrent(scope)
        && getOfflineScope(owner.actorId, owner.effectiveUserId, 'learner', action.courseId!) === scope;
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (!current()) break;
      const token = session.session?.access_token;
      if (sessionError || session.session?.user.id !== owner.actorId || typeof token !== 'string' || !token.trim()) continue;
      // The SDK awaits its token getter at actual dispatch. An explicit original
      // bearer prevents an A request from silently acquiring B's later session.
      // It stays in memory only; never include it in queue rows or logs.
      const authorization = `Bearer ${token}`;
      if (!action.enrollmentId || !isLearningProgressEpoch(action.learningProgressEpoch)) continue;
      const snapshot = await fetchOwnLearningProgress(action.courseId!, owner.effectiveUserId, authorization);
      if (!current()) break;
      // Untagged/mismatched actions are never upgraded to the current server run.
      if (snapshot.enrollment.id !== action.enrollmentId || snapshot.learning_progress_epoch !== action.learningProgressEpoch) {
        await removeFromQueue(action.id, current); continue;
      }
      const course = await supabase.from('courses').select('id,organization_id').eq('id', action.courseId).setHeader('Authorization', authorization).maybeSingle();
      if (!current()) break;
      if (course.error || course.data?.organization_id !== owner.organizationId || !['active','completed'].includes(String(snapshot.enrollment.status))) continue;
      let acknowledged = false;
      // No production enrollment_update enqueuers exist. Its old client percentage
      // must never become authority; only guarded per-lesson facts may be replayed.
      if (action.type !== 'lesson_progress' || !action.data || action.data.user_id !== owner.effectiveUserId
        || typeof action.data.lesson_id !== 'string' || Object.keys(action.data).some(key => !['lesson_id','user_id','completed','time_spent'].includes(key))
        || (action.data.completed !== undefined && typeof action.data.completed !== 'boolean')
        || (action.data.time_spent !== undefined && (typeof action.data.time_spent !== 'number' || !Number.isFinite(action.data.time_spent) || action.data.time_spent < 0))) continue;
      // Legacy time_spent was an accumulated value, not an epoch-bound delta: do not replay it.
      if (action.data.time_spent !== undefined) continue;
      try {
        await saveOwnLearningProgress(snapshotRun(snapshot), action.data.lesson_id, { completed: action.data.completed }, authorization);
        acknowledged = true;
      } catch (error) {
        if (isLearningProgressReset(error) && current()) await removeFromQueue(action.id, current);
      }
      if (!acknowledged || !current()) continue;
      const removed = await removeFromQueue(action.id, current);
      if (!current()) break;
      if (removed) synced++;
    } catch (e) {
      // Keep in queue for next attempt
    }
  }

  if (synced > 0) {
  }
  return synced;
}

const inFlight = new Map<OfflineScope, Promise<number>>();
export function syncOfflineQueue(scope: OfflineScope, courseId: string, current: () => boolean = () => true): Promise<number> {
  const existing = inFlight.get(scope);
  if (existing) return existing;
  const operation = syncOwnedQueue(scope, courseId, current).finally(() => { inFlight.delete(scope); });
  inFlight.set(scope, operation);
  return operation;
}

/**
 * Set up automatic sync when coming back online.
 */
export function setupOfflineSyncListeners(scope: OfflineScope, courseId: string, contextCurrent: () => boolean): () => void {
  let active = true;
  const current = () => active && contextCurrent();
  const handleOnline = async () => {
    const synced = await syncOfflineQueue(scope, courseId, current);
    if (synced > 0) {
    }
  };

  window.addEventListener('online', handleOnline);
  
  // Also try syncing on page load if online
  if (navigator.onLine) {
    syncOfflineQueue(scope, courseId, current).catch(() => {});
  }

  return () => {
    active = false;
    window.removeEventListener('online', handleOnline);
  };
}
