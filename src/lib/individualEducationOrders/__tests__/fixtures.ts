import { evidenceSha256 } from '@/lib/signatureAssurance/validation';
import { programmeTypeLabels, type IndividualOrder, type IndividualOrderRenderContext, type IndividualOrderRenderVariables, type IndividualOrderAction, type OrderProgrammeChoiceRow } from '../contract';
export const uid = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const org = uid(1), actor = uid(2), pupil = uid(3), enrollment = uid(4), course = uid(5), orderId = uid(6), request = uid(7), stamp = '2026-11-23T12:00:00.123456Z';
export const hash = 'a'.repeat(64), identityHash = 'b'.repeat(64), inputHash = 'c'.repeat(64), htmlHash = 'd'.repeat(64), byteHash = 'e'.repeat(64);
export const source = (document = 18, version = 19) => ({ kind: 'org_document_version' as const, document_id: uid(document), version_id: uid(version), content_hash: hash });
export const facts = () => ({ schema_version: 1 as const, full_title: 'Синтетическая программа проверки', program_type: 'professional_training' as const, academic_hours: 72, training_form: 'full_time' as const, uses_elearning: true, uses_distance_learning: false, duration_calendar: 'Две недели', attestation_form: 'Проверка по протоколу', attestation_criteria: 'Установленные в программе критерии', qualification: null, profession: 'Синтетическая профессия' });
export const programme = () => ({ program_id: uid(10), version_id: uid(11), version_revision: 4, facts_sha256: hash, file: source(), file_review_id: uid(20), file_review_revision: 3, file_approval: { number: 'ТЕСТ-1', date: '2026-11-20' }, snapshot_sha256: hash });
export const witness = () => ({ document_facts_revision: 1, registry_context_binding_sha256: hash, identity_sha256: identityHash });
export const basis = (role: 'application' | 'authority_document' = 'application') => ({ role, source: source(role === 'application' ? 21 : 23, role === 'application' ? 22 : 24), review_id: uid(role === 'application' ? 25 : 26), review_revision: 2, provision: role === 'application' ? 'Синтетическое заявление №1' : 'Синтетическое основание полномочий №2' });
export const dates = () => ({ document_date: '2026-11-23', effective_date: '2026-11-24', training_start_date: '2026-11-24', training_end_date: '2026-12-05', timezone: 'Asia/Vladivostok' });
export function preparedOrder(): IndividualOrder {
  return { id: orderId, organization_id: org, enrollment_id: enrollment, subject_user_id: pupil, course_id: course, order_kind: 'admission', revision: 1, state_sha256: '1'.repeat(64), state: 'prepared_unapproved',
    programme: programme(), programme_facts: facts(), identity_snapshot: { source: 'current_student_registration', profile_id: uid(27), user_id: pupil, full_name: 'Иванов Иван Иванович', birth_date: null, identity_sha256: identityHash, name_assurance: 'registered_data_and_explicit_staff_review' },
    dates: dates(), basis: [basis(), basis('authority_document')], grounds: 'Синтетическое основание для проверки, не решение клиента.', decision: null, official_order_number: null, render: null, artifact: null, registry: null,
    execution_assurance: 'signature_not_observed_by_this_feature', capabilities: { can_prepare: true, can_approve: true, can_render: false, can_register: false, can_open_source: false } };
}
export function approvedOrder(): IndividualOrder {
  const value = preparedOrder(); value.revision = 2; value.state_sha256 = '2'.repeat(64); value.state = 'approved_unrendered';
  value.decision = { event_id: uid(30), kind: 'admit', actor_user_id: actor, server_at: stamp, payload_sha256: hash, decision: { kind: 'admit', facts_checked: true, authority_checked: true, programme_checked: true, grounds: value.grounds } };
  value.official_order_number = { namespace: 'group_order', year: 2026, sequence_number: 1, display: 'УЦ-1/2026', reserved_at: stamp };
  value.render = { id: uid(40), generation: 1, request_id: uid(41), approved_order_revision: 2, approved_order_sha256: '2'.repeat(64), render_input_sha256: inputHash, html_sha256: null, renderer: 'browserless', renderer_revision: 'uc-individual-order-v1', stage: 'prepared', staging_proof: null };
  value.capabilities = { can_prepare: false, can_approve: false, can_render: true, can_register: false, can_open_source: false }; return value;
}
export function savedOrder(): IndividualOrder {
  const value = approvedOrder(); value.revision = 4; value.state_sha256 = '4'.repeat(64); value.state = 'rendered_unregistered';
  value.render = { ...value.render!, stage: 'saved', html_sha256: htmlHash, staging_proof: { proof_id: uid(50), object_id: uid(51), updated_at: stamp, render_input_sha256: inputHash, html_sha256: htmlHash, byte_sha256: byteHash, byte_size: 600, renderer: 'browserless', renderer_revision: 'uc-individual-order-v1' } };
  value.artifact = { source: source(70, 72), byte_sha256: byteHash, byte_size: 600, render_input_sha256: inputHash, html_sha256: htmlHash, render_job_id: value.render.id, render_generation: 1, proof_id: uid(74), renderer: 'browserless', renderer_revision: 'uc-individual-order-v1', output_review: null };
  value.capabilities = { can_prepare: false, can_approve: false, can_render: false, can_register: true, can_open_source: true }; return value;
}
export function registeredOrder(): IndividualOrder {
  const value = savedOrder(); value.revision = 5; value.state_sha256 = '5'.repeat(64); value.state = 'registered';
  value.artifact!.output_review = { event_id: uid(81), actor_user_id: actor, server_at: stamp, artifact_byte_sha256: byteHash };
  value.registry = { record_id: uid(80), record_revision: 1, registration_id: 'РЕГ-2026/000021', registered_at: stamp, source: structuredClone(value.artifact!.source) };
  value.capabilities.can_register = false; return value;
}
export function variables(order = approvedOrder()): IndividualOrderRenderVariables {
  return { organization_name: 'Синтетический учебный центр', organization_inn: '0000000000', organization_ogrn: null, organization_requisites_sha256: hash, issuer_name: 'Синтетический руководитель', issuer_position: 'Руководитель', issuer_authority_basis: basis('authority_document'),
    student_full_name: order.identity_snapshot.full_name, programme_type: order.programme_facts.program_type as 'professional_training', programme_type_label: programmeTypeLabels[order.programme_facts.program_type as 'professional_training'], programme_title: order.programme_facts.full_title!, academic_hours: order.programme_facts.academic_hours!,
    order_kind: order.order_kind, official_order_number: order.official_order_number!.display, document_date: order.dates.document_date, effective_date: order.dates.effective_date, training_start_date: order.dates.training_start_date, training_end_date: order.dates.training_end_date, timezone: order.dates.timezone,
    grounds_text: order.grounds, basis_labels: order.basis.map(ref => ref.provision), decision_event_id: order.decision!.event_id, decision_recorded_at: order.decision!.server_at, signature_assurance: 'not_observed' };
}
export function prepareAction(): Extract<IndividualOrderAction, { action: 'prepare' }> { return { version: 1, action: 'prepare', order_kind: 'admission', expected_enrollment: witness(), programme_choice: { kind: 'individual_selection', programme: programme(), selection_reason: 'Явный выбор для этого обучения' }, dates: dates(), basis: [basis(), basis('authority_document')], grounds: preparedOrder().grounds }; }
export function approveAction(): IndividualOrderAction { const before = preparedOrder(); return { version: 1, action: 'approve', order_id: orderId, expected_state_sha256: before.state_sha256, expected_enrollment: witness(), expected_programme: programme(), decision: approvedOrder().decision!.decision, reason: 'Синтетическая проверка и фактическое решение' }; }
export function registerAction(): IndividualOrderAction { const value = savedOrder(), { output_review: _, ...artifact } = value.artifact!; return { version: 1, action: 'register', order_id: value.id, expected_state_sha256: value.state_sha256, expected_artifact: artifact, pdf_review_confirmed: true, reason: 'Проверен точный сохранённый PDF' }; }
export function choice(): OrderProgrammeChoiceRow { return { id: programme().version_id, organization_id: org, course_id: course, label: 'Синтетическая утверждённая программа', programme: programme(), facts: facts(), course_binding_revision: null }; }
export const envelope = (kind: string) => ({ version: 1, ok: true, kind, organization_id: org, actor_user_id: actor, enrollment_id: enrollment, subject_user_id: pupil, course_id: course });
export const orderReply = (order: IndividualOrder) => ({ ...envelope('order'), order });
export const applyReply = (order: IndividualOrder, appliedRevision: number, replayed = false) => ({ ...envelope('apply'), request_id: request, replayed, event_id: uid(90), revision_applied: appliedRevision, order });
export function renderReply(order = savedOrder()) { return { version: 1, ok: true, kind: 'artifact_saved', organization_id: org, enrollment_id: enrollment, order_id: order.id, render_job_id: order.render!.id, render_generation: order.render!.generation, render_request_id: order.render!.request_id, approved_order_revision: 2, approved_order_sha256: '2'.repeat(64), status: order.state as 'rendered_unregistered' | 'registered', artifact: order.artifact, registry: order.registry }; }
export async function context(stage: 'prepared' | 'staged' | 'saved' = 'prepared'): Promise<IndividualOrderRenderContext> {
  const order = stage === 'saved' ? savedOrder() : approvedOrder(), job = order.render!;
  const input = { version: 1, organization_id: org, enrollment_id: enrollment, subject_user_id: pupil, course_id: course, order_id: order.id, approved_order_revision: job.approved_order_revision, approved_order_sha256: job.approved_order_sha256, render_job_id: job.id, render_generation: job.generation,
    programme: order.programme, programme_facts: order.programme_facts, identity_snapshot: order.identity_snapshot, dates: order.dates, official_order_number: order.official_order_number, decision: order.decision, variables: variables(order), renderer: 'browserless', renderer_revision: 'uc-individual-order-v1' };
  const literal = JSON.stringify(input), inputSha = await evidenceSha256(literal); job.render_input_sha256 = inputSha;
  if (stage !== 'prepared') { job.stage = stage; job.html_sha256 = htmlHash; job.staging_proof = { ...savedOrder().render!.staging_proof!, render_input_sha256: inputSha }; }
  const provenance = { version: 1 as const, kind: 'individual_order' as const, order_id: orderId, render_job_id: job.id, render_generation: 1, render_input_sha256: inputSha, html_sha256: htmlHash, byte_sha256: byteHash, renderer: 'browserless' as const, renderer_revision: 'uc-individual-order-v1' as const };
  if (order.artifact) order.artifact.render_input_sha256 = inputSha;
  return { version: 1, organization_id: org, enrollment_id: enrollment, subject_user_id: pupil, course_id: course, actor_user_id: actor, order_id: orderId, current_order_revision: order.revision, current_order_state_sha256: order.state_sha256, current_order_state: order.state as 'approved_unrendered' | 'rendered_unregistered', render_job: job, render_input_json: literal, render_input_sha256: inputSha,
    staging: { bucket: 'uc-individual-order-staging', path: [pupil, org, orderId, job.id, inputSha + '.pdf'].join('/'), proof: job.staging_proof, observed_object: stage === 'prepared' ? null : { object_id: uid(51), updated_at: stamp, byte_size: 600, mime_type: 'application/pdf', provenance } },
    output: { document_id: uid(70), upload_request_id: uid(71), expected_document_revision: 0, file_name: 'order.pdf', file_path: [org, 'versions', uid(70), uid(71) + '.pdf'].join('/'), document: { name: 'Индивидуальный приказ', type: 'other', issue_date: order.dates.document_date, status: 'active' }, source: order.artifact?.source ?? null, object: stage === 'saved' ? { object_id: uid(75), updated_at: stamp } : null, artifact: order.artifact, observed_object: stage === 'saved' ? { object_id: uid(75), updated_at: stamp, byte_size: 600, mime_type: 'application/pdf', provenance } : null }, registry: null };
}
