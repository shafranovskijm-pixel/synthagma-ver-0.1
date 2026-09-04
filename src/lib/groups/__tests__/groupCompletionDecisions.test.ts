import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  completionEnrollment, fetchGroupCompletionDecisions, isCurrentCompletionDecision, saveGroupCompletionDecision,
  type GroupCompletionContext, type GroupCompletionDecision, type GroupCompletionDecisionsClient, type SaveCompletionDecision,
} from "../groupCompletionDecisions";

const ORG = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const GROUP = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-000000000003";
const COURSE = "00000000-0000-4000-8000-000000000004";
const ENROLLMENT = "00000000-0000-4000-8000-000000000005";
const ACTOR = "00000000-0000-4000-8000-000000000006";
const DECISION = "00000000-0000-4000-8000-000000000007";
const OTHER = "00000000-0000-4000-8000-000000000099";
const scope = { organizationId: ORG, groupId: GROUP };
function context(): GroupCompletionContext {
  return { organization_id: ORG, can_manage: true,
    group: { id: GROUP, organization_id: ORG, course_id: COURSE, name: "Тестовая группа", start_date: "2026-09-01", end_date: "2026-09-04" },
    students: [{ user_id: USER, full_name: "Тестовый Ученик", decision: null, enrollments: [
      { id: ENROLLMENT, user_id: USER, course_id: COURSE, status: "completed", progress: 100, started_at: "2026-09-01T09:00:00Z", completed_at: "2026-09-04T09:00:00Z", document_facts_revision: "3" },
    ] }],
  };
}
function decision(): GroupCompletionDecision {
  return { id: DECISION, organization_id: ORG, group_id: GROUP, user_id: USER, enrollment_id: ENROLLMENT, enrollment_facts_revision: "3", course_id: COURSE,
    group_start_date: "2026-09-01", group_end_date: "2026-09-04", grade_text: "Зачтено", issuance_decision: "with_document", protocol_number: null, protocol_date: null, decision_note: null,
    revision: 1, confirmed_by: ACTOR, confirmed_at: "2026-09-04T10:00:00Z" };
}
function input(source = context()): SaveCompletionDecision {
  return { ...scope, actorId: ACTOR, context: source, userId: USER, gradeText: "Зачтено", issuanceDecision: "with_document", protocolNumber: null, protocolDate: null, decisionNote: null };
}
function fixture() {
  const state = { context: context(), readError: null as unknown, writeError: null as unknown };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "read_group_completion_decisions") return { data: structuredClone(state.context) as unknown, error: state.readError };
    const saved: GroupCompletionDecision = { ...decision(), revision: (state.context.students[0].decision?.revision ?? 0) + 1,
      grade_text: String(args.p_grade_text), issuance_decision: args.p_issuance_decision as GroupCompletionDecision["issuance_decision"],
      protocol_number: args.p_protocol_number as string | null, protocol_date: args.p_protocol_date as string | null, decision_note: args.p_decision_note as string | null };
    if (!state.writeError) state.context.students[0].decision = saved;
    return { data: saved as unknown, error: state.writeError };
  });
  return { state, rpc, client: { rpc } as GroupCompletionDecisionsClient };
}

describe("group completion decisions scoped RPC client", () => {
  it("reads the exact organization and group via one RPC, with no other data API", async () => {
    const f = fixture(); expect(await fetchGroupCompletionDecisions(scope, f.client)).toEqual(context());
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("read_group_completion_decisions", { p_organization_id: ORG, p_group_id: GROUP });
  });
  it.each(["organization", "group", "user", "duplicate", "revision", "decision"])("rejects malformed or foreign %s read data", async kind => {
    const f = fixture();
    if (kind === "organization") f.state.context.organization_id = OTHER;
    if (kind === "group") f.state.context.group.id = OTHER;
    if (kind === "user") f.state.context.students[0].enrollments[0].user_id = OTHER;
    if (kind === "duplicate") f.state.context.students.push(f.state.context.students[0]);
    if (kind === "revision") f.state.context.students[0].enrollments[0].document_facts_revision = "1.3";
    if (kind === "decision") f.state.context.students[0].decision = { ...decision(), user_id: OTHER };
    await expect(fetchGroupCompletionDecisions(scope, f.client)).rejects.toThrow(/Не удалось подтвердить/);
  });
  it.each(["42P01", "42883", "PGRST202", "PGRST205"])("reports missing server migration %s honestly as Beta", async code => {
    const f = fixture(); f.state.readError = { code };
    await expect(fetchGroupCompletionDecisions(scope, f.client)).rejects.toThrow(/Бета.*обновление не установлено/);
  });
  it("accepts an empty or course-less read context without inventing a requirement", async () => {
    const f = fixture(); f.state.context.group.course_id = null; f.state.context.students = [];
    expect((await fetchGroupCompletionDecisions(scope, f.client)).students).toEqual([]);
  });
  it.each(["with_document", "without_document"] as const)("persists an explicit %s decision and rereads all exact fields", async issuanceDecision => {
    const f = fixture(); const value = { ...input(), issuanceDecision, gradeText: "  Не зачтено  ", protocolNumber: " № 9 ", protocolDate: "2026-09-04", decisionNote: " Решение комиссии " };
    const fresh = await saveGroupCompletionDecision(value, f.client);
    expect(fresh.students[0].decision).toMatchObject({ grade_text: "Не зачтено", issuance_decision: issuanceDecision, protocol_number: "№ 9", protocol_date: "2026-09-04", decision_note: "Решение комиссии" });
    expect(f.rpc.mock.calls.map(call => call[0])).toEqual(["save_group_completion_decision", "read_group_completion_decisions"]);
    expect(f.rpc.mock.calls[0][1]).toEqual({ p_organization_id: ORG, p_group_id: GROUP, p_user_id: USER, p_expected_enrollment_id: ENROLLMENT,
      p_expected_enrollment_revision: "3", p_expected_course_id: COURSE, p_expected_start_date: "2026-09-01", p_expected_end_date: "2026-09-04", p_expected_decision_revision: null,
      p_grade_text: "Не зачтено", p_issuance_decision: issuanceDecision, p_protocol_number: "№ 9", p_protocol_date: "2026-09-04", p_decision_note: "Решение комиссии" });
  });
  it("retains an old decision for inspection but replaces it only through its current CAS revision", async () => {
    const f = fixture(); f.state.context.students[0].decision = { ...decision(), revision: 4, enrollment_facts_revision: "2", issuance_decision: "without_document" };
    const source = await fetchGroupCompletionDecisions(scope, f.client);
    expect(isCurrentCompletionDecision(source.students[0].decision!, source, source.students[0])).toBe(false);
    const fresh = await saveGroupCompletionDecision(input(source), f.client);
    expect(f.rpc.mock.calls[1][1].p_expected_decision_revision).toBe(4);
    expect(fresh.students[0].decision?.revision).toBe(5);
  });
  it.each(["readonly", "missing", "multiple", "inactive", "course", "actor", "blank", "long", "control", "outcome", "date", "protocol", "note"])("blocks %s without issuing a mutation", async kind => {
    const f = fixture(), value = input();
    if (kind === "readonly") value.context.can_manage = false;
    if (kind === "missing") value.context.students[0].enrollments = [];
    if (kind === "multiple") value.context.students[0].enrollments.push({ ...value.context.students[0].enrollments[0], id: OTHER });
    if (kind === "inactive") value.context.students[0].enrollments[0].status = "cancelled";
    if (kind === "course") { value.context.group.course_id = null; value.context.students[0].enrollments = []; }
    if (kind === "actor") value.actorId = "";
    if (kind === "blank") value.gradeText = "  ";
    if (kind === "long") value.gradeText = "A".repeat(101);
    if (kind === "control") value.gradeText = "A\u0000";
    if (kind === "outcome") value.issuanceDecision = "" as typeof value.issuanceDecision;
    if (kind === "date") value.protocolDate = "2026-02-30";
    if (kind === "protocol") value.protocolNumber = "A".repeat(201);
    if (kind === "note") value.decisionNote = "A".repeat(1001);
    await expect(saveGroupCompletionDecision(value, f.client)).rejects.toThrow(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("counts Unicode codepoints, not UTF-16 units, and does not impose a numeric scale", async () => {
    const f = fixture();
    const fresh = await saveGroupCompletionDecision({ ...input(), gradeText: "✅".repeat(100) }, f.client);
    expect(fresh.students[0].decision?.grade_text).toHaveLength(100);
    const g = fixture(); await expect(saveGroupCompletionDecision({ ...input(), gradeText: "😀".repeat(100) }, g.client)).resolves.toBeDefined();
  });
  it.each(["error", "network", "malformed", "revision", "actor", "id", "fields", "context"])("requires reload without an automatic retry after uncertain %s save", async kind => {
    const f = fixture(), value = input();
    if (kind === "error") f.state.writeError = { code: "40001" };
    else if (kind === "network") f.rpc.mockRejectedValueOnce(new Error("Offline"));
    else {
      if (kind === "id") { value.context.students[0].decision = decision(); f.state.context.students[0].decision = decision(); }
      const saved = { ...decision(), ...(kind === "revision" ? { revision: 5 } : {}), ...(kind === "actor" ? { confirmed_by: OTHER } : {}),
        ...(kind === "id" ? { id: OTHER, revision: 2 } : {}), ...(kind === "fields" ? { issuance_decision: "without_document" as const } : {}),
        ...(kind === "context" ? { enrollment_facts_revision: "2" } : {}) };
      f.rpc.mockResolvedValueOnce({ data: kind === "malformed" ? null : saved, error: null });
    }
    await expect(saveGroupCompletionDecision(value, f.client)).rejects.toMatchObject({ requiresReload: true });
    expect(f.rpc).toHaveBeenCalledOnce();
  });
  it.each(["missing", "grade", "revision", "enrollment", "dates", "permission", "network"])("does not claim success when readback %s disagrees with persistence reply", async kind => {
    const f = fixture(); const after = context(); after.students[0].decision = decision();
    if (kind === "missing") after.students[0].decision = null;
    if (kind === "grade") after.students[0].decision!.grade_text = "Иная оценка";
    if (kind === "revision") after.students[0].decision!.revision = 2;
    if (kind === "enrollment") after.students[0].enrollments[0].document_facts_revision = "4";
    if (kind === "dates") after.group.end_date = "2026-09-05";
    if (kind === "permission") after.can_manage = false;
    f.rpc.mockResolvedValueOnce({ data: decision(), error: null });
    if (kind === "network") f.rpc.mockRejectedValueOnce(new Error("Offline")); else f.rpc.mockResolvedValueOnce({ data: after, error: null });
    await expect(saveGroupCompletionDecision(input(), f.client)).rejects.toMatchObject({ requiresReload: true });
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it("does not prefer a completed enrollment over a second active enrollment", () => {
    const c = context(); c.students[0].enrollments.push({ ...c.students[0].enrollments[0], id: OTHER, status: "active" });
    expect(completionEnrollment(c.students[0], c)).toBeNull();
  });
});
