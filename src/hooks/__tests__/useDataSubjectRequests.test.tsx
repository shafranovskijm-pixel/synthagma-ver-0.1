import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ user: { id: "actor-a" }, revision: 1, rpc: vi.fn(), session: vi.fn(), headers: [] as string[], error: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: f.user, userRole: "teacher", loading: false }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ loading: false, error: null, orgRole: "teacher", adminRole: null, orgPermissions: new Set(["documents.write"]) }) }));
vi.mock("@/utils/courseCache", () => ({ captureOfflineContext: () => ({ actorId: f.user.id, revision: f.revision }), isOfflineActorCurrent: (id: string, revision: number) => id === f.user.id && revision === f.revision }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: f.session }, rpc: (name: string, args: unknown) => ({ setHeader: (key: string, value: string) => { f.headers.push(key + ":" + value); return f.rpc(name, args); } }) } }));
vi.mock("sonner", () => ({ toast: { error: f.error, success: f.success } }));
import { useMyDataSubjectRequests, useOrgDataSubjectRequests, type DataSubjectRequest } from "../useDataSubjectRequests";
const request = (org = "org-a"): DataSubjectRequest => ({ id: "request-a", user_id: "subject", organization_id: org, request_type: "access", status: "pending", description: null, contact_email: null, attachment_urls: null, response: null, due_date: null, resolved_at: null, resolved_by: null, created_at: "2026-10-22", updated_at: "2026-10-22", deadline_revision: 0, deadline_details: null });
const response = (requests: DataSubjectRequest[]) => ({ data: { requests, counts: { all: requests.length, pending: requests.filter(r => r.status === "pending").length, in_progress: requests.filter(r => r.status === "in_progress").length, resolved: requests.filter(r => r.status === "resolved").length, rejected: requests.filter(r => r.status === "rejected").length }, next_cursor: null }, error: null });
const deferred = () => { let resolve!: (value: unknown) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { f.rpc.mockReset(); f.session.mockReset(); f.headers = []; f.error.mockReset(); f.success.mockReset(); f.user = { id: "actor-a" }; f.revision = 1; f.session.mockImplementation(async () => ({ data: { session: { user: f.user, access_token: "SYNTHETIC_CAPTURED_TOKEN" } }, error: null })); f.rpc.mockResolvedValue(response([])); });
describe("UC023 request authority and captured UI scope", () => {
  it("sends no client-created deadline and keeps an unknown create retry idempotent", async () => {
    f.rpc.mockImplementation((name: string) => name === "uc_dsr_create" ? Promise.resolve({ data: null, error: { message: "unknown network outcome" } }) : Promise.resolve(response([])));
    const { result } = renderHook(() => useMyDataSubjectRequests("actor-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.create("org-a", "access", "copy", "a@example.test"); });
    await act(async () => { await result.current.create("org-a", "access", "copy", "a@example.test"); });
    const calls = f.rpc.mock.calls.filter(c => c[0] === "uc_dsr_create");
    expect(calls).toHaveLength(2); expect(calls[0][1]).toEqual(calls[1][1]);
    expect(calls[0][1]).not.toHaveProperty("due_date"); expect(f.success).not.toHaveBeenCalled();
  });
  it("masks A immediately and rejects an earlier A response after an A→B→A cycle", async () => {
    const old = deferred(); let countA = 0;
    f.rpc.mockImplementation((_name: string, args: { p_organization_id: string }) => args.p_organization_id === "org-a" && ++countA === 1 ? old.promise : Promise.resolve(response([{ ...request(args.p_organization_id), id: "fresh-" + args.p_organization_id }])));
    const { result, rerender } = renderHook(({ org }) => useOrgDataSubjectRequests(org), { initialProps: { org: "org-a" } });
    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(1));
    rerender({ org: "org-b" }); expect(result.current.requests).toEqual([]);
    await waitFor(() => expect(result.current.requests[0]?.id).toBe("fresh-org-b"));
    rerender({ org: "org-a" }); expect(result.current.requests).toEqual([]);
    await waitFor(() => expect(result.current.requests[0]?.id).toBe("fresh-org-a"));
    await act(async () => old.resolve(response([{ ...request(), id: "stale-private-A" }])));
    expect(result.current.requests[0]?.id).toBe("fresh-org-a");
  });
  it("does not silently retry stale CAS, and refuses a request from another organization", async () => {
    f.rpc.mockImplementation((name: string) => Promise.resolve(name === "uc_dsr_apply" ? { data: null, error: { code: "PT409", message: "stale" } } : response([request()])));
    const { result } = renderHook(() => useOrgDataSubjectRequests("org-a"));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    let ok = true;
    await act(async () => { ok = await result.current.apply(request("org-b"), "respond", { reason: "x" }); });
    expect(ok).toBe(false); expect(f.rpc.mock.calls.filter(c => c[0] === "uc_dsr_apply")).toHaveLength(0);
    await act(async () => { ok = await result.current.apply(request(), "respond", { reason: "x" }); });
    expect(ok).toBe(false); expect(f.rpc.mock.calls.filter(c => c[0] === "uc_dsr_apply")).toHaveLength(1);
    expect(f.error).toHaveBeenCalledWith(expect.stringContaining("Обновите список"));
  });
  it("discards a pending save after actor revision changes without success notice or new-scope reload", async () => {
    const save = deferred();
    f.rpc.mockImplementation((name: string) => name === "uc_dsr_apply" ? save.promise : Promise.resolve(response([request()])));
    const { result, rerender } = renderHook(() => useOrgDataSubjectRequests("org-a"));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    let pending!: Promise<boolean>; act(() => { pending = result.current.apply(request(), "respond", { reason: "x" }); });
    await waitFor(() => expect(f.rpc.mock.calls.some(c => c[0] === "uc_dsr_apply")).toBe(true));
    f.revision++; rerender(); expect(result.current.requests).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => save.resolve({ data: request(), error: null }));
    expect(await pending).toBe(false); expect(f.success).not.toHaveBeenCalled();
  });
  it("requests the exact next cursor, appends the complete second page and preserves server totals", async () => {
    const cursor = { created_at: "2026-10-22T00:00:00Z", id: "request-a" };
    f.rpc.mockImplementation((_name: string, args: { p_cursor: unknown }) => Promise.resolve(args.p_cursor ? { ...response([{ ...request(), id: "second", created_at: "2026-10-21" }]), data: { ...response([{ ...request(), id: "second", created_at: "2026-10-21" }]).data, counts: { ...response([request()]).data.counts, all: 2, pending: 2 } } } : { ...response([request()]), data: { ...response([request()]).data, counts: { ...response([request()]).data.counts, all: 2, pending: 2 }, next_cursor: cursor } }));
    const { result } = renderHook(() => useOrgDataSubjectRequests("org-a"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(result.current.counts.all).toBe(2); expect(result.current.loadedCount).toBe(1);
    await act(async () => { await result.current.loadMore(); });
    expect(f.rpc.mock.calls[1][1]).toMatchObject({ p_cursor: cursor, p_limit: 100 });
    expect(result.current.requests.map(r => r.id)).toEqual(["request-a", "second"]); expect(result.current.hasMore).toBe(false);
  });
  it("refuses the old callback when the offline actor changes before React renders", async () => {
    f.rpc.mockResolvedValue(response([request()]));
    const { result } = renderHook(() => useOrgDataSubjectRequests("org-a"));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    const stale = result.current.apply;
    f.user = { id: "actor-b" }; f.revision++;
    const sessionCalls = f.session.mock.calls.length;
    expect(await stale(request(), "respond", { reason: "x" })).toBe(false);
    expect(f.session).toHaveBeenCalledTimes(sessionCalls);
    expect(f.rpc.mock.calls.filter(c => c[0] === "uc_dsr_apply")).toHaveLength(0);
  });
  it("refuses a session belonging to another actor and binds accepted calls to the captured bearer", async () => {
    f.rpc.mockResolvedValue(response([request()]));
    const { result } = renderHook(() => useOrgDataSubjectRequests("org-a"));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    expect(f.headers[0]).toBe("Authorization:Bearer SYNTHETIC_CAPTURED_TOKEN");
    f.session.mockResolvedValueOnce({ data: { session: { user: { id: "actor-b" }, access_token: "OTHER_ACTOR_TOKEN" } }, error: null });
    await act(async () => { expect(await result.current.apply(request(), "respond", { reason: "x" })).toBe(false); });
    expect(f.rpc.mock.calls.filter(c => c[0] === "uc_dsr_apply")).toHaveLength(0); expect(f.success).not.toHaveBeenCalled();
  });
  it.each([null, { ...request(), id: "wrong-id", status: "in_progress", deadline_revision: 1 }, { ...request(), status: "in_progress", deadline_revision: 9 }])("never treats null, another request or an unexpected revision as mutation success: %j", async invalid => {
    f.rpc.mockImplementation((name: string) => Promise.resolve(name === "uc_dsr_apply" ? { data: invalid, error: null } : response([request()])));
    const { result } = renderHook(() => useOrgDataSubjectRequests("org-a"));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    await act(async () => { expect(await result.current.apply(request(), "respond", { reason: "x" })).toBe(false); });
    expect(f.success).not.toHaveBeenCalled(); expect(f.rpc.mock.calls.filter(c => c[0] === "uc_dsr_list")).toHaveLength(1);
  });
  it("rejects foreign organization data and a next cursor that does not name the last row", async () => {
    f.rpc.mockResolvedValue(response([request("org-b")]));
    const { result } = renderHook(() => useOrgDataSubjectRequests("org-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.requests).toEqual([]); expect(f.error).toHaveBeenCalled();
    f.error.mockClear(); f.rpc.mockResolvedValue({ ...response([request()]), data: { ...response([request()]).data, next_cursor: { id: "unrelated", created_at: "2026-10-22" } } });
    await act(async () => { await result.current.reload(); });
    expect(result.current.requests).toEqual([]); expect(f.error).toHaveBeenCalled();
  });

  it("accepts a genuine create receipt with PostgreSQL btrim semantics and confirms the saved request", async () => {
    const description = " \tcopy\u00a0 ";
    f.rpc.mockImplementation((name: string, args: Record<string, unknown>) => Promise.resolve(name === "uc_dsr_create" ? { data: { ...request(), id: args.p_request_id, user_id: "actor-a", description: "\tcopy\u00a0", contact_email: "a@example.test", deadline_details: { state: "needs_review", rule_version: "v1" } }, error: null } : response([])));
    const { result } = renderHook(() => useMyDataSubjectRequests("actor-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { expect(await result.current.create("org-a", "access", description, " a@example.test ")).toBe(true); });
    expect(f.success).toHaveBeenCalledTimes(1);
  });
  it("accepts an exact authorized next revision before reporting a successful operator decision", async () => {
    const saved = { ...request(), status: "in_progress", deadline_revision: 1, response: "Проверка начата" };
    f.rpc.mockImplementation((name: string) => Promise.resolve(name === "uc_dsr_apply" ? { data: saved, error: null } : response([request()])));
    const { result } = renderHook(() => useOrgDataSubjectRequests("org-a"));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    await act(async () => { expect(await result.current.apply(request(), "respond", { reason: "Проверено", response: "Проверка начата" })).toBe(true); });
    expect(f.success).toHaveBeenCalledTimes(1); expect(f.rpc.mock.calls.filter(c => c[0] === "uc_dsr_list")).toHaveLength(2);
  });

});
