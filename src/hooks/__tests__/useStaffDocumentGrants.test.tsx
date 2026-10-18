import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStaffDocumentGrants } from "../useStaffDocumentGrants";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
const row = (changes = {}) => ({ id: "staff", organization_id: "org", role: "teacher", sections_access: null, ...changes });
const capabilities = { canManage: true, canGrantSign: true, canGrantIssue: true };
const setup = (caps = capabilities) => renderHook(({ org }) => useStaffDocumentGrants(org, "staff", caps), { initialProps: { org: "org" } });
describe("staff document grants", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: row(), error: null }); });
  it("preserves exact NULL CAS and requests independent grants", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: row({ sections_access: ["documents.issue"] }), error: null });
    await act(async () => expect(await result.current.save(false, true)).toBe(true));
    expect(rpc).toHaveBeenLastCalledWith("set_org_staff_document_grants", {
      p_org: "org", p_staff: "staff", p_expected_role: "teacher", p_expected_sections_access: null, p_sign: false, p_issue: true,
    });
  });
  it("passes unrelated JSON values/order unchanged to CAS", async () => {
    const previous = ["courses.write", { legacy: "value" }, "documents.sign"];
    rpc.mockResolvedValueOnce({ data: row({ sections_access: previous }), error: null });
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: row({ sections_access: ["courses.write", { legacy: "value" }, "documents.issue"] }), error: null });
    await act(async () => expect(await result.current.save(false, true)).toBe(true));
    expect(rpc.mock.lastCall?.[1].p_expected_sections_access).toEqual(previous);
  });
  it("staff.write alone cannot add an action grant, but can remove it", async () => {
    rpc.mockResolvedValueOnce({ data: row({ sections_access: ["documents.sign"] }), error: null });
    const { result } = setup({ canManage: true, canGrantSign: false, canGrantIssue: false });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => expect(await result.current.save(true, true)).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValueOnce({ data: row({ sections_access: [] }), error: null });
    await act(async () => expect(await result.current.save(false, false)).toBe(true));
  });
  it.each(["owner", "admin"])("never emulates removing %s role defaults", async role => {
    rpc.mockResolvedValueOnce({ data: row({ role }), error: null });
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => expect(await result.current.save(false, false)).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("role/permissions conflict requires reload and preserves the old snapshot until then", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    await act(async () => expect(await result.current.save(true, false)).toBe(false));
    expect(result.current.needsReload).toBe(true);
    await act(async () => expect(await result.current.save(true, false)).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockResolvedValueOnce({ data: row({ role: "course_editor", sections_access: [] }), error: null });
    await act(async () => { await result.current.reload(); });
    expect(result.current.data?.role).toBe("course_editor");
    expect(result.current.needsReload).toBe(false);
  });
  it("never treats an unmatched response as saved", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    rpc.mockResolvedValueOnce({ data: row({ organization_id: "other", sections_access: ["documents.sign"] }), error: null });
    await act(async () => expect(await result.current.save(true, false)).toBe(false));
    expect(result.current.needsReload).toBe(true);
  });
  it("failed read does not invent empty permissions", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const { result } = setup(); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    await act(async () => expect(await result.current.save(true, true)).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("ignores a late successful save after switching organization", async () => {
    const { result, rerender } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    let resolve!: (value: any) => void;
    rpc.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    let saving!: Promise<boolean>;
    act(() => { saving = result.current.save(true, false); });
    rpc.mockResolvedValueOnce({ data: row({ organization_id: "other" }), error: null });
    rerender({ org: "other" });
    await waitFor(() => expect(result.current.data?.organization_id).toBe("other"));
    await act(async () => { resolve({ data: row({ sections_access: ["documents.sign"] }), error: null }); expect(await saving).toBe(false); });
    expect(result.current.data?.organization_id).toBe("other");
  });
});
