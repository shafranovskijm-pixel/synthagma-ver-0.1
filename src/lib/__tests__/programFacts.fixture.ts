import { emptyProgramFacts, type ProgramEnvelope, type ProgramCandidates, type GroupProgramFacts } from "../programFacts";
export const pfId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const pfOrg = pfId(1), pfProgram = pfId(2), pfVersion = pfId(3), pfCourse = pfId(4), pfGroup = pfId(5), pfEnrollment = pfId(6), pfUser = pfId(7);
export function programFixture(): ProgramEnvelope {
  const facts = { ...emptyProgramFacts(), full_title: "QA программа", program_type: "dpo_upskilling" as const, academic_hours: 72,
    training_form: "part_time" as const, duration_calendar: "Две недели", attestation_form: "Тест", attestation_criteria: "Не менее 80%" };
  const v = { id: pfVersion, organization_id: pfOrg, program_id: pfProgram, version_number: 1, revision: 3, state: "approved" as const,
    file_document_id: pfId(8), file_version_id: pfId(9), file_review_id: pfId(10), file_approval: { number: "QA-1", date: "2026-10-18", recorded_at: "2026-10-18T01:00:00Z", recorded_by: pfId(11) },
    facts, facts_hash: "a".repeat(64), reviewer_user_id: pfId(11), reviewer_name: "QA reviewer", created_by: pfId(12), created_by_name: "QA author", created_at: "2026-10-18T01:00:00Z",
    approved_at: "2026-10-18T02:00:00Z", approved_by: pfId(11), note: null };
  return { program: { id: pfProgram, organization_id: pfOrg, name: "QA программа", description: null, revision: 3 },
    current_version: v, versions: [v], capabilities: { can_create_version: true, can_submit: false, can_approve: false, can_reject: false, can_cancel: false } };
}
export function programCandidatesFixture(): ProgramCandidates {
  const v = programFixture().current_version!;
  return { files: [{ document_id: v.file_document_id, version_id: v.file_version_id, review_id: v.file_review_id, document_name: "QA документ", version_number: 1, approval: v.file_approval }],
    reviewers: [{ user_id: v.reviewer_user_id, display_name: v.reviewer_name }], courses: [{ id: pfCourse, title: "QA курс" }], groups: [{ id: pfGroup, name: "QA группа", course_id: pfCourse }] };
}
export function courseBindingFixture() {
  return { revision: 1, binding: { course_id: pfCourse, organization_id: pfOrg, revision: 1, version_id: pfVersion, program_id: pfProgram,
    recorded_at: "2026-10-18T03:00:00Z", recorded_by: pfId(12) }, version: programFixture().current_version };
}
export function groupFactsFixture(): GroupProgramFacts {
  const v = programFixture().current_version!;
  const g = { name: "QA группа", start_date: "2026-10-18", end_date: "2026-11-01", training_dates: null, schedule_text: null, instructor_name: null };
  const b = { id: pfId(13), organization_id: pfOrg, group_id: pfGroup, course_id: pfCourse, revision: 1, version_id: pfVersion, program_id: pfProgram,
    program_snapshot: v, group_snapshot: g, snapshot_hash: "b".repeat(64), recorded_at: "2026-10-18T03:00:00Z", recorded_by: pfId(12) };
  const s = { id: pfId(14), organization_id: pfOrg, group_id: pfGroup, course_id: pfCourse, enrollment_id: pfEnrollment, user_id: pfUser,
    binding_id: b.id, binding_revision: 1, version_id: pfVersion, program_snapshot: v, group_snapshot: g, snapshot_hash: "c".repeat(64),
    source: "confirmed_existing_association" as const, recorded_at: "2026-10-18T04:00:00Z", recorded_by: pfId(12), legal_enrollment_date: null };
  return { state: "confirmed", reason: null, group_id: pfGroup, course_id: pfCourse, enrollment_id: pfEnrollment, revision: 1, binding: b, snapshot: s,
    enrollments: [{ enrollment_id: pfEnrollment, user_id: pfUser, snapshot_id: s.id, state: "confirmed" }], capabilities: { can_bind: false, can_confirm_existing: true } };
}
