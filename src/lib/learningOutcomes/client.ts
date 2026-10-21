import { supabase } from '@/integrations/supabase/client';
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import * as c from './contract';

export interface LearningOutcomeAuthority {
  actorId: string;
  accessRevision: number;
  organizationId: string;
  current?: () => boolean;
}
export interface LearningOutcomeActorScope extends LearningOutcomeAuthority {
  studentUserId: string;
  courseId: string;
  enrollmentId: string;
  association: c.OutcomeScope | null;
}
export interface LearningCriteriaActorScope extends LearningOutcomeAuthority { courseId: string; programVersionId: string }
export class LearningOutcomeError extends Error {
  constructor(readonly code: c.OutcomeErrorCode = 'DEPENDENCY_UNAVAILABLE') { super(code); this.name = 'LearningOutcomeError'; }
}
export const learningOutcomeErrorMessages: Record<c.OutcomeErrorCode, string> = {
  INVALID_INPUT: 'Проверьте выбранное зачисление и заполненные сведения.',
  ACCESS_DENIED: 'Не удалось подтвердить доступ к итогам. Обновите права или выберите другое зачисление.',
  REVISION_CONFLICT: 'Итог изменился. Обновите сведения перед новым действием.',
  REQUEST_CONFLICT: 'Этот запрос уже использован с другими сведениями. Обновите итог.',
  SOURCE_CHANGED: 'Исходные сведения изменились. Обновите итог и проверьте изменения.',
  SOURCE_UNAVAILABLE: 'Не удалось подтвердить исходные сведения для расчёта.',
  PREREQUISITE_MISSING: 'Сначала необходимо подготовить программу, критерии и исходные сведения.',
  LIMIT_EXCEEDED: 'Достигнут предел текущего набора. Уточните выбранные сведения.',
  DEPENDENCY_UNAVAILABLE: 'Результат запроса пока не подтверждён. Можно повторить проверку.',
  PHOTO_POLICY_MISMATCH: 'Выбранный итоговый тест не соответствует действующим настройкам фотофиксации курса. Проверьте настройки курса.',
};
export function captureLearningOutcomeScope(
  organizationId: string, studentUserId: string, courseId: string, enrollmentId: string,
  association: c.OutcomeScope | null = null, current?: () => boolean,
): LearningOutcomeActorScope {
  const actor = captureOfflineContext();
  if (!actor) throw new LearningOutcomeError('ACCESS_DENIED');
  return { actorId: actor.actorId, accessRevision: actor.revision, organizationId, studentUserId, courseId, enrollmentId, association, current };
}
export function captureLearningCriteriaScope(organizationId: string, courseId: string, programVersionId: string, current?: () => boolean): LearningCriteriaActorScope {
  const actor = captureOfflineContext();
  if (!actor) throw new LearningOutcomeError('ACCESS_DENIED');
  return { actorId: actor.actorId, accessRevision: actor.revision, organizationId, courseId, programVersionId, current };
}
export function learningOutcomeScopeCurrent(scope: LearningOutcomeAuthority): boolean {
  return isOfflineActorCurrent(scope.actorId, scope.accessRevision) && (!scope.current || scope.current());
}
function requireAuthority(scope: LearningOutcomeAuthority): void {
  if (!learningOutcomeScopeCurrent(scope)) throw new LearningOutcomeError('ACCESS_DENIED');
  if (![scope.actorId, scope.organizationId].every(id => c.outcomeUuid.safeParse(id).success)) throw new LearningOutcomeError('INVALID_INPUT');
}
function requireCurrent(scope: LearningOutcomeActorScope): void {
  requireAuthority(scope);
  if (![scope.actorId, scope.organizationId, scope.studentUserId, scope.courseId, scope.enrollmentId].every(id => c.outcomeUuid.safeParse(id).success)) {
    throw new LearningOutcomeError('INVALID_INPUT');
  }
  if (scope.association) assertOutcomeScope(scope, scope.association);
}
export function normalizeLearningOutcomeError(error: unknown): LearningOutcomeError {
  if (error instanceof LearningOutcomeError) return error;
  const value = error as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown } | null;
  if (value?.status === 401 || value?.status === 403 || value?.statusCode === 401 || value?.statusCode === 403
    || value?.code === '42501' || value?.code === 'PGRST301' || value?.code === 'PGRST302') return new LearningOutcomeError('ACCESS_DENIED');
  const raw = `${typeof value?.code === 'string' ? value.code : ''} ${typeof value?.message === 'string' ? value.message : ''}`;
  const code = raw.match(/LEARNING_OUTCOME_(INVALID_INPUT|ACCESS_DENIED|REVISION_CONFLICT|REQUEST_CONFLICT|SOURCE_CHANGED|SOURCE_UNAVAILABLE|PREREQUISITE_MISSING|LIMIT_EXCEEDED|DEPENDENCY_UNAVAILABLE|PHOTO_POLICY_MISMATCH)/)?.[1];
  if (code && c.outcomeErrorCodeSchema.safeParse(code).success) return new LearningOutcomeError(code as c.OutcomeErrorCode);
  if (value?.code === '40001') return new LearningOutcomeError('REVISION_CONFLICT');
  if (value?.code === '22023') return new LearningOutcomeError('INVALID_INPUT');
  return new LearningOutcomeError();
}
function parse<T>(schema: { safeParse(value: unknown): { success: boolean; data?: T } }, value: unknown, code: c.OutcomeErrorCode = 'DEPENDENCY_UNAVAILABLE'): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new LearningOutcomeError(code);
  return parsed.data as T;
}
export function assertOutcomeScope(scope: LearningOutcomeActorScope, association: c.OutcomeScope): void {
  if (!c.outcomeScopeSchema.safeParse(association).success || association.organization_id !== scope.organizationId
    || association.user_id !== scope.studentUserId || association.course_id !== scope.courseId || association.enrollment_id !== scope.enrollmentId
    || scope.association && !c.sameOutcomeScope(scope.association, association)) throw new LearningOutcomeError();
}
async function bearerFor(scope: LearningOutcomeAuthority): Promise<string> {
  requireAuthority(scope);
  const { data, error } = await supabase.auth.getSession();
  requireAuthority(scope);
  if (error || data.session?.user.id !== scope.actorId || !data.session.access_token) throw new LearningOutcomeError('ACCESS_DENIED');
  return `Bearer ${data.session.access_token}`;
}
async function rpc(scope: LearningOutcomeAuthority, name: string, args: Record<string, unknown>, bearer?: string): Promise<unknown> {
  const authorization = bearer || await bearerFor(scope);
  requireAuthority(scope);
  const response = await supabase.rpc(name as never, args as never).setHeader('Authorization', authorization);
  requireAuthority(scope);
  if (response.status === 401 || response.status === 403) throw new LearningOutcomeError('ACCESS_DENIED');
  if (response.error) throw normalizeLearningOutcomeError(response.error);
  const error = c.outcomeErrorSchema.safeParse(response.data);
  if (error.success) throw new LearningOutcomeError(error.data.code);
  return response.data;
}
export async function readLearningOutcomeAssociations(scope: LearningOutcomeActorScope, afterSnapshotId: string | null = null): Promise<c.OutcomeAssociations> {
  requireCurrent(scope);
  const query = parse(c.outcomeAssociationsQuerySchema, { kind: 'associations', user_id: scope.studentUserId, course_id: scope.courseId,
    enrollment_id: scope.enrollmentId, after_snapshot_id: afterSnapshotId, limit: 50 }, 'INVALID_INPUT');
  const result = parse<c.OutcomeAssociations>(c.outcomeAssociationsSchema, await rpc(scope, 'read_learning_outcome', { p_organization_id: scope.organizationId, p_query: query }));
  if (result.organization_id !== scope.organizationId || result.user_id !== scope.studentUserId || result.course_id !== scope.courseId
    || result.enrollment_id !== scope.enrollmentId) throw new LearningOutcomeError();
  const seen = new Set<string>();
  for (const item of result.associations) {
    assertOutcomeScope({ ...scope, association: null }, item.scope);
    const id = item.scope.program_enrollment_snapshot_id;
    if (seen.has(id) || afterSnapshotId !== null && id <= afterSnapshotId) throw new LearningOutcomeError();
    seen.add(id);
  }
  if (result.next_after_snapshot_id !== null && (result.associations.length === 0
    || result.next_after_snapshot_id !== result.associations[result.associations.length - 1].scope.program_enrollment_snapshot_id)) throw new LearningOutcomeError();
  return result;
}
export async function readLearningOutcome(scope: LearningOutcomeActorScope): Promise<c.OutcomeEnvelope> {
  requireCurrent(scope);
  if (!scope.association) throw new LearningOutcomeError('INVALID_INPUT');
  const result = parse<c.OutcomeEnvelope>(c.outcomeEnvelopeSchema, await rpc(scope, 'read_learning_outcome', {
    p_organization_id: scope.organizationId, p_query: { kind: 'outcome', scope: scope.association },
  }));
  assertOutcomeScope(scope, result.scope);
  return result;
}
export interface PreparedLearningOutcomeAction {
  scope: LearningOutcomeActorScope;
  command: c.OutcomeAction;
  requestId: string;
  bearer: string;
}
export type PreparedLearningOutcomeCapture = PreparedLearningOutcomeAction;
export async function prepareLearningOutcomeAction(scope: LearningOutcomeActorScope, command: c.OutcomeAction, requestId: string): Promise<PreparedLearningOutcomeAction> {
  requireCurrent(scope);
  const parsed = parse<c.OutcomeAction>(c.outcomeActionSchema, command, 'INVALID_INPUT');
  assertOutcomeScope(scope, parsed.scope);
  if (!scope.association || !c.outcomeUuid.safeParse(requestId).success) throw new LearningOutcomeError('INVALID_INPUT');
  const bearer = await bearerFor(scope);
  return { scope, command: parsed, requestId, bearer };
}
export async function applyPreparedLearningOutcomeAction(prepared: PreparedLearningOutcomeAction): Promise<c.OutcomeMutation> {
  const { scope, command, requestId, bearer } = prepared;
  requireCurrent(scope);
  const result = parse<c.OutcomeMutation>(c.outcomeMutationSchema, await rpc(scope, 'apply_learning_outcome_action', {
    p_organization_id: scope.organizationId, p_request_id: requestId, p_command: command,
  }, bearer));
  assertOutcomeScope(scope, result.current.scope);
  if (result.receipt.request_id !== requestId || result.receipt.action !== command.action
    || result.receipt.applied_revision !== command.expected_revision + 1 || result.current.revision < result.receipt.applied_revision
    || !result.current.criteria_ref || !c.sameCriteriaRef(result.current.criteria_ref, command.action === 'capture_machine_result' ? command.expected_criteria_ref : command.criteria_ref)) throw new LearningOutcomeError();
  if (result.current.revision === result.receipt.applied_revision) {
    if (command.action === 'capture_machine_result' && (!result.current.machine || result.current.machine.id !== result.receipt.event_id
      || result.current.machine.revision_created !== result.receipt.applied_revision)) throw new LearningOutcomeError();
    if (command.action !== 'capture_machine_result' && (!result.current.last_decision || result.current.last_decision.id !== result.receipt.event_id
      || result.current.last_decision.machine_result_id !== command.machine_result_id || result.current.last_decision.outcome !== command.outcome
      || result.current.last_decision.supersedes_id !== command.expected_decision_id)) throw new LearningOutcomeError();
  }
  return result;
}
export const prepareLearningOutcomeCapture = prepareLearningOutcomeAction;
export const applyPreparedLearningOutcomeCapture = applyPreparedLearningOutcomeAction;

function requireCriteriaScope(scope: LearningCriteriaActorScope): void {
  requireAuthority(scope);
  if (![scope.courseId, scope.programVersionId].every(id => c.outcomeUuid.safeParse(id).success)) throw new LearningOutcomeError('INVALID_INPUT');
}
// Zod's inferred fields are optional under this app's strictNullChecks=false.
// Accept the parsed shape, then require every identity at runtime before matching.
type ParsedCriteriaTarget = Pick<c.LearningCriteriaEnvelope, 'organization_id' | 'course_id' | 'program_version_id'>;
function assertCriteriaTarget(scope: LearningCriteriaActorScope, value: ParsedCriteriaTarget): void {
  if (typeof value.organization_id !== 'string' || typeof value.course_id !== 'string' || typeof value.program_version_id !== 'string'
    || value.organization_id !== scope.organizationId || value.course_id !== scope.courseId || value.program_version_id !== scope.programVersionId) throw new LearningOutcomeError();
}
function assertCriteriaEnvelope(scope: LearningCriteriaActorScope, value: c.LearningCriteriaEnvelope): void {
  assertCriteriaTarget(scope, value);
  if (new Set(value.versions.map(version => version.id)).size !== value.versions.length) throw new LearningOutcomeError();
  if (value.programme_proof && value.programme_proof.program_version_id !== scope.programVersionId) throw new LearningOutcomeError();
  for (const version of value.versions) {
    assertCriteriaTarget(scope, version);
    if (version.programme_proof.program_version_id !== scope.programVersionId || version.reviewer_id !== version.definition.reviewer_id) throw new LearningOutcomeError();
  }
}
export async function readLearningCriteria(scope: LearningCriteriaActorScope): Promise<c.LearningCriteriaEnvelope> {
  requireCriteriaScope(scope);
  const data = parse<c.LearningCriteriaEnvelope>(c.learningCriteriaEnvelopeSchema, await rpc(scope, 'read_learning_outcome', {
    p_organization_id: scope.organizationId, p_query: { kind: 'criteria', course_id: scope.courseId, program_version_id: scope.programVersionId },
  }));
  assertCriteriaEnvelope(scope, data); return data;
}
export async function readLearningCriteriaOptions(scope: LearningCriteriaActorScope): Promise<c.LearningCriteriaOptions> {
  requireCriteriaScope(scope);
  const data = parse<c.LearningCriteriaOptions>(c.learningCriteriaOptionsSchema, await rpc(scope, 'read_learning_outcome', {
    p_organization_id: scope.organizationId, p_query: { kind: 'options', course_id: scope.courseId, program_version_id: scope.programVersionId },
  }));
  assertCriteriaTarget(scope, data);
  for (const ids of [data.lessons.map(item => item.id), data.modules.map(item => item.id), data.humans.map(item => item.user_id), data.files.map(item => item.version_id)]) {
    if (new Set(ids).size !== ids.length) throw new LearningOutcomeError();
  }
  return data;
}
export interface PreparedLearningCriteriaAction { scope: LearningCriteriaActorScope; command: c.LearningCriteriaAction; requestId: string; bearer: string }
export async function prepareLearningCriteriaAction(scope: LearningCriteriaActorScope, command: c.LearningCriteriaAction, requestId: string): Promise<PreparedLearningCriteriaAction> {
  requireCriteriaScope(scope);
  const parsed = parse<c.LearningCriteriaAction>(c.learningCriteriaActionSchema, command, 'INVALID_INPUT');
  if (!c.outcomeUuid.safeParse(requestId).success || parsed.action === 'save_criteria_version'
    && (parsed.course_id !== scope.courseId || parsed.program_version_id !== scope.programVersionId)) throw new LearningOutcomeError('INVALID_INPUT');
  return { scope, command: parsed, requestId, bearer: await bearerFor(scope) };
}
export async function applyPreparedLearningCriteriaAction(prepared: PreparedLearningCriteriaAction): Promise<c.LearningCriteriaMutation> {
  const { scope, command, requestId, bearer } = prepared; requireCriteriaScope(scope);
  const data = parse<c.LearningCriteriaMutation>(c.learningCriteriaMutationSchema, await rpc(scope, 'apply_learning_outcome_action', {
    p_organization_id: scope.organizationId, p_request_id: requestId, p_command: command,
  }, bearer));
  assertCriteriaEnvelope(scope, data.current);
  if (data.receipt.request_id !== requestId || data.receipt.action !== command.action || data.receipt.applied_revision !== command.expected_revision + 1
    || command.action === 'approve_criteria_version' && data.receipt.event_id !== command.version_id
    || command.action === 'save_criteria_version' && command.draft_id !== null && data.receipt.event_id !== command.draft_id) throw new LearningOutcomeError();
  const version = data.current.versions.find(version => version.id === data.receipt.event_id);
  if (!version || version.revision < data.receipt.applied_revision) throw new LearningOutcomeError();
  return data;
}
export async function readLearningDecisionOptions(scope: LearningOutcomeActorScope): Promise<c.LearningDecisionOptions> {
  requireCurrent(scope);
  if (!scope.association) throw new LearningOutcomeError('INVALID_INPUT');
  const data = parse<c.LearningDecisionOptions>(c.learningDecisionOptionsSchema, await rpc(scope, 'read_learning_outcome', {
    p_organization_id: scope.organizationId, p_query: { kind: 'decision_options', scope: scope.association },
  }));
  assertOutcomeScope(scope, data.scope);
  if (new Set(data.files.map(file => file.version_id)).size !== data.files.length) throw new LearningOutcomeError();
  return data;
}
