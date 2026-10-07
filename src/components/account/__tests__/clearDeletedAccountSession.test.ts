import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { clearDeletedAccountSession } from "../clearDeletedAccountSession";
import { loadPendingDeletion, savePendingDeletion } from "../pendingDeletion";

describe("deleted account's local session cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("caches", { keys: vi.fn().mockResolvedValue(["sigma-v1-api-cache", "sigma-v1-images-cache", "sigma-v1-static-cache"]), delete: vi.fn().mockResolvedValue(true) });
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
    expect(caches.delete).toHaveBeenCalledWith("sigma-v1-api-cache");
    expect(caches.delete).toHaveBeenCalledWith("sigma-v1-images-cache");
    expect(caches.delete).not.toHaveBeenCalledWith("sigma-v1-static-cache");
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
});
