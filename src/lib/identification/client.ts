import { supabase } from '@/integrations/supabase/client';
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import { identificationUuid, identificationStateResult, identificationMutationResult, identificationPreparation,
  type IdentificationRecord, type IdentificationAction, type IdentificationPreparation, type IdentificationSubject } from './contract.ts';

export interface IdentificationScope { actorId: string; accessRevision: number; organizationId: string; studentUserId: string; enrollmentId: string | null; current?: () => boolean }
export class IdentificationError extends Error {
  constructor(public code = 'IDENTIFICATION_UNAVAILABLE') { super(code); this.name = 'IdentificationError'; }
}
export function captureIdentificationScope(organizationId: string, studentUserId: string, enrollmentId: string | null = null, current?: () => boolean): IdentificationScope {
  const actor = captureOfflineContext();
  if (!actor) throw new IdentificationError('IDENTIFICATION_ACCESS_DENIED');
  return {actorId: actor.actorId, accessRevision: actor.revision, organizationId, studentUserId, enrollmentId, current};
}
export function identificationScopeCurrent(scope: IdentificationScope): boolean {
  return isOfflineActorCurrent(scope.actorId, scope.accessRevision) && (!scope.current || scope.current());
}
function requireCurrent(scope: IdentificationScope) {
  if (!identificationScopeCurrent(scope)) throw new IdentificationError('IDENTIFICATION_ACCESS_DENIED');
  if (![scope.actorId,scope.organizationId,scope.studentUserId,...(scope.enrollmentId ? [scope.enrollmentId] : [])].every(value => identificationUuid.safeParse(value).success)) throw new IdentificationError('IDENTIFICATION_INVALID_REQUEST');
}
function publicError(error: unknown): IdentificationError {
  const candidate = error as {code?: string; message?: string} | null;
  const code = `${candidate?.code || ''} ${candidate?.message || ''}`.match(/IDENTIFICATION_(?:ACCESS_DENIED|CONFLICT|INVALID_REQUEST|SOURCE_UNAVAILABLE|UPLOAD_EXPIRED|UNAVAILABLE)/)?.[0];
  return new IdentificationError(code || 'IDENTIFICATION_UNAVAILABLE');
}
export async function identificationBearer(scope: IdentificationScope): Promise<string> {
  requireCurrent(scope);
  const {data, error} = await supabase.auth.getSession();
  requireCurrent(scope);
  const session = data.session;
  if (error || session?.user.id !== scope.actorId || !session.access_token) throw new IdentificationError('IDENTIFICATION_ACCESS_DENIED');
  return `Bearer ${session.access_token}`;
}
async function rpc(scope: IdentificationScope, name: string, args: Record<string, unknown>) {
  const bearer = await identificationBearer(scope);
  requireCurrent(scope);
  const result = await supabase.rpc(name as never, args as never).setHeader('Authorization', bearer);
  requireCurrent(scope);
  if (result.error) throw publicError(result.error);
  return result.data;
}
async function edge(scope: IdentificationScope, name: string, body: Record<string, unknown>, bearer?: string) {
  const authorization = bearer || await identificationBearer(scope); requireCurrent(scope);
  const result = await supabase.functions.invoke(name, {body, headers: {Authorization: authorization}});
  requireCurrent(scope);
  if (result.error) throw publicError(result.error);
  return result.data;
}
function assertRecordScope(record: IdentificationRecord, scope: IdentificationScope) {
  if (record.organizationId !== scope.organizationId || record.studentUserId !== scope.studentUserId
    || (scope.enrollmentId && record.enrollmentId !== scope.enrollmentId)
    || (record.media && record.media.identificationId !== record.identificationId)) throw new IdentificationError();
}
export async function readIdentificationStates(scope: IdentificationScope, studentUserIds: string[], includeHistory = false): Promise<IdentificationSubject[]> {
  if (!studentUserIds.length || studentUserIds.length > 100 || new Set(studentUserIds).size !== studentUserIds.length
    || studentUserIds.some(value => !identificationUuid.safeParse(value).success) || (includeHistory && studentUserIds.length !== 1)
    || (scope.enrollmentId && studentUserIds.length !== 1)) throw new IdentificationError('IDENTIFICATION_INVALID_REQUEST');
  const parsed = identificationStateResult.safeParse(await rpc(scope, 'get_student_identification_state', {
    p_organization_id: scope.organizationId, p_student_user_ids: studentUserIds, p_include_history: includeHistory, p_enrollment_id: scope.enrollmentId,
  }));
  if (!parsed.success || parsed.data.subjects.length !== studentUserIds.length) throw new IdentificationError();
  const seen = new Set<string>();
  for (const subject of parsed.data.subjects) {
    if (seen.has(subject.studentUserId) || !studentUserIds.includes(subject.studentUserId) || subject.organizationId !== scope.organizationId || subject.requestedEnrollmentId !== scope.enrollmentId) throw new IdentificationError();
    seen.add(subject.studentUserId);
    for (const record of [...subject.history, ...(subject.current ? [subject.current] : [])]) assertRecordScope(record, {...scope, studentUserId: subject.studentUserId});
    const records = new Set([...subject.history, ...(subject.current ? [subject.current] : [])].map(record => record.identificationId));
    if (subject.events.some(event => !records.has(event.identificationId))) throw new IdentificationError();
  }
  return parsed.data.subjects;
}
export async function prepareIdentification(scope: IdentificationScope, requestId: string): Promise<IdentificationPreparation> {
  if (scope.actorId !== scope.studentUserId || !identificationUuid.safeParse(requestId).success) throw new IdentificationError('IDENTIFICATION_INVALID_REQUEST');
  const parsed = identificationPreparation.safeParse(await rpc(scope, 'prepare_own_identification_photo', {p_organization_id: scope.organizationId, p_request_id: requestId, p_enrollment_id: scope.enrollmentId}));
  if (!parsed.success || parsed.data.path !== `${scope.studentUserId}/${scope.organizationId}/${parsed.data.identificationId}/${parsed.data.sourceId}/capture.jpg`) throw new IdentificationError();
  return parsed.data;
}
export async function submitIdentification(scope: IdentificationScope, prepared: IdentificationPreparation, photo: Blob, requestId: string) {
  if (!identificationPreparation.safeParse(prepared).success || scope.actorId !== scope.studentUserId || !identificationUuid.safeParse(requestId).success || photo.type !== 'image/jpeg' || photo.size <= 0 || photo.size > 5242880
    || prepared.path !== `${scope.studentUserId}/${scope.organizationId}/${prepared.identificationId}/${prepared.sourceId}/capture.jpg`) throw new IdentificationError('IDENTIFICATION_INVALID_REQUEST');
  const bearer = await identificationBearer(scope);
  // A dedicated storage client pins the original bearer; the singleton's lazy
  // session getter cannot silently substitute the next signed-in actor.
  const {StorageClient} = await import('@supabase/storage-js');
  requireCurrent(scope);
  const {data, error} = await supabase.auth.getSession(); requireCurrent(scope);
  if (error || data.session?.user.id !== scope.actorId || `Bearer ${data.session.access_token}` !== bearer) throw new IdentificationError('IDENTIFICATION_ACCESS_DENIED');
  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1`;
  const storage = new StorageClient(storageUrl, {Authorization: bearer, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}, window.fetch.bind(window));
  let uploadError: unknown;
  try { const uploaded = await storage.from(prepared.bucket).upload(prepared.path, photo, {contentType: 'image/jpeg', upsert: false}); uploadError = uploaded.error; }
  catch (error) { uploadError = error; }
  requireCurrent(scope);
  // An ambiguous upload can only be recovered by the server's exact source proof.
  const parsed = identificationMutationResult.safeParse(await edge(scope, 'student-identification-submit', {
    identificationId: prepared.identificationId, sourceId: prepared.sourceId, expectedRevision: prepared.revision, requestId,
  }, bearer));
  if (!parsed.success) throw publicError(uploadError);
  const result = parsed.data; assertRecordScope(result.record, scope);
  if (result.record.identificationId !== prepared.identificationId || result.record.revision !== 2 || result.record.status !== 'pending'
    || result.record.sourceKind !== 'self_photo' || result.record.assurance !== 'submitted' || result.record.media?.sourceId !== prepared.sourceId
    || result.event?.identificationId !== prepared.identificationId || result.event.action !== 'submitted' || result.event.revision !== 2) throw new IdentificationError();
  return result;
}
export async function decideIdentification(scope: IdentificationScope, action: IdentificationAction, record: IdentificationRecord | null, requestId: string, reason: string | null = null) {
  if (!identificationUuid.safeParse(requestId).success || (action === 'manual_verify' ? record !== null : !record)
    || (reason !== null && (reason.trim().length > 1000 || !reason.trim())) || (action === 'reject' && !reason?.trim())) throw new IdentificationError('IDENTIFICATION_INVALID_REQUEST');
  if (record) assertRecordScope(record, scope);
  const parsed = identificationMutationResult.safeParse(await rpc(scope, 'decide_student_identification', {
    p_organization_id: scope.organizationId, p_student_user_id: scope.studentUserId, p_request_id: requestId,
    p_action: action, p_identification_id: record?.identificationId || null, p_expected_revision: record?.revision || 0, p_reason: reason?.trim() || null,
  }));
  if (!parsed.success) throw new IdentificationError();
  const result = parsed.data; assertRecordScope(result.record, scope);
  const expectedAction = {verify: 'verified', reject: 'rejected', reset: 'reset', manual_verify: 'manual_verified'}[action];
  const expectedStatus = action === 'reset' ? 'pending' : action === 'reject' ? 'rejected' : 'verified';
  if ((record && result.record.identificationId !== record.identificationId) || result.record.revision !== (record?.revision || 0) + 1
    || result.record.status !== expectedStatus || result.event?.action !== expectedAction || result.event.identificationId !== result.record.identificationId
    || result.event.revision !== result.record.revision || (action === 'manual_verify' && (result.record.sourceKind !== 'manual_staff_claim' || result.record.media))) throw new IdentificationError();
  return result;
}
export async function readIdentificationMedia(scope: IdentificationScope, record: IdentificationRecord): Promise<Blob> {
  assertRecordScope(record, scope);
  if (!record.media || !record.capabilities.canReadMedia) throw new IdentificationError('IDENTIFICATION_SOURCE_UNAVAILABLE');
  const authorization = await identificationBearer(scope); requireCurrent(scope);
  const response = await window.fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/student-identification-media`, {
    method:'POST',headers:{Authorization:authorization,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
    cache:'no-store',credentials:'omit',body:JSON.stringify(record.media),
  });
  requireCurrent(scope);
  if (!response.ok || response.headers.get('Content-Type')?.split(';')[0] !== 'image/jpeg') throw new IdentificationError('IDENTIFICATION_SOURCE_UNAVAILABLE');
  const data = await response.blob();
  if (!(data instanceof Blob) || data.type.split(';')[0] !== 'image/jpeg' || !data.size || data.size > 5242880) throw new IdentificationError('IDENTIFICATION_SOURCE_UNAVAILABLE');
  requireCurrent(scope);
  return data;
}
