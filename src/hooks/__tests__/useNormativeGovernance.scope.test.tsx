// @vitest-environment jsdom
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useNormativeGovernance } from "../useNormativeGovernance";
import { ORG_A, ORG_B, MANIFEST_ID, snapshot } from "@/lib/normativeGovernance/__tests__/normative.fixture";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
beforeAll(() => { vi.stubGlobal("crypto", webcrypto); });afterAll(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); mock.rpc.mockReset(); });
const deferred = <T,>() => { let resolve!: (value: T) => void;const promise = new Promise<T>(done => { resolve = done; });return { promise, resolve }; };
const command = () => ({ kind: "review_due_set" as const, manifestId: MANIFEST_ID, body: { dueOn: "2026-11-10", reason: "Synthetic explicit owner review task" } });
describe("UC030 original caller scoped governance hook", () => {
 it("loads independent statuses without issuing owner/legal/publication commands", async () => {
  const initial = await snapshot();mock.rpc.mockResolvedValue({ data: initial, error: null });
  const hook = renderHook(() => useNormativeGovernance(ORG_A, true, true, 1));await waitFor(() => expect(hook.result.current.data).not.toBeNull());
  expect(mock.rpc.mock.calls.map(call => call[0])).toEqual(["read_normative_governance"]);expect(hook.result.current.data!.projection.reviewDueOn).toBeNull();expect(hook.result.current.data!.projection.legalReviewed).toBe(false);
 });
 it("discards a late organization A read after switching to B", async () => {
  const first = deferred<any>(), a = await snapshot(), b = await snapshot(ORG_B);mock.rpc.mockImplementation((_name, args) => args.p_organization_id === ORG_A ? first.promise : Promise.resolve({ data: b, error: null }));
  const hook = renderHook(({ org }) => useNormativeGovernance(org, true, true, 1), { initialProps: { org: ORG_A } });
  hook.rerender({ org: ORG_B });await waitFor(() => expect(hook.result.current.data?.organizationId).toBe(ORG_B));
  await act(async () => { first.resolve({ data: a, error: null });await first.promise; });expect(hook.result.current.data?.organizationId).toBe(ORG_B);
 });
 it("does not apply an old successful write after close and reopen of the same organization", async () => {
  const initial = await snapshot(), write = deferred<any>();let writeArgs: any;
  mock.rpc.mockImplementation((name, args) => { if (name === "record_normative_governance_event") { writeArgs = args;return write.promise; }return Promise.resolve({ data: initial, error: null }); });
  const hook = renderHook(({ read }) => useNormativeGovernance(ORG_A, read, true, 1), { initialProps: { read: true } });await waitFor(() => expect(hook.result.current.data).not.toBeNull());
  let result!: Promise<boolean>;act(() => { result = hook.result.current.record(command()); });await waitFor(() => expect(writeArgs).toBeTruthy());
  hook.rerender({ read: false });hook.rerender({ read: true });await waitFor(() => expect(hook.result.current.data?.globalSequence).toBe(2));
  const saved = structuredClone(initial);saved.globalSequence = 3;saved.projection.reviewDueOn = "2026-11-10";
  await act(async () => { write.resolve({ data: { snapshot: saved, receipt: { requestId: writeArgs.p_request_id, actorId: initial.actorId, kind: "review_due_set", manifestId: MANIFEST_ID, manifestSha256: initial.manifests[0].manifest.sha256 } }, error: null });expect(await result).toBe(false); });
  expect(hook.result.current.data?.projection.reviewDueOn).toBeNull();expect(hook.result.current.data?.globalSequence).toBe(2);
 });
 it("retries an uncertain write with exactly the original UUID and refuses a different decision", async () => {
  const initial = await snapshot();let uncertain = true;const writes: any[] = [];
  mock.rpc.mockImplementation((name, args) => {
   if (name === "read_normative_governance") return Promise.resolve({ data: initial, error: null });writes.push(structuredClone(args));
   if (uncertain) return Promise.resolve({ data: null, error: { message: "Synthetic response lost" } });
   const saved = structuredClone(initial);saved.globalSequence = 3;saved.projection.reviewDueOn = "2026-11-10";
   return Promise.resolve({ data: { snapshot: saved, receipt: { requestId: args.p_request_id, actorId: initial.actorId, kind: "review_due_set", manifestId: MANIFEST_ID, manifestSha256: initial.manifests[0].manifest.sha256 } }, error: null });
  });
  const hook = renderHook(() => useNormativeGovernance(ORG_A, true, true, 1));await waitFor(() => expect(hook.result.current.data).not.toBeNull());
  await act(async () => { expect(await hook.result.current.record(command())).toBe(false); });expect(hook.result.current.uncertain).toBe(true);
  await act(async () => { expect(await hook.result.current.record({ ...command(), body: { dueOn: "2026-12-01", reason: "Another decision" } })).toBe(false); });expect(writes).toHaveLength(1);
  uncertain = false;await act(async () => { expect(await hook.result.current.retry()).toBe(true); });expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);expect(hook.result.current.data?.projection.reviewDueOn).toBe("2026-11-10");
 });
 it("rejects a server profile tuple that no longer matches the displayed centre profile", async () => {
  const initial = await snapshot();initial.profileRevision = 2;mock.rpc.mockResolvedValue({ data: initial, error: null });
  const hook = renderHook(() => useNormativeGovernance(ORG_A, true, true, 1));await waitFor(() => expect(hook.result.current.loading).toBe(false));expect(hook.result.current.data).toBeNull();expect(hook.result.current.error).toBeTruthy();
 });
 it("keeps read-only access from invoking any write, even if an old snapshot says owner", async () => {
  const initial = await snapshot();mock.rpc.mockResolvedValue({ data: initial, error: null });
  const hook = renderHook(() => useNormativeGovernance(ORG_A, true, false, 1));await waitFor(() => expect(hook.result.current.data).not.toBeNull());
  await act(async () => { expect(await hook.result.current.record(command())).toBe(false);expect(await hook.result.current.registerCurrent()).toBe(false); });expect(mock.rpc.mock.calls.every(call => call[0] === "read_normative_governance")).toBe(true);
 });
 it("returns no old impact page after changing organization during the request", async () => {
  const initial = await snapshot(), b = await snapshot(ORG_B), page = deferred<any>();
  mock.rpc.mockImplementation((name, args) => name === "list_normative_impact_centres" ? page.promise : Promise.resolve({ data: args.p_organization_id === ORG_A ? initial : b, error: null }));
  const hook = renderHook(({ org }) => useNormativeGovernance(org, true, true, 1), { initialProps: { org: ORG_A } });await waitFor(() => expect(hook.result.current.data).not.toBeNull());
  let request!: Promise<any>;act(() => { request = hook.result.current.loadImpactCentres(); });hook.rerender({ org: ORG_B });await waitFor(() => expect(hook.result.current.data?.organizationId).toBe(ORG_B));
  await act(async () => { page.resolve({ data: { schemaVersion: 1, contextOrganizationId: ORG_A, manifestId: MANIFEST_ID, items: [], nextBeforeOrganizationId: null, complete: true, legalComplianceConfirmed: false }, error: null });expect(await request).toBeNull(); });
 });
});
