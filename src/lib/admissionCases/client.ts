import { supabase } from '@/integrations/supabase/client';
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import * as c from './contract';

export interface AdmissionActorScope {
  actorId: string; accessRevision: number; organizationId: string; studentUserId: string;
  association: c.AdmissionScope | null; current?: () => boolean;
  contextKey?: string;
}
export class AdmissionError extends Error {
  constructor(public code: c.AdmissionErrorCode = 'DEPENDENCY_UNAVAILABLE') { super(code); this.name = 'AdmissionError'; }
}
export const admissionErrorMessages: Record<c.AdmissionErrorCode,string> = {
  ACCESS_DENIED: 'Доступ к личному делу не подтверждён. Обновите права или выберите другое зачисление.',
  INVALID_INPUT: 'Проверьте заполненные сведения.', REVISION_CONFLICT: 'Личное дело изменилось. Проверьте актуальную версию перед новым действием.',
  SOURCE_CHANGED: 'Источник изменился. Выберите актуальную версию.', SOURCE_UNAVAILABLE: 'Источник недоступен. Нужна читаемая индивидуальная копия PDF, JPEG или PNG.',
  PREREQUISITE_MISSING: 'Сначала подтвердите точную группу, зачисление и версию программы.', REVIEW_REQUIRED: 'Требуется проверка ответственным.',
  LIMIT_REACHED: 'Достигнут предел текущего набора. Обратитесь к администратору.', DEPENDENCY_UNAVAILABLE: 'Не удалось подтвердить результат. Можно повторить тот же запрос.',
};
export function captureAdmissionScope(organizationId: string, studentUserId: string, association: c.AdmissionScope | null = null, current?: () => boolean): AdmissionActorScope {
  const actor = captureOfflineContext();
  if (!actor) throw new AdmissionError('ACCESS_DENIED');
  return {actorId: actor.actorId, accessRevision: actor.revision, organizationId, studentUserId, association, current};
}
export function admissionScopeCurrent(scope: AdmissionActorScope): boolean {
  return isOfflineActorCurrent(scope.actorId, scope.accessRevision) && (!scope.current || scope.current());
}
function requireCurrent(scope: AdmissionActorScope) {
  if (!admissionScopeCurrent(scope)) throw new AdmissionError('ACCESS_DENIED');
  if (![scope.actorId,scope.organizationId,scope.studentUserId].every(id => c.admissionUuid.safeParse(id).success)) throw new AdmissionError('INVALID_INPUT');
  if (scope.association && (!c.admissionScopeSchema.safeParse(scope.association).success || scope.association.organization_id !== scope.organizationId || scope.association.user_id !== scope.studentUserId)) throw new AdmissionError('INVALID_INPUT');
}
export function normalizeAdmissionError(error: unknown): AdmissionError {
  if (error instanceof AdmissionError) return error;
  const value = error as {code?: unknown; message?: unknown} | null;
  const raw = `${typeof value?.code === 'string' ? value.code : ''} ${typeof value?.message === 'string' ? value.message : ''}`;
  const code = raw.match(/ADMISSION_(ACCESS_DENIED|INVALID_INPUT|REVISION_CONFLICT|SOURCE_CHANGED|SOURCE_UNAVAILABLE|PREREQUISITE_MISSING|REVIEW_REQUIRED|LIMIT_REACHED|DEPENDENCY_UNAVAILABLE)/)?.[1];
  if (code && c.admissionErrorCodeSchema.safeParse(code).success) return new AdmissionError(code as c.AdmissionErrorCode);
  if (value?.code === '42501' || value?.code === 'PGRST301') return new AdmissionError('ACCESS_DENIED');
  if (value?.code === '40001') return new AdmissionError('REVISION_CONFLICT');
  return new AdmissionError();
}
export async function admissionBearer(scope: AdmissionActorScope): Promise<string> {
  requireCurrent(scope);
  const {data,error} = await supabase.auth.getSession(); requireCurrent(scope);
  if (error || data.session?.user.id !== scope.actorId || !data.session.access_token) throw new AdmissionError('ACCESS_DENIED');
  return `Bearer ${data.session.access_token}`;
}
async function rpc(scope: AdmissionActorScope, name: string, args: Record<string,unknown>, pinnedBearer?: string): Promise<unknown> {
  const bearer = pinnedBearer || await admissionBearer(scope); requireCurrent(scope);
  const response = await supabase.rpc(name as never,args as never).setHeader('Authorization',bearer); requireCurrent(scope);
  if (response.error) throw normalizeAdmissionError(response.error);
  const errorDto = c.admissionErrorSchema.safeParse(response.data);
  if (errorDto.success) throw new AdmissionError(errorDto.data.code);
  return response.data;
}
function parse<T>(schema: {safeParse(value: unknown): {success: boolean; data?: T}}, value: unknown, code:c.AdmissionErrorCode = 'DEPENDENCY_UNAVAILABLE'): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AdmissionError(code);
  return result.data as T;
}
const equal = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameScope = (a: c.AdmissionScope,b: c.AdmissionScope) => Object.keys(a).every(key => a[key as keyof typeof a] === b[key as keyof typeof b]);
export function assertAdmissionScope(scope: AdmissionActorScope, value: c.AdmissionScope) {
  if (value.organization_id !== scope.organizationId || value.user_id !== scope.studentUserId || scope.association && !sameScope(scope.association,value)) throw new AdmissionError();
}
function assertUnique(ids: string[]) { if (new Set(ids).size !== ids.length) throw new AdmissionError(); }
function assertStaffState(scope: AdmissionActorScope,state: c.AdmissionStaffCase) {
  assertAdmissionScope(scope,state.scope);
  assertUnique(state.requirements.map(value => value.id)); assertUnique(state.evidence.map(value => value.id)); assertUnique(state.tasks.map(value => value.id));
  const conditions=state.issuance_conditions??[],reviews=state.issuance_reviews??[];
  assertUnique(conditions.map(value=>value.requirement_id));assertUnique(reviews.map(value=>value.requirement_id));
  if(conditions.some(value=>!state.requirements.some(requirement=>requirement.id===value.requirement_id&&requirement.revision===value.requirement_revision))
    ||reviews.some(value=>!state.requirements.some(requirement=>requirement.id===value.requirement_id&&value.requirement_revision<=requirement.revision)
      ||value.evidence?.evidence_version_ids.some(id=>!state.evidence.some(evidence=>evidence.id===id&&evidence.requirement_id===value.requirement_id))))throw new AdmissionError();
  if ((state.rule_set_id === null) !== (state.rule_set_digest === null)
    || state.requirements.some(requirement => requirement.rule_set_id !== state.rule_set_id || requirement.rule_set_digest !== state.rule_set_digest)
    || state.evidence.some(evidence => evidence.case_id !== state.id || evidence.case_revision_created > state.revision)
    || state.decision && (state.decision.case_revision > state.revision || !equal(state.decision.program_ref,state.program_ref))) throw new AdmissionError();
}
export async function readAdmissionAssociations(scope: AdmissionActorScope,afterId: string | null = null) {
  const query = c.admissionReadQuerySchema.parse({mode:'associations',after_id:afterId,limit:50});
  const data = parse<c.AdmissionAssociations>(c.admissionAssociationsSchema,await rpc(scope,'read_student_admission_case',{p_organization_id:scope.organizationId,p_student_user_id:scope.studentUserId,p_query:query}));
  if (data.organization_id !== scope.organizationId || data.user_id !== scope.studentUserId || data.has_more !== !!data.next_after_id) throw new AdmissionError();
  assertUnique(data.items.map(item => item.scope.group_id));
  for (const item of data.items) assertAdmissionScope({...scope,association:null},item.scope);
  if (data.has_more && data.next_after_id !== data.items.at(-1)?.scope.group_id) throw new AdmissionError();
  return data;
}
export async function readAdmissionCase(scope: AdmissionActorScope): Promise<c.AdmissionCaseRead> {
  if (!scope.association) throw new AdmissionError('INVALID_INPUT');
  const data = parse<c.AdmissionCaseRead>(c.admissionCaseReadSchema,await rpc(scope,'read_student_admission_case',{
    p_organization_id:scope.organizationId,p_student_user_id:scope.studentUserId,p_query:{mode:'case',group_id:scope.association.group_id,enrollment_id:scope.association.enrollment_id},
  }));
  assertAdmissionScope(scope,data.scope);
  if (data.state) {
    assertAdmissionScope(scope,data.state.scope);
    if (data.projection === 'staff') assertStaffState(scope,data.state);
    else assertUnique(data.state.tasks.map(task => task.id));
  }
  return data;
}
export async function readAdmissionOptions(scope: AdmissionActorScope,state: c.AdmissionStaffCase,kind: 'responsibles'|'local_acts',afterId: string|null = null) {
  assertStaffState(scope,state);
  const data = parse<c.AdmissionOptions>(c.admissionOptionsSchema,await rpc(scope,'read_student_admission_case',{p_organization_id:scope.organizationId,p_student_user_id:scope.studentUserId,
    p_query:{mode:'options',case_id:state.id,kind,after_id:afterId,limit:50}}));
  if (data.case_id !== state.id || data.kind !== kind || data.case_revision < state.revision || data.has_more !== !!data.next_after_id) throw new AdmissionError();
  assertUnique(data.kind === 'responsibles' ? data.items.map(item => item.user_id) : data.items.map(item => item.document_id));
  return data;
}
export async function readAdmissionCandidates(scope: AdmissionActorScope,state: c.AdmissionStaffCase,kind: 'identity_document'|'enrollment_document'|'contract_artifact'|'organization_document_version',afterId: string|null = null) {
  assertStaffState(scope,state);
  const data = parse<c.AdmissionCandidates>(c.admissionCandidatesSchema,await rpc(scope,'read_student_admission_case',{p_organization_id:scope.organizationId,p_student_user_id:scope.studentUserId,
    p_query:{mode:'candidates',case_id:state.id,kind,after_id:afterId,limit:50}}));
  if (data.case_id !== state.id || data.case_revision < state.revision || data.has_more !== !!data.next_after_id || data.items.some(item => item.kind !== kind || kind === 'organization_document_version' && !item.version_id)) throw new AdmissionError();
  assertUnique(data.items.map(item => item.id)); return data;
}
export async function readAdmissionHistory(scope: AdmissionActorScope,state: c.AdmissionStaffCase,beforeRevision: number|null = null,ceilingRevision: number|null = null) {
  assertStaffState(scope,state);
  const data = parse<c.AdmissionHistory>(c.admissionHistorySchema,await rpc(scope,'read_student_admission_case',{p_organization_id:scope.organizationId,p_student_user_id:scope.studentUserId,
    p_query:{mode:'history',case_id:state.id,ceiling_revision:ceilingRevision,before_revision:beforeRevision,limit:25}}));
  if (data.case_id !== state.id || ceilingRevision !== null && data.ceiling_revision !== ceilingRevision || data.has_more !== !!data.next_before_revision
    || data.items.some(event => event.case_id !== state.id || event.case_revision > data.ceiling_revision || beforeRevision !== null && event.case_revision >= beforeRevision)) throw new AdmissionError();
  assertUnique(data.items.map(item => item.id));
  return data;
}
function parseMutation(scope: AdmissionActorScope,raw: unknown,requestId: string,kind: c.AdmissionCaseAction['action']|'evidence_committed',expectedRevision: number,caseId: string|null) {
  const result = parse<c.AdmissionMutationResult>(c.admissionMutationResultSchema,raw); assertAdmissionScope(scope,result.scope); assertStaffState(scope,result.state);
  if (!sameScope(result.scope,result.state.scope) || result.receipt.request_id !== requestId || result.receipt.kind !== kind || result.receipt.case_id !== result.state.id
    || result.receipt.revision !== expectedRevision + 1 || result.state.revision < result.receipt.revision || caseId && result.state.id !== caseId) throw new AdmissionError();
  return result;
}
export async function applyAdmissionAction(scope: AdmissionActorScope,command: c.AdmissionCaseAction,requestId: string) {
  const action = parse<c.AdmissionCaseAction>(c.admissionCaseActionSchema,command,'INVALID_INPUT');
  if (!c.admissionUuid.safeParse(requestId).success) throw new AdmissionError('INVALID_INPUT');
  if (action.action === 'initialize' && (!scope.association || action.group_id !== scope.association.group_id || action.enrollment_id !== scope.association.enrollment_id)) throw new AdmissionError('INVALID_INPUT');
  return parseMutation(scope,await rpc(scope,'apply_student_admission_case_action',{p_organization_id:scope.organizationId,p_student_user_id:scope.studentUserId,p_request_id:requestId,p_command:action}),requestId,action.action,action.expected_revision,action.action === 'initialize' ? null : action.case_id);
}
async function prepare(scope: AdmissionActorScope,state: c.AdmissionStaffCase,source: c.AdmissionEvidenceSource,requestId: string,bearer: string) {
  const args = parse<c.AdmissionPrepareArgs>(c.admissionPrepareArgsSchema,{p_case_id:state.id,p_expected_revision:state.revision,p_expected_program_ref:state.program_ref,p_request_id:requestId,p_source:source});
  const data = parse<c.AdmissionPreparation>(c.admissionPreparationSchema,await rpc(scope,'prepare_admission_case_evidence',args,bearer));
  if (data.case_id !== state.id || data.case_revision !== state.revision || data.source_kind !== source.kind || (data.source_kind === 'upload') !== !!data.upload_slot
    || data.upload_slot && data.upload_slot.path !== `${scope.studentUserId}/${scope.organizationId}/${state.id}/staging/${scope.actorId}/${data.reservation_id}`) throw new AdmissionError();
  return data;
}
async function commit(scope: AdmissionActorScope,prepared: c.AdmissionPreparation,source:c.AdmissionEvidenceSource,requestId: string,bearer: string) {
  const body = c.admissionCommitBodySchema.parse({case_id:prepared.case_id,reservation_id:prepared.reservation_id,expected_revision:prepared.case_revision,request_id:requestId});
  requireCurrent(scope);
  const result = await supabase.functions.invoke('admission-case-evidence-commit',{body,headers:{Authorization:bearer}}); requireCurrent(scope);
  if (result.error) throw await admissionFunctionError(result.error,scope);
  const error = c.admissionErrorSchema.safeParse(result.data); if (error.success) throw new AdmissionError(error.data.code);
  const mutation = parseMutation(scope,result.data,requestId,'evidence_committed',prepared.case_revision,prepared.case_id);
  const evidence = mutation.state.evidence.find(evidence => evidence.id === prepared.evidence_version_id);
  if ((mutation.state.revision === prepared.case_revision + 1 && !evidence) || evidence && (evidence.requirement_id !== source.requirement_id || evidence.supersedes_id !== source.supersedes_id
    || source.kind === 'upload' && (evidence.byte_sha256 !== source.declared_sha256 || evidence.byte_size !== source.declared_size || evidence.mime_type !== source.declared_mime))) throw new AdmissionError();
  return mutation;
}
export async function captureAdmissionEvidence(scope: AdmissionActorScope,state: c.AdmissionStaffCase,source: c.AdmissionEvidenceSource,prepareRequest: string,commitRequest: string,file: File|null = null) {
  assertStaffState(scope,state); const bearer = await admissionBearer(scope);
  const parsedSource = parse<c.AdmissionEvidenceSource>(c.admissionEvidenceSourceSchema,source);
  if (parsedSource.kind === 'upload') {
    if (!file || file.size !== parsedSource.declared_size || file.type !== parsedSource.declared_mime) throw new AdmissionError('INVALID_INPUT');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(byte => byte.toString(16).padStart(2,'0')).join(''); requireCurrent(scope);
    if (digest !== parsedSource.declared_sha256) throw new AdmissionError('INVALID_INPUT');
  }
  const prepared = await prepare(scope,state,parsedSource,prepareRequest,bearer);
  if (prepared.upload_slot && file) {
    const {StorageClient} = await import('@supabase/storage-js'); requireCurrent(scope);
    const storage = new StorageClient(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1`,{Authorization:bearer,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},window.fetch.bind(window));
    try { await storage.from(prepared.upload_slot.bucket).upload(prepared.upload_slot.path,file,{contentType:file.type,upsert:false}); }
    catch { /* An uncertain upload is reconciled only by the exact server source proof. */ }
    requireCurrent(scope);
  }
  return commit(scope,prepared,parsedSource,commitRequest,bearer);
}
export async function admissionFunctionError(error:unknown,scope:AdmissionActorScope):Promise<AdmissionError> {
  const context = (error as {context?:unknown}|null)?.context;
  if (context instanceof Response) {
    const status = context.status;
    if ([401,403].includes(status)) return new AdmissionError('ACCESS_DENIED');
    try {
      const reader = context.clone().body?.getReader(); let length = 0, chunks = '';
      const deadline = Date.now() + 2000, decoder = new TextDecoder();
      if (reader) {
        try { while (true) {
          let timer:ReturnType<typeof setTimeout>|undefined;
          let next:ReadableStreamReadResult<Uint8Array>;
          try {next = await Promise.race([reader.read(),new Promise<never>((_,reject) => {timer=setTimeout(() => reject(new Error('bounded_error_read')),Math.max(1,deadline-Date.now()));})]);}
          finally {if(timer) clearTimeout(timer);}
          requireCurrent(scope);if(next.done) break;length+=next.value.byteLength;if(length>4096) break;chunks+=decoder.decode(next.value,{stream:true});
        }} finally {void reader.cancel().catch(() => undefined);}
      }
      requireCurrent(scope);
      if (length <= 4096) {const parsed = c.admissionErrorSchema.safeParse(JSON.parse(chunks));if(parsed.success) return new AdmissionError(parsed.data.code);}
    } catch { requireCurrent(scope); }
    if ([401,403].includes(status)) return new AdmissionError('ACCESS_DENIED');
    if (status === 409) return new AdmissionError('REVISION_CONFLICT');
    if ([400,413].includes(status)) return new AdmissionError(status === 413 ? 'LIMIT_REACHED' : 'INVALID_INPUT');
  }
  return normalizeAdmissionError(error);
}
export async function readAdmissionEvidenceFile(scope: AdmissionActorScope,state: c.AdmissionStaffCase,evidence: c.AdmissionEvidence,historyEvent:c.AdmissionHistory['items'][number]|null = null): Promise<Blob> {
  assertStaffState(scope,state);
  const currentMetadata = state.evidence.find(item => equal(item,evidence));
  const history = historyEvent ? c.admissionEventSchema.safeParse(historyEvent) : null;
  const historicalMetadata = history?.success && history.data.case_id === state.id && history.data.case_revision <= state.revision
    ? history.data.payload.evidence.find(item => equal(item,evidence) && item.case_revision_created <= history.data.case_revision) : null;
  const authorized = currentMetadata || historicalMetadata;
  if (!authorized || evidence.case_id !== state.id || evidence.case_revision_created > state.revision || !authorized.can_read_bytes) throw new AdmissionError('ACCESS_DENIED');
  const bearer = await admissionBearer(scope);
  const response = await window.fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admission-case-evidence-file`,{method:'POST',headers:{Authorization:bearer,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},cache:'no-store',credentials:'omit',body:JSON.stringify({case_id:state.id,evidence_version_id:evidence.id})});
  requireCurrent(scope);
  if (!response.ok) {
    throw await admissionFunctionError({context:response},scope);
  }
  if (response.headers.get('Content-Type')?.split(';')[0] !== evidence.mime_type) throw new AdmissionError('SOURCE_UNAVAILABLE');
  const blob = await response.blob(); requireCurrent(scope);
  if (blob.size !== evidence.byte_size || blob.size <= 0 || blob.size > c.ADMISSION_MAX_BYTES || blob.type.split(';')[0] !== evidence.mime_type) throw new AdmissionError('SOURCE_UNAVAILABLE');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(byte => byte.toString(16).padStart(2,'0')).join(''); requireCurrent(scope);
  if (digest !== evidence.byte_sha256) throw new AdmissionError('SOURCE_UNAVAILABLE');
  return blob;
}
