import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStaffDocumentScope } from "../useStaffDocumentScope";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
const scope = (changes = {}) => ({ organization_id: "org", staff_id: "staff", revision: 0,
  scope: "assigned_groups", group_ids: [], available_groups: [{ id: "g1", name: "Первая" }, { id: "g2", name: "Вторая" }], ...changes });
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
const setup = (canWrite = true) => renderHook(({ org, staff }) => useStaffDocumentScope(org, staff, canWrite), { initialProps: { org: "org", staff: "staff" as string | null } });

describe("staff document scope", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: scope(), error: null }); });
  it("loads empty assignments as an explicit scope and saves the exact deduplicated set with revision", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data?.group_ids).toEqual([]));
    rpc.mockResolvedValueOnce({ data: scope({ revision: 1, group_ids: ["g1", "g2"] }), error: null });
    let saved = false;
    await act(async () => { saved = await result.current.save(["g2", "g1", "g1"]); });
    expect(saved).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("set_org_staff_document_groups", {
      p_organization_id: "org", p_staff_id: "staff", p_group_ids: ["g1", "g2"], p_expected_revision: 0,
    });
    expect(result.current.data?.revision).toBe(1);
  });
  it.each([null, scope({ organization_id: "other" }), scope({ group_ids: ["foreign"] }), scope({ revision: -1 })])("fails closed on invalid data %j", async data => {
    rpc.mockResolvedValueOnce({ data, error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
    await act(async () => expect(await result.current.save([])).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not mistake an access error for an empty assignment list", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const { result } = setup();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeNull();
  });
  it("read-only access never invokes the setter", async () => {
    const { result } = setup(false);
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => expect(await result.current.save(["g1"])).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects groups absent from the server list", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => expect(await result.current.save(["foreign"])).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("requires a fresh load after CAS conflict and then uses the new revision", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    await act(async () => expect(await result.current.save(["g1"])).toBe(false));
    expect(result.current.conflict).toBe(true);
    await act(async () => expect(await result.current.save(["g1"])).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockResolvedValueOnce({ data: scope({ revision: 4, group_ids: ["g2"] }), error: null });
    await act(async () => { await result.current.reload(); });
    expect(result.current.conflict).toBe(false);
    rpc.mockResolvedValueOnce({ data: scope({ revision: 5, group_ids: [] }), error: null });
    await act(async () => expect(await result.current.save([])).toBe(true));
    expect(rpc.mock.lastCall?.[1].p_expected_revision).toBe(4);
  });
  it("keeps a failed save unsaved and prevents a rapid duplicate mutation", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const pending = deferred(); rpc.mockReturnValueOnce(pending.promise);
    let first!: Promise<boolean>;
    act(() => { first = result.current.save(["g1"]); });
    await act(async () => expect(await result.current.save(["g2"])).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(2);
    await act(async () => { pending.resolve({ data: null, error: { message: "timeout" } }); expect(await first).toBe(false); });
    expect(result.current.data?.group_ids).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });
  it("ignores a late load from a previous organization/staff", async () => {
    const pending = deferred(); rpc.mockReturnValueOnce(pending.promise);
    const { result, rerender } = setup();
    rpc.mockResolvedValueOnce({ data: scope({ organization_id: "other", staff_id: "other-staff" }), error: null });
    rerender({ org: "other", staff: "other-staff" });
    await waitFor(() => expect(result.current.data?.organization_id).toBe("other"));
    await act(async () => { pending.resolve({ data: scope({ group_ids: ["g1"] }), error: null }); });
    expect(result.current.data?.staff_id).toBe("other-staff");
  });
  it("cannot report success from a save after the dialog closed", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const pending = deferred(); rpc.mockReturnValueOnce(pending.promise);
    let save!: Promise<boolean>;
    act(() => { save = result.current.save(["g1"]); });
    rerender({ org: "org", staff: null });
    await act(async () => { pending.resolve({ data: scope({ revision: 1, group_ids: ["g1"] }), error: null }); expect(await save).toBe(false); });
    expect(result.current.data).toBeNull();
  });
});
