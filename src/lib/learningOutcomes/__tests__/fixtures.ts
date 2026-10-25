import type { LearningCriteriaDefinition, LearningCriteriaEnvelope, LearningCriteriaOptions, LearningCriteriaVersion, OutcomeEnvelope, OutcomeScope } from '../contract.ts';

export const id = (number: number) => `11111111-1111-4111-8111-${String(number).padStart(12, '0')}`;
export const actor = id(1), organization = id(2), learner = id(3), course = id(4), enrollment = id(5);
export const hash = 'a'.repeat(64), instant = '2026-10-20T01:00:00.123456+00:00';
export const scope: OutcomeScope = { organization_id: organization, group_id: id(6), user_id: learner,
  course_id: course, enrollment_id: enrollment, program_enrollment_snapshot_id: id(7), program_version_id: id(8) };
export const criteria = { id: id(9), revision: 1, content_hash: hash, approved_at: instant };
export function outcome(extra: Partial<OutcomeEnvelope> = {}): OutcomeEnvelope {
  return { schema_version: 1, audience: 'staff', scope, revision: 2, criteria_ref: criteria,
    machine: { id: id(10), revision_created: 2, criteria_ref: criteria, input_hash: hash, evaluated_at: instant,
      eligibility: 'eligible', components: [], source_fresh: true },
    last_decision: null, decision_relation: 'no_decision', technical_observation: { status: 'completed', progress: 100, manual_credited_at: null },
    prerequisites: [], capabilities: { can_capture: true, can_decide: false }, ...extra } as OutcomeEnvelope;
}
export function associations(items = [outcome()]) {
  return { schema_version: 1, organization_id: organization, user_id: learner, course_id: course, enrollment_id: enrollment,
    associations: items, next_after_snapshot_id: null };
}
export function mutation(requestId = id(20), extra: Partial<OutcomeEnvelope> = {}) {
  return { schema_version: 1, receipt: { request_id: requestId, action: 'capture_machine_result', scope_hash: hash,
    applied_revision: 3, event_id: id(22), input_hash: hash, replayed: false }, current: outcome({ revision: 3,
      machine: { ...outcome().machine!, id: id(22), revision_created: 3 }, ...extra }) };
}
export const programmeProof = { program_id: id(50), program_version_id: scope.program_version_id, facts_hash: hash,
  file_document_id: id(51), file_version_id: id(52), file_review_id: id(53) };
export function criteriaDefinition(extra: Partial<LearningCriteriaDefinition> = {}): LearningCriteriaDefinition {
  return { schema_version: 1, main: null, requirements: [], reviewer_id: null, independent_review_required: false,
    eligible_decider_ids: [], recognition_component_ids: [], recognition_file_version_ids: [], review_note: 'Синтетические критерии центра', ...extra };
}
export function criteriaVersion(extra: Partial<LearningCriteriaVersion> = {}): LearningCriteriaVersion {
  return { id: id(60), organization_id: organization, course_id: course, program_version_id: scope.program_version_id, revision: 1,
    state: 'draft', definition: criteriaDefinition(), module_snapshots: [], programme_proof: programmeProof, content_hash: hash,
    created_by: actor, reviewer_id: null, approved_by: null, redacted: false, created_at: instant, approved_at: null, ...extra };
}
export function criteriaEnvelope(versions = [criteriaVersion()]): LearningCriteriaEnvelope {
  return { schema_version: 1, organization_id: organization, course_id: course, program_version_id: scope.program_version_id,
    programme_proof: programmeProof, versions, capabilities: { can_save: true } };
}
export function criteriaOptions(): LearningCriteriaOptions {
  return { schema_version: 1, organization_id: organization, course_id: course, program_version_id: scope.program_version_id,
    lessons: [{ id: id(70), title: 'Реальный итоговый тест', type: 'test', module_id: id(71) }],
    modules: [{ id: id(71), title: 'Реальный модуль курса' }], humans: [
      { user_id: actor, display_name: 'Назначенный проверяющий', can_review: true, can_decide: true },
      { user_id: id(72), display_name: 'Другой ответственный', can_review: true, can_decide: true },
    ], files: [{ version_id: id(73), document_name: 'Согласованное основание признания' }] };
}
