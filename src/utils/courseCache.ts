/**
 * IndexedDB-based course caching for offline resilience.
 * Caches course data, lessons, test questions, and attachments metadata.
 * TTL: 7 days.
 */

const DB_NAME = 'sigma-course-cache';
const DB_VERSION = 2;
// Leave legacy unowned stores intact, but never guess their owner or read them.
const COURSE_STORE = 'courses_scoped_v2';
const DASHBOARD_STORE = 'dashboard_scoped_v2';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface OfflineScope {
  actorId: string;
  organizationId: string;
  effectiveUserId: string;
  mode: 'learner' | 'preview';
  authRevision: number;
  resource: string;
}

let activeActor: string | null = null;
let authRevision = 0;
let observedAccess: string | null = null;
const validatedScopes = new Map<string, OfflineScope>();
const erasedAccounts = new Set<string>();

/** Only AuthProvider sets actor; no stored role/profile is treated as current auth. */
export function setOfflineAuthActor(actorId: string | null): void {
  if (actorId && erasedAccounts.has(actorId)) actorId = null;
  if (activeActor === actorId) return;
  activeActor = actorId;
  observedAccess = null;
  authRevision += 1;
  validatedScopes.clear();
}

/** Publish an observed role/access change synchronously before React state publication. */
export function observeOfflineAccess(actorId: string, fingerprint: string): void {
  if (actorId !== activeActor || observedAccess === fingerprint) return;
  observedAccess = fingerprint;
  authRevision += 1;
  validatedScopes.clear();
}

/** Monotonic auth/access epoch, including anonymous transitions. */
export function captureOfflineAuthRevision(): number { return authRevision; }

export function captureOfflineContext(): { actorId: string; revision: number } | null {
  return activeActor ? { actorId: activeActor, revision: authRevision } : null;
}

export function markOfflineAccountDeleted(accountId: string): void {
  erasedAccounts.add(accountId);
  for (const [key, scope] of validatedScopes) {
    if (scope.actorId === accountId || scope.effectiveUserId === accountId) validatedScopes.delete(key);
  }
  if (activeActor === accountId) setOfflineAuthActor(null);
}

export function captureOfflineActor(actorId: string | null | undefined): number | null {
  return actorId && actorId === activeActor ? authRevision : null;
}

export function isOfflineActorCurrent(actorId: string, revision: number | null): boolean {
  return revision !== null && actorId === activeActor && revision === authRevision;
}

function scopeLookup(actorId: string, effectiveUserId: string, mode: OfflineScope['mode'], resource: string): string {
  return JSON.stringify([actorId, effectiveUserId, mode, resource]);
}

/** Call only after the original caller successfully read the exact online association. */
export function rememberOfflineScope(
  values: Omit<OfflineScope, 'authRevision' | 'resource'>, resource: string, revision: number | null,
): OfflineScope | null {
  if (!values.organizationId || !values.effectiveUserId || erasedAccounts.has(values.effectiveUserId) || !isOfflineActorCurrent(values.actorId, revision)) return null;
  const scope = { ...values, authRevision: revision!, resource };
  validatedScopes.set(scopeLookup(values.actorId, values.effectiveUserId, values.mode, resource), scope);
  return scope;
}

/** Cold offline without a current validated tenant needs a reconnect, even if old bytes exist. */
export function getOfflineScope(actorId: string, effectiveUserId: string, mode: OfflineScope['mode'], resource: string): OfflineScope | null {
  const scope = validatedScopes.get(scopeLookup(actorId, effectiveUserId, mode, resource));
  return scope && isOfflineScopeCurrent(scope) ? scope : null;
}

export function forgetOfflineScope(actorId: string, effectiveUserId: string, mode: OfflineScope['mode'], resource: string): void {
  validatedScopes.delete(scopeLookup(actorId, effectiveUserId, mode, resource));
}

/** A known server denial must never become an offline authorization fallback. */
export function isOfflineAccessDenied(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string } | null;
  return [401, 403].includes(e?.status || 0) || (e?.status === 404 && e.code !== 'PGRST202')
    || ['42501', 'PGRST301', 'PGRST302', 'PGRST116'].includes(e?.code || '')
    || /(?:access denied|permission denied|not authenticated|not authori[sz]ed|forbidden)/i.test(e?.message || '');
}

export function mayUseOfflineFallback(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string } | null;
  if (isOfflineAccessDenied(error)) return false;
  return (typeof navigator !== 'undefined' && navigator.onLine === false)
    || /(?:network|failed to fetch|load failed|connection|timeout)/i.test(e?.message || '');
}

export function isOfflineScopeCurrent(scope: OfflineScope | null | undefined): scope is OfflineScope {
  return !!scope && !!scope.organizationId && !!scope.effectiveUserId && !erasedAccounts.has(scope.effectiveUserId)
    && isOfflineActorCurrent(scope.actorId, scope.authRevision)
    && validatedScopes.get(scopeLookup(scope.actorId, scope.effectiveUserId, scope.mode, scope.resource)) === scope;
}

function scopedKey(scope: OfflineScope, resource: string): string {
  return JSON.stringify([2, scope.actorId, scope.organizationId, scope.effectiveUserId, scope.mode, resource]);
}

interface CachedCourseData {
  key: string;
  owner: Omit<OfflineScope, 'authRevision'>;
  courseId: string;
  course: any;
  lessons: any[];
  lessonProgress: any[];
  lessonAttachments: Record<string, any[]>;
  cachedAt: number;
}

interface CachedDashboardData {
  key: string;
  owner: Omit<OfflineScope, 'authRevision'>;
  courses: any[];
  profile: any;
  branding: any;
  dashboardSettings: any;
  totalTimeSpent: number;
  totalCompletedLessons: number;
  documentsProgress: { completed: number; total: number };
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(COURSE_STORE)) {
        db.createObjectStore(COURSE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(DASHBOARD_STORE)) {
        db.createObjectStore(DASHBOARD_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putItem(storeName: string, data: any, current: () => boolean): Promise<void> {
  try {
    const db = await openDB();
    if (!current()) { db.close(); return; }
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(data);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
  }
}

async function getItem<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    const result = await new Promise<T | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch (e) {
    return null;
  }
}

// ---- Course Cache ----

export async function cacheCourseData(
  scope: OfflineScope,
  courseId: string,
  course: any,
  lessons: any[],
  lessonProgress: any[],
  lessonAttachments: Record<string, any[]>
): Promise<void> {
  if (!isOfflineScopeCurrent(scope) || scope.resource !== courseId) return;
  const { authRevision: _revision, ...owner } = scope;
  const data: CachedCourseData = {
    key: scopedKey(scope, courseId), owner,
    courseId,
    course,
    lessons,
    lessonProgress,
    lessonAttachments,
    cachedAt: Date.now(),
  };
  await putItem(COURSE_STORE, data, () => isOfflineScopeCurrent(scope));
}

export async function getCachedCourseData(scope: OfflineScope | null, courseId: string): Promise<CachedCourseData | null> {
  if (!isOfflineScopeCurrent(scope) || scope.resource !== courseId) return null;
  const data = await getItem<CachedCourseData>(COURSE_STORE, scopedKey(scope, courseId));
  if (!isOfflineScopeCurrent(scope) || data?.key !== scopedKey(scope, courseId)) return null;
  if (!data) return null;
  if (Date.now() - data.cachedAt > TTL_MS) return null; // expired
  return data;
}

export async function clearCourseCache(scope: OfflineScope, courseId: string): Promise<void> {
  if (!isOfflineScopeCurrent(scope) || scope.resource !== courseId) return;
  try {
    const db = await openDB();
    if (!isOfflineScopeCurrent(scope)) { db.close(); return; }
    const tx = db.transaction(COURSE_STORE, 'readwrite');
    tx.objectStore(COURSE_STORE).delete(scopedKey(scope, courseId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
  }
}

// ---- Dashboard Cache ----

export async function cacheDashboardData(
  scope: OfflineScope,
  data: Omit<CachedDashboardData, 'key' | 'owner' | 'cachedAt'>
): Promise<void> {
  if (!isOfflineScopeCurrent(scope) || scope.resource !== 'dashboard') return;
  const { authRevision: _revision, ...owner } = scope;
  await putItem(DASHBOARD_STORE, { ...data, owner, key: scopedKey(scope, 'dashboard'), cachedAt: Date.now() }, () => isOfflineScopeCurrent(scope));
}

export async function getCachedDashboardData(scope: OfflineScope | null): Promise<CachedDashboardData | null> {
  if (!isOfflineScopeCurrent(scope) || scope.resource !== 'dashboard') return null;
  const data = await getItem<CachedDashboardData>(DASHBOARD_STORE, scopedKey(scope, 'dashboard'));
  if (!isOfflineScopeCurrent(scope) || data?.key !== scopedKey(scope, 'dashboard')) return null;
  if (!data) return null;
  if (Date.now() - data.cachedAt > TTL_MS) return null;
  return data;
}

// ---- Cleanup expired entries ----
export async function cleanupExpiredCache(): Promise<void> {
  try {
    const db = await openDB();
    for (const storeName of [COURSE_STORE, DASHBOARD_STORE]) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (Date.now() - (cursor.value.cachedAt || 0) > TTL_MS) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    }
    db.close();
  } catch (e) {
  }
}
