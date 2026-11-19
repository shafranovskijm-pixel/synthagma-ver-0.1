import { supabase } from '@/integrations/supabase/client';
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import * as c from './contract';

export type AdmissionDocumentErrorCode = 'ACCESS_DENIED' | 'INVALID_INPUT' | 'REVISION_CONFLICT' | 'REQUEST_MISMATCH' | 'SOURCE_CHANGED' | 'REGISTERED_DOCUMENT' | 'DEPENDENCY_UNAVAILABLE';
export class AdmissionDocumentError extends Error {
  constructor(public readonly code: AdmissionDocumentErrorCode = 'DEPENDENCY_UNAVAILABLE') { super(code); this.name = 'AdmissionDocumentError'; }
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
  const result = await supabase.rpc(name as never,args as never).setHeader('Authorization',`Bearer ${session.data.session.access_token}`); assertAdmissionDocumentScopeCurrent(scope);
  if (result.error) throw normalizeAdmissionDocumentError(result.error);
  return result.data;
}
function parse<T>(schema: { safeParse(raw: unknown): { success: boolean; data?: T } }, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AdmissionDocumentError();
  return parsed.data as T;
}
function assertSettings(scope: AdmissionDocumentActorScope, state: c.AdmissionDocumentSettings) {
  if (state.organization_id !== scope.organizationId || JSON.stringify(state.scope) !== JSON.stringify(scope.scope)
    || new Set(state.groups.map(group => group.id)).size !== state.groups.length
    || state.draft && (state.draft.organization_id !== scope.organizationId || scope.scope.kind === 'enrollment' && state.draft.enrollment_id !== scope.scope.enrollment_id)) throw new AdmissionDocumentError();
}
export async function readAdmissionDocumentSettings(scope: AdmissionDocumentActorScope) {
  const state = parse<c.AdmissionDocumentSettings>(c.settingsSchema,await rpc(scope,'read_admission_document_settings',{ p_organization_id: scope.organizationId,p_scope: scope.scope }));
  assertSettings(scope,state); return state;
}
export async function applyAdmissionDocumentSettings(scope: AdmissionDocumentActorScope, expectedRevision: number, requestId: string, command: c.AdmissionDocumentCommand) {
  if (!c.uuid.safeParse(requestId).success || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new AdmissionDocumentError('INVALID_INPUT');
  const input = c.commandSchema.safeParse(command);
  if (!input.success) throw new AdmissionDocumentError('INVALID_INPUT');
  const value = parse<c.AdmissionDocumentMutation>(c.mutationSchema,await rpc(scope,'apply_admission_document_settings',{
    p_organization_id: scope.organizationId,p_scope: scope.scope,p_expected_revision: expectedRevision,p_request_id: requestId,p_command: input.data,
  }));
  assertSettings(scope,value.state);
  if (value.request_id !== requestId || value.state.revision < expectedRevision || input.data.action !== 'apply_current' && value.next_after_enrollment_id !== null
    || input.data.action === 'apply_current' && value.next_after_enrollment_id !== null && value.next_after_enrollment_id === input.data.after_enrollment_id) throw new AdmissionDocumentError();
  return value;
}
export async function readAutomaticAdmissionDraft(scope: AdmissionDocumentActorScope, draft: c.AutomaticAdmissionDraft) {
  if (scope.scope.kind !== 'enrollment' || scope.scope.enrollment_id !== draft.enrollment_id || draft.organization_id !== scope.organizationId || draft.group_id !== scope.scope.group_id) throw new AdmissionDocumentError('INVALID_INPUT');
  const data = parse<c.AdmissionDraftExport>(c.exportSchema,await rpc(scope,'read_automatic_admission_draft',{
    p_organization_id: scope.organizationId,p_enrollment_id: draft.enrollment_id,p_expected_revision: draft.revision,
  }));
  if (data.organization_id !== scope.organizationId || data.enrollment_id !== draft.enrollment_id || data.draft_id !== draft.id || data.revision !== draft.revision) throw new AdmissionDocumentError();
  return data;
}
