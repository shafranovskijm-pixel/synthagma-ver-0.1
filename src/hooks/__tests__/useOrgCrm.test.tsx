import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgCrm } from "../useOrgCrm";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: { id: "30000000-0000-4000-8000-000000000001" } as { id: string } | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
const clientId = "20000000-0000-4000-8000-000000000001";
const date = "2026-10-12T07:00:00.123456+00:00";
const snapshot = (org = orgA, name = "Клиент") => ({ clients: [{ id: clientId, organization_id: org,
  org_name: name, inn: null, email: null, phone: null, address: null, notes: null, created_at: date, updated_at: date }],
  deals: [], tasks: [], activities: [], assignees: [], counts: { clients: 1, deals: 0, tasks: 0, activities: 0 },
  truncated: { clients: false, deals: false, tasks: false, activities: false } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const clients: QueryClient[] = [];
function setup(org = orgA) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ organizationId }) => useOrgCrm(organizationId), { wrapper, initialProps: { organizationId: org } });
}
beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: "30000000-0000-4000-8000-000000000001" };
  mocks.rpc.mockImplementation(async (_name, args) => ({ data: snapshot(args.p_organization_id), error: null })); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("organization CRM data boundary", () => {
  it("loads the explicitly selected organization without relying on profile.organization_id", async () => {
    const { result } = setup(orgB);
    await waitFor(() => expect(result.current.data?.clients[0].organization_id).toBe(orgB));
    expect(mocks.rpc).toHaveBeenCalledWith("org_crm_snapshot", { p_organization_id: orgB });
  });
  it("shows a failed read as an error and supports explicit retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "private detail" } });
    const { result } = setup();
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.data?.clients).toHaveLength(1));
  });
  it("rejects cross-organization rows in a response", async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot(orgB), error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.error).toMatchObject({ code: "CRM_INVALID_RESPONSE" }));
    expect(result.current.data).toBeUndefined();
  });
  it("never displays a late response from the previous organization", async () => {
    const old = deferred<{ data: unknown; error: null }>();
    mocks.rpc.mockImplementation((_name, args) => args.p_organization_id === orgA ? old.promise : Promise.resolve({ data: snapshot(orgB, "Новый"), error: null }));
    const { result, rerender } = setup();
    rerender({ organizationId: orgB });
    await waitFor(() => expect(result.current.data?.clients[0].org_name).toBe("Новый"));
    await act(async () => { old.resolve({ data: snapshot(orgA, "Старый"), error: null }); await old.promise; });
    expect(result.current.data?.clients[0].org_name).toBe("Новый");
  });
  it("sends the precise edit revision and refreshes after a confirmed write", async () => {
    mocks.rpc.mockImplementation(async (name, args) => name === "org_crm_snapshot"
      ? { data: snapshot(args.p_organization_id), error: null }
      : { data: { id: clientId, updated_at: date }, error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    await act(async () => { await result.current.saveClient.mutateAsync({ id: clientId, expected_updated_at: date, org_name: "Исправлен" }); });
    expect(mocks.rpc).toHaveBeenCalledWith("org_crm_save_client", { p_organization_id: orgA, p_id: clientId,
      p_expected_updated_at: date, p_values: { org_name: "Исправлен" } });
    expect(mocks.rpc.mock.calls.filter(c => c[0] === "org_crm_snapshot")).toHaveLength(2);
  });
  it("does not present a write from an old organization as current success", async () => {
    const save = deferred<{ data: unknown; error: null }>();
    mocks.rpc.mockImplementation((name, args) => name === "org_crm_save_client" ? save.promise
      : Promise.resolve({ data: snapshot(args.p_organization_id), error: null }));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    let receipt!: Promise<unknown>;
    act(() => { receipt = result.current.saveClient.mutateAsync({ org_name: "Клиент" }).catch(error => error); });
    await waitFor(() => expect(mocks.rpc.mock.calls.some(c => c[0] === "org_crm_save_client")).toBe(true));
    rerender({ organizationId: orgB });
    await act(async () => { save.resolve({ data: { id: clientId, updated_at: date }, error: null }); });
    expect(await receipt).toMatchObject({ code: "CRM_CONTEXT_CHANGED" });
    expect(mocks.rpc.mock.calls.filter(c => c[0] === "org_crm_snapshot" && c[1].p_organization_id === orgB)).toHaveLength(1);
  });
  it("does not retry an unconfirmed write automatically", async () => {
    mocks.rpc.mockImplementation(async (name, args) => name === "org_crm_snapshot"
      ? { data: snapshot(args.p_organization_id), error: null } : { data: null, error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    let failure: unknown;
    await act(async () => { try { await result.current.saveClient.mutateAsync({ org_name: "Клиент" }); } catch (error) { failure = error; } });
    expect(failure).toMatchObject({ code: "CRM_UNCONFIRMED_WRITE" });
    expect(mocks.rpc.mock.calls.filter(c => c[0] === "org_crm_save_client")).toHaveLength(1);
  });
  it("keeps a confirmed write successful if its subsequent reload fails", async () => {
    let reads = 0;
    mocks.rpc.mockImplementation(async name => name !== "org_crm_snapshot" ? { data: { id: clientId, updated_at: date }, error: null }
      : ++reads === 1 ? { data: snapshot(), error: null } : { data: null, error: new Error("offline") });
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    let saved: unknown;
    await act(async () => { saved = await result.current.saveClient.mutateAsync({ org_name: "Клиент" }); });
    expect(saved).toMatchObject({ id: clientId });
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
  it("does not load data without an authenticated user", () => {
    mocks.user = null;
    const { result } = setup();
    expect(result.current.data).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
