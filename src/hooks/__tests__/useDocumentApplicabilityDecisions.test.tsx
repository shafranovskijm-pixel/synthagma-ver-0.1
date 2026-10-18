import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useDocumentApplicabilityDecisions } from "../useDocumentApplicabilityDecisions";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
const row = (changes = {}) => ({ organization_id: "org", requirement_id: "charter", revision: 1, profile_revision: 2, catalog_version: "catalog", decision: "not_applicable", reason: "ИП обучает лично", decided_at: "2026-10-18T00:00:00Z", decided_by: "actor", ...changes });
const setup = (profileRevision = 2, canWrite = true) => renderHook(({ org, revision }) => useDocumentApplicabilityDecisions(org, revision, "catalog", true, canWrite), { initialProps: { org: "org", revision: profileRevision } });
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: [], error: null }); });
it("saves an explicit reason with both revisions and keeps a withdrawal as a new event", async () => {
  const { result } = setup(); await waitFor(() => expect(result.current.data).toEqual([]));
  rpc.mockResolvedValueOnce({ data: row(), error: null }); await act(async () => expect(await result.current.save("charter", "not_applicable", "  ИП обучает лично  ")).toBe(true));
  expect(rpc.mock.lastCall?.[1]).toMatchObject({ p_expected_revision: 0, p_profile_revision: 2, p_catalog_version: "catalog", p_reason: "ИП обучает лично", p_request_id: expect.any(String) });
  rpc.mockResolvedValueOnce({ data: row({ revision: 2, decision: null, reason: "Уточняем статус" }), error: null });
  await act(async () => expect(await result.current.save("charter", null, "Уточняем статус")).toBe(true));
  expect(result.current.data?.[0]).toMatchObject({ revision: 2, decision: null }); expect(rpc.mock.lastCall?.[1].p_expected_revision).toBe(1);
});
it.each([[0, true], [2, false]])("does not write without a saved profile or write permission", async (revision, writable) => {
  const { result } = setup(revision as number, writable as boolean); await waitFor(() => expect(result.current.data).toEqual([]));
  await act(async () => expect(await result.current.save("charter", "not_applicable", "Reason")).toBe(false)); expect(rpc).toHaveBeenCalledTimes(1);
});
it("requires a reason and never changes the list on conflict", async () => {
  const { result } = setup(); await waitFor(() => expect(result.current.data).toEqual([]));
  await act(async () => expect(await result.current.save("charter", "not_applicable", " ")).toBe(false)); expect(rpc).toHaveBeenCalledTimes(1);
  rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } }); await act(async () => expect(await result.current.save("charter", "not_applicable", "Reason")).toBe(false));
  expect(result.current.conflict).toBe(true); expect(result.current.data).toEqual([]);
  await act(async () => expect(await result.current.save("charter", "not_applicable", "Reason")).toBe(false)); expect(rpc).toHaveBeenCalledTimes(2);
});
it("retries the same uncertain operation without inventing another event", async () => {
  const { result } = setup(); await waitFor(() => expect(result.current.data).toEqual([])); rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
  await act(async () => expect(await result.current.save("charter", "not_applicable", "ИП обучает лично")).toBe(false)); const request = rpc.mock.lastCall?.[1];
  rpc.mockResolvedValueOnce({ data: row(), error: null }).mockResolvedValueOnce({ data: [row({ revision: 3, decision: null, reason: "Уточнение другой вкладки" })], error: null });
  await act(async () => expect(await result.current.save("charter", "not_applicable", "ИП обучает лично")).toBe(true));
  expect(rpc.mock.calls.at(-2)?.[1]).toEqual(request); expect(result.current.data?.[0].revision).toBe(3); expect(result.current.data?.[0].decision).toBeNull();
});
it.each([[row({ organization_id: "foreign" })], [row(), row()], null])("fails closed on invalid current decisions", async data => {
  rpc.mockResolvedValueOnce({ data, error: null }); const { result } = setup(); await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeNull();
});
it("does not treat a history error as no history and rejects another requirement's events", async () => {
  const { result } = setup(); await waitFor(() => expect(result.current.data).toEqual([]));
  rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } }); expect(await result.current.loadHistory("charter")).toBeNull();
  rpc.mockResolvedValueOnce({ data: [row({ requirement_id: "license" })], error: null }); expect(await result.current.loadHistory("charter")).toBeNull();
  rpc.mockResolvedValueOnce({ data: [row()], error: null }); expect(await result.current.loadHistory("charter", 2)).toEqual([row()]);
  expect(rpc.mock.lastCall?.[1]).toMatchObject({ p_before_revision: 2, p_limit: 25 });
});
it("does not leak a late current-list response across profiles", async () => {
  let resolve!: (value: any) => void; rpc.mockReturnValueOnce(new Promise(r => { resolve = r; })); const { result, rerender } = setup();
  rerender({ org: "org", revision: 3 }); await waitFor(() => expect(result.current.data).toEqual([]));
  await act(async () => resolve({ data: [row()], error: null })); expect(result.current.data).toEqual([]);
});
