import { z } from 'zod';

export const outcomeUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const outcomeHash = z.string().regex(/^[0-9a-f]{64}$/);
export const outcomeRevision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveRevision = outcomeRevision.refine(value => value > 0);
export const outcomeTime = z.string().datetime({ offset: true });
const text = (maximum = 2000) => z.string().min(1).max(maximum).refine(value => value.trim() === value);
// Existing display labels are not authority inputs; preserve their original spacing.
const displayLabel = (maximum: number) => z.string().min(1).max(maximum).refine(value => value.trim().length > 0);

export const outcomeScopeSchema = z.object({
  organization_id: outcomeUuid, group_id: outcomeUuid, user_id: outcomeUuid, course_id: outcomeUuid,
  enrollment_id: outcomeUuid, program_enrollment_snapshot_id: outcomeUuid, program_version_id: outcomeUuid,
}).strict();
export const outcomeCriteriaRefSchema = z.object({
  id: outcomeUuid, revision: positiveRevision, content_hash: outcomeHash, approved_at: outcomeTime,
}).strict();
export const outcomeOriginalGradeSchema = z.object({
  attempt_id: outcomeUuid, session_id: outcomeUuid, started_at: outcomeTime, completed_at: outcomeTime,
  score: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), max_score: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  original_passed: z.boolean(), original_passing_score: z.number().finite().min(0).max(100),
}).strict().refine(value => value.score <= value.max_score);
export const outcomeComponentSchema = z.object({
  component_id: outcomeUuid, kind: z.enum(['test', 'module_completion', 'human_assessment']),
  status: z.enum(['satisfied', 'not_satisfied', 'not_started', 'unknown']), reason_code: text(160),
  original_grade: outcomeOriginalGradeSchema.nullable(), selected_source_hash: outcomeHash.nullable(),
  provenance: z.enum(['bound_context', 'current_condition_observed', 'unavailable']),
}).strict();
export const outcomeMachineSchema = z.object({
  id: outcomeUuid, revision_created: positiveRevision, criteria_ref: outcomeCriteriaRefSchema,
  input_hash: outcomeHash, evaluated_at: outcomeTime,
  eligibility: z.enum(['eligible', 'not_eligible', 'incomplete', 'unknown']),
  components: z.array(outcomeComponentSchema).max(20), source_fresh: z.boolean(),
}).strict().refine(value => new Set(value.components.map(component => component.component_id)).size === value.components.length);

const decisionFields = {
  id: outcomeUuid, machine_result_id: outcomeUuid, outcome: z.enum(['passed', 'not_passed', 'deferred']),
  learner_summary: text(1000), recorded_at: outcomeTime, supersedes_id: outcomeUuid.nullable(),
} as const;
export const outcomeLearnerDecisionSchema = z.object(decisionFields).strict();
export const outcomeStaffDecisionSchema = z.object({
  ...decisionFields, staff_reason: text(), actor_id: outcomeUuid.nullable(), basis: z.enum(['machine', 'recognition']),
}).strict();
const envelopeFields = {
  schema_version: z.literal(1), scope: outcomeScopeSchema, revision: outcomeRevision,
  criteria_ref: outcomeCriteriaRefSchema.nullable(), machine: outcomeMachineSchema.nullable(),
  decision_relation: z.enum(['no_decision', 'current_inputs', 'new_machine_requires_review', 'source_changed']),
  technical_observation: z.object({
    status: text(80), progress: z.number().finite().min(0).max(100), manual_credited_at: outcomeTime.nullable(),
  }).strict(),
  prerequisites: z.array(text()).max(50),
} as const;
export const outcomeEnvelopeSchema = z.discriminatedUnion('audience', [
  z.object({ ...envelopeFields, audience: z.literal('staff'), last_decision: outcomeStaffDecisionSchema.nullable(),
    capabilities: z.object({ can_capture: z.boolean(), can_decide: z.boolean() }).strict() }).strict(),
  z.object({ ...envelopeFields, audience: z.literal('learner'), last_decision: outcomeLearnerDecisionSchema.nullable(),
    capabilities: z.object({ can_capture: z.boolean(), can_decide: z.literal(false) }).strict() }).strict(),
]).superRefine((value, context) => {
  if (value.machine && (!value.criteria_ref || !sameCriteriaRef(value.criteria_ref, value.machine.criteria_ref)
    || value.machine.revision_created > value.revision)) context.addIssue({ code: 'custom', message: 'Unconfirmed criteria or result revision' });
  if ((value.last_decision === null) !== (value.decision_relation === 'no_decision')) {
    context.addIssue({ code: 'custom', message: 'Unconfirmed decision relationship' });
  }
  if (value.decision_relation === 'current_inputs' && (!value.machine || !value.machine.source_fresh
    || value.last_decision?.machine_result_id !== value.machine.id)) context.addIssue({ code: 'custom', message: 'Unconfirmed current inputs' });
});
export const outcomeAssociationsQuerySchema = z.object({
  kind: z.literal('associations'), user_id: outcomeUuid, course_id: outcomeUuid, enrollment_id: outcomeUuid,
  after_snapshot_id: outcomeUuid.nullable(), limit: z.number().int().min(1).max(50),
}).strict();
export const outcomeReadQuerySchema = z.union([
  outcomeAssociationsQuerySchema,
  z.object({ kind: z.literal('outcome'), scope: outcomeScopeSchema }).strict(),
]);
export const outcomeAssociationsSchema = z.object({
  schema_version: z.literal(1), organization_id: outcomeUuid, user_id: outcomeUuid,
  course_id: outcomeUuid, enrollment_id: outcomeUuid, associations: z.array(outcomeEnvelopeSchema).max(50),
  next_after_snapshot_id: outcomeUuid.nullable(),
}).strict();
export const outcomeCaptureCommandSchema = z.object({
  action: z.literal('capture_machine_result'), scope: outcomeScopeSchema, expected_revision: outcomeRevision,
  expected_criteria_ref: outcomeCriteriaRefSchema, reason: text(),
}).strict();
const uniqueIds = (maximum: number) => z.array(outcomeUuid).max(maximum).refine(ids => new Set(ids).size === ids.length);
export const outcomeDecisionCommandSchema = z.object({
  action: z.enum(['record_attestation_decision', 'supersede_decision']), scope: outcomeScopeSchema, expected_revision: outcomeRevision,
  criteria_ref: outcomeCriteriaRefSchema, machine_result_id: outcomeUuid, expected_machine_input_hash: outcomeHash,
  expected_decision_id: outcomeUuid.nullable(), outcome: z.enum(['passed', 'not_passed', 'deferred']),
  basis: z.enum(['machine', 'recognition']), staff_reason: text(), learner_summary: text(1000),
  reviewed_current_component_ids: uniqueIds(20), recognized_component_ids: uniqueIds(20), recognition_file_version_id: outcomeUuid.nullable(),
}).strict().refine(value => (value.action === 'record_attestation_decision') === (value.expected_decision_id === null));
export const outcomeActionSchema = z.union([outcomeCaptureCommandSchema, outcomeDecisionCommandSchema]);
const receiptFields = {
  request_id: outcomeUuid, scope_hash: outcomeHash, applied_revision: positiveRevision,
  event_id: outcomeUuid, input_hash: outcomeHash, replayed: z.boolean(),
};
export const outcomeMutationSchema = z.object({
  schema_version: z.literal(1), receipt: z.object({
    ...receiptFields, action: z.enum(['capture_machine_result', 'record_attestation_decision', 'supersede_decision']),
  }).strict(), current: outcomeEnvelopeSchema,
}).strict();

export const learningProgrammeProofSchema = z.object({
  program_id: outcomeUuid, program_version_id: outcomeUuid, facts_hash: outcomeHash,
  file_document_id: outcomeUuid, file_version_id: outcomeUuid, file_review_id: outcomeUuid,
}).strict();
export const learningPassRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session_pass') }).strict(),
  z.object({ kind: z.literal('percent'), threshold_basis_points: z.number().int().min(0).max(10000),
    rounding: z.enum(['none', 'nearest_integer_half_up']) }).strict(),
]);
export const learningTestCriterionSchema = z.object({
  kind: z.literal('test'), component_id: outcomeUuid, lesson_id: outcomeUuid,
  retake_policy: z.enum(['latest_completed', 'best_percent']), pass_rule: learningPassRuleSchema,
}).strict();
const learningModuleCriterionSchema = z.object({ kind: z.literal('module_completion'), component_id: outcomeUuid, module_id: outcomeUuid }).strict();
const learningHumanCriterionSchema = z.object({ kind: z.literal('human_assessment'), component_id: outcomeUuid, label: text(500) }).strict();
export const learningCriteriaDefinitionSchema = z.object({
  schema_version: z.literal(1), main: z.union([learningTestCriterionSchema, learningHumanCriterionSchema]).nullable(),
  requirements: z.array(z.union([learningTestCriterionSchema, learningModuleCriterionSchema])).max(19), reviewer_id: outcomeUuid.nullable(),
  independent_review_required: z.boolean(), eligible_decider_ids: uniqueIds(20), recognition_component_ids: uniqueIds(20),
  recognition_file_version_ids: uniqueIds(5), review_note: text(),
}).strict().superRefine((value, context) => {
  const components = [...(value.main ? [value.main] : []), ...value.requirements];
  if (new Set(components.map(component => component.component_id)).size !== components.length
    || value.recognition_component_ids.some(id => !components.some(component => component.component_id === id))) {
    context.addIssue({ code: 'custom', message: 'Exact unique criteria components required' });
  }
});
export const learningCriteriaVersionSchema = z.object({
  id: outcomeUuid, organization_id: outcomeUuid, course_id: outcomeUuid, program_version_id: outcomeUuid, revision: positiveRevision,
  state: z.enum(['draft', 'approved']), definition: learningCriteriaDefinitionSchema,
  module_snapshots: z.array(z.object({ component_id: outcomeUuid, module_id: outcomeUuid, lesson_ids: uniqueIds(250) }).strict()).max(19),
  programme_proof: learningProgrammeProofSchema, content_hash: outcomeHash, created_by: outcomeUuid.nullable(),
  reviewer_id: outcomeUuid.nullable(), approved_by: outcomeUuid.nullable(), redacted: z.literal(false),
  created_at: outcomeTime, approved_at: outcomeTime.nullable(),
}).strict().refine(value => (value.state === 'approved') === (value.approved_at !== null));
export const learningCriteriaEnvelopeSchema = z.object({
  schema_version: z.literal(1), organization_id: outcomeUuid, course_id: outcomeUuid, program_version_id: outcomeUuid,
  programme_proof: learningProgrammeProofSchema.nullable(), versions: z.array(learningCriteriaVersionSchema).max(50),
  capabilities: z.object({ can_save: z.boolean() }).strict(),
}).strict();
export const learningCriteriaOptionsSchema = z.object({
  schema_version: z.literal(1), organization_id: outcomeUuid, course_id: outcomeUuid, program_version_id: outcomeUuid,
  lessons: z.array(z.object({ id: outcomeUuid, title: displayLabel(1000), type: text(80), module_id: outcomeUuid.nullable() }).strict()).max(500),
  modules: z.array(z.object({ id: outcomeUuid, title: displayLabel(1000) }).strict()).max(250),
  humans: z.array(z.object({ user_id: outcomeUuid, display_name: displayLabel(500), can_review: z.boolean(), can_decide: z.boolean() }).strict()).max(250),
  files: z.array(z.object({ version_id: outcomeUuid, document_name: displayLabel(1000) }).strict()).max(250),
}).strict();
export const learningCriteriaSaveSchema = z.object({
  action: z.literal('save_criteria_version'), course_id: outcomeUuid, program_version_id: outcomeUuid, draft_id: outcomeUuid.nullable(),
  expected_revision: outcomeRevision, definition: learningCriteriaDefinitionSchema, reason: text(),
}).strict().refine(value => (value.draft_id === null) === (value.expected_revision === 0));
export const learningCriteriaApproveSchema = z.object({
  action: z.literal('approve_criteria_version'), version_id: outcomeUuid, expected_revision: positiveRevision,
  expected_content_hash: outcomeHash, reason: text(),
}).strict();
export const learningCriteriaActionSchema = z.union([learningCriteriaSaveSchema, learningCriteriaApproveSchema]);
export const learningCriteriaMutationSchema = z.object({ schema_version: z.literal(1), receipt: z.object({
  ...receiptFields, action: z.enum(['save_criteria_version', 'approve_criteria_version']),
}).strict(), current: learningCriteriaEnvelopeSchema }).strict();
export const learningDecisionOptionsSchema = z.object({
  schema_version: z.literal(1), scope: outcomeScopeSchema, allowed_component_ids: uniqueIds(20),
  files: z.array(z.object({ version_id: outcomeUuid, document_name: displayLabel(1000) }).strict()).max(5),
}).strict();
export const outcomeErrorCodeSchema = z.enum([
  'INVALID_INPUT', 'ACCESS_DENIED', 'REVISION_CONFLICT', 'REQUEST_CONFLICT', 'SOURCE_CHANGED',
  'SOURCE_UNAVAILABLE', 'PREREQUISITE_MISSING', 'LIMIT_EXCEEDED', 'DEPENDENCY_UNAVAILABLE', 'PHOTO_POLICY_MISMATCH',
]);
export const outcomeErrorSchema = z.object({
  schema_version: z.literal(1), code: outcomeErrorCodeSchema, message: text(),
}).strict();

export type OutcomeScope = z.infer<typeof outcomeScopeSchema>;
export type OutcomeCriteriaRef = z.infer<typeof outcomeCriteriaRefSchema>;
export type OutcomeEnvelope = z.infer<typeof outcomeEnvelopeSchema>;
export type OutcomeAssociations = z.infer<typeof outcomeAssociationsSchema>;
export type OutcomeCaptureCommand = z.infer<typeof outcomeCaptureCommandSchema>;
export type OutcomeDecisionCommand = z.infer<typeof outcomeDecisionCommandSchema>;
export type OutcomeAction = z.infer<typeof outcomeActionSchema>;
export type OutcomeMutation = z.infer<typeof outcomeMutationSchema>;
export type OutcomeErrorCode = z.infer<typeof outcomeErrorCodeSchema>;
export type OutcomeComponent = z.infer<typeof outcomeComponentSchema>;
export type LearningCriteriaDefinition = z.infer<typeof learningCriteriaDefinitionSchema>;
export type LearningCriteriaVersion = z.infer<typeof learningCriteriaVersionSchema>;
export type LearningCriteriaEnvelope = z.infer<typeof learningCriteriaEnvelopeSchema>;
export type LearningCriteriaOptions = z.infer<typeof learningCriteriaOptionsSchema>;
export type LearningCriteriaAction = z.infer<typeof learningCriteriaActionSchema>;
export type LearningCriteriaMutation = z.infer<typeof learningCriteriaMutationSchema>;
export type LearningDecisionOptions = z.infer<typeof learningDecisionOptionsSchema>;

export function sameOutcomeScope(a: OutcomeScope, b: OutcomeScope): boolean {
  return Object.keys(outcomeScopeSchema.shape).every(key => a[key as keyof OutcomeScope] === b[key as keyof OutcomeScope]);
}
export function sameCriteriaRef(a: OutcomeCriteriaRef, b: OutcomeCriteriaRef): boolean {
  return a.id === b.id && a.revision === b.revision && a.content_hash === b.content_hash && a.approved_at === b.approved_at;
}
