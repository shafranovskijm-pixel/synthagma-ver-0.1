/**
 * IndexedDB-based course caching for offline resilience.
 * Caches course data, lessons, test questions, and attachments metadata.
 * TTL: 7 days.
 */

const DB_NAME = 'sigma-course-cache';
const DB_VERSION = 1;
const COURSE_STORE = 'courses';
const DASHBOARD_STORE = 'dashboard';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedCourseData {
  courseId: string;
  course: any;
  lessons: any[];
  lessonProgress: any[];
  lessonAttachments: Record<string, any[]>;
  cachedAt: number;
}

interface CachedDashboardData {
  key: string;
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
        db.createObjectStore(COURSE_STORE, { keyPath: 'courseId' });
      }
      if (!db.objectStoreNames.contains(DASHBOARD_STORE)) {
        db.createObjectStore(DASHBOARD_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putItem(storeName: string, data: any): Promise<void> {
  try {
    const db = await openDB();
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
  courseId: string,
  course: any,
  lessons: any[],
  lessonProgress: any[],
  lessonAttachments: Record<string, any[]>
): Promise<void> {
  const data: CachedCourseData = {
    courseId,
    course,
    lessons,
    lessonProgress,
    lessonAttachments,
    cachedAt: Date.now(),
  };
  await putItem(COURSE_STORE, data);
}

export async function getCachedCourseData(courseId: string): Promise<CachedCourseData | null> {
  const data = await getItem<CachedCourseData>(COURSE_STORE, courseId);
  if (!data) return null;
  if (Date.now() - data.cachedAt > TTL_MS) return null; // expired
  return data;
}

export async function clearCourseCache(courseId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(COURSE_STORE, 'readwrite');
    tx.objectStore(COURSE_STORE).delete(courseId);
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
  userId: string,
  data: Omit<CachedDashboardData, 'key' | 'cachedAt'>
): Promise<void> {
  await putItem(DASHBOARD_STORE, { ...data, key: userId, cachedAt: Date.now() });
}

export async function getCachedDashboardData(userId: string): Promise<CachedDashboardData | null> {
  const data = await getItem<CachedDashboardData>(DASHBOARD_STORE, userId);
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
