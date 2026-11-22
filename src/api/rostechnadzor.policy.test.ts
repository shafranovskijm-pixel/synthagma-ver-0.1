import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: transport.rpc, functions: { invoke: transport.invoke } } }));
import { checkRtnSource, getRtnWorkspace, startRtnAttempt } from "./rostechnadzor";
const bank = { id: "bank", title: "Технический банк", code: "A.1", domain: "industrial-safety", source_id: "source", normative_status: "current", normative_cutoff_at: null,
  can_manual_check: false, available_for_training: true, key_status: "released", release_id: "release", published_at: "2026-11-20T10:00:00Z",
  active_release: { release_id: "release", published_at: "2026-11-20T10:00:00Z" },
  approval_policy: "source-tracked-v2", legal_validity: "no_declared_cutoff_reviewed", legal_cutoff_at: null, editorial_review_before: "2026-11-21", editorial_status: "due", key_reviewed_at: "2026-11-20T09:00:00Z", admission_reason: "ready", next_check_after: "2026-11-22T16:00:00Z" };
const workspace = (item: Record<string, unknown>) => ({ access: { allowed: true, can_manage: true, can_assign: true, can_view_results: true, pilot: true }, banks: [item], checks: [], assignments: [], results: [], students: [], groups: [], settings: { notify_updates: true, show_archived_releases: false } });
beforeEach(() => vi.resetAllMocks());
describe("question-first metadata and source backoff boundary", () => {
  it("accepts a due routine review without converting it into a legal expiry or changing real release dates", async () => {
    transport.rpc.mockResolvedValue({ data: workspace(bank), error: null });
    await expect(getRtnWorkspace("org")).resolves.toMatchObject({ banks: [{ normative_status: "current", editorial_status: "due", legal_cutoff_at: null, published_at: bank.published_at }] });
  });
  it("rejects an updated date attached to another or contradictory current release", async () => {
    transport.rpc.mockResolvedValueOnce({ data: workspace({ ...bank, active_release: { ...bank.active_release, release_id: "future-release" } }), error: null });
    await expect(getRtnWorkspace("org")).rejects.toMatchObject({ code: "invalid_response" });
    transport.rpc.mockResolvedValueOnce({ data: workspace({ ...bank, active_release: { ...bank.active_release, published_at: "2026-12-01T10:00:00Z" } }), error: null });
    await expect(getRtnWorkspace("org")).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("rejects invented policy states and malformed retry dates", async () => {
    transport.rpc.mockResolvedValue({ data: workspace({ ...bank, legal_validity: "unlimited" }), error: null });
    await expect(getRtnWorkspace("org")).rejects.toMatchObject({ code: "invalid_response" });
    transport.invoke.mockResolvedValue({ data: { run_id: "real-failed-run", status: "error", retry_after: "tomorrow", can_manual_check: false }, error: null });
    await expect(checkRtnSource("org", "source")).rejects.toMatchObject({ code: "invalid_response" });
    transport.invoke.mockResolvedValue({ data: { run_id: "real-failed-run", status: "error", retry_after: "2026-02-31T10:00:00Z", can_manual_check: false }, error: null });
    await expect(checkRtnSource("org", "source")).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("keeps a terminal error replay and deadline rather than reporting or invoking a fresh successful check", async () => {
    transport.invoke.mockResolvedValue({ data: { run_id: "real-failed-run", status: "error", replayed: true, retry_after: "2026-11-22T16:00:00Z", can_manual_check: false }, error: null });
    await expect(checkRtnSource("org", "source")).resolves.toMatchObject({ run_id: "real-failed-run", status: "error", replayed: true, can_manual_check: false });
    expect(transport.invoke).toHaveBeenCalledTimes(1); expect(transport.rpc).not.toHaveBeenCalled();
  });
  it("explains a true normative cutoff separately from the routine review date", async () => {
    transport.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "rtn_normative_review_required", details: "legal_limit_reached" } });
    await expect(startRtnAttempt("assignment")).rejects.toMatchObject({ message: expect.stringContaining("Нормативный срок этой редакции истёк") });
  });
});
