import { supabase } from '@/integrations/supabase/client';
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import * as c from './contract';

export type AdmissionDocumentErrorCode = 'ACCESS_DENIED' | 'INVALID_INPUT' | 'REVISION_CONFLICT' | 'REQUEST_MISMATCH' | 'SOURCE_CHANGED' | 'REGISTERED_DOCUMENT' | 'DEPENDENCY_UNAVAILABLE';
export class AdmissionDocumentError extends Error {
  constructor(public readonly code: AdmissionDocumentErrorCode = 'DEPENDENCY_UNAVAILABLE') { super(code); this.name = 'AdmissionDocumentError'; }
}
type DiagnosticStage = 'rpc.error' | 'rpc.transport' | 'settings.response' | 'mutation.response' | 'draft.response'
  | 'settings.organization' | 'settings.scope' | 'settings.groups_unique' | 'settings.draft_binding'
  | 'mutation.request' | 'mutation.revision' | 'mutation.cursor_kind' | 'mutation.cursor_repeat' | 'draft.binding';
const diagnosticFields = new Set(('schema_version organization_id scope revision preferences effective groups draft individual_date_overrides capabilities can_read can_write can_prepare can_apply_current kind group_id enrollment_id enabled document_date effective_admission_date timezone sources policy_revisions organization group enrollment id name course_id user_id observed_group_id recorded_at updated_at status preparation_mode missing_facts source_revision program_ref stale registered_locked live_missing_facts enrollment_snapshot_id binding_id binding_revision version_id snapshot_hash facts_hash file_document_id file_version_id file_review_id request_id replayed processed next_after_enrollment_id state draft_id organization_name student_name course_title group_name program_title').split(' '));
const diagnosticIssueCodes = new Set(('invalid_type invalid_literal custom invalid_union invalid_union_discriminator invalid_enum_value unrecognized_keys invalid_arguments invalid_return_type invalid_date invalid_string too_small too_big invalid_intersection_types not_multiple_of not_finite invalid_value invalid_format').split(' '));
const diagnosticErrorCodes = new Set<AdmissionDocumentErrorCode>(['ACCESS_DENIED','INVALID_INPUT','REVISION_CONFLICT','REQUEST_MISMATCH','SOURCE_CHANGED','REGISTERED_DOCUMENT','DEPENDENCY_UNAVAILABLE']);
/** Static stages/schema paths only. Never log response values, IDs or raw errors. */
function diagnostic(stage: DiagnosticStage, code?: AdmissionDocumentErrorCode, rawIssues?: unknown) {
  const issues = Array.isArray(rawIssues) ? rawIssues.slice(0,8).map(raw => {
    const issue = raw as { code?: unknown; path?: unknown } | null;
    return { code: typeof issue?.code === 'string' && diagnosticIssueCodes.has(issue.code) ? issue.code : 'validation',
      path: Array.isArray(issue?.path) ? issue.path.slice(0,12).map(part => typeof part === 'string' && diagnosticFields.has(part) ? part
        : typeof part === 'number' && Number.isInteger(part) && part >= 0 && part <= 100000 ? part : '<field>') : [] };
  }) : undefined;
  try { console.warn('[AdmissionDocuments]', { stage,...(code ? { code: diagnosticErrorCodes.has(code) ? code : 'DEPENDENCY_UNAVAILABLE' } : {}),...(issues ? { issues } : {}) }); }
  catch { /* Diagnostics cannot change mutation/retry behavior. */ }
}
export const admissionDocumentErrorMessages: Record<AdmissionDocumentErrorCode,string> = {
  ACCESS_DENIED: 'Доступ к настройкам документов не подтверждён.', INVALID_INPUT: 'Проверьте группу и выбранные даты.',
  REVISION_CONFLICT: 'Настройки изменились. Обновите сведения перед сохранением.', REQUEST_MISMATCH: 'Параметры повтора изменились. Обновите сведения.',
  SOURCE_CHANGED: 'Сведения изменились. Обновите проект перед открытием.', REGISTERED_DOCUMENT: 'Приказ уже зарегистрирован. Сохранённый документ не изменяется.',
  DEPENDENCY_UNAVAILABLE: 'Не удалось подтвердить результат. Повторите тот же запрос.',
};
export function normalizeAdmissionDocumentError(value: unknown): AdmissionDocumentError {
  if (value instanceof AdmissionDocumentError) return value;
  const input = value as { code?: unknown; message?: unknown } | null;
  const raw = `${typeof input?.code === 'string' ? input.code : ''} ${typeof input?.message === 'string' ? input.message : ''}`;
  const code = raw.match(/ADMISSION_AUTOMATION_(ACCESS_DENIED|INVALID_INPUT|REVISION_CONFLICT|REQUEST_MISMATCH|SOURCE_CHANGED|REGISTERED_DOCUMENT)/)?.[1] as AdmissionDocumentErrorCode | undefined;
  return new AdmissionDocumentError(code ?? (input?.code === '42501' || input?.code === 'PGRST301' ? 'ACCESS_DENIED' : input?.code === '40001' ? 'REVISION_CONFLICT' : 'DEPENDENCY_UNAVAILABLE'));
}
export interface AdmissionDocumentActorScope { actorId: string; accessRevision: number; organizationId: string; scope: c.WireScope; current: () => boolean }
export function captureAdmissionDocumentScope(organizationId: string, scope: c.AdmissionDocumentScope, current: () => boolean = () => true): AdmissionDocumentActorScope {
  const actor = captureOfflineContext();
  if (!actor || !c.uuid.safeParse(organizationId).success) throw new AdmissionDocumentError('ACCESS_DENIED');
  return { actorId: actor.actorId, accessRevision: actor.revision, organizationId, scope: c.wireScope(scope), current };
}
export function assertAdmissionDocumentScopeCurrent(scope: AdmissionDocumentActorScope) {
  if (!scope.current() || !isOfflineActorCurrent(scope.actorId,scope.accessRevision)) throw new AdmissionDocumentError('ACCESS_DENIED');
}
async function rpc(scope: AdmissionDocumentActorScope, name: string, args: Record<string,unknown>): Promise<unknown> {
  assertAdmissionDocumentScopeCurrent(scope);
  const session = await supabase.auth.getSession(); assertAdmissionDocumentScopeCurrent(scope);
  if (session.error || session.data.session?.user.id !== scope.actorId || !session.data.session.access_token) throw new AdmissionDocumentError('ACCESS_DENIED');
  let result;
  try { result = await supabase.rpc(name as never,args as never).setHeader('Authorization',`Bearer ${session.data.session.access_token}`); }
  catch (error) { diagnostic('rpc.transport',normalizeAdmissionDocumentError(error).code); throw error; }
  assertAdmissionDocumentScopeCurrent(scope);
  if (result.error) { const error=normalizeAdmissionDocumentError(result.error); diagnostic('rpc.error',error.code); throw error; }
  return result.data;
}
function parse<T>(schema: { safeParse(raw: unknown): { success: boolean; data?: T; error?: { issues?: unknown } } }, raw: unknown, stage: DiagnosticStage): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) { diagnostic(stage,undefined,parsed.error?.issues); throw new AdmissionDocumentError(); }
  return parsed.data as T;
}
function assertSettings(scope: AdmissionDocumentActorScope, state: c.AdmissionDocumentSettings) {
  const stage:DiagnosticStage|null = state.organization_id !== scope.organizationId ? 'settings.organization'
    : JSON.stringify(state.scope) !== JSON.stringify(scope.scope) ? 'settings.scope'
      : new Set(state.groups.map(group => group.id)).size !== state.groups.length ? 'settings.groups_unique'
        : state.draft && (state.draft.organization_id !== scope.organizationId || scope.scope.kind === 'enrollment' && state.draft.enrollment_id !== scope.scope.enrollment_id) ? 'settings.draft_binding' : null;
  if (stage) { diagnostic(stage); throw new AdmissionDocumentError(); }
}
export async function readAdmissionDocumentSettings(scope: AdmissionDocumentActorScope) {
  const state = parse<c.AdmissionDocumentSettings>(c.settingsSchema,await rpc(scope,'read_admission_document_settings',{ p_organization_id: scope.organizationId,p_scope: scope.scope }),'settings.response');
  assertSettings(scope,state); return state;
}
export async function applyAdmissionDocumentSettings(scope: AdmissionDocumentActorScope, expectedRevision: number, requestId: string, command: c.AdmissionDocumentCommand) {
  if (!c.uuid.safeParse(requestId).success || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new AdmissionDocumentError('INVALID_INPUT');
  const input = c.commandSchema.safeParse(command);
  if (!input.success) throw new AdmissionDocumentError('INVALID_INPUT');
  const value = parse<c.AdmissionDocumentMutation>(c.mutationSchema,await rpc(scope,'apply_admission_document_settings',{
    p_organization_id: scope.organizationId,p_scope: scope.scope,p_expected_revision: expectedRevision,p_request_id: requestId,p_command: input.data,
  }),'mutation.response');
  assertSettings(scope,value.state);
  const stage:DiagnosticStage|null = value.request_id !== requestId ? 'mutation.request' : value.state.revision < expectedRevision ? 'mutation.revision'
    : input.data.action !== 'apply_current' && value.next_after_enrollment_id !== null ? 'mutation.cursor_kind'
      : input.data.action === 'apply_current' && value.next_after_enrollment_id !== null && value.next_after_enrollment_id === input.data.after_enrollment_id ? 'mutation.cursor_repeat' : null;
  if (stage) { diagnostic(stage); throw new AdmissionDocumentError(); }
  return value;
}
export async function readAutomaticAdmissionDraft(scope: AdmissionDocumentActorScope, draft: c.AutomaticAdmissionDraft) {
  if (scope.scope.kind !== 'enrollment' || scope.scope.enrollment_id !== draft.enrollment_id || draft.organization_id !== scope.organizationId || draft.group_id !== scope.scope.group_id) throw new AdmissionDocumentError('INVALID_INPUT');
  const data = parse<c.AdmissionDraftExport>(c.exportSchema,await rpc(scope,'read_automatic_admission_draft',{
    p_organization_id: scope.organizationId,p_enrollment_id: draft.enrollment_id,p_expected_revision: draft.revision,
  }),'draft.response');
  if (data.organization_id !== scope.organizationId || data.enrollment_id !== draft.enrollment_id || data.draft_id !== draft.id || data.revision !== draft.revision) { diagnostic('draft.binding'); throw new AdmissionDocumentError(); }
  return data;
}
