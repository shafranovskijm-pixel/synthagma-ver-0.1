import { z } from 'zod';
import { admissionIssuanceConditionSchema, admissionIssuanceEvidenceSchema, admissionIssuanceReviewSnapshotSchema } from './issuanceCondition.ts';

export const admissionUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const admissionRevision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveRevision = admissionRevision.refine(value => value > 0);
export const admissionSha256 = z.string().regex(/^[0-9a-f]{64}$/);
const text = (max = 4000) => z.string().min(1).max(max).refine(value => value.trim() === value && value.length > 0);
export const admissionTime = z.string().datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const ids = (min = 0, max = 100) => z.array(admissionUuid).min(min).max(max).refine(values => new Set(values).size === values.length);
export const admissionMime = z.enum(['application/pdf', 'image/jpeg', 'image/png']);
export const ADMISSION_MAX_BYTES = 20971520;
export const admissionScopeSchema = z.object({ organization_id: admissionUuid, group_id: admissionUuid, enrollment_id: admissionUuid, user_id: admissionUuid, course_id: admissionUuid }).strict();
export const admissionProgramRefSchema = z.object({ enrollment_snapshot_id: admissionUuid, binding_id: admissionUuid, binding_revision: positiveRevision, version_id: admissionUuid,
  snapshot_hash: admissionSha256, facts_hash: admissionSha256, file_document_id: admissionUuid, file_version_id: admissionUuid, file_review_id: admissionUuid }).strict();
export const admissionPrerequisiteSchema = z.object({
  code: z.enum(['missing_group','missing_enrollment','missing_program_binding','missing_enrollment_snapshot','program_file_unavailable','association_inactive','rule_set_unreviewed']),
  public_label: text(160), next_action: z.enum(['select_exact_association','contact_staff','open_programme_confirmation','review_rule_set']), persisted: z.literal(false),
}).strict();
export const admissionSourceKind = z.enum(['identity_document','enrollment_document','contract_artifact','organization_document_version']);
export const admissionCandidateRefSchema = z.object({kind: admissionSourceKind, id: admissionUuid, version_id: admissionUuid.nullable(), fingerprint: admissionSha256}).strict();
export const admissionCandidateSchema = admissionCandidateRefSchema.extend({availability: z.enum(['capturable','unavailable','needs_individual_copy']), label: text(160)}).strict();
export const admissionRequirementSchema = z.object({id: admissionUuid, revision: positiveRevision, rule_id: admissionUuid, rule_set_id: admissionUuid, rule_set_digest: admissionSha256,
  label: text(160), applicability: z.enum(['unknown','applicable','not_applicable']), review_event_id: admissionUuid.nullable(), evidence_version_ids: ids(),
  current_state: z.enum(['unknown','missing','unreviewed','satisfied','unreadable','exception_pending','exception_recorded']), public_next_action: text(160).nullable()}).strict();
export const admissionEvidenceSchema = z.object({id: admissionUuid, case_id: admissionUuid, case_revision_created: positiveRevision, requirement_id: admissionUuid, supersedes_id: admissionUuid.nullable(),
  source_kind: z.enum(['upload','identity_document','enrollment_document','contract_artifact','organization_document_version']), captured_at: admissionTime, byte_sha256: admissionSha256,
  byte_size: z.number().int().min(1).max(ADMISSION_MAX_BYTES), mime_type: admissionMime, availability: z.enum(['available','unavailable','integrity_conflict']),
  review: z.enum(['unreviewed','accepted','rejected']), review_event_id: admissionUuid.nullable(), can_read_bytes: z.boolean()}).strict();
export const admissionTaskSchema = z.object({id: admissionUuid, key: admissionSha256, requirement_id: admissionUuid.nullable(),
  kind: z.enum(['supply_evidence','review_applicability','review_evidence','review_exception','recheck_source','recheck_programme']), status: z.enum(['open','resolved','superseded']),
  assignee_id: admissionUuid.nullable(), public_label: text(160), deadline: z.object({kind: z.enum(['not_set','internal_target','reviewed_rule']), date: date.nullable(), rule_id: admissionUuid.nullable()}).strict(), reason: text().nullable()}).strict();
export const admissionDecisionSchema = z.object({event_id: admissionUuid, case_revision: positiveRevision, outcome: z.enum(['needs_information','admitted','not_admitted']),
  recorded_at: admissionTime, responsible_id: admissionUuid.nullable(), reason: text(), program_ref: admissionProgramRefSchema, rule_set_id: admissionUuid, requirements_digest: admissionSha256,
  evidence_version_ids: ids(), authority_snapshot_hash: admissionSha256, later_review_required: z.boolean()}).strict();
export const admissionCapabilitiesSchema = z.object({can_initialize: z.boolean(), can_assign: z.boolean(), can_review: z.boolean(), can_decide: z.boolean(), can_prepare_evidence: z.boolean(), can_configure_rules: z.boolean()}).strict();
export const admissionStaffCaseSchema = z.object({id: admissionUuid, scope: admissionScopeSchema, revision: positiveRevision, program_ref: admissionProgramRefSchema, program_title: text(),
  program_type: z.enum(['dpo_upskilling','dpo_retraining','professional_training','internal_nonformal']), responsible_id: admissionUuid.nullable(), rule_set_id: admissionUuid.nullable(),
  requirements: z.array(admissionRequirementSchema).max(50), evidence: z.array(admissionEvidenceSchema).max(100), tasks: z.array(admissionTaskSchema).max(50), decision: admissionDecisionSchema.nullable(),
  prerequisites: z.array(admissionPrerequisiteSchema).max(20), capabilities: admissionCapabilitiesSchema, rule_set_digest: admissionSha256.nullable(), requirements_digest: admissionSha256,
  issuance_reviews: z.array(admissionIssuanceReviewSnapshotSchema).max(50).optional(),
  issuance_conditions: z.array(z.object({ requirement_id: admissionUuid, requirement_revision: positiveRevision, condition: admissionIssuanceConditionSchema }).strict()).max(50).optional()}).strict();
export const admissionLearnerTaskSchema = z.object({id: admissionUuid, public_label: text(160), next_action: z.enum(['upload_own_attachment','contact_staff']), status: z.enum(['open','resolved','superseded'])}).strict();
export const admissionLearnerCaseSchema = z.object({id: admissionUuid, scope: admissionScopeSchema, revision: positiveRevision, program_title: text(),
  outcome: z.enum(['not_reviewed','needs_information','admitted','not_admitted']), outcome_recorded_at: admissionTime.nullable(), later_review_required: z.boolean(), tasks: z.array(admissionLearnerTaskSchema).max(50)}).strict();
export const admissionLocalActRefSchema = z.object({document_id: admissionUuid, version_id: admissionUuid, review_id: admissionUuid}).strict();
export const admissionLocalRequirementInputSchema = z.object({key: z.string().regex(/^[a-z0-9_]{1,64}$/), kind: z.enum(['education_basis','application','contract_or_funding','other_reviewed']),
  staff_label: text(160), source_version_ids: ids(1,3), provision: text(1000), exception_policy: z.enum(['not_defined','local_reasoned_exception']),
  issuance_condition: admissionIssuanceConditionSchema.optional()}).strict().refine(row => !row.issuance_condition || row.kind === 'education_basis');
export const admissionResponsibleOptionSchema = z.object({user_id: admissionUuid, display_name: text(160)}).strict();
export const admissionLocalActOptionSchema = admissionLocalActRefSchema.extend({type: z.enum(['admission_rules','edu_relations','paid_services']), label: text(160),
  approval: z.object({number: text(), date, recorded_at: admissionTime, recorded_by: admissionUuid}).strict()}).strict();

const page = {after_id: admissionUuid.nullable(), limit: z.number().int().min(1).max(50)};
export const admissionReadQuerySchema = z.discriminatedUnion('mode', [
  z.object({mode: z.literal('associations'), ...page}).strict(),
  z.object({mode: z.literal('case'), group_id: admissionUuid, enrollment_id: admissionUuid}).strict(),
  z.object({mode: z.literal('candidates'), case_id: admissionUuid, kind: admissionSourceKind, ...page}).strict(),
  z.object({mode: z.literal('history'), case_id: admissionUuid, ceiling_revision: admissionRevision.nullable(), before_revision: admissionRevision.nullable(), limit: page.limit}).strict(),
  z.object({mode: z.literal('options'), case_id: admissionUuid, kind: z.enum(['responsibles','local_acts']), ...page}).strict(),
]);
const caseCommon = {case_id: admissionUuid, expected_revision: positiveRevision, expected_program_ref: admissionProgramRefSchema};
export const admissionCaseActionSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('initialize'), group_id: admissionUuid, enrollment_id: admissionUuid, expected_program_ref: admissionProgramRefSchema, expected_revision: z.literal(0)}).strict(),
  z.object({action: z.literal('assign_responsible'), ...caseCommon, responsible_id: admissionUuid, reason: text()}).strict(),
  z.object({action: z.literal('review_local_rules'), ...caseCommon, sources: z.array(admissionLocalActRefSchema).min(1).max(3), requirements: z.array(admissionLocalRequirementInputSchema).min(3).max(50), review_reason: text()}).strict(),
  z.object({action: z.literal('review_requirement'), ...caseCommon, requirement_id: admissionUuid, expected_requirement_revision: positiveRevision,
    applicability: z.enum(['applicable','not_applicable','unknown']), evidence_version_ids: ids(), reason: text(), issuance_evidence: admissionIssuanceEvidenceSchema.nullable().optional(), exception: z.object({rule_id: admissionUuid, reason: text(), evidence_version_ids: ids(1)}).strict().nullable()}).strict(),
  z.object({action: z.literal('review_evidence'), ...caseCommon, requirement_id: admissionUuid, expected_requirement_revision: positiveRevision, evidence_version_id: admissionUuid,
    byte_sha256: admissionSha256, outcome: z.enum(['accepted','rejected']), reason: text()}).strict(),
  z.object({action: z.literal('record_decision'), ...caseCommon, rule_set_id: admissionUuid, rule_set_digest: admissionSha256, requirements_digest: admissionSha256,
    evidence_version_ids: ids(), outcome: z.enum(['needs_information','admitted','not_admitted']), reason: text()}).strict(),
]).superRefine((command, ctx) => {
  if (command.action !== 'review_local_rules') return;
  if (new Set(command.sources.map(source => source.document_id)).size !== command.sources.length
    || new Set(command.requirements.map(requirement => requirement.key)).size !== command.requirements.length
    || ['education_basis','application','contract_or_funding'].some(kind => !command.requirements.some(requirement => requirement.kind === kind))
    || command.requirements.some(requirement => requirement.source_version_ids.some(id => !command.sources.some(source => source.version_id === id)))) {
    ctx.addIssue({code: 'custom', message: 'Требуются точные источники и вопросы проверки личного дела'});
  }
});
export const admissionEvidenceSourceSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('upload'), requirement_id: admissionUuid, supersedes_id: admissionUuid.nullable(), declared_size: z.number().int().min(1).max(ADMISSION_MAX_BYTES), declared_mime: admissionMime, declared_sha256: admissionSha256}).strict(),
  z.object({kind: z.literal('existing'), requirement_id: admissionUuid, supersedes_id: admissionUuid.nullable(), candidate: admissionCandidateRefSchema}).strict(),
]);
export const admissionPrepareArgsSchema = z.object({p_case_id: admissionUuid, p_expected_revision: positiveRevision, p_expected_program_ref: admissionProgramRefSchema,
  p_request_id: admissionUuid, p_source: admissionEvidenceSourceSchema}).strict();
export const admissionCommitBodySchema = z.object({case_id: admissionUuid, reservation_id: admissionUuid, expected_revision: positiveRevision, request_id: admissionUuid}).strict();
export const admissionFileBodySchema = z.object({case_id: admissionUuid, evidence_version_id: admissionUuid}).strict();
export const admissionPreparationSchema = z.object({schema_version: z.literal(1), case_id: admissionUuid, case_revision: positiveRevision, reservation_id: admissionUuid,
  evidence_version_id: admissionUuid, expires_at: admissionTime, source_kind: z.enum(['upload','existing']), upload_slot: z.object({bucket: z.literal('admission-case-evidence'), path: z.string().min(1).max(2000), upsert: z.literal(false), max_bytes: z.literal(ADMISSION_MAX_BYTES)}).strict().nullable()}).strict();
export const admissionActionKind = z.enum(['initialize','assign_responsible','review_local_rules','review_requirement','review_evidence','record_decision','evidence_committed']);
export const admissionEventPayloadSchema = z.object({reason: text().nullable(), program_ref: admissionProgramRefSchema, rule_set_id: admissionUuid.nullable(), rule_set_digest: admissionSha256.nullable(),
  responsible_id: admissionUuid.nullable(), requirements_digest: admissionSha256, requirements: z.array(admissionRequirementSchema).max(50), evidence_version_ids: ids(), evidence: z.array(admissionEvidenceSchema).max(100), tasks: z.array(admissionTaskSchema).max(50), decision: admissionDecisionSchema.nullable(),
  local_sources: z.array(admissionLocalActRefSchema).max(3), local_requirements: z.array(admissionLocalRequirementInputSchema).max(50),
  issuance_reviews: z.array(admissionIssuanceReviewSnapshotSchema).max(50).optional()}).strict();
export const admissionEventSchema = z.object({id: admissionUuid, case_id: admissionUuid, case_revision: positiveRevision, kind: admissionActionKind, recorded_at: admissionTime,
  actor_id: admissionUuid.nullable(), payload: admissionEventPayloadSchema}).strict();
export const admissionReceiptSchema = z.object({schema_version: z.literal(1), request_id: admissionUuid, case_id: admissionUuid, revision: positiveRevision,
  event_id: admissionUuid, kind: admissionActionKind, payload_digest: admissionSha256}).strict();
export const admissionMutationResultSchema = z.object({schema_version: z.literal(1), scope: admissionScopeSchema, receipt: admissionReceiptSchema, replayed: z.boolean(), state: admissionStaffCaseSchema}).strict();
export const admissionCaseReadSchema = z.discriminatedUnion('projection', [
  z.object({schema_version: z.literal(1), mode: z.literal('case'), projection: z.literal('staff'), scope: admissionScopeSchema,
    program_ref: admissionProgramRefSchema.nullable(), program_title: text().nullable(), state: admissionStaffCaseSchema.nullable(), prerequisites: z.array(admissionPrerequisiteSchema).max(20), capabilities: admissionCapabilitiesSchema}).strict(),
  z.object({schema_version: z.literal(1), mode: z.literal('case'), projection: z.literal('learner'), scope: admissionScopeSchema,
    state: admissionLearnerCaseSchema.nullable(), prerequisites: z.array(admissionPrerequisiteSchema).max(20)}).strict(),
]);
export const admissionAssociationsSchema = z.object({schema_version: z.literal(1), mode: z.literal('associations'), organization_id: admissionUuid, user_id: admissionUuid,
  items: z.array(z.object({scope: admissionScopeSchema, group_label: text(160), case_id: admissionUuid.nullable(), prerequisites: z.array(admissionPrerequisiteSchema).max(20)}).strict()).max(50),
  prerequisites: z.array(admissionPrerequisiteSchema).max(20), has_more: z.boolean(), next_after_id: admissionUuid.nullable()}).strict();
export const admissionCandidatesSchema = z.object({schema_version: z.literal(1), mode: z.literal('candidates'), case_id: admissionUuid, case_revision: positiveRevision,
  items: z.array(admissionCandidateSchema).max(50), has_more: z.boolean(), next_after_id: admissionUuid.nullable()}).strict();
export const admissionHistorySchema = z.object({schema_version: z.literal(1), mode: z.literal('history'), case_id: admissionUuid, ceiling_revision: positiveRevision,
  items: z.array(admissionEventSchema).max(50), has_more: z.boolean(), next_before_revision: positiveRevision.nullable()}).strict();
export const admissionOptionsSchema = z.discriminatedUnion('kind', [
  z.object({schema_version: z.literal(1), mode: z.literal('options'), case_id: admissionUuid, case_revision: positiveRevision, kind: z.literal('responsibles'), items: z.array(admissionResponsibleOptionSchema).max(50), has_more: z.boolean(), next_after_id: admissionUuid.nullable()}).strict(),
  z.object({schema_version: z.literal(1), mode: z.literal('options'), case_id: admissionUuid, case_revision: positiveRevision, kind: z.literal('local_acts'), items: z.array(admissionLocalActOptionSchema).max(50), has_more: z.boolean(), next_after_id: admissionUuid.nullable()}).strict(),
]);
export const admissionErrorCodeSchema = z.enum(['ACCESS_DENIED','INVALID_INPUT','REVISION_CONFLICT','SOURCE_CHANGED','SOURCE_UNAVAILABLE','PREREQUISITE_MISSING','REVIEW_REQUIRED','LIMIT_REACHED','DEPENDENCY_UNAVAILABLE']);
export const admissionErrorSchema = z.object({schema_version: z.literal(1), code: admissionErrorCodeSchema, retryable: z.boolean(), message: text(500)}).strict();

export type AdmissionScope = z.infer<typeof admissionScopeSchema>;
export type AdmissionProgramRef = z.infer<typeof admissionProgramRefSchema>;
export type AdmissionStaffCase = z.infer<typeof admissionStaffCaseSchema>;
export type AdmissionLearnerCase = z.infer<typeof admissionLearnerCaseSchema>;
export type AdmissionRequirement = z.infer<typeof admissionRequirementSchema>;
export type AdmissionEvidence = z.infer<typeof admissionEvidenceSchema>;
export type AdmissionCaseRead = z.infer<typeof admissionCaseReadSchema>;
export type AdmissionAssociations = z.infer<typeof admissionAssociationsSchema>;
export type AdmissionCaseAction = z.infer<typeof admissionCaseActionSchema>;
export type AdmissionReadQuery = z.infer<typeof admissionReadQuerySchema>;
export type AdmissionPreparation = z.infer<typeof admissionPreparationSchema>;
export type AdmissionPrepareArgs = z.infer<typeof admissionPrepareArgsSchema>;
export type AdmissionMutationResult = z.infer<typeof admissionMutationResultSchema>;
export type AdmissionEvidenceSource = z.infer<typeof admissionEvidenceSourceSchema>;
export type AdmissionOptions = z.infer<typeof admissionOptionsSchema>;
export type AdmissionCandidates = z.infer<typeof admissionCandidatesSchema>;
export type AdmissionHistory = z.infer<typeof admissionHistorySchema>;
export type AdmissionErrorCode = z.infer<typeof admissionErrorCodeSchema>;
export type AdmissionLocalRequirementInput = z.infer<typeof admissionLocalRequirementInputSchema>;

export const admissionOutcomeLabels = {not_reviewed: 'Решение ещё не принято', needs_information: 'Нужны сведения', admitted: 'Допуск зафиксирован ответственным', not_admitted: 'Ответственный не подтвердил допуск'} as const;
export const admissionRequirementLabels = {unknown: 'Применимость не проверена', missing: 'Нужны сведения', unreviewed: 'Ожидает проверки', satisfied: 'Проверено', unreadable: 'Источник недоступен', exception_pending: 'Нужно рассмотреть исключение', exception_recorded: 'Исключение записано'} as const;
export const admissionProcessLabels = {education_basis: 'Основание обучения', application: 'Заявление и учебные отношения', contract_or_funding: 'Договор или основание финансирования', other_reviewed: 'Дополнительный вопрос'} as const;
