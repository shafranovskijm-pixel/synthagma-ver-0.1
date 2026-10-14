import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgCrmContext } from "../useOrgCrmContext";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "40000000-0000-4000-8000-000000000001" } }) }));
const org = "10000000-0000-4000-8000-000000000001", a = "20000000-0000-4000-8000-000000000001", b = "20000000-0000-4000-8000-000000000002";
const clientId = "30000000-0000-4000-8000-000000000001", date = "2026-10-12T07:00:00.123456+00:00";
const data = (id = a) => ({ subject: { type: "student", id, name: id, profile_id: id }, client: null, related_company: null,
  crm: { clients: [], deals: [], tasks: [], activities: [], assignees: [], counts: { clients: 0, deals: 0, tasks: 0, activities: 0 }, truncated: { clients: false, deals: false, tasks: false, activities: false } },
  timeline: { events: [], total: 0, truncated: false, restricted_sources: [], unavailable_sources: [] } });
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(({ id }) => useOrgCrmContext(org, "student", id), { wrapper, initialProps: { id: a } }), client };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockImplementation(async (_name, args) => ({ data: data(args.p_entity_id), error: null })); });
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });
describe("CRM context loading and writes", () => {
  it("only reads on opening and separates two students in the same organization", async () => {
    const old = deferred<any>(); mocks.rpc.mockImplementation((_name, args) => args.p_entity_id === a ? old.promise : Promise.resolve({ data: data(b), error: null }));
    const { result, rerender } = mount(); rerender({ id: b });
    await waitFor(() => expect(result.current.data?.subject.id).toBe(b));
    await act(async () => { old.resolve({ data: data(a), error: null }); await old.promise; });
    expect(result.current.data?.subject.id).toBe(b);
    expect(mocks.rpc.mock.calls.every(call => call[0] === "org_crm_context")).toBe(true);
  });
  it("rejects a late link receipt after changing cards", async () => {
    const pending = deferred<any>(); mocks.rpc.mockImplementation((name, args) => name === "org_crm_link_subject" ? pending.promise : Promise.resolve({ data: data(args.p_entity_id), error: null }));
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.data).toBeDefined());
    let receipt!: Promise<unknown>; act(() => { receipt = result.current.linkClient.mutateAsync(null).catch(e => e); });
    await waitFor(() => expect(mocks.rpc.mock.calls.some(c => c[0] === "org_crm_link_subject")).toBe(true)); rerender({ id: b });
    await act(async () => { pending.resolve({ data: { id: clientId, updated_at: date }, error: null }); });
    expect(await receipt).toMatchObject({ code: "CRM_CONTEXT_CHANGED" });
  });
  it("does not retry an unconfirmed link or save another card's deal", async () => {
    mocks.rpc.mockImplementation(async (name, args) => ({ data: name === "org_crm_context" ? data(args.p_entity_id) : null, error: null }));
    const { result } = mount(); await waitFor(() => expect(result.current.data).toBeDefined());
    await act(async () => { await expect(result.current.linkClient.mutateAsync(null)).rejects.toMatchObject({ code: "CRM_UNCONFIRMED_WRITE" }); });
    await act(async () => { await expect(result.current.saveDeal.mutateAsync({ client_id: clientId, title: "Сделка", stage: "new", amount: 0 })).rejects.toMatchObject({ code: "CRM_CONTEXT_CHANGED" }); });
    expect(mocks.rpc.mock.calls.filter(c => c[0] === "org_crm_link_subject")).toHaveLength(1);
    expect(mocks.rpc.mock.calls.some(c => c[0] === "org_crm_save_deal")).toBe(false);
  });
  it("invalidates both CRM surfaces after a confirmed link even when the reload fails", async () => {
    let reads = 0; mocks.rpc.mockImplementation(async name => name === "org_crm_context" ? ++reads === 1 ? { data: data(), error: null } : { data: null, error: new Error("offline") } : { data: { id: clientId, updated_at: date }, error: null });
    const { result, client } = mount(); const spy = vi.spyOn(client, "invalidateQueries"); await waitFor(() => expect(result.current.data).toBeDefined());
    await act(async () => { expect(await result.current.linkClient.mutateAsync(null)).toMatchObject({ id: clientId }); });
    expect(spy.mock.calls.map(c => c[0].queryKey[0])).toEqual(expect.arrayContaining(["org-crm", "org-crm-context"]));
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
