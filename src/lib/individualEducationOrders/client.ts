import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { captureCustomJournalScope, customJournalScopeCurrent, type CustomJournalScope } from '@/lib/customJournals/client';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { captureDocumentRegistryScope, readDocumentRegistry } from '@/lib/documentRegistry/client';
import { registrySourceSchema, type RegistrySource } from '@/lib/documentRegistry/contract';
import { parseWorkflowEnvelope } from '@/lib/orgDocumentWorkflow';
import { evidenceSha256 } from '@/lib/signatureAssurance/validation';
import * as c from './contract';

export interface IndividualOrderScope extends CustomJournalScope { enrollmentId: string; subjectUserId: string; courseId: string }
export type IndividualOrderErrorCode = z.infer<typeof c.orderErrorCode>;
export class IndividualOrderError extends Error {
  constructor(readonly code: IndividualOrderErrorCode = 'DEPENDENCY_UNAVAILABLE', readonly missingFacts: readonly z.infer<typeof c.orderMissingFact>[] = []) { super(individualOrderMessages[code]); this.name = 'IndividualOrderError'; }
}
export const individualOrderMessages: Record<IndividualOrderErrorCode, string> = {
  ACCESS_DENIED: 'Доступ к приказам этого обучения не подтверждён.', INVALID_INPUT: 'Проверьте выбранную программу, основания и даты.', NOT_FOUND: 'Приказ не найден в этом обучении.',
  PREREQUISITE_MISSING: 'Сначала подтвердите недостающие сведения и основания.', SOURCE_CHANGED: 'Исходные сведения изменились. Обновите подготовку; история сохранена.',
  SOURCE_UNAVAILABLE: 'Точная версия документа сейчас недоступна.', CONTEXT_CHANGED: 'Связь с обучением изменилась. Обновите сведения.',
  REQUEST_CONFLICT: 'Сохранённый запрос связан с другими данными. Проверьте состояние.', REVISION_CONFLICT: 'Сведения изменились. Проверьте состояние перед повтором.', ORDER_EXISTS: 'Для этого этапа уже есть приказ. Откройте существующую запись.',
  DECISION_REQUIRED: 'Нужно отдельное решение уполномоченного сотрудника.', OUTPUT_REVIEW_REQUIRED: 'Сначала проверьте сохранённый PDF.', ARTIFACT_RENDER_FAILED: 'PDF не сформирован. Приказ не зарегистрирован.',
  DEPENDENCY_UNAVAILABLE: 'Результат пока не подтверждён. Проверьте сохранённый запрос.', CLOSED: 'Продолжение этого приказа закрыто. История сохранена.', LIMIT_EXCEEDED: 'Объём превышает допустимый предел. Сведения не сокращены.',
};
export function normalizeIndividualOrderError(error: unknown): IndividualOrderError {
  if (error instanceof IndividualOrderError) return error;
  const raw = error as { code?: string; status?: number; message?: string } | null;
  if (raw?.code === '42501' || raw?.status === 401 || raw?.status === 403) return new IndividualOrderError('ACCESS_DENIED');
  if (raw?.code === '22023') return new IndividualOrderError('INVALID_INPUT');
  if (raw?.code === '40001' || raw?.code === 'PT409' || raw?.code === '55P03') return new IndividualOrderError('REVISION_CONFLICT');
  const domain = c.orderErrorCode.safeParse(raw?.message?.match(/^UC_INDIVIDUAL_ORDER_([A-Z_]+)$/)?.[1]);
  return new IndividualOrderError(domain.success ? domain.data : 'DEPENDENCY_UNAVAILABLE');
}
export function captureIndividualOrderScope(organizationId: string, enrollmentId: string, target: { subjectUserId: string; courseId: string }, current?: () => boolean): IndividualOrderScope {
  if (![organizationId, enrollmentId, target.subjectUserId, target.courseId].every(value => c.individualOrderUuid.safeParse(value).success)) throw new IndividualOrderError('INVALID_INPUT');
  try { return Object.freeze({ ...captureCustomJournalScope(organizationId, current), enrollmentId, ...target }); }
  catch { throw new IndividualOrderError('ACCESS_DENIED'); }
}
export const individualOrderScopeCurrent = (scope: IndividualOrderScope) => customJournalScopeCurrent(scope);
const requireCurrent = (scope: IndividualOrderScope) => { if (!individualOrderScopeCurrent(scope)) throw new IndividualOrderError('ACCESS_DENIED'); };
function invalid(code: IndividualOrderErrorCode = 'DEPENDENCY_UNAVAILABLE'): never { throw new IndividualOrderError(code); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
async function bearer(scope: IndividualOrderScope) {
  requireCurrent(scope); const session = await supabase.auth.getSession(); requireCurrent(scope);
  if (session.error || session.data.session?.user.id !== scope.actorId || !session.data.session.access_token) throw new IndividualOrderError('ACCESS_DENIED');
  return 'Bearer ' + session.data.session.access_token;
}
async function call(scope: IndividualOrderScope, name: string, args: Record<string, unknown>) {
  const authorization = await bearer(scope); requireCurrent(scope);
  const result = await supabase.rpc(name as never, args as never).setHeader('Authorization', authorization); requireCurrent(scope);
  if (result.status === 401 || result.status === 403) throw new IndividualOrderError('ACCESS_DENIED');
  if (result.error) throw normalizeIndividualOrderError(result.error);
  const failure = c.individualOrderFailureSchema.safeParse(result.data);
  if (failure.success) throw new IndividualOrderError(failure.data.code, Object.freeze([...failure.data.missing_facts]));
  return result.data;
}
function envelope(scope: IndividualOrderScope, value: { organization_id?: string; actor_user_id?: string; enrollment_id?: string; subject_user_id?: string; course_id?: string }) {
  if (value.organization_id !== scope.organizationId || value.actor_user_id !== scope.actorId || value.enrollment_id !== scope.enrollmentId || value.subject_user_id !== scope.subjectUserId || value.course_id !== scope.courseId) invalid('ACCESS_DENIED');
}
export function assertIndividualOrder(scope: IndividualOrderScope, value: c.IndividualOrder) {
  if (value.organization_id !== scope.organizationId || value.enrollment_id !== scope.enrollmentId || value.subject_user_id !== scope.subjectUserId || value.course_id !== scope.courseId || value.identity_snapshot.user_id !== scope.subjectUserId) invalid('SOURCE_CHANGED');
  if (value.official_order_number && value.official_order_number.year !== Number(value.dates.document_date.slice(0, 4))) invalid('SOURCE_CHANGED');
}
function ascending(values: string[], after: string | null, next: string | null, limit: number) {
  let last = after; if (values.length > limit) invalid();
  for (const value of values) { if (last !== null && value <= last) invalid(); last = value; }
  // This bounded raw-catalog cursor may skip unavailable approved files. Returned choices remain strictly sorted.
  if (next !== null && (after !== null && next <= after || last !== null && next < last)) invalid();
}
async function verifyRenderContext(scope: IndividualOrderScope, context: c.IndividualOrderRenderContext) {
  envelope(scope, context); const parsed: unknown = (() => { try { return JSON.parse(context.render_input_json); } catch { return null; } })();
  const input = c.orderRenderInputSchema.safeParse(parsed);
  if (!input.success || await evidenceSha256(context.render_input_json) !== context.render_input_sha256) invalid('SOURCE_CHANGED');
  requireCurrent(scope); const value = input.data, job = context.render_job;
  if (value.organization_id !== scope.organizationId || value.enrollment_id !== scope.enrollmentId || value.subject_user_id !== scope.subjectUserId || value.course_id !== scope.courseId || value.order_id !== context.order_id
    || value.approved_order_revision !== job.approved_order_revision || value.approved_order_sha256 !== job.approved_order_sha256 || value.render_job_id !== job.id || value.render_generation !== job.generation
    || context.output.document.issue_date !== value.dates.document_date) invalid('SOURCE_CHANGED');
}
export async function readIndividualEducationOrder(scope: IndividualOrderScope, raw: c.IndividualOrderQuery): Promise<c.IndividualOrderRead> {
  requireCurrent(scope); const query = c.individualOrderQuerySchema.safeParse(structuredClone(raw)); if (!query.success) invalid('INVALID_INPUT');
  const parsed = c.individualOrderReadSchema.safeParse(await call(scope, 'read_individual_education_order', { p_organization_id: scope.organizationId, p_enrollment_id: scope.enrollmentId, p_query: query.data }));
  if (!parsed.success) invalid(); const value = parsed.data as c.IndividualOrderRead; envelope(scope, value); if (value.kind !== query.data.kind) invalid();
  if (value.kind === 'summary') {
    if (new Set(value.orders.map(row => row.id)).size !== value.orders.length || new Set(value.orders.map(row => row.order_kind === 'admission' ? 'admission' : 'termination')).size !== value.orders.length || value.suggested_programme && value.suggested_programme.kind !== 'course_binding') invalid();
    value.orders.forEach(row => assertIndividualOrder(scope, row));
  } else if (value.kind === 'order' && query.data.kind === 'order') {
    assertIndividualOrder(scope, value.order); if (value.order.id !== query.data.order_id) invalid('SOURCE_CHANGED');
  } else if (value.kind === 'history' && query.data.kind === 'history') {
    if (value.order_id !== query.data.order_id || value.events.length > query.data.limit) invalid();
    let revision = query.data.after_revision; const ids = new Set<string>();
    for (const event of value.events) { if (event.order_id !== query.data.order_id || event.revision <= revision || ids.has(event.id)) invalid(); revision = event.revision; ids.add(event.id); }
    if (value.next_after_revision !== null && (!value.events.length || value.next_after_revision !== revision)) invalid();
  } else if (value.kind === 'programme_choices' && query.data.kind === 'programme_choices') {
    ascending(value.choices.map(choice => choice.id), query.data.after_version_id, value.next_after_version_id, query.data.limit);
    if (value.choices.some(choice => choice.organization_id !== scope.organizationId || choice.course_id !== scope.courseId)) invalid('SOURCE_CHANGED');
  } else if (value.kind === 'render_context' && query.data.kind === 'render_context') {
    const context = value.render_context, job = context.render_job;
    if (context.order_id !== query.data.order_id || job.approved_order_revision !== query.data.expected_revision || job.approved_order_sha256 !== query.data.expected_state_sha256 || job.request_id !== query.data.render_request_id) invalid('SOURCE_CHANGED');
    await verifyRenderContext(scope, context);
  } else invalid();
  requireCurrent(scope); return freeze(value);
}
/** Rows are obtained from the normal bounded server choice list, never typed hashes or arbitrary course IDs. */
export async function readIndividualOrderProgrammeChoices(scope: IndividualOrderScope, afterVersionId: string | null = null) {
  const value = await readIndividualEducationOrder(scope, { version: 1, kind: 'programme_choices', after_version_id: afterVersionId, limit: 100 });
  if (value.kind !== 'programme_choices') invalid(); return { choices: value.choices, nextAfterVersionId: value.next_after_version_id };
}
export function chooseIndividualOrderProgramme(scope: IndividualOrderScope, raw: c.OrderProgrammeChoiceRow, individualReason?: string): c.OrderProgrammeChoice {
  requireCurrent(scope); const row = c.programmeChoiceRowSchema.safeParse(structuredClone(raw));
  if (!row.success || row.data.organization_id !== scope.organizationId || row.data.course_id !== scope.courseId) invalid('INVALID_INPUT');
  const input = individualReason === undefined && row.data.course_binding_revision !== null
    ? { kind: 'course_binding', expected_binding_revision: row.data.course_binding_revision, programme: row.data.programme }
    : { kind: 'individual_selection', programme: row.data.programme, selection_reason: individualReason };
  const choice = c.programmeChoiceSchema.safeParse(input); if (!choice.success) invalid('INVALID_INPUT'); return freeze(choice.data as c.OrderProgrammeChoice);
}
function registryScope(scope: IndividualOrderScope) {
  requireCurrent(scope); const captured = captureDocumentRegistryScope(scope.organizationId, { kind: 'organization' }, () => individualOrderScopeCurrent(scope));
  if (captured.actorId !== scope.actorId || captured.accessRevision !== scope.accessRevision) invalid('ACCESS_DENIED'); return captured;
}
export async function readIndividualOrderSourceChoices(scope: IndividualOrderScope, search = '', afterId: string | null = null) {
  const value = await readDocumentRegistry(registryScope(scope), { kind: 'sources', text: search, after_id: afterId, limit: 100 }); requireCurrent(scope);
  if (value.kind !== 'sources') invalid(); return { choices: value.sources, nextAfterId: value.next_after_id };
}
/** Resolve a selected actual protected version and its approved review; the operator only selects role/provision. */
export async function readIndividualOrderBasisReviews(scope: IndividualOrderScope, raw: RegistrySource) {
  requireCurrent(scope); const source = registrySourceSchema.safeParse(structuredClone(raw)); if (!source.success) invalid('INVALID_INPUT');
  const selected = await readDocumentRegistry(registryScope(scope), { kind: 'source', document_id: source.data.document_id, version_id: source.data.version_id }); requireCurrent(scope);
  if (selected.kind !== 'source' || !sameCopyValue(selected.source.source, source.data)) invalid('SOURCE_CHANGED');
  const workflowRaw = await call(scope, 'get_org_document_workflow', { p_document_id: source.data.document_id });
  let workflow; try { workflow = parseWorkflowEnvelope(workflowRaw, source.data.document_id, scope.organizationId); } catch { invalid('SOURCE_UNAVAILABLE'); }
  const approved = workflow.cycles.filter(cycle => cycle.version_id === source.data.version_id && cycle.state === 'approved' && cycle.approval !== null);
  return Object.freeze(approved.map(cycle => Object.freeze({ label: selected.source.label, source: freeze(structuredClone(source.data)), review_id: cycle.id, review_revision: cycle.revision, approval_number: cycle.approval!.number, approval_date: cycle.approval!.date })));
}
const draftActionMatches = (action: Extract<c.IndividualOrderAction, { action: 'prepare' | 'revise_draft' }>, order: c.IndividualOrder) => sameCopyValue(action.programme_choice.programme, order.programme) && sameCopyValue(action.dates, order.dates) && sameCopyValue(action.basis, order.basis) && action.grounds === order.grounds && action.expected_enrollment.identity_sha256 === order.identity_snapshot.identity_sha256;
const immutableArtifact = (value: NonNullable<c.IndividualOrder['artifact']>) => { const { output_review: _, ...artifact } = value; return artifact; };
/** Freeze one actual operator intent. An uncertain transport must reuse this object/request ID, not allocate another number. */
export function prepareIndividualEducationOrderAction(scope: IndividualOrderScope, currentOrder: c.IndividualOrder | null, raw: c.IndividualOrderAction, requestId: string = crypto.randomUUID()) {
  requireCurrent(scope); const parsed = c.individualOrderActionSchema.safeParse(structuredClone(raw)), before = currentOrder === null ? null : c.individualOrderSchema.safeParse(structuredClone(currentOrder));
  if (!parsed.success || !c.individualOrderUuid.safeParse(requestId).success || before && !before.success) invalid('INVALID_INPUT');
  const action = freeze(parsed.data as c.IndividualOrderAction), original = before?.success ? freeze(before.data as c.IndividualOrder) : null;
  if (original) assertIndividualOrder(scope, original);
  if (action.action === 'prepare' ? original !== null : !original || action.order_id !== original.id || action.expected_state_sha256 !== original.state_sha256) invalid('INVALID_INPUT');
  if (action.action === 'revise_draft' && (!original?.capabilities.can_prepare || original.state !== 'prepared_unapproved')) invalid('ACCESS_DENIED');
  if (action.action === 'approve' && (!original?.capabilities.can_approve || original.state !== 'prepared_unapproved' || !sameCopyValue(action.expected_programme, original.programme) || action.expected_enrollment.identity_sha256 !== original.identity_snapshot.identity_sha256 || action.decision.grounds !== original.grounds)) invalid('DECISION_REQUIRED');
  if (action.action === 'register' && (!original?.capabilities.can_register || original.state !== 'rendered_unregistered' || !original.artifact || !sameCopyValue(action.expected_artifact, immutableArtifact(original.artifact)))) invalid('OUTPUT_REVIEW_REQUIRED');
  const expectedRevision = original?.revision ?? 0, args = freeze({ p_organization_id: scope.organizationId, p_enrollment_id: scope.enrollmentId, p_expected_revision: expectedRevision, p_request_id: requestId, p_action: action });
  let inFlight: Promise<c.IndividualOrderApply> | null = null;
  const execute = async (): Promise<c.IndividualOrderApply> => {
    const response = c.individualOrderApplySchema.safeParse(await call(scope, 'apply_individual_education_order', args)); if (!response.success) invalid();
    const value = response.data as c.IndividualOrderApply, order = value.order; envelope(scope, value); assertIndividualOrder(scope, order);
    if (value.request_id !== requestId || value.revision_applied !== expectedRevision + 1 || order.revision < value.revision_applied || action.action !== 'prepare' && order.id !== action.order_id) invalid();
    if (action.action === 'prepare' && (order.order_kind !== action.order_kind || !draftActionMatches(action, order)) || action.action === 'revise_draft' && !draftActionMatches(action, order)) invalid('SOURCE_CHANGED');
    if (action.action === 'approve' && (!order.decision || order.decision.actor_user_id !== scope.actorId || !sameCopyValue(order.decision.decision, action.decision) || !sameCopyValue(order.programme, original!.programme) || !sameCopyValue(order.dates, original!.dates) || !sameCopyValue(order.identity_snapshot, original!.identity_snapshot) || !sameCopyValue(order.basis, original!.basis))) invalid('SOURCE_CHANGED');
    if (action.action === 'register' && (!order.registry || !order.artifact || !sameCopyValue(immutableArtifact(order.artifact), action.expected_artifact) || !sameCopyValue(order.official_order_number, original!.official_order_number) || !sameCopyValue(order.decision, original!.decision))) invalid('SOURCE_CHANGED');
    requireCurrent(scope); return freeze(value);
  };
  return Object.freeze({ requestId, action, run() { requireCurrent(scope); if (!inFlight) inFlight = execute().catch(error => { throw normalizeIndividualOrderError(error); }).finally(() => { inFlight = null; }); return inFlight; } });
}
function sameApprovedGeneration(before: c.IndividualOrder, after: c.IndividualOrder) {
  const first = before.render, last = after.render;
  return before.id === after.id && sameCopyValue(before.programme, after.programme) && sameCopyValue(before.programme_facts, after.programme_facts) && sameCopyValue(before.identity_snapshot, after.identity_snapshot) && sameCopyValue(before.dates, after.dates) && sameCopyValue(before.basis, after.basis) && sameCopyValue(before.decision, after.decision) && sameCopyValue(before.official_order_number, after.official_order_number)
    && first && last && first.id === last.id && first.generation === last.generation && first.request_id === last.request_id && first.approved_order_revision === last.approved_order_revision && first.approved_order_sha256 === last.approved_order_sha256 && first.render_input_sha256 === last.render_input_sha256;
}
async function renderIndividualEducationOrderPdf(scope: IndividualOrderScope, selected: c.IndividualOrder): Promise<c.IndividualOrder> {
  requireCurrent(scope); const checked = c.individualOrderSchema.safeParse(selected); if (!checked.success) invalid('INVALID_INPUT'); assertIndividualOrder(scope, checked.data as c.IndividualOrder);
  const read = await readIndividualEducationOrder(scope, { version: 1, kind: 'order', order_id: checked.data.id });
  if (read.kind !== 'order' || !sameApprovedGeneration(checked.data as c.IndividualOrder, read.order)) invalid('SOURCE_CHANGED');
  const fresh = read.order, job = fresh.render;
  if (fresh.state === 'rendered_unregistered' || fresh.state === 'registered') return fresh;
  if (fresh.state !== 'approved_unrendered' || !fresh.capabilities.can_render || !job) invalid('ACCESS_DENIED');
  const request = c.orderRenderRequestSchema.parse({ version: 1, organization_id: scope.organizationId, enrollment_id: scope.enrollmentId, order_id: fresh.id, expected_order_revision: job.approved_order_revision, expected_order_sha256: job.approved_order_sha256, render_request_id: job.request_id });
  const authorization = await bearer(scope); requireCurrent(scope);
  const verified = await supabase.auth.getUser(authorization.slice(7)); requireCurrent(scope); if (verified.error || verified.data.user?.id !== scope.actorId) invalid('ACCESS_DENIED');
  const response = await supabase.functions.invoke('individual-education-order-artifact', { body: request, headers: { Authorization: authorization }, timeout: 60000 }); requireCurrent(scope);
  let data: unknown = response.data;
  if (response.error) {
    const context = (response.error as { context?: unknown }).context;
    if (context instanceof Response) { try { data = await context.clone().json(); } catch { data = null; } requireCurrent(scope); }
    const failure = c.individualOrderFailureSchema.safeParse(data); if (failure.success) throw new IndividualOrderError(failure.data.code, failure.data.missing_facts); throw normalizeIndividualOrderError(response.error);
  }
  const failure = c.individualOrderFailureSchema.safeParse(data); if (failure.success) throw new IndividualOrderError(failure.data.code, failure.data.missing_facts);
  const parsed = c.orderRenderReplySchema.safeParse(data); if (!parsed.success) invalid(); const result = parsed.data as c.IndividualOrderRenderReply;
  if (result.organization_id !== scope.organizationId || result.enrollment_id !== scope.enrollmentId || result.order_id !== fresh.id || result.render_job_id !== job.id || result.render_generation !== job.generation || result.render_request_id !== job.request_id || result.approved_order_revision !== job.approved_order_revision || result.approved_order_sha256 !== job.approved_order_sha256 || result.artifact.render_input_sha256 !== job.render_input_sha256) invalid('SOURCE_CHANGED');
  const saved = await readIndividualEducationOrder(scope, { version: 1, kind: 'order', order_id: fresh.id });
  if (saved.kind !== 'order' || !sameApprovedGeneration(fresh, saved.order) || !saved.order.artifact || !sameCopyValue(immutableArtifact(saved.order.artifact), immutableArtifact(result.artifact)) || saved.order.state !== result.status || !sameCopyValue(saved.order.registry, result.registry)) invalid('SOURCE_CHANGED');
  return saved.order;
}
/** The stored render request survives reload. Keep this object while a render result is uncertain. */
export function prepareIndividualOrderRender(scope: IndividualOrderScope, raw: c.IndividualOrder) {
  requireCurrent(scope); const parsed = c.individualOrderSchema.safeParse(structuredClone(raw)); if (!parsed.success) invalid('INVALID_INPUT');
  const selected = freeze(parsed.data as c.IndividualOrder); assertIndividualOrder(scope, selected); if (!selected.render) invalid('DECISION_REQUIRED');
  let inFlight: Promise<c.IndividualOrder> | null = null;
  return Object.freeze({ requestId: selected.render.request_id, run() { requireCurrent(scope); if (!inFlight) inFlight = renderIndividualEducationOrderPdf(scope, selected).catch(error => { throw normalizeIndividualOrderError(error); }).finally(() => { inFlight = null; }); return inFlight; } });
}
