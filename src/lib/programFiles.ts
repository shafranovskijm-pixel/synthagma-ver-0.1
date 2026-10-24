import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import { createDocumentUploadOperation, saveDocumentUpload, restoreDocumentFile, type DocumentUploadOperation, type VersionCommitResult, type OrgDocumentClient } from '@/lib/orgDocumentLifecycle';
import type { PrivateDownloadSigner, PrivateDownloadSigningInput } from '@/utils/storageHelpers';
import { proxiedAssetUrl } from '@/utils/proxyFetch';

export const PROGRAM_FILE_TYPE = 'education_program';
export const PROGRAM_FILE_MAX_BYTES = 20 * 1024 * 1024;
const uuid = z.string().uuid();
const documentColumns = 'id,organization_id,type,name,document_revision,current_version_id,status,deleted_at,created_at';
const versionColumns = 'id,document_id,organization_id,version_number,file_url,file_path,file_size,file_name,change_summary,uploaded_by,uploaded_by_name,created_at,event_kind,restored_from_version_id,request_id,result_revision';
const documentSchema = z.object({ id: uuid, organization_id: uuid, type: z.literal(PROGRAM_FILE_TYPE), name: z.string().min(1),
  document_revision: z.number().int().nonnegative(), current_version_id: uuid.nullable(), status: z.enum(['active', 'archived', 'expired']), deleted_at: z.null(), created_at: z.string() }).strict();
const versionSchema = z.object({ id: uuid, document_id: uuid, organization_id: uuid, version_number: z.number().int().positive(),
  file_url: z.string().nullable(), file_path: z.string().nullable(), file_size: z.number().int().nonnegative().nullable(), file_name: z.string().nullable(),
  change_summary: z.string().nullable(), uploaded_by: uuid.nullable(), uploaded_by_name: z.string().nullable(), created_at: z.string(),
  event_kind: z.enum(['baseline', 'upload', 'restore']).nullable(), restored_from_version_id: uuid.nullable(), request_id: uuid.nullable(), result_revision: z.number().int().positive().nullable() }).strict();
export type ProgramFileDocument = z.infer<typeof documentSchema>;
export type ProgramFileVersion = z.infer<typeof versionSchema>;
export interface ProgramFile { document: ProgramFileDocument; currentVersion: ProgramFileVersion | null }
export interface ProgramFileScope { actorId: string; organizationId: string; accessRevision: number; key: string; current: () => boolean }
export class ProgramFileError extends Error {
  constructor(readonly code: 'ACCESS_DENIED' | 'SOURCE_CHANGED' | 'REVISION_CONFLICT' | 'DEPENDENCY_UNAVAILABLE', message?: string) {
    super(message ?? ({ ACCESS_DENIED: 'Доступ изменился. Откройте файлы программ заново.', SOURCE_CHANGED: 'Не удалось подтвердить выбранный файл. Обновите список.',
      REVISION_CONFLICT: 'Файл изменился. Проверьте текущую версию.', DEPENDENCY_UNAVAILABLE: 'Результат пока не подтверждён. Повторите то же сохранение.' }[code]));
    this.name = 'ProgramFileError';
  }
}
export function captureProgramFileScope(organizationId: string, key: string, current: () => boolean): ProgramFileScope {
  const actor = captureOfflineContext();
  if (!actor || !uuid.safeParse(organizationId).success || !current()) throw new ProgramFileError('ACCESS_DENIED');
  return { actorId: actor.actorId, organizationId, accessRevision: actor.revision, key, current };
}
export function requireProgramFileScope(scope: ProgramFileScope) {
  if (!isOfflineActorCurrent(scope.actorId, scope.accessRevision) || !scope.current()) throw new ProgramFileError('ACCESS_DENIED');
}
export function programFileScopeCurrent(scope: ProgramFileScope) { try { requireProgramFileScope(scope); return true; } catch { return false; } }
function checked(error: unknown) {
  if (!error) return;
  const e = error as { code?: string; status?: number };
  if (e.code === '42501' || e.status === 401 || e.status === 403) throw new ProgramFileError('ACCESS_DENIED');
  if (e.code === '40001' || e.code === 'PT409' || e.code === '55000') throw new ProgramFileError('REVISION_CONFLICT');
  throw error;
}
async function bounded<T>(request: PromiseLike<T>, deadline = Date.now() + 45000): Promise<T> {
  if (Date.now() >= deadline) throw new ProgramFileError('DEPENDENCY_UNAVAILABLE');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve(request), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ProgramFileError('DEPENDENCY_UNAVAILABLE')), Math.max(0, deadline - Date.now())); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
function active(scope: ProgramFileScope, deadline: number) {
  requireProgramFileScope(scope); if (Date.now() >= deadline) throw new ProgramFileError('DEPENDENCY_UNAVAILABLE');
}
async function authorization(scope: ProgramFileScope, deadline = Date.now() + 45000) {
  active(scope, deadline);
  const session = await bounded(supabase.auth.getSession(), deadline); requireProgramFileScope(scope);
  if (session.error || session.data.session?.user.id !== scope.actorId || !session.data.session.access_token) throw new ProgramFileError('ACCESS_DENIED');
  const token = session.data.session.access_token;
  active(scope, deadline);
  const identity = await bounded(supabase.auth.getUser(token), deadline); requireProgramFileScope(scope);
  if (identity.error || identity.data.user?.id !== scope.actorId) throw new ProgramFileError('ACCESS_DENIED');
  active(scope, deadline);
  return 'Bearer ' + token;
}

/** Opt-in transport for the programme manager. No privileges or changes to other callers. */
export interface ScopedOrgDocumentTransport {
  key: string;
  assertCurrent(): void;
  signUrl: PrivateDownloadSigner;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  readDocument(documentId: string): Promise<{ data: unknown; error: unknown }>;
  readVersions(documentId: string): Promise<{ data: unknown; error: unknown }>;
  saveUpload(operation: DocumentUploadOperation): Promise<VersionCommitResult>;
  restore(input: Parameters<typeof restoreDocumentFile>[0]): Promise<VersionCommitResult>;
}
export function createScopedOrgDocumentTransport(scope: ProgramFileScope, pdfOnly = false): ScopedOrgDocumentTransport {
  const assertCurrent = () => requireProgramFileScope(scope);
  return { key: scope.key, assertCurrent,
    signUrl: input => signProgramFile(scope, input),
    async saveUpload(operation) {
      const deadline = Date.now() + 45000;
      assertCurrent(); if (operation.organizationId !== scope.organizationId) throw new ProgramFileError('ACCESS_DENIED');
      if (pdfOnly) { await bounded(validateProgramPdf(operation.file), deadline); active(scope, deadline); }
      return saveDocumentUpload(operation, lifecycleClient(scope, deadline, pdfOnly));
    },
    async restore(input) { assertCurrent(); if (input.organizationId !== scope.organizationId) throw new ProgramFileError('ACCESS_DENIED'); return restoreDocumentFile(input, lifecycleClient(scope, Date.now() + 45000, false)); },
    async rpc(name, args) { const deadline = Date.now() + 45000, bearer = await authorization(scope, deadline); active(scope, deadline); const result = await bounded(supabase.rpc(name as never, args as never).setHeader('Authorization', bearer), deadline); assertCurrent(); return result; },
    async readDocument(documentId) {
      if (!uuid.safeParse(documentId).success) throw new ProgramFileError('SOURCE_CHANGED');
      const deadline = Date.now() + 45000, bearer = await authorization(scope, deadline); active(scope, deadline);
      const result = await bounded(supabase.from('org_documents').select('*').eq('organization_id', scope.organizationId).eq('id', documentId).single().setHeader('Authorization', bearer), deadline); assertCurrent();
      if (result.data && (result.data.id !== documentId || result.data.organization_id !== scope.organizationId)) throw new ProgramFileError('SOURCE_CHANGED');
      return result;
    },
    async readVersions(documentId) {
      if (!uuid.safeParse(documentId).success) throw new ProgramFileError('SOURCE_CHANGED');
      const deadline = Date.now() + 45000, bearer = await authorization(scope, deadline); active(scope, deadline);
      const result = await bounded(supabase.from('org_document_versions').select('*').eq('organization_id', scope.organizationId).eq('document_id', documentId).order('version_number', { ascending: false }).setHeader('Authorization', bearer), deadline); assertCurrent();
      if (result.data?.some(row => row.document_id !== documentId || row.organization_id !== scope.organizationId)) throw new ProgramFileError('SOURCE_CHANGED');
      return result;
    },
  };
}

async function readVersionRows(scope: ProgramFileScope, ids: string[], deadline = Date.now() + 45000) {
  if (!ids.length) return [];
  const bearer = await authorization(scope, deadline);
  const result = await bounded(supabase.from('org_document_versions').select(versionColumns).eq('organization_id', scope.organizationId).in('id', ids).setHeader('Authorization', bearer), deadline);
  requireProgramFileScope(scope); checked(result.error);
  const rows = z.array(versionSchema).max(51).safeParse(result.data);
  if (!rows.success || rows.data.some(r => r.organization_id !== scope.organizationId || !ids.includes(r.id)) || new Set(rows.data.map(r => r.id)).size !== rows.data.length) throw new ProgramFileError('SOURCE_CHANGED');
  return rows.data;
}
async function withVersions(scope: ProgramFileScope, documents: ProgramFileDocument[], deadline?: number): Promise<ProgramFile[]> {
  const ids = documents.flatMap(d => d.current_version_id ? [d.current_version_id] : []);
  if (new Set(ids).size !== ids.length) throw new ProgramFileError('SOURCE_CHANGED');
  const versions = await readVersionRows(scope, ids, deadline); requireProgramFileScope(scope);
  return documents.map(document => {
    const currentVersion = versions.find(v => v.id === document.current_version_id) ?? null;
    if (document.organization_id !== scope.organizationId || document.current_version_id && (!currentVersion || currentVersion.document_id !== document.id)) throw new ProgramFileError('SOURCE_CHANGED');
    return { document, currentVersion };
  });
}
export async function readProgramFile(scope: ProgramFileScope, documentId: string, deadline = Date.now() + 45000): Promise<ProgramFile | null> {
  if (!uuid.safeParse(documentId).success) throw new ProgramFileError('SOURCE_CHANGED');
  const bearer = await authorization(scope, deadline);
  const result = await bounded(supabase.from('org_documents').select(documentColumns).eq('organization_id', scope.organizationId).eq('id', documentId).eq('type', PROGRAM_FILE_TYPE).is('deleted_at', null).maybeSingle().setHeader('Authorization', bearer), deadline);
  requireProgramFileScope(scope); checked(result.error); if (result.data === null) return null;
  const row = documentSchema.safeParse(result.data);
  if (!row.success || row.data.id !== documentId || row.data.organization_id !== scope.organizationId) throw new ProgramFileError('SOURCE_CHANGED');
  return (await withVersions(scope, [row.data], deadline))[0];
}
export async function listProgramFiles(scope: ProgramFileScope, after: string | null = null) {
  if (after !== null && !uuid.safeParse(after).success) throw new ProgramFileError('SOURCE_CHANGED');
  const deadline = Date.now() + 45000, bearer = await authorization(scope, deadline);
  let query = supabase.from('org_documents').select(documentColumns).eq('organization_id', scope.organizationId).eq('type', PROGRAM_FILE_TYPE).is('deleted_at', null).order('id', { ascending: true }).limit(51);
  if (after) query = query.gt('id', after);
  const result = await bounded(query.setHeader('Authorization', bearer), deadline); requireProgramFileScope(scope); checked(result.error);
  const parsed = z.array(documentSchema).max(51).safeParse(result.data);
  if (!parsed.success) throw new ProgramFileError('SOURCE_CHANGED');
  let previous = after;
  for (const d of parsed.data) { if (d.organization_id !== scope.organizationId || previous !== null && d.id <= previous) throw new ProgramFileError('SOURCE_CHANGED'); previous = d.id; }
  const items = await withVersions(scope, parsed.data.slice(0, 50), deadline); requireProgramFileScope(scope);
  return { items, next: parsed.data.length > 50 ? parsed.data[49].id : null };
}

export async function validateProgramPdf(file: File) {
  if (!/\.pdf$/i.test(file.name) || file.type && file.type.toLowerCase() !== 'application/pdf') throw new Error('Выберите файл PDF.');
  if (file.size < 5 || file.size > PROGRAM_FILE_MAX_BYTES) throw new Error('Нужен непустой PDF размером не более 20 МБ.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || [37,80,68,70,45].some((n,i) => bytes[i] !== n)) throw new Error('Не удалось распознать PDF. Выберите исходный файл программы.');
  return new File([bytes.slice().buffer], file.name, { type: 'application/pdf', lastModified: file.lastModified });
}
async function readExactBody(response: Response, deadline: number, scope: ProgramFileScope, maximum = PROGRAM_FILE_MAX_BYTES) {
  const reader = response.body?.getReader(); if (!reader) throw new ProgramFileError('SOURCE_CHANGED');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { requireProgramFileScope(scope); const next = await bounded(reader.read(), deadline); requireProgramFileScope(scope); if (next.done) break;
    size += next.value.length; if (size > maximum) throw new ProgramFileError('SOURCE_CHANGED'); chunks.push(next.value); } }
  finally { void reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}

/** Mirrors the actual storage-js2.90.1 signing endpoint without mutating global SDK headers. */
async function signProgramFile(scope: ProgramFileScope, input: PrivateDownloadSigningInput): Promise<string> {
  const { bucket, path, expiresIn, downloadName, signal } = input;
  if (!Number.isFinite(input.deadline)) throw new ProgramFileError('SOURCE_CHANGED');
  const deadline = Math.min(input.deadline, Date.now() + 45000);
  active(scope, deadline);
  if (signal.aborted) throw new ProgramFileError('ACCESS_DENIED');
  if (bucket !== 'org-documents' || !path.startsWith(scope.organizationId + '/') || path.split('/').some(s => !s || s === '.' || s === '..') || /[\\?#\u0000-\u001f]/.test(path)
    || !Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) throw new ProgramFileError('SOURCE_CHANGED');
  const project = new URL(import.meta.env.VITE_SUPABASE_URL), apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!['https:','http:'].includes(project.protocol) || project.username || project.password || project.search || project.hash || !apiKey?.trim()) throw new ProgramFileError('SOURCE_CHANGED');
  const base = project.pathname.replace(/\/$/, '') + '/storage/v1';
  const encoded = [bucket,...path.split('/')].map(encodeURIComponent).join('/');
  const endpoint = new URL(project.origin + base + '/object/sign/' + encoded);
  const bearer = await authorization(scope, deadline); active(scope, deadline);
  if (signal.aborted) throw new ProgramFileError('ACCESS_DENIED');
  const response = await bounded(fetch(endpoint.toString(), { method:'POST',headers:{Authorization:bearer,apikey:apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({expiresIn}),signal,credentials:'omit',cache:'no-store',redirect:'error' }),deadline);
  active(scope, deadline);
  if (signal.aborted) throw new ProgramFileError('ACCESS_DENIED');
  if (response.status === 401 || response.status === 403) throw new ProgramFileError('ACCESS_DENIED');
  const signingContentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!response.ok || !['application/json', 'text/plain'].includes(signingContentType ?? '')) throw new ProgramFileError('DEPENDENCY_UNAVAILABLE');
  const bytes = await readExactBody(response,deadline,scope,32768); active(scope,deadline);
  if (signal.aborted) throw new ProgramFileError('ACCESS_DENIED');
  let data: unknown;
  try { data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw new ProgramFileError('SOURCE_CHANGED'); }
  const parsed=z.object({signedURL:z.string().min(1).max(16384)}).passthrough().safeParse(data);
  if (!parsed.success || !parsed.data.signedURL.startsWith('/object/sign/')) throw new ProgramFileError('SOURCE_CHANGED');
  const signed=new URL(project.origin+base+parsed.data.signedURL);
  let decoded: string;try { decoded=decodeURIComponent(signed.pathname); } catch { throw new ProgramFileError('SOURCE_CHANGED'); }
  if (signed.origin !== project.origin || signed.username || signed.password || signed.hash || decoded !== base+'/object/sign/'+bucket+'/'+path
    || !signed.searchParams.get('token') || [...signed.searchParams.keys()].length !== 1 || [...signed.searchParams.keys()].some(k=>k!=='token')) throw new ProgramFileError('SOURCE_CHANGED');
  signed.searchParams.set('download',downloadName);
  return proxiedAssetUrl(signed.toString());
}
async function recoverDuplicate(scope: ProgramFileScope, path: string, file: File, bearer: string, deadline: number) {
  const publicUrl = new URL(supabase.storage.from('org-documents').getPublicUrl(path).data.publicUrl);
  const project = new URL(import.meta.env.VITE_SUPABASE_URL), apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const base = project.pathname.replace(/\/$/, '');
  if (publicUrl.origin !== project.origin || publicUrl.pathname !== base + '/storage/v1/object/public/org-documents/' + path || publicUrl.search || publicUrl.hash || !apiKey?.trim()) throw new ProgramFileError('SOURCE_CHANGED');
  publicUrl.pathname = base + '/storage/v1/object/authenticated/org-documents/' + path;
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), Math.max(0, deadline - Date.now()));
  try {
    active(scope, deadline);
    const response = await bounded(fetch(publicUrl.toString(), { headers: { Authorization: bearer, apikey: apiKey }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: abort.signal }), deadline); requireProgramFileScope(scope);
    if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') throw new ProgramFileError('SOURCE_CHANGED');
    const declared = response.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > PROGRAM_FILE_MAX_BYTES || !response.headers.get('content-encoding') && Number(declared) !== file.size)) throw new ProgramFileError('SOURCE_CHANGED');
    const bytes = await readExactBody(response, deadline, scope), original = new Uint8Array(await bounded(file.arrayBuffer(), deadline)); requireProgramFileScope(scope);
    if (bytes.length !== original.length || bytes.some((n,i) => n !== original[i])) throw new ProgramFileError('SOURCE_CHANGED');
  } finally { clearTimeout(timer); abort.abort(); }
}

function lifecycleClient(scope: ProgramFileScope, deadline: number, pdfOnly: boolean): OrgDocumentClient {
  return { storage: { from(bucket) { if (bucket !== 'org-documents') throw new ProgramFileError('SOURCE_CHANGED'); return {
    getPublicUrl(path) { requireProgramFileScope(scope); return supabase.storage.from(bucket).getPublicUrl(path); },
    async upload(path, body, options) {
      if (!path.startsWith(scope.organizationId + '/versions/')) throw new ProgramFileError('ACCESS_DENIED');
      const canonical = pdfOnly ? await bounded(validateProgramPdf(body), deadline) : body; requireProgramFileScope(scope);
      const bearer = await authorization(scope, deadline);
      active(scope, deadline);
      const result = await bounded(supabase.storage.from(bucket).upload(path, canonical, { ...options, contentType: canonical.type || options.contentType, headers: { Authorization: bearer } }), deadline); requireProgramFileScope(scope);
      const e = result.error as { name?: string; status?: string | number; statusCode?: string | number; message?: string } | null;
      const duplicate = [e?.status,e?.statusCode].some(s => String(s) === '409') || [e?.status,e?.statusCode].some(s => String(s) === '400') && e?.name === 'StorageApiError' && e.message === 'The resource already exists';
      if (e && duplicate && pdfOnly) { await recoverDuplicate(scope, path, canonical, bearer, deadline); return { error: null }; }
      return { error: result.error };
    },
  }; } }, rpc: async (name, args) => {
    const bearer = await authorization(scope, deadline);
    active(scope, deadline);
    const result = await bounded(supabase.rpc(name as never, args as never).setHeader('Authorization', bearer), deadline); requireProgramFileScope(scope); checked(result.error); return result;
  } };
}

/** Retain the returned object for an unknown result. Never replace/delete a fixed-slot document. */
export async function prepareProgramFile(scope: ProgramFileScope, name: string, file: File) {
  requireProgramFileScope(scope); const title = name.trim();
  if (!title || title.length > 200) throw new Error('Введите название программы — до 200 символов.');
  const pdf = await bounded(validateProgramPdf(file)); requireProgramFileScope(scope);
  const binding = { actor: scope.actorId, org: scope.organizationId, revision: scope.accessRevision };
  const operation = createDocumentUploadOperation({ organizationId: scope.organizationId, expectedRevision: 0, file: pdf, document: { name: title, type: PROGRAM_FILE_TYPE, status: 'active' } });
  let running = false;
  return { documentId: operation.documentId, requestId: operation.requestId, name: title, fileName: pdf.name,
    async run(currentScope: ProgramFileScope): Promise<ProgramFile> {
      requireProgramFileScope(currentScope);
      if (currentScope.actorId !== binding.actor || currentScope.organizationId !== binding.org || currentScope.accessRevision !== binding.revision) throw new ProgramFileError('ACCESS_DENIED');
      if (running) throw new ProgramFileError('REVISION_CONFLICT'); running = true;
      const deadline = Date.now() + 45000;
      try {
        const receipt = await saveDocumentUpload(operation, lifecycleClient(currentScope, deadline, true)); requireProgramFileScope(currentScope);
        if (receipt.document_id !== operation.documentId || !uuid.safeParse(receipt.version_id).success || receipt.revision !== 1 || receipt.version_number !== 1 || typeof receipt.replayed !== 'boolean') throw new ProgramFileError('SOURCE_CHANGED');
        const [actual, versions] = await Promise.all([readProgramFile(currentScope, operation.documentId, deadline), readVersionRows(currentScope, [receipt.version_id], deadline)]); requireProgramFileScope(currentScope);
        const saved = versions[0];
        if (!actual || actual.document.document_revision < 1 || !actual.document.current_version_id || !saved || saved.document_id !== operation.documentId || saved.request_id !== operation.requestId || saved.version_number !== 1 || saved.result_revision !== 1 || saved.event_kind !== 'upload' || saved.file_path !== operation.path || saved.file_name !== pdf.name || saved.file_size !== pdf.size) throw new ProgramFileError('SOURCE_CHANGED');
        // Replay proves the original immutable v1 even when another authorized action already created current v2.
        return actual;
      } finally { running = false; }
    },
  };
}
export type PreparedProgramFile = Awaited<ReturnType<typeof prepareProgramFile>>;
