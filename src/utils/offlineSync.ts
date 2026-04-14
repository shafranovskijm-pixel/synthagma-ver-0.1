/**
 * Offline sync queue: stores lesson progress and test answers locally
 * when the database is unavailable, then syncs when connection is restored.
 */

import { supabase } from "@/integrations/supabase/client";

const DB_NAME = 'sigma-offline-sync';
const DB_VERSION = 1;
const QUEUE_STORE = 'sync_queue';

export interface SyncAction {
  id: string;
  type: 'lesson_progress' | 'enrollment_update';
  data: any;
  createdAt: number;
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

export async function addToSyncQueue(action: Omit<SyncAction, 'id' | 'createdAt'>): Promise<void> {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const entry: SyncAction = {
      ...action,
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

async function removeFromQueue(id: string): Promise<void> {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
  }
}

/**
 * Attempt to sync all queued actions to the database.
 * Returns the number of successfully synced items.
 */
export async function syncOfflineQueue(): Promise<number> {
  const queue = await getAllFromQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  // Sort by creation time
  queue.sort((a, b) => a.createdAt - b.createdAt);

  for (const action of queue) {
    try {
      if (action.type === 'lesson_progress') {
        const { error } = await supabase
          .from('lesson_progress')
          .upsert(action.data, { onConflict: 'lesson_id,user_id' });
        if (error) {
          continue; // keep in queue
        }
      } else if (action.type === 'enrollment_update') {
        const { id: enrollmentId, ...updateData } = action.data;
        const { error } = await supabase
          .from('enrollments')
          .update(updateData)
          .eq('id', enrollmentId);
        if (error) {
          continue;
        }
      }
      
      await removeFromQueue(action.id);
      synced++;
    } catch (e) {
      // Keep in queue for next attempt
    }
  }

  if (synced > 0) {
  }
  return synced;
}

/**
 * Set up automatic sync when coming back online.
 */
export function setupOfflineSyncListeners(): () => void {
  const handleOnline = async () => {
    const synced = await syncOfflineQueue();
    if (synced > 0) {
    }
  };

  window.addEventListener('online', handleOnline);
  
  // Also try syncing on page load if online
  if (navigator.onLine) {
    syncOfflineQueue().catch(() => {});
  }

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
