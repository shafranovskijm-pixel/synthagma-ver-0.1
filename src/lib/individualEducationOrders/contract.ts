import { z } from 'zod';
import { registrySourceSchema } from '@/lib/documentRegistry/contract';
import { programFactsSchema, programFactsReady } from '@/lib/programFacts';
import { ORDER_PROGRAMME_LABELS } from '../../../supabase/functions/_shared/individual-education-order-render';

type Validated<T> = T extends (infer Item)[] ? Validated<Item>[] : T extends object ? { [Key in keyof T]-?: Validated<T[Key]> } : T;

export const individualOrderUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const individualOrderHash = z.string().regex(/^[0-9a-f]{64}$/);
const id = individualOrderUuid, sha = individualOrderHash;
export const orderRevision0 = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const orderRevision = orderRevision0.refine(value => value > 0);
export const orderDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + 'T00:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; });
export const orderUtc = z.string().max(64).datetime().refine(value => /(?:\.\d{1,6})?Z$/.test(value));
const exactUtc = orderUtc.refine(value => /\.\d{6}Z$/.test(value));
const text = (max: number, empty = false) => z.string().max(max).refine(value => (empty || value.trim().length > 0) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value));
export const orderTimezone = text(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } });
const unique = <T>(values: T[]) => new Set(values).size === values.length;
export const orderKind = z.enum(['admission', 'completion', 'early_withdrawal']);
export const educationProgrammeType = z.enum(['professional_training', 'dpo_upskilling', 'dpo_retraining']);
export const programmeTypeLabels = ORDER_PROGRAMME_LABELS;
export const orderProgrammeFacts = programFactsSchema.refine(value => programFactsReady(value) && value.program_type !== 'internal_nonformal');
export const programmeRefSchema = z.object({ program_id: id, version_id: id, version_revision: orderRevision0, facts_sha256: sha, file: registrySourceSchema,
  file_review_id: id, file_review_revision: orderRevision0, file_approval: z.object({ number: text(500), date: orderDate }).strict(), snapshot_sha256: sha }).strict();
export const programmeChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('course_binding'), expected_binding_revision: orderRevision0, programme: programmeRefSchema }).strict(),
  z.object({ kind: z.literal('individual_selection'), programme: programmeRefSchema, selection_reason: text(2000) }).strict(),
]);
export const programmeChoiceRowSchema = z.object({ id, organization_id: id, course_id: id, label: text(2000), programme: programmeRefSchema, facts: orderProgrammeFacts, course_binding_revision: orderRevision0.nullable() }).strict().refine(value => value.id === value.programme.version_id);
export const enrollmentWitnessSchema = z.object({ document_facts_revision: orderRevision0, registry_context_binding_sha256: sha, identity_sha256: sha }).strict();
export const orderDatesSchema = z.object({ document_date: orderDate, effective_date: orderDate, training_start_date: orderDate, training_end_date: orderDate.nullable(), timezone: orderTimezone }).strict().refine(value => value.training_end_date === null || value.training_end_date >= value.training_start_date);
export const orderBasisRole = z.enum(['application', 'education_contract', 'local_admission_rule', 'prior_admission_order', 'final_protocol', 'withdrawal_request', 'termination_ground', 'authority_document']);
export const orderBasisSchema = z.object({ role: orderBasisRole, source: registrySourceSchema, review_id: id, review_revision: orderRevision0, provision: text(2000) }).strict();
const bases = z.array(orderBasisSchema).min(1).max(10).refine(values => unique(values.map(value => [value.role, value.source.document_id, value.source.version_id, value.source.content_hash].join(':'))));
export const orderDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('admit'), facts_checked: z.literal(true), authority_checked: z.literal(true), programme_checked: z.literal(true), grounds: text(2000) }).strict(),
  z.object({ kind: z.literal('complete'), final_protocol_source: registrySourceSchema, final_protocol_checked: z.literal(true), required_practice_checked: z.literal(true), attestation_criteria_checked: z.literal(true), actual_outcome: z.literal('passed'), authority_checked: z.literal(true), grounds: text(2000) }).strict(),
  z.object({ kind: z.literal('terminate_early'), ground_kind: z.enum(['learner_request', 'organization_decision', 'independent_circumstances']), ground_source: registrySourceSchema, ground_checked: z.literal(true), no_completion_award: z.literal(true), authority_checked: z.literal(true), grounds: text(2000) }).strict(),
]);
export const recordedOrderDecisionSchema = z.object({ event_id: id, kind: z.enum(['admit', 'complete', 'terminate_early']), actor_user_id: id, server_at: orderUtc, payload_sha256: sha, decision: orderDecisionSchema }).strict().refine(value => value.kind === value.decision.kind);
export const orderIdentitySchema = z.object({ source: z.literal('current_student_registration'), profile_id: id, user_id: id, full_name: text(500), birth_date: orderDate.nullable(), identity_sha256: sha, name_assurance: z.literal('registered_data_and_explicit_staff_review') }).strict();
export const officialOrderNumberSchema = z.object({ namespace: z.literal('group_order'), year: z.number().int().min(2000).max(2200), sequence_number: z.number().int().positive().max(2147483647), display: text(120), reserved_at: orderUtc }).strict().refine(value => value.display === `УЦ-${value.sequence_number}/${value.year}`);
const renderer = { renderer: z.literal('browserless'), renderer_revision: z.literal('uc-individual-order-v1') };
const bytes = z.number().int().min(1).max(20971520);
export const orderObjectIdentitySchema = z.object({ object_id: id, updated_at: exactUtc }).strict();
export const orderObjectObservationSchema = z.object({ object_id: id, updated_at: exactUtc, byte_size: bytes, mime_type: z.literal('application/pdf'),
  provenance: z.object({ version: z.literal(1), kind: z.literal('individual_order'), order_id: id, render_job_id: id, render_generation: orderRevision,
    render_input_sha256: sha, html_sha256: sha, byte_sha256: sha, ...renderer }).strict(),
}).strict();
export const orderStageProofSchema = z.object({ proof_id: id, object_id: id, updated_at: exactUtc, render_input_sha256: sha, html_sha256: sha, byte_sha256: sha, byte_size: bytes, ...renderer }).strict();
export const orderRenderJobSchema = z.object({ id, generation: orderRevision, request_id: id, approved_order_revision: orderRevision, approved_order_sha256: sha, render_input_sha256: sha, html_sha256: sha.nullable(), ...renderer, stage: z.enum(['prepared', 'staged', 'saved']), staging_proof: orderStageProofSchema.nullable() }).strict().superRefine((value, ctx) => {
  if (value.stage === 'prepared' ? value.html_sha256 !== null || value.staging_proof !== null : value.html_sha256 === null || value.staging_proof === null || value.staging_proof.html_sha256 !== value.html_sha256 || value.staging_proof.render_input_sha256 !== value.render_input_sha256) ctx.addIssue({ code: 'custom', message: 'Unconfirmed rendered stage' });
});
export const orderArtifactImmutableSchema = z.object({ source: registrySourceSchema, byte_sha256: sha, byte_size: bytes, render_input_sha256: sha, html_sha256: sha, render_job_id: id, render_generation: orderRevision, proof_id: id, ...renderer }).strict();
export const orderArtifactSchema = orderArtifactImmutableSchema.extend({ output_review: z.object({ event_id: id, actor_user_id: id, server_at: orderUtc, artifact_byte_sha256: sha }).strict().nullable() }).strict().refine(value => value.output_review === null || value.output_review.artifact_byte_sha256 === value.byte_sha256);
export const orderRegistryRefSchema = z.object({ record_id: id, record_revision: orderRevision, registration_id: text(120), registered_at: orderUtc, source: registrySourceSchema }).strict();
export const orderCapabilitiesSchema = z.object({ can_prepare: z.boolean(), can_approve: z.boolean(), can_render: z.boolean(), can_register: z.boolean(), can_open_source: z.boolean() }).strict();
const same = (a: unknown, b: unknown): boolean => a === b || a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.prototype.hasOwnProperty.call(b, key) && same(a[key as keyof typeof a], b[key as keyof typeof b]));
const decisionKind = { admission: 'admit', completion: 'complete', early_withdrawal: 'terminate_early' } as const;
export const individualOrderSchema = z.object({ id, organization_id: id, enrollment_id: id, subject_user_id: id, course_id: id, order_kind: orderKind, revision: orderRevision, state_sha256: sha,
  state: z.enum(['prepared_unapproved', 'approved_unrendered', 'rendered_unregistered', 'registered', 'source_changed', 'closed']),
  programme: programmeRefSchema, programme_facts: orderProgrammeFacts, identity_snapshot: orderIdentitySchema, dates: orderDatesSchema, basis: bases, grounds: text(2000), decision: recordedOrderDecisionSchema.nullable(),
  official_order_number: officialOrderNumberSchema.nullable(), render: orderRenderJobSchema.nullable(), artifact: orderArtifactSchema.nullable(), registry: orderRegistryRefSchema.nullable(), execution_assurance: z.literal('signature_not_observed_by_this_feature'), capabilities: orderCapabilitiesSchema,
}).strict().superRefine((value, ctx) => {
  const draft = value.state === 'prepared_unapproved', approved = ['approved_unrendered', 'rendered_unregistered', 'registered'].includes(value.state), saved = ['rendered_unregistered', 'registered'].includes(value.state);
  const invalid = value.identity_snapshot.user_id !== value.subject_user_id || value.decision && (value.decision.kind !== decisionKind[value.order_kind] || value.decision.decision.grounds !== value.grounds)
    || draft && (value.decision !== null || value.official_order_number !== null || value.render !== null || value.artifact !== null || value.registry !== null)
    || approved && (!value.decision || !value.official_order_number || !value.render)
    || value.state === 'approved_unrendered' && (value.artifact !== null || value.registry !== null || value.render?.stage === 'saved')
    || saved && (!value.artifact || value.render?.stage !== 'saved')
    || value.state === 'rendered_unregistered' && value.registry !== null
    || value.state === 'registered' && (!value.registry || !value.artifact?.output_review)
    || value.registry && (!value.artifact || !same(value.registry.source, value.artifact.source))
    || value.render && (value.render.approved_order_revision > value.revision || value.artifact && (value.artifact.render_job_id !== value.render.id || value.artifact.render_generation !== value.render.generation || value.artifact.render_input_sha256 !== value.render.render_input_sha256 || value.artifact.html_sha256 !== value.render.html_sha256 || value.artifact.byte_sha256 !== value.render.staging_proof?.byte_sha256 || value.artifact.byte_size !== value.render.staging_proof?.byte_size))
    || ['source_changed', 'closed'].includes(value.state) && (value.capabilities.can_prepare || value.capabilities.can_approve || value.capabilities.can_render || value.capabilities.can_register);
  if (invalid) ctx.addIssue({ code: 'custom', message: 'Contradictory individual-order facts' });
});
export type IndividualOrder = Validated<z.infer<typeof individualOrderSchema>>;
export type OrderProgrammeRef = Validated<z.infer<typeof programmeRefSchema>>;
export type OrderProgrammeChoice = Validated<z.infer<typeof programmeChoiceSchema>>;
export type OrderProgrammeChoiceRow = Validated<z.infer<typeof programmeChoiceRowSchema>>;
export type OrderBasis = Validated<z.infer<typeof orderBasisSchema>>;
const draftFields = { expected_enrollment: enrollmentWitnessSchema, programme_choice: programmeChoiceSchema, dates: orderDatesSchema, basis: bases, grounds: text(2000) };
export const individualOrderActionSchema = z.discriminatedUnion('action', [
  z.object({ version: z.literal(1), action: z.literal('prepare'), order_kind: orderKind, ...draftFields }).strict(),
  z.object({ version: z.literal(1), action: z.literal('revise_draft'), order_id: id, expected_state_sha256: sha, ...draftFields, reason: text(2000) }).strict(),
  z.object({ version: z.literal(1), action: z.literal('approve'), order_id: id, expected_state_sha256: sha, expected_enrollment: enrollmentWitnessSchema, expected_programme: programmeRefSchema, decision: orderDecisionSchema, reason: text(2000) }).strict(),
  z.object({ version: z.literal(1), action: z.literal('register'), order_id: id, expected_state_sha256: sha, expected_artifact: orderArtifactImmutableSchema, pdf_review_confirmed: z.literal(true), reason: text(2000) }).strict(),
]);
export type IndividualOrderAction = Validated<z.infer<typeof individualOrderActionSchema>>;
export const orderEventSchema = z.object({ id, order_id: id, revision: orderRevision, action: z.enum(['prepared', 'draft_revised', 'approved', 'artifact_staged', 'artifact_saved', 'output_reviewed_and_registered', 'closed']), request_id: id, payload_sha256: sha, actor_user_id: id, server_at: orderUtc, before_sha256: sha.nullable(), after_sha256: sha, reason: text(2000) }).strict();
export const orderMissingFact = z.enum(['PROGRAM_REQUIRED', 'PROGRAM_NOT_APPROVED', 'PROGRAM_FILE_UNAVAILABLE', 'IDENTITY_REQUIRED', 'AUTHORITY_BASIS_REQUIRED', 'ADMISSION_BASIS_REQUIRED', 'PRIOR_ADMISSION_REQUIRED', 'FINAL_PROTOCOL_REQUIRED', 'COMPLETION_DECISION_REQUIRED', 'WITHDRAWAL_GROUND_REQUIRED', 'DATE_REQUIRED', 'DATE_CONFLICT', 'TIMEZONE_REQUIRED', 'RENDER_REQUIRED', 'OUTPUT_REVIEW_REQUIRED', 'EXISTING_ORDER_REVIEW_REQUIRED', 'SIGNATORY_REQUIRED']);
export const orderErrorCode = z.enum(['ACCESS_DENIED', 'INVALID_INPUT', 'NOT_FOUND', 'PREREQUISITE_MISSING', 'SOURCE_CHANGED', 'SOURCE_UNAVAILABLE', 'CONTEXT_CHANGED', 'REQUEST_CONFLICT', 'REVISION_CONFLICT', 'ORDER_EXISTS', 'DECISION_REQUIRED', 'OUTPUT_REVIEW_REQUIRED', 'ARTIFACT_RENDER_FAILED', 'DEPENDENCY_UNAVAILABLE', 'CLOSED', 'LIMIT_EXCEEDED']);
const missingFacts = z.array(orderMissingFact).max(20).refine(unique);
export const individualOrderFailureSchema = z.object({ version: z.literal(1), ok: z.literal(false), code: orderErrorCode, missing_facts: missingFacts }).strict().refine(value => value.code === 'PREREQUISITE_MISSING' || value.missing_facts.length === 0);

export const orderRenderVariablesSchema = z.object({ organization_name: text(1000), organization_inn: text(20, true).nullable(), organization_ogrn: text(20, true).nullable(), organization_requisites_sha256: sha,
  issuer_name: text(500), issuer_position: text(300), issuer_authority_basis: orderBasisSchema.refine(value => value.role === 'authority_document'), student_full_name: text(500),
  programme_type: educationProgrammeType, programme_type_label: text(200), programme_title: text(4000), academic_hours: z.number().int().min(1).max(999999), order_kind: orderKind, official_order_number: text(120),
  document_date: orderDate, effective_date: orderDate, training_start_date: orderDate, training_end_date: orderDate.nullable(), timezone: orderTimezone, grounds_text: text(2000), basis_labels: z.array(text(2000)).min(1).max(10), decision_event_id: id, decision_recorded_at: orderUtc, signature_assurance: z.literal('not_observed'),
}).strict().refine(value => value.programme_type_label === programmeTypeLabels[value.programme_type] && (value.training_end_date === null || value.training_end_date >= value.training_start_date));
export type IndividualOrderRenderVariables = Validated<z.infer<typeof orderRenderVariablesSchema>>;
export const orderRenderInputSchema = z.object({ version: z.literal(1), organization_id: id, enrollment_id: id, subject_user_id: id, course_id: id, order_id: id, approved_order_revision: orderRevision, approved_order_sha256: sha, render_job_id: id, render_generation: orderRevision,
  programme: programmeRefSchema, programme_facts: orderProgrammeFacts, identity_snapshot: orderIdentitySchema, dates: orderDatesSchema, official_order_number: officialOrderNumberSchema, decision: recordedOrderDecisionSchema, variables: orderRenderVariablesSchema, ...renderer,
}).strict().superRefine((value, ctx) => {
  const v = value.variables, p = value.programme_facts;
  if (value.identity_snapshot.user_id !== value.subject_user_id || v.student_full_name !== value.identity_snapshot.full_name || v.programme_type !== p.program_type || v.programme_title !== p.full_title || v.academic_hours !== p.academic_hours
    || v.official_order_number !== value.official_order_number.display || v.decision_event_id !== value.decision.event_id || v.decision_recorded_at !== value.decision.server_at || v.order_kind !== ({ admit: 'admission', complete: 'completion', terminate_early: 'early_withdrawal' } as const)[value.decision.kind]
    || v.grounds_text !== value.decision.decision.grounds || v.document_date !== value.dates.document_date || v.effective_date !== value.dates.effective_date || v.training_start_date !== value.dates.training_start_date || v.training_end_date !== value.dates.training_end_date || v.timezone !== value.dates.timezone) ctx.addIssue({ code: 'custom', message: 'Render variables do not match frozen order facts' });
});
export const orderRenderContextSchema = z.object({ version: z.literal(1), organization_id: id, enrollment_id: id, subject_user_id: id, course_id: id, actor_user_id: id, order_id: id, current_order_revision: orderRevision, current_order_state_sha256: sha,
  current_order_state: z.enum(['approved_unrendered', 'rendered_unregistered', 'registered']), render_job: orderRenderJobSchema,
  render_input_json: z.string().refine(value => new TextEncoder().encode(value).length <= 196608), render_input_sha256: sha,
  staging: z.object({ bucket: z.literal('uc-individual-order-staging'), path: text(1000), proof: orderStageProofSchema.nullable(), observed_object: orderObjectObservationSchema.nullable() }).strict(),
  output: z.object({ document_id: id, upload_request_id: id, expected_document_revision: z.literal(0), file_name: text(200), file_path: text(1000), document: z.object({ name: text(1000), type: z.literal('other'), issue_date: orderDate, status: z.literal('active') }).strict(), source: registrySourceSchema.nullable(), object: orderObjectIdentitySchema.nullable(), artifact: orderArtifactSchema.nullable(), observed_object: orderObjectObservationSchema.nullable() }).strict(), registry: orderRegistryRefSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  const job = value.render_job, saved = job.stage === 'saved';
  if (value.current_order_revision < job.approved_order_revision || job.render_input_sha256 !== value.render_input_sha256 || !same(job.staging_proof, value.staging.proof)
    || value.staging.path !== [value.subject_user_id, value.organization_id, value.order_id, job.id, value.render_input_sha256 + '.pdf'].join('/')
    || value.output.file_path !== [value.organization_id, 'versions', value.output.document_id, value.output.upload_request_id + '.pdf'].join('/') || !/^[^\\/\x00-\x1f]{1,196}\.pdf$/i.test(value.output.file_name)
    || (value.output.source !== null) !== (value.output.object !== null) || saved !== (value.output.artifact !== null)
    || job.stage === 'prepared' && (value.output.source !== null || value.output.object !== null)
    || value.output.source && (value.output.source.document_id !== value.output.document_id || !value.output.observed_object || value.output.observed_object.object_id !== value.output.object?.object_id || value.output.observed_object.updated_at !== value.output.object?.updated_at)
    || saved && (value.output.source?.document_id !== value.output.document_id || !same(value.output.source, value.output.artifact?.source) || value.output.artifact?.render_job_id !== job.id || value.output.artifact?.render_generation !== job.generation || value.output.artifact?.byte_sha256 !== job.staging_proof?.byte_sha256 || value.output.artifact?.byte_size !== job.staging_proof?.byte_size || value.output.artifact?.html_sha256 !== job.html_sha256)
    || saved !== (value.current_order_state !== 'approved_unrendered') || (value.registry !== null) !== (value.current_order_state === 'registered') || value.registry && !same(value.registry.source, value.output.source)) ctx.addIssue({ code: 'custom', message: 'Unconfirmed exact render context' });
  for (const observed of [value.staging.observed_object, value.output.observed_object]) {
    if (observed && (observed.provenance.order_id !== value.order_id || observed.provenance.render_job_id !== job.id || observed.provenance.render_generation !== job.generation || observed.provenance.render_input_sha256 !== job.render_input_sha256
      || job.html_sha256 !== null && observed.provenance.html_sha256 !== job.html_sha256 || job.staging_proof && (observed.provenance.byte_sha256 !== job.staging_proof.byte_sha256 || observed.byte_size !== job.staging_proof.byte_size))) ctx.addIssue({ code: 'custom', message: 'Observation belongs to another frozen job' });
  }
  if (job.staging_proof && (!value.staging.observed_object || value.staging.observed_object.object_id !== job.staging_proof.object_id || value.staging.observed_object.updated_at !== job.staging_proof.updated_at)
    || saved && (!value.output.observed_object || value.output.observed_object.object_id !== value.output.object?.object_id || value.output.observed_object.updated_at !== value.output.object?.updated_at)) ctx.addIssue({ code: 'custom', message: 'Missing actual object observation' });
});
export type IndividualOrderRenderContext = Validated<z.infer<typeof orderRenderContextSchema>>;
export const individualOrderQuerySchema = z.discriminatedUnion('kind', [
  z.object({ version: z.literal(1), kind: z.literal('summary') }).strict(),
  z.object({ version: z.literal(1), kind: z.literal('order'), order_id: id }).strict(),
  z.object({ version: z.literal(1), kind: z.literal('history'), order_id: id, after_revision: orderRevision0, limit: z.number().int().min(1).max(100) }).strict(),
  z.object({ version: z.literal(1), kind: z.literal('programme_choices'), after_version_id: id.nullable(), limit: z.number().int().min(1).max(100) }).strict(),
  z.object({ version: z.literal(1), kind: z.literal('render_context'), order_id: id, expected_revision: orderRevision, expected_state_sha256: sha, render_request_id: id }).strict(),
]);
export type IndividualOrderQuery = Validated<z.infer<typeof individualOrderQuerySchema>>;
const envelope = { version: z.literal(1), ok: z.literal(true), organization_id: id, actor_user_id: id, enrollment_id: id, subject_user_id: id, course_id: id };
export const individualOrderReadSchema = z.discriminatedUnion('kind', [
  z.object({ ...envelope, kind: z.literal('summary'), context: z.object({ enrollment_witness: enrollmentWitnessSchema, student_label: text(500), course_label: text(2000) }).strict(), suggested_programme: programmeChoiceSchema.nullable(), orders: z.array(individualOrderSchema).max(2), missing_facts: missingFacts, capabilities: z.object({ can_prepare: z.boolean() }).strict() }).strict(),
  z.object({ ...envelope, kind: z.literal('order'), order: individualOrderSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('history'), order_id: id, events: z.array(orderEventSchema).max(100), next_after_revision: orderRevision.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('programme_choices'), choices: z.array(programmeChoiceRowSchema).max(100), next_after_version_id: id.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('render_context'), render_context: orderRenderContextSchema }).strict(),
]);
export type IndividualOrderRead = Validated<z.infer<typeof individualOrderReadSchema>>;
export const individualOrderApplySchema = z.object({ ...envelope, kind: z.literal('apply'), request_id: id, replayed: z.boolean(), event_id: id, revision_applied: orderRevision, order: individualOrderSchema }).strict();
export type IndividualOrderApply = Validated<z.infer<typeof individualOrderApplySchema>>;
export const orderRenderRequestSchema = z.object({ version: z.literal(1), organization_id: id, enrollment_id: id, order_id: id, expected_order_revision: orderRevision, expected_order_sha256: sha, render_request_id: id }).strict();
export const orderRenderReplySchema = z.object({ version: z.literal(1), ok: z.literal(true), kind: z.literal('artifact_saved'), organization_id: id, enrollment_id: id, order_id: id, render_job_id: id, render_generation: orderRevision, render_request_id: id, approved_order_revision: orderRevision, approved_order_sha256: sha, status: z.enum(['rendered_unregistered', 'registered']), artifact: orderArtifactSchema, registry: orderRegistryRefSchema.nullable() }).strict().refine(value => (value.registry !== null) === (value.status === 'registered') && (!value.registry || same(value.registry.source, value.artifact.source)));
export type IndividualOrderRenderReply = Validated<z.infer<typeof orderRenderReplySchema>>;
export const orderAttestationBindingSchema = z.object({ version: z.literal(1), organization_id: id, enrollment_id: id, subject_user_id: id, course_id: id, order_id: id, approved_order_revision: orderRevision, approved_order_sha256: sha, render_job_id: id, render_generation: orderRevision, render_request_id: id, render_input_sha256: sha, ...renderer }).strict();
export const orderTrustedAttestationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('staging'), object_id: id, object_updated_at: exactUtc, html_sha256: sha, render_input_sha256: sha, byte_sha256: sha, byte_size: bytes, ...renderer }).strict(),
  z.object({ kind: z.literal('output'), source: registrySourceSchema, object_id: id, object_updated_at: exactUtc, staging_object_id: id, staging_updated_at: exactUtc, byte_sha256: sha, byte_size: bytes, render_input_sha256: sha, html_sha256: sha, ...renderer }).strict(),
]);
export const orderAttestationReplySchema = z.object({ version: z.literal(1), ok: z.literal(true), kind: z.enum(['staging_attested', 'artifact_attested']), organization_id: id, enrollment_id: id, order_id: id, render_job_id: id, render_generation: orderRevision, render_request_id: id, render_input_sha256: sha, proof_id: id, byte_sha256: sha, byte_size: bytes, html_sha256: sha, source: registrySourceSchema.nullable(), object: orderObjectIdentitySchema, replayed: z.boolean() }).strict().refine(value => (value.source !== null) === (value.kind === 'artifact_attested'));
