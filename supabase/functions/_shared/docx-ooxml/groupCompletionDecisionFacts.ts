import { buildGroupDocumentFactRows, type GroupDocumentFactsSnapshot, type GroupDocumentFactsResult } from "./groupDocumentFacts.ts";
import { type GroupAttestationFactsResult } from "./groupAttestationFacts.ts";
import { parseGroupCompletionContext, isCurrentCompletionDecision, type GroupCompletionDecision } from "./groupCompletionDecisions.ts";

export interface CompletionDecisionSource {
  userId: string; enrollmentId: string; decisionId: string; decisionRevision: number;
  enrollmentFactsRevision: string; confirmedBy: string; confirmedAt: string;
  issuanceDecision: "with_document" | "without_document";
}
export interface ConfirmedExpulsionFacts extends GroupDocumentFactsResult {
  rowsBySource: Record<"expulsion_with_issuance" | "expulsion_without_issuance", Array<Record<string, string>>>;
  decisionSources: CompletionDecisionSource[];
  decisionCoverage: { total: number; confirmed: number; omitted: Array<{ userId: string; fullName: string }> };
}
export interface ConfirmedAttestationFacts extends GroupAttestationFactsResult { decisionSources: CompletionDecisionSource[] }
/** All data here comes from the caller-scoped SQL snapshot. Browser HTML is never an authority. */
export function applyGroupCompletionDecisions(input: {
  snapshot: GroupDocumentFactsSnapshot; context: unknown; attestation: GroupAttestationFactsResult;
  expulsionFillMode: "blank" | "data"; attestationFillMode: "blank" | "data";
}): { expulsion: ConfirmedExpulsionFacts; attestation: ConfirmedAttestationFacts } {
  const { snapshot } = input;
  const expulsion: ConfirmedExpulsionFacts = {
    ...buildGroupDocumentFactRows({ docType: "expulsion_order", snapshot }),
    rowsBySource: { expulsion_with_issuance: [], expulsion_without_issuance: [] }, decisionSources: [],
    decisionCoverage: { total: snapshot.profiles.filter(profile => profile.archived_at === null).length, confirmed: 0, omitted: [] },
  };
  const attestation: ConfirmedAttestationFacts = {
    ...input.attestation, rows: input.attestation.rows.map(row => ({ ...row })),
    issues: [...input.attestation.issues], rowSources: input.attestation.rowSources.map(row => ({ ...row })), decisionSources: [],
  };
  const result = { expulsion, attestation };
  if (input.expulsionFillMode === "blank" && input.attestationFillMode === "blank") return result;
  const unavailable = (message: string) => {
    if (input.expulsionFillMode === "data") expulsion.issues.push({ docType: "expulsion_order", code: "completion_decisions_unavailable", field: "group_completion_decisions", message, severity: "warning" });
    if (input.attestationFillMode === "data") attestation.issues.push({ docType: "attestation_sheet", code: "completion_decisions_unavailable", field: "group_completion_decisions", message, severity: "warning" });
    return result;
  };
  if (input.context === null) return unavailable("Итоговые решения пока недоступны. Откройте «Итоговые решения» в документах группы; оценки и списки выдачи не определяются по процентам теста.");
  let context;
  try { context = parseGroupCompletionContext(input.context, { organizationId: snapshot.organization.id, groupId: snapshot.group.id }); }
  catch { return unavailable("Не удалось подтвердить источник итоговых решений этой группы. Перечитайте группу перед формированием документов."); }
  const profiles = snapshot.profiles.filter(profile => profile.archived_at === null);
  if (context.group.course_id !== snapshot.group.course_id || context.group.start_date !== snapshot.group.start_date || context.group.end_date !== snapshot.group.end_date
    || profiles.length !== context.students.length || new Set(profiles.map(profile => profile.user_id)).size !== profiles.length
    || profiles.some(profile => profile.organization_id !== snapshot.organization.id || profile.student_group_id !== snapshot.group.id
      || !context.students.some(student => student.user_id === profile.user_id && student.full_name === profile.full_name))) {
    return unavailable("Состав, ФИО, курс или период изменились во время формирования. Обновите группу; старые решения не подставлены.");
  }
  const roster = buildGroupDocumentFactRows({ docType: "enrollment_order", snapshot });
  expulsion.issues.push(...roster.issues.filter(issue => !expulsion.issues.some(prior => prior.code === issue.code && prior.field === issue.field && prior.userId === issue.userId))
    .map(issue => ({ ...issue, docType: "expulsion_order" as const })));
  const accepted = new Map<string, GroupCompletionDecision>();
  for (const student of context.students) {
    const enrollment = student.enrollments.length === 1 ? student.enrollments[0] : null;
    const stored = snapshot.enrollments.filter(row => row.user_id === student.user_id && row.course_id === snapshot.group.course_id);
    if (student.decision && enrollment && student.full_name?.trim() && stored.length === 1 && stored[0].id === enrollment.id && stored[0].status === enrollment.status
      && stored[0].progress === enrollment.progress && stored[0].completed_at === enrollment.completed_at
      && stored[0].started_at === enrollment.started_at && stored[0].document_facts_revision === enrollment.document_facts_revision
      && isCurrentCompletionDecision(student.decision, context, student)) accepted.set(student.user_id, student.decision);
  }
  const source = (decision: GroupCompletionDecision): CompletionDecisionSource => ({
    userId: decision.user_id, enrollmentId: decision.enrollment_id, decisionId: decision.id, decisionRevision: decision.revision,
    enrollmentFactsRevision: decision.enrollment_facts_revision, confirmedBy: decision.confirmed_by, confirmedAt: decision.confirmed_at,
    issuanceDecision: decision.issuance_decision,
  });
  if (input.expulsionFillMode === "data") {
    // Preserve the client's blank 'Основание': optional protocol details are audit data, not an instruction to alter that field.
    roster.rowSources.forEach((rowSource, index) => {
      const decision = accepted.get(rowSource.userId);
      if (!decision || rowSource.enrollmentId !== decision.enrollment_id) return;
      const key = decision.issuance_decision === "with_document" ? "expulsion_with_issuance" : "expulsion_without_issuance";
      const rows = expulsion.rowsBySource[key];
      rows.push({ ...roster.rows[index], N: String(rows.length + 1) });
      expulsion.rowSources.push(rowSource); expulsion.decisionSources.push(source(decision));
    });
    if (expulsion.decisionSources.length) expulsion.issues = expulsion.issues.filter(issue => issue.code !== "expulsion_classification_not_confirmed");
    // Common rows deliberately stays empty. Only separately addressed original tables may contain a learner.
    expulsion.decisionCoverage.confirmed = expulsion.decisionSources.length;
    for (const student of context.students) if (!accepted.has(student.user_id)) {
      expulsion.decisionCoverage.omitted.push({ userId: student.user_id, fullName: student.full_name || "" });
      expulsion.issues.push({
      docType: "expulsion_order", code: "completion_decision_missing_or_stale", field: "group_completion_decisions", userId: student.user_id,
      message: `${student.full_name?.trim() || `Участник ${student.user_id}`}: нет актуального подтверждённого решения или полного ФИО. Не включён ни в список «с выдачей», ни в список «без выдачи»; откройте итоговые решения группы.`, severity: "warning",
    }); }
  }
  if (input.attestationFillMode === "data") {
    attestation.rowSources.forEach((rowSource, index) => {
      const decision = accepted.get(rowSource.userId);
      if (decision && rowSource.enrollmentId === decision.enrollment_id) {
        attestation.rows[index].GRADE = decision.grade_text; attestation.decisionSources.push(source(decision));
      }
    });
    if (attestation.decisionSources.length) {
      attestation.issues = attestation.issues.filter(issue => issue.code !== "grading_policy_missing");
      // A missing online attempt leaves only the percentage blank; explicitly entered grades are independent.
      attestation.issues = attestation.issues.map(issue => issue.code === "missing_final_test" ? { ...issue, message: "В курсе нет подтверждённого онлайн-теста; процент оставлен пустым. Оценка берётся только из отдельно подтверждённого итогового решения." } : issue);
      attestation.rowSources.forEach((rowSource, index) => {
        if (!attestation.rows[index].GRADE) attestation.issues.push({ docType: "attestation_sheet", code: "completion_grade_missing", field: "GRADE", userId: rowSource.userId,
          message: "Итоговая оценка участника не подтверждена для текущего обучения. Заполните итоговое решение в документах группы.", severity: "warning" });
      });
    }
  }
  return result;
}
