import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: transport.rpc, functions: { invoke: transport.invoke } } }));
import { getRtnWorkspace } from "./rostechnadzor";
const bank = { id: "bank", title: "Технический банк", code: "A.1", domain: "industrial-safety", source_id: "source", source_revision_id: "selected-source-revision", normative_status: "current", normative_cutoff_at: null, can_manual_check: false, available_for_training: true, key_status: "released", release_id: "release", published_at: "2026-11-20T10:00:00Z", last_success_at: "2026-11-19T10:00:00Z", source_acquisition_method: "admin_upload", source_received_at: "2026-11-22T14:01:28Z" };
const workspace = (item: Record<string, unknown>) => ({ access: { allowed: true, can_manage: true, can_assign: true, can_view_results: true, pilot: true }, banks: [item], checks: [], assignments: [], results: [], students: [], groups: [], settings: { notify_updates: true, show_archived_releases: false } });
beforeEach(() => vi.resetAllMocks());
describe("manual original acquisition metadata", () => {
  it("keeps file receipt, real publication and successful automatic check dates independent", async () => {
    transport.rpc.mockResolvedValue({ data: workspace(bank), error: null });
    await expect(getRtnWorkspace("organization")).resolves.toMatchObject({ banks: [{ source_received_at: bank.source_received_at, last_success_at: bank.last_success_at, published_at: bank.published_at }] });
    expect(transport.invoke).not.toHaveBeenCalled();
  });
  it("does not accept an administrator-upload badge without a selected source revision", async () => {
    transport.rpc.mockResolvedValue({ data: workspace({ ...bank, source_revision_id: null }), error: null });
    await expect(getRtnWorkspace("organization")).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("rejects an invented acquisition method or normalized invalid calendar date", async () => {
    transport.rpc.mockResolvedValueOnce({ data: workspace({ ...bank, source_acquisition_method: "always_current" }), error: null });
    await expect(getRtnWorkspace("organization")).rejects.toMatchObject({ code: "invalid_response" });
    transport.rpc.mockResolvedValueOnce({ data: workspace({ ...bank, source_received_at: "2026-02-31T10:00:00Z" }), error: null });
    await expect(getRtnWorkspace("organization")).rejects.toMatchObject({ code: "invalid_response" });
  });
});
