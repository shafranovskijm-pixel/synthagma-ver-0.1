import { emptyProgramFacts, type ProgramVersion, type ProgramEnvelope, type GroupProgramFacts } from "@/lib/programFacts";
export const ids = { org: "11111111-1111-4111-8111-111111111111", program: "22222222-2222-4222-8222-222222222222", version: "33333333-3333-4333-8333-333333333333", newer: "44444444-4444-4444-8444-444444444444", file: "55555555-5555-4555-8555-555555555555", document: "66666666-6666-4666-8666-666666666666", review: "77777777-7777-4777-8777-777777777777", actor: "88888888-8888-4888-8888-888888888888", group: "99999999-9999-4999-8999-999999999999", course: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", binding: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", learner: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", enrollment: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", snapshot: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" };
export function programVersion(overrides: Partial<ProgramVersion> = {}): ProgramVersion { return {
  id: ids.version, organization_id: ids.org, program_id: ids.program, version_number: 1, revision: 3, state: "approved",
  file_document_id: ids.document, file_version_id: ids.file, file_review_id: ids.review,
  file_approval: { number: "П-1", date: "2026-10-18", recorded_at: "2026-10-18T10:00:00Z", recorded_by: ids.actor },
  facts: { ...emptyProgramFacts(), full_title: "Подтверждённая программа", program_type: "dpo_upskilling", academic_hours: 72, training_form: "part_time", duration_calendar: "Две недели", attestation_form: "Тест", attestation_criteria: "Не менее 80%" },
  facts_hash: "a".repeat(64), reviewer_user_id: ids.actor, reviewer_name: "Мария Проверяющая", created_by: ids.actor,
  created_by_name: "Анна Автор", created_at: "2026-10-18T09:00:00Z", approved_at: "2026-10-18T11:00:00Z", approved_by: ids.actor, note: null, ...overrides,
}; }
export function programEnvelope(version = programVersion()): ProgramEnvelope { return { program: { id: ids.program, organization_id: ids.org, name: "Программа центра", description: null, revision: 3 }, current_version: version, versions: [version], capabilities: { can_create_version: true, can_submit: false, can_approve: false, can_reject: false, can_cancel: false } }; }
export function groupEnvelope(): GroupProgramFacts { return { group_id: ids.group, course_id: ids.course, enrollment_id: null, revision: 1, state: "confirmed", reason: null, snapshot: null,
  binding: { id: ids.binding, organization_id: ids.org, group_id: ids.group, course_id: ids.course, revision: 1, version_id: ids.version, program_id: ids.program, program_snapshot: programVersion(), group_snapshot: { name: "Группа", start_date: null, end_date: null, training_dates: [], schedule_text: null, instructor_name: null }, snapshot_hash: "b".repeat(64), recorded_at: "2026-10-18T12:00:00Z", recorded_by: ids.actor },
  enrollments: [{ enrollment_id: ids.enrollment, user_id: ids.learner, snapshot_id: null, state: "unconfirmed" }], capabilities: { can_bind: false, can_confirm_existing: true },
}; }
