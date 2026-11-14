import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: transport.rpc, functions: { invoke: transport.invoke } } }));
import { assignRtnTraining, checkRtnSource, getRtnAssignment, getRtnAttempt, getRtnStudentWorkspace, getRtnWorkspace, saveRtnSettings, startRtnAttempt, submitRtnAttempt } from "./rostechnadzor";

beforeEach(() => vi.resetAllMocks());
describe("RTN API boundaries", () => {
  it("fails closed instead of granting access for a malformed success payload", async () => {
    transport.rpc.mockResolvedValue({ data: { access: { allowed: true }, banks: [] }, error: null });
    await expect(getRtnWorkspace("tenant-a")).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("keeps authorization errors distinct from network errors", async () => {
    transport.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "staff guard" } });
    await expect(getRtnWorkspace("tenant-a")).rejects.toMatchObject({ code: "forbidden" });
    transport.rpc.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(getRtnWorkspace("tenant-a")).rejects.toMatchObject({ code: "network" });
  });
  it("keeps the catalog usable when an existing student profile has no full name", async () => {
    transport.rpc.mockResolvedValue({ data: {
      access: { allowed: true, can_manage: true, can_assign: true, can_view_results: true, pilot: true, reason: "included" },
      banks: [], checks: [], assignments: [], results: [], groups: [],
      settings: { notify_updates: true, show_archived_releases: false },
      students: [{ id: "profile-a", user_id: "user-a", full_name: null }],
    }, error: null });
    await expect(getRtnWorkspace("tenant-a")).resolves.toMatchObject({ students: [{ id: "profile-a", full_name: "Ученик без ФИО" }] });
  });
  it("invokes one Edge check without also creating a duplicate RPC queue job", async () => {
    transport.invoke.mockResolvedValue({ data: { run_id: "run-1", status: "queued" }, error: null });
    await expect(checkRtnSource("tenant-a", "source-a")).resolves.toMatchObject({ status: "queued" });
    expect(transport.invoke).toHaveBeenCalledWith("rtn-source-check", { body: { organizationId: "tenant-a", sourceId: "source-a" } });
    expect(transport.rpc).not.toHaveBeenCalled();
  });
  it("does not invent success when the source worker fails or omits its run", async () => {
    transport.invoke.mockResolvedValueOnce({ data: { run_id: "run-1", status: "error", error: "TLS" }, error: null });
    await expect(checkRtnSource("tenant-a", "source-a")).resolves.toMatchObject({ status: "error" });
    transport.invoke.mockResolvedValueOnce({ data: { status: "unchanged" }, error: null });
    await expect(checkRtnSource("tenant-a", "source-a")).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("passes the explicit tenant and profile identifiers to assignment guards", async () => {
    transport.rpc.mockResolvedValue({ data: { assignments: [], replayed: true }, error: null });
    await assignRtnTraining({ organizationId: "tenant-a", bankId: "bank-a", studentIds: ["profile-a"], groupId: null });
    expect(transport.rpc).toHaveBeenCalledWith("assign_rtn_training", { p_organization_id: "tenant-a", p_bank_id: "bank-a", p_student_ids: ["profile-a"], p_group_id: null });
  });
  it("rejects ambiguous settings writes rather than reporting them saved", async () => {
    transport.rpc.mockResolvedValue({ data: { notify_updates: true }, error: null });
    await expect(saveRtnSettings("tenant-a", { notify_updates: true, show_archived_releases: false })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("loads learner assignments for the actual authenticated session without user impersonation arguments", async () => {
    transport.rpc.mockResolvedValue({ data: { access: { allowed: true }, assignments: [] }, error: null });
    await expect(getRtnStudentWorkspace()).resolves.toEqual({ access: { allowed: true }, assignments: [] });
    expect(transport.rpc).toHaveBeenCalledWith("get_rtn_student_workspace", {});
  });

  it("requires real course material before learner introduction is rendered", async () => {
    transport.rpc.mockResolvedValue({ data: { assignment: { id: "assignment-a" }, release: { id: "release-a", question_count: 2 }, source: { page_url: "https://www.gosnadzor.ru/", document_url: "https://www.gosnadzor.ru/test.pdf" }, materials: [{ title: "Unsupported partial section" }] }, error: null });
    await expect(getRtnAssignment("assignment-a")).rejects.toMatchObject({ code: "invalid_response" });
    expect(transport.rpc).toHaveBeenCalledWith("get_rtn_assignment", { p_assignment_id: "assignment-a" });
  });

  it("rejects an accidental answer-key leak in an active learner payload", async () => {
    transport.rpc.mockResolvedValue({ data: { attempt_id: "attempt-a", release_id: "release-a", status: "active", questions: [{ id: "q1", text: "Question", options: [{ id: "a", text: "Option" }], correct_option_ids: ["a"] }] }, error: null });
    await expect(startRtnAttempt("assignment-a")).rejects.toMatchObject({ code: "invalid_response" });
    transport.rpc.mockResolvedValue({ data: { attempt_id: "attempt-a", release_id: "release-a", status: "active", questions: [{ id: "q1", text: "Question", options: [{ id: "a", text: "Option" }] }], feedback: [{ id: "q1", evidence: [] }] }, error: null });
    await expect(getRtnAttempt("attempt-a")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("submits question and option identifiers without client-derived marks", async () => {
    transport.rpc.mockResolvedValue({ data: { attempt_id: "attempt-a", release_id: "release-a", status: "submitted", score: 50, correct: 1, total: 2, passed: false, submitted_at: "2026-11-14T10:00:00Z" }, error: null });
    await expect(submitRtnAttempt("attempt-a", { q1: ["a", "b"], q2: ["c"] })).resolves.toMatchObject({ score: 50, passed: false });
    expect(transport.rpc).toHaveBeenCalledWith("submit_rtn_attempt", { p_attempt_id: "attempt-a", p_answers: { q1: ["a", "b"], q2: ["c"] } });
  });
});
