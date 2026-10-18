import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEducationComplianceProfile } from "../useEducationComplianceProfile";
import { createEmptyEducationProfile } from "@/lib/uc-compliance/model";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
const snapshot = (changes = {}) => ({ organization_id: "org", revision: 0, profile: createEmptyEducationProfile(), updated_at: null, updated_by: null, ...changes });
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
const setup = (read = true, write = true) => renderHook(({ org, canRead, canWrite }) => useEducationComplianceProfile(org, canRead, canWrite), { initialProps: { org: "org", canRead: read, canWrite: write } });
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: snapshot(), error: null }); });
describe("education profile persistence", () => {
  it("keeps an absent profile unknown and saves an explicit revision with the same null facts", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data?.revision).toBe(0));
    expect(result.current.data?.profile.license.status).toBeNull(); expect(result.current.data?.profile.educationalActivity).toBeNull();
    rpc.mockResolvedValueOnce({ data: snapshot({ revision: 1 }), error: null });
    await act(async () => expect(await result.current.save(createEmptyEducationProfile())).toBe(true));
    expect(rpc.mock.lastCall?.[1]).toMatchObject({ p_organization_id: "org", p_expected_revision: 0, p_profile: createEmptyEducationProfile(), p_request_id: expect.any(String) });
  });
  it.each([snapshot({ organization_id: "foreign" }), snapshot({ revision: -1 }), snapshot({ profile: { schemaVersion: 1 } }), null])("does not turn an invalid response into a default successful profile", async data => {
    rpc.mockResolvedValueOnce({ data, error: null }); const { result } = setup(); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull(); expect(result.current.error).toBeTruthy();
  });
  it("handles forbidden read separately from an empty profile", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } }); const { result } = setup();
    await waitFor(() => expect(result.current.denied).toBe(true)); expect(result.current.data).toBeNull();
  });
  it("does not fetch without read access and does not save with read-only access", async () => {
    const { result, rerender } = setup(false, false); expect(rpc).not.toHaveBeenCalled();
    rerender({ org: "org", canRead: true, canWrite: false }); await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => expect(await result.current.save(createEmptyEducationProfile())).toBe(false)); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("retries an uncertain commit with the exact request id and rejects changed data until reconciliation", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    const profile = { ...createEmptyEducationProfile(), hasEmployees: true };
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Lost response" } });
    await act(async () => expect(await result.current.save(profile)).toBe(false));
    const request = rpc.mock.lastCall?.[1]; expect(result.current.uncertain).toBe(true); expect(result.current.data?.revision).toBe(0);
    await act(async () => expect(await result.current.save({ ...profile, hasEmployees: false })).toBe(false)); expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockResolvedValueOnce({ data: snapshot({ profile, revision: 1 }), error: null });
    rpc.mockResolvedValueOnce({ data: snapshot({ profile: { ...profile, hasEmployees: false }, revision: 3 }), error: null });
    await act(async () => expect(await result.current.save(profile)).toBe(true)); expect(rpc.mock.calls.at(-2)?.[1]).toEqual(request); expect(result.current.uncertain).toBe(false);
    expect(result.current.data?.revision).toBe(3); expect(result.current.data?.profile.hasEmployees).toBe(false);
  });
  it("requires reload after conflict and uses the authoritative new revision", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } }); await act(async () => expect(await result.current.save(createEmptyEducationProfile())).toBe(false));
    await act(async () => expect(await result.current.save(createEmptyEducationProfile())).toBe(false)); expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockResolvedValueOnce({ data: snapshot({ revision: 7 }), error: null }); await act(async () => { await result.current.reload(); });
    rpc.mockResolvedValueOnce({ data: snapshot({ revision: 8 }), error: null }); await act(async () => expect(await result.current.save(createEmptyEducationProfile())).toBe(true));
    expect(rpc.mock.lastCall?.[1].p_expected_revision).toBe(7);
  });
  it("ignores an old organization's late load", async () => {
    const old = deferred(); rpc.mockReturnValueOnce(old.promise); const { result, rerender } = setup();
    rpc.mockResolvedValueOnce({ data: snapshot({ organization_id: "other" }), error: null }); rerender({ org: "other", canRead: true, canWrite: true });
    await waitFor(() => expect(result.current.data?.organization_id).toBe("other"));
    await act(async () => old.resolve({ data: snapshot({ revision: 99 }), error: null })); expect(result.current.data?.organization_id).toBe("other");
  });
  it("prevents duplicate writes and refuses late success after the organization changes", async () => {
    const { result, rerender } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy()); const old = deferred(); rpc.mockReturnValueOnce(old.promise);
    let pending!: Promise<boolean>; act(() => { pending = result.current.save(createEmptyEducationProfile()); });
    await act(async () => expect(await result.current.save(createEmptyEducationProfile())).toBe(false));
    rpc.mockResolvedValueOnce({ data: snapshot({ organization_id: "other" }), error: null }); rerender({ org: "other", canRead: true, canWrite: true });
    await act(async () => { old.resolve({ data: snapshot({ revision: 1 }), error: null }); expect(await pending).toBe(false); });
    await waitFor(() => expect(result.current.data?.organization_id).toBe("other"));
  });
  it("does not report a mismatched successful save as committed", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: snapshot({ revision: 1 }), error: null });
    await act(async () => expect(await result.current.save({ ...createEmptyEducationProfile(), hasEmployees: true })).toBe(false));
    expect(result.current.uncertain).toBe(true); expect(result.current.data?.revision).toBe(0);
  });
  it("clears current data when replay committed but the authoritative refresh failed", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    await act(async () => { await result.current.save(createEmptyEducationProfile()); });
    rpc.mockResolvedValueOnce({ data: snapshot({ revision: 1 }), error: null }).mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    await act(async () => expect(await result.current.save(createEmptyEducationProfile())).toBe(true));
    expect(result.current.data).toBeNull(); expect(result.current.error).toMatch(/Сохранение подтверждено/); expect(result.current.uncertain).toBe(false);
  });
  it("does not report success when write access is revoked during a request", async () => {
    const { result, rerender } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    const delayed = deferred(); rpc.mockReturnValueOnce(delayed.promise); let pending!: Promise<boolean>;
    act(() => { pending = result.current.save(createEmptyEducationProfile()); });
    rerender({ org: "org", canRead: true, canWrite: false });
    await act(async () => { delayed.resolve({ data: snapshot({ revision: 1 }), error: null }); expect(await pending).toBe(false); });
    expect(result.current.saving).toBe(false); expect(result.current.error).toMatch(/Права изменились/);
  });
  it("loads immutable history in descending pages and rejects foreign or out-of-order snapshots", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: [snapshot({ revision: 3 }), snapshot({ revision: 2 })], error: null });
    expect((await result.current.loadHistory(4))?.map(row => row.revision)).toEqual([3, 2]);
    expect(rpc.mock.lastCall?.[1]).toEqual({ p_organization_id: "org", p_limit: 25, p_before_revision: 4 });
    rpc.mockResolvedValueOnce({ data: [snapshot({ organization_id: "foreign", revision: 1 })], error: null }); expect(await result.current.loadHistory()).toBeNull();
    rpc.mockResolvedValueOnce({ data: [snapshot({ revision: 2 }), snapshot({ revision: 3 })], error: null }); expect(await result.current.loadHistory()).toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } }); expect(await result.current.loadHistory()).toBeNull();
  });
});
