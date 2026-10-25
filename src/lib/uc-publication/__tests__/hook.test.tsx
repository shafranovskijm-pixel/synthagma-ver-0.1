import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: { user: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } as { id: string } | null, loading: false }, rpc: vi.fn(), edge: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (name: string, args: unknown) => ({ abortSignal: (signal: AbortSignal) => mocks.rpc(name, args, signal) }), functions: { invoke: (...args: unknown[]) => mocks.edge(...args) } } }));
import { usePublicationCalendar } from "@/hooks/usePublicationCalendar";
import { actor, calendar, createArgs, created, id, list, org, rules } from "./fixtures";
const reads = (name: string) => name === "list_publication_rule_versions" ? rules() : name === "list_organization_publications" ? list() : calendar();
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { mocks.auth = { user: { id: actor }, loading: false }; mocks.rpc.mockReset(); mocks.edge.mockReset(); mocks.rpc.mockImplementation(async (name: string) => ({ data: reads(name), error: null })); });
afterEach(cleanup);
describe("UC026 current access, refresh and immutable request retries", () => {
  it("loads the three original-caller scopes before showing data", async () => {
    const h = renderHook(() => usePublicationCalendar(org, 2025, true, true, true));
    expect(h.result.current.data).toBeNull();
    await waitFor(() => expect(h.result.current.data?.records).toHaveLength(1));
    expect(mocks.rpc.mock.calls.map(c => c[0])).toEqual(["list_publication_rule_versions", "list_organization_publications", "list_organization_publication_calendar"]);
  });
  it("masks old records in the same render when access is removed", async () => {
    const h = renderHook(({ read }) => usePublicationCalendar(org, 2025, read, true, true), { initialProps: { read: true } });
    await waitFor(() => expect(h.result.current.data).not.toBeNull()); h.rerender({ read: false });
    expect(h.result.current.data).toBeNull();
    await act(async () => expect(await h.result.current.mutate("create_organization_publication", createArgs())).toBe(false));
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });
  it("cannot restore an old actor's delayed response after the authenticated account changes", async () => {
    const gate = deferred<{ data: unknown; error: null }>(); let first = true;
    mocks.rpc.mockImplementation((name: string) => { if (first && name === "list_publication_rule_versions") { first = false; return gate.promise; } return Promise.resolve({ data: reads(name), error: null }); });
    const h = renderHook(() => usePublicationCalendar(org, 2025, true, true, true));
    mocks.auth = { user: { id: id(99) }, loading: false }; h.rerender();
    await waitFor(() => expect(h.result.current.data).not.toBeNull());
    await act(async () => { gate.resolve({ data: { ...rules(), organization_id: id(9) }, error: null }); await gate.promise; });
    expect(h.result.current.error).toBeNull(); expect(h.result.current.actorId).toBe(id(99));
  });
  it("hides the entire combined view when any read returns another tenant", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "list_publication_rule_versions" ? { ...rules(), organization_id: id(9) } : reads(name), error: null }));
    const h = renderHook(() => usePublicationCalendar(org, 2025, true, true, true));
    await waitFor(() => expect(h.result.current.error).not.toBeNull()); expect(h.result.current.data).toBeNull();
  });
  it("retries exactly the same immutable request after an uncertain result", async () => {
    let writes = 0; mocks.rpc.mockImplementation(async (name: string) => name === "create_organization_publication" ? (++writes === 1 ? { data: null, error: { code: "NETWORK_FAILURE" } } : { data: created(), error: null }) : { data: reads(name), error: null });
    const h = renderHook(() => usePublicationCalendar(org, 2025, true, true, true)); await waitFor(() => expect(h.result.current.data).not.toBeNull());
    const args = createArgs(); await act(async () => expect(await h.result.current.mutate("create_organization_publication", args)).toBe(false));
    expect(h.result.current.uncertain).toBe(true); expect(h.result.current.data).toBeNull(); args.p_request_id = id(99);
    await act(async () => expect(await h.result.current.retry()).toBe(true));
    const actual = mocks.rpc.mock.calls.filter(c => c[0] === "create_organization_publication"); expect(actual).toHaveLength(2); expect(actual[0][1]).toEqual(actual[1][1]); expect(actual[1][1].p_request_id).toBe(id(10));
  });
  it("blocks a different mutation while an uncertain request is retained", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "create_organization_publication" ? { data: null, error: { code: "NETWORK_FAILURE" } } : { data: reads(name), error: null });
    const h = renderHook(() => usePublicationCalendar(org, 2025, true, true, true)); await waitFor(() => expect(h.result.current.data).not.toBeNull());
    await act(async () => { await h.result.current.mutate("create_organization_publication", createArgs()); });
    await act(async () => expect(await h.result.current.mutate("create_organization_publication", { ...createArgs(), p_request_id: id(22) })).toBe(false));
    expect(mocks.rpc.mock.calls.filter(c => c[0] === "create_organization_publication")).toHaveLength(1);
  });
  it("requires sign permission for an explicit centre decision and never calls RPC when absent", async () => {
    const h = renderHook(() => usePublicationCalendar(org, 2025, true, true, false)); await waitFor(() => expect(h.result.current.data).not.toBeNull());
    await act(async () => expect(await h.result.current.mutate("record_organization_publication_action", {}, true)).toBe(false));
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });
  it("hides retained private data when a history read reports access revocation", async () => {
    const h = renderHook(() => usePublicationCalendar(org, 2025, true, true, true)); await waitFor(() => expect(h.result.current.data).not.toBeNull());
    mocks.rpc.mockImplementation(async () => ({ data: null, error: { code: "42501" } }));
    await act(async () => expect(await h.result.current.readHistory(id(2))).toBeNull());
    expect(h.result.current.denied).toBe(true); expect(h.result.current.data).toBeNull();
  });
});
