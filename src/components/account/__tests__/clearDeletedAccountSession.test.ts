import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { clearDeletedAccountSession } from "../clearDeletedAccountSession";
import { loadPendingDeletion, savePendingDeletion } from "../pendingDeletion";
import { memoryCacheStorage, offlineMemoryStorage } from '@/test/offlineMemoryStorage';
const origin = 'https://app.example';
const publicLesson = 'https://project.supabase.co/storage/v1/object/public/course-files/11111111-1111-4111-8111-111111111111/attachments/lesson/public.png';
let cache: ReturnType<typeof memoryCacheStorage>;

describe("deleted account's local session cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
    vi.stubGlobal("indexedDB", undefined);
    cache = memoryCacheStorage({ 'sigma-v1-api-cache': { [`${origin}/sb-api/rest/v1/profiles`]: 'private', [publicLesson]: 'public sentinel' }, 'sigma-v1-images-cache': { [`${origin}/unknown/passport.png`]: 'private' }, 'other-app': { [`${origin}/foreign`]: 'unrelated' } });
    vi.stubGlobal('caches', cache.storage);
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "deleted-user" } } }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    savePendingDeletion({ accountId: "deleted-user", requestId: "request-1", statusToken: "capability" });
  });
  afterEach(() => vi.unstubAllGlobals());
  const client = () => ({ cancelQueries: vi.fn().mockResolvedValue(undefined), clear: vi.fn() });

  it("clears sensitive API/image caches and the deleted learner's drafts without discarding another learner's draft", async () => {
    sessionStorage.setItem("test-draft:deleted-user:attempt-1", "answers");
    sessionStorage.setItem("test-draft:other-user:attempt-2", "other-answers");
    const query = client();
    expect(await clearDeletedAccountSession("deleted-user", "request-1", query as unknown as QueryClient)).toBe(true);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(query.clear).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("test-draft:deleted-user:attempt-1")).toBeNull();
    expect(sessionStorage.getItem("test-draft:other-user:attempt-2")).toBe("other-answers");
    expect(cache.deletedNames).toContain('sigma-v1-api-cache');
    expect(cache.rows.get('sigma-v1-images-cache')?.size).toBe(0);
    expect(cache.rows.get('sintagma-public-lessons-v1')?.has(publicLesson)).toBe(true);
    expect(cache.rows.has('other-app')).toBe(true);
    expect(loadPendingDeletion()).toBeNull();
  });

  it("does not sign out a different user who logged in while deletion was finishing", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "new-user" } } }, error: null });
    localStorage.setItem("user_role", "student");
    expect(await clearDeletedAccountSession("deleted-user", "request-1", client() as unknown as QueryClient)).toBe(true);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem("user_role")).toBe("student");
  });

  it("still attempts local logout if query cancellation fails and keeps recovery when cleanup is incomplete", async () => {
    const query = client(); query.cancelQueries.mockRejectedValue(new Error("cache failure"));
    expect(await clearDeletedAccountSession("deleted-user", "request-1", query as unknown as QueryClient)).toBe(false);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(loadPendingDeletion()?.requestId).toBe("request-1");
  });
  it('removes provably deleted actor/effective-subject metadata and queued work while preserving B, anonymous lesson assets and unknown legacy ownership', async () => {
    const storage = offlineMemoryStorage(); vi.stubGlobal('indexedDB', storage.factory);
    for (const store of ['courses_scoped_v2', 'dashboard_scoped_v2']) {
      const rows = storage.rows('sigma-course-cache', store);
      rows.set('deleted-owner', {key: 'deleted-owner', owner: {actorId: 'deleted-user', effectiveUserId: 'target'}});
      rows.set('deleted-target', {key: 'deleted-target', owner: {actorId: 'b', effectiveUserId: 'deleted-user'}});
      rows.set('other', {key: 'other', owner: {actorId: 'b', effectiveUserId: 'b'}});
    }
    storage.rows('sigma-course-cache', 'courses').set('unowned', {courseId: 'unknown', lessonProgress: []});
    const queue = storage.rows('sigma-offline-sync', 'sync_queue');
    queue.set('deleted', {id: 'deleted', owner: {actorId: 'deleted-user', effectiveUserId: 'deleted-user'}, data: {id: 'enrollment', progress: 1}});
    queue.set('other', {id: 'other', owner: {actorId: 'b', effectiveUserId: 'b'}, data: {id: 'other-enrollment', progress: 1}});
    queue.set('legacy', {id: 'legacy', data: {id: 'unknown-enrollment'}});
    auth.getSession.mockResolvedValue({data: {session: {user: {id: 'b'}}}, error: null});
    expect(await clearDeletedAccountSession('deleted-user', 'request-scoped', client() as unknown as QueryClient)).toBe(true);
    for (const store of ['courses_scoped_v2', 'dashboard_scoped_v2']) expect([...storage.rows('sigma-course-cache', store).keys()]).toEqual(['other']);
    expect(storage.rows('sigma-course-cache', 'courses').has('unowned')).toBe(true);
    expect([...queue.keys()]).toEqual(['other', 'legacy']); expect(auth.signOut).not.toHaveBeenCalled();
    expect(cache.rows.get('sintagma-public-lessons-v1')?.has(publicLesson)).toBe(true);
  });
});
