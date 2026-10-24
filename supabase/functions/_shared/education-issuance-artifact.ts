import {educationArtifactRequestSchema, educationArtifactContextSchema, educationArtifactAttestationSchema,
  educationArtifactWorkerResultSchema, educationStagingAttestProofSchema, educationOutputAttestProofSchema, educationArtifactObjectObservationSchema,
  type EducationArtifactRequest, type EducationArtifactContext, type EducationStagingProof} from './education-issuance-artifact-contract.ts';
import {admissionSame, admissionHash, admissionTime, admissionUuid, readAdmissionBody, requireAdmissionActor,
  AdmissionError} from './admission-case-access.ts';
import {prepareEducationHtml, EducationTemplateError} from './education-issuance-render.ts';
import {validateFaithfulPdf, FaithfulPdfError, EDUCATION_PDF_MAX_BYTES, EDUCATION_RENDERER_REVISION} from './faithful-pdf.ts';

export const EDUCATION_ARTIFACT_MS = 55_000;
export const EDUCATION_ARTIFACT_REVISION = 'uc-education-artifact-20261024-v3';
const codes = ['INVALID_INPUT', 'ACCESS_DENIED', 'REVISION_CONFLICT', 'REQUEST_CONFLICT', 'SOURCE_CHANGED', 'SOURCE_UNAVAILABLE',
  'PREREQUISITE_MISSING', 'REVIEW_REQUIRED', 'LIMIT_EXCEEDED', 'DEPENDENCY_UNAVAILABLE', 'NUMBER_PLAN_STALE',
  'ARTIFACT_UNAVAILABLE', 'ARTIFACT_REVIEW_REQUIRED', 'ARTIFACT_RENDER_FAILED'] as const;
type Code = typeof codes[number];
const labels: Record<Code, string> = {
  INVALID_INPUT: 'Некорректный запрос', ACCESS_DENIED: 'Нет доступа к подготовке документа',
  REVISION_CONFLICT: 'Данные изменились. Обновите подготовку', REQUEST_CONFLICT: 'Этот запрос уже связан с другими данными',
  SOURCE_CHANGED: 'Источник изменился. Проверьте подготовку заново', SOURCE_UNAVAILABLE: 'Точный источник документа недоступен',
  PREREQUISITE_MISSING: 'Сначала выполните необходимые действия', REVIEW_REQUIRED: 'Требуется проверка ответственным',
  LIMIT_EXCEEDED: 'Превышен допустимый размер', DEPENDENCY_UNAVAILABLE: 'Сервис временно недоступен. Повторите тот же запрос',
  NUMBER_PLAN_STALE: 'План номеров изменился. Документ ещё не выдан', ARTIFACT_UNAVAILABLE: 'Подготовленный файл недоступен',
  ARTIFACT_REVIEW_REQUIRED: 'Подготовленный файл должен проверить ответственный',
  ARTIFACT_RENDER_FAILED: 'Не удалось сформировать точный PDF. Документ не выдан',
};
export class EducationArtifactError extends Error {
  constructor(readonly code: Code, readonly status = code === 'ACCESS_DENIED' ? 403 : code === 'INVALID_INPUT' ? 400
    : code === 'LIMIT_EXCEEDED' ? 413 : ['DEPENDENCY_UNAVAILABLE', 'ARTIFACT_RENDER_FAILED'].includes(code) ? 503 : 409) {super(code);}
}
const fail = (code: Code = 'SOURCE_CHANGED'): never => {throw new EducationArtifactError(code);};
const check = (signal: AbortSignal): void => {if (signal.aborted) fail('DEPENDENCY_UNAVAILABLE');};
const same = (left: unknown, right: unknown): void => {if (!admissionSame(left, right)) fail();};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'X-Sintagma-Function-Revision',
  'X-Sintagma-Function-Revision': EDUCATION_ARTIFACT_REVISION, 'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {...headers, 'Content-Type': 'application/json'}});
export function educationArtifactError(error: unknown): Response {
  let safe = error instanceof EducationArtifactError ? error : new EducationArtifactError('DEPENDENCY_UNAVAILABLE');
  if (error instanceof FaithfulPdfError) safe = new EducationArtifactError('ARTIFACT_RENDER_FAILED');
  if (error instanceof EducationTemplateError) safe = new EducationArtifactError('SOURCE_UNAVAILABLE');
  if (error instanceof AdmissionError && codes.includes(error.code as Code)) safe = new EducationArtifactError(error.code as Code, error.status);
  const message = error instanceof EducationTemplateError && error.reason === 'required_fields'
    ? 'В утверждённом шаблоне нужны поля: организация, ФИО, программа, номер документа, регистрационный номер и дата выдачи. Документ ещё не выдан.'
    : labels[safe.code];
  return json({schema_version: 1, code: safe.code, retryable: ['DEPENDENCY_UNAVAILABLE', 'ARTIFACT_RENDER_FAILED'].includes(safe.code), message}, safe.status);
}

type DbResult = {data: unknown; error: unknown};
type StorageResult<T> = {data: T | null; error: unknown};
export interface EducationStorage {
  from(bucket: string): {
    info(path: string): PromiseLike<StorageResult<unknown>>;
    download(path: string): PromiseLike<StorageResult<Blob>>;
    upload(path: string, bytes: ArrayBuffer, options: {contentType: string; upsert: false; cacheControl: string; metadata?: Record<string, string>}): PromiseLike<StorageResult<{id?: string}>>;
  };
}
export interface EducationService {rpc(name: string, args: Record<string, unknown>): PromiseLike<DbResult>; storage: EducationStorage;}
export interface EducationCaller extends EducationService {
  auth: {getUser(jwt: string): PromiseLike<{data: {user: {id: string} | null}; error: unknown}>};
}
export interface EducationArtifactDependencies {
  configured: boolean;
  createCaller(authorization: string, signal: AbortSignal): EducationCaller;
  createService(signal: AbortSignal): EducationService;
  render(html: string, signal: AbortSignal): Promise<Uint8Array>;
}
function db(result: DbResult): unknown {
  if (!result.error) return result.data;
  const error = record(result.error) ? result.error : {};
  if (error.code === '42501') fail('ACCESS_DENIED');
  if (error.code === '22023') fail('INVALID_INPUT');
  if (error.code === '40001') fail('REVISION_CONFLICT');
  const message = typeof error.message === 'string' ? error.message : '';
  const code = message.replace(/^(?:EDUCATION_ISSUANCE_|EDUCATION_ARTIFACT_|ISSUANCE_)/, '');
  if (codes.includes(code as Code)) fail(code as Code);
  if (error.code === 'PT409') fail('REVISION_CONFLICT');
  fail('DEPENDENCY_UNAVAILABLE');
}
function stable(context: EducationArtifactContext): unknown {
  return {schema_version: context.schema_version, organization_id: context.organization_id, preparation_id: context.preparation_id,
    item_id: context.item_id, input_revision: context.input_revision, request_id: context.request_id, user_id: context.user_id,
    subject_user_id: context.subject_user_id, scope: context.scope, render_input_hash: context.render_input_hash,
    template: context.template, variables: context.variables, staging: {bucket: context.staging.bucket, path: context.staging.path},
    output: {document_id: context.output.document_id, upload_request_id: context.output.upload_request_id,
      expected_revision: context.output.expected_revision, file_path: context.output.file_path,
      file_name: context.output.file_name, document: context.output.document}};
}
function immutableArtifact(context: EducationArtifactContext): unknown {
  if (!context.output.artifact) return null;
  const {output_review: _currentReview, ...immutable} = context.output.artifact;
  return immutable;
}
function progression(before: EducationArtifactContext, after: EducationArtifactContext): void {
  same(stable(before), stable(after));
  const modes = ['prepared', 'staged', 'rendered', 'consumed'];
  if (modes.indexOf(after.mode) < modes.indexOf(before.mode)) fail();
  if (before.staging.proof) same(before.staging.proof, after.staging.proof);
  if (before.output.source) same(before.output.source, after.output.source);
  if (before.output.object) same(before.output.object, after.output.object);
  if (before.output.artifact) same(immutableArtifact(before), immutableArtifact(after));
  if (before.final_record_id) same(before.final_record_id, after.final_record_id);
}
function parseContext(raw: unknown, input: EducationArtifactRequest, actor: string): EducationArtifactContext {
  const parsed = educationArtifactContextSchema.safeParse(raw);
  if (!parsed.success) fail('SOURCE_UNAVAILABLE');
  const context = parsed.data;
  for (const key of Object.keys(input) as (keyof EducationArtifactRequest)[]) if (context[key] !== input[key]) fail();
  if (context.user_id !== actor) fail('ACCESS_DENIED');
  const path = context.template.storage.path;
  if (/[\\?#%:\x00-\x20\x7f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')
    || !new RegExp(`^${context.organization_id}/versions/${context.template.ref.source.document_id}/[a-f0-9-]{36}\\.html?$`).test(path)) fail('SOURCE_UNAVAILABLE');
  if (context.template.storage.metadata_hash !== context.template.ref.source.content_hash) fail();
  if (!/^[^\\/\x00-\x1f]{1,196}\.pdf$/i.test(context.output.file_name)) fail('SOURCE_UNAVAILABLE');
  if (context.mode === 'prepared' && context.output.source !== null) fail();
  return context;
}

type RawObjectInfo = {object_id: string; updated_at: string; size: number; mime: string; storage_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> | null};
type RawObserver = () => Promise<RawObjectInfo | null>;
type ObjectInfo = {object_id: string; updated_at: string; size: number; mime: string; metadata: Record<string, unknown> | null; raw_metadata?: unknown};
// SDK timestamps may be serialized Dates. Their observed digits only cross-check
// transport; every identity and SQL attestation retains the original PG microseconds.
function sdkTimeMatchesRaw(raw: unknown, exact: string): void {
  const observed = admissionTime(raw), fraction = (raw as string).match(/\.(\d{1,6})(?:Z|\+00:00)$/)?.[1] || '';
  const end = fraction.length ? 20 + fraction.length : 19;
  same(observed.slice(0, end), exact.slice(0, end));
}
function metadataTransport(value: Record<string, unknown> | null): unknown {
  if (!value || !Object.keys(value).length) return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const canonical = provenanceKeys.find(candidate => candidate === key || camel(candidate) === key);
    if (!canonical || typeof value[key] !== 'string' || canonical in out) fail();
    out[canonical] = value[key];
  }
  return out;
}
const notFound = (error: unknown) => record(error) && [error.statusCode, error.status, error.code].some(value => String(value) === '404' || value === 'NoSuchKey' || value === 'not_found');
function selectEqual<T>(values: unknown[], parser: (value: unknown) => T): T {
  const available = values.filter(value => value !== undefined && value !== null);
  if (!available.length) return fail('SOURCE_UNAVAILABLE');
  const parsed = available.map(parser); for (const value of parsed) same(parsed[0], value);
  return parsed[0];
}
async function info(storage: EducationStorage, bucket: string, path: string, signal: AbortSignal,
  fence: () => Promise<unknown>, absent = false, observe?: RawObserver): Promise<ObjectInfo | null> {
  await fence();
  check(signal);
  const before = observe ? await observe() : undefined; check(signal);
  const result = await storage.from(bucket).info(path); check(signal);
  await fence(); check(signal);
  const after = observe ? await observe() : undefined; check(signal);
  same(before, after);
  if (result.error) {
    if (notFound(result.error)) {if (absent && (before === undefined || before === null)) return null; return fail('SOURCE_UNAVAILABLE');}
    if (record(result.error) && [result.error.statusCode, result.error.status].some(value => String(value) === '403')) fail('ACCESS_DENIED');
    return fail('DEPENDENCY_UNAVAILABLE');
  }
  if (!record(result.data)) fail('SOURCE_UNAVAILABLE');
  if (observe && !before) fail();
  const value = result.data;
  if ((value.bucketId ?? value.bucket_id) !== bucket || value.name !== path) fail();
  for (const key of ['owner', 'ownerId', 'owner_id']) if (bucket === 'education-issuance-staging' && value[key] !== undefined && value[key] !== null && value[key] !== '') fail();
  const metadata = record(value.metadata) ? value.metadata : null;
  const size = selectEqual([value.size, metadata?.size], raw => {
    if (!Number.isSafeInteger(raw) || (raw as number) < 1 || (raw as number) > EDUCATION_PDF_MAX_BYTES) return fail('SOURCE_UNAVAILABLE');
    return raw as number;
  });
  const mime = selectEqual([value.contentType, value.content_type, metadata?.mimetype], raw => {
    if (typeof raw !== 'string' || !['application/pdf', 'text/html'].includes(raw)) return fail('SOURCE_UNAVAILABLE');
    return raw;
  });
  let updated: string, id: string;
  try {
    const aliases = [value.updatedAt, value.updated_at, value.lastModified, value.last_modified].filter(v => v !== undefined && v !== null);
    if (!aliases.length) fail('SOURCE_UNAVAILABLE');
    id = admissionUuid(value.id);
    if (before) {
      updated = admissionTime(before.updated_at);
      for (const alias of aliases) sdkTimeMatchesRaw(alias, updated);
      same(id, before.object_id); same(size, before.size); same(mime, before.mime);
    } else updated = selectEqual(aliases, admissionTime);
  }
  catch {return fail('SOURCE_UNAVAILABLE');}
  const explicit = value.userMetadata ?? value.user_metadata;
  if (explicit !== undefined && explicit !== null && !record(explicit)) fail();
  // Current Storage InfoRenderer exposes user_metadata as metadata; older APIs
  // expose userMetadata separately. The SQL attestation checks actual DB ownership.
  const userMetadata = record(explicit) ? explicit : metadata && ('preparationId' in metadata || 'preparation_id' in metadata) ? metadata : null;
  if (before && 'user_metadata' in before) same(metadataTransport(userMetadata), metadataTransport(before.user_metadata ?? null));
  return {object_id: id!, updated_at: updated!, size, mime, metadata: userMetadata,
    raw_metadata: before?.storage_metadata ? {storage_metadata: before.storage_metadata, user_metadata: before.user_metadata} : undefined};
}
function identity(value: ObjectInfo): unknown {return {object_id: value.object_id, updated_at: value.updated_at, size: value.size, mime: value.mime, metadata: value.metadata, raw_metadata: value.raw_metadata};}
function objectIdentity(value: ObjectInfo, expected: {object_id: string; updated_at: string}): void {
  same(value.object_id, expected.object_id); same(value.updated_at, admissionTime(expected.updated_at));
}
async function bytes(storage: EducationStorage, bucket: string, path: string, expected: ObjectInfo,
  signal: AbortSignal, knownHash: string | null, fence: () => Promise<unknown>, observe?: RawObserver,
  plainHtmlTemplateTransport = false): Promise<{bytes: Uint8Array; sha256: string}> {
  await fence();
  check(signal);
  const result = await storage.from(bucket).download(path); check(signal);
  await fence(); check(signal);
  if (result.error) {if (notFound(result.error)) fail('SOURCE_UNAVAILABLE'); return fail('DEPENDENCY_UNAVAILABLE');}
  // The deployed private-object proxy returns this verified HTML source as text/plain.
  // This transport exception is enabled only at the original-caller template call;
  // SQL/info MIME and all PDF downloads retain their exact canonical checks.
  const exactMime = result.data?.type === expected.mime;
  const plainTemplate = plainHtmlTemplateTransport && expected.mime === 'text/html' && result.data?.type === 'text/plain';
  if (!result.data || result.data.size !== expected.size || !exactMime && !plainTemplate) fail('SOURCE_UNAVAILABLE');
  const data = new Uint8Array(await result.data.arrayBuffer()); check(signal);
  if (data.length !== expected.size) fail();
  if (expected.mime === 'application/pdf') validateFaithfulPdf(data);
  const sha256 = await admissionHash(data); check(signal);
  await fence(); check(signal);
  if (knownHash && sha256 !== knownHash) fail();
  const after = await info(storage, bucket, path, signal, fence, false, observe); same(identity(expected), after && identity(after));
  return {bytes: data, sha256};
}
const provenanceKeys = ['preparation_id', 'item_id', 'render_input_hash', 'template_byte_sha256', 'html_sha256', 'byte_sha256', 'renderer', 'renderer_revision'] as const;
const camel = (value: string) => value.replace(/_([a-z])/g, (_all, letter: string) => letter.toUpperCase());
function provenance(value: ObjectInfo, expected: Record<string, string>): Record<string, string> {
  if (value.mime !== 'application/pdf' || !value.metadata) fail();
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(value.metadata)) {
    const canonical = provenanceKeys.find(candidate => candidate === key || camel(candidate) === key);
    const item = value.metadata[key];
    if (!canonical || typeof item !== 'string' || normalized[canonical] !== undefined && normalized[canonical] !== item) fail();
    normalized[canonical] = item;
  }
  if (Object.keys(normalized).length !== provenanceKeys.length || !hash(normalized.byte_sha256)) fail();
  for (const key of Object.keys(expected)) same(normalized[key], expected[key]);
  return normalized;
}
function proofEqual(expected: EducationStagingProof, actual: EducationStagingProof): void {
  same({...expected, updated_at: admissionTime(expected.updated_at)}, {...actual, updated_at: admissionTime(actual.updated_at)});
}
function attestation(raw: unknown, kind: 'staging_attested' | 'artifact_attested', context: EducationArtifactContext,
  object: ObjectInfo, sha256: string): void {
  const parsed = educationArtifactAttestationSchema.safeParse(raw);
  if (!parsed.success) fail('SOURCE_UNAVAILABLE');
  same({...parsed.data, updated_at: admissionTime(parsed.data.updated_at)}, {schema_version: 1, kind,
    organization_id: context.organization_id, preparation_id: context.preparation_id, item_id: context.item_id,
    input_revision: context.input_revision, render_input_hash: context.render_input_hash, byte_sha256: sha256,
    byte_size: object.size, object_id: object.object_id, updated_at: object.updated_at});
}

async function execute(request: Request, authorization: string, deps: EducationArtifactDependencies, signal: AbortSignal): Promise<Response> {
  const parsed = educationArtifactRequestSchema.safeParse(await readAdmissionBody(request, signal));
  if (!parsed.success) fail('INVALID_INPUT');
  check(signal);
  if (!deps.configured) fail('DEPENDENCY_UNAVAILABLE');
  const input = parsed.data, caller = deps.createCaller(authorization, signal);
  const actor = await requireAdmissionActor(caller, authorization); check(signal);
  const args = {p_organization_id: input.organization_id, p_preparation_id: input.preparation_id,
    p_item_id: input.item_id, p_input_revision: input.input_revision, p_request_id: input.request_id};
  let previous: EducationArtifactContext | undefined;
  const current = async (): Promise<EducationArtifactContext> => {
    check(signal); await requireAdmissionActor(caller, authorization, actor); check(signal);
    const raw = db(await caller.rpc('uc_education_artifact_context', args)); check(signal);
    await requireAdmissionActor(caller, authorization, actor); check(signal);
    const value = parseContext(raw, input, actor);
    if (previous) progression(previous, value);
    previous = value; return value;
  };
  let context = await current();
  const service = deps.createService(signal);
  const serviceArgs = {p_actor_id: actor, ...args};

  const observeTemplate: RawObserver = async () => {
    check(signal);
    if (!previous) fail('DEPENDENCY_UNAVAILABLE');
    const value = previous.template.storage;
    return {object_id: value.object_id, updated_at: admissionTime(value.updated_at), size: value.byte_size, mime: value.mime_type};
  };
  const observeSlot = (kind: 'staging' | 'output'): RawObserver => async () => {
    check(signal);
    if (!previous) fail('DEPENDENCY_UNAVAILABLE');
    const live = previous; // info() has just refreshed the original-caller fence.
    const raw = db(await service.rpc('uc_observe_education_artifact_object', {...serviceArgs, p_kind: kind})); check(signal);
    const parsed = educationArtifactObjectObservationSchema.safeParse(raw);
    if (!parsed.success) fail('SOURCE_UNAVAILABLE');
    const value = parsed.data;
    for (const key of Object.keys(input) as (keyof EducationArtifactRequest)[]) same(value[key], input[key]);
    same(value.actor_id, actor); same(value.render_input_hash, live.render_input_hash); same(value.kind, kind);
    if (!value.object) return null;
    const bucket = kind === 'staging' ? live.staging.bucket : 'org-documents';
    const path = kind === 'staging' ? live.staging.path : live.output.file_path;
    same(value.object.bucket, bucket); same(value.object.path, path);
    return {object_id: value.object.object_id, updated_at: value.object.updated_at, size: value.object.byte_size,
      mime: value.object.mime_type, storage_metadata: value.object.storage_metadata, user_metadata: value.object.user_metadata};
  };
  const observeStage = observeSlot('staging'), observeOutput = observeSlot('output');

  // Template bytes are distinct from the UC006 metadata content_hash.
  const template = context.template.storage;
  await current();
  const templateInfo = await info(caller.storage, template.bucket, template.path, signal, current, false, observeTemplate); context = await current();
  if (!templateInfo || templateInfo.size !== template.byte_size || templateInfo.mime !== 'text/html' || templateInfo.size > 1_048_576) fail();
  objectIdentity(templateInfo, template);
  const templateProof = await bytes(caller.storage, template.bucket, template.path, templateInfo, signal, template.known_sha256, current, observeTemplate, true); context = await current();
  const html = prepareEducationHtml(templateProof.bytes, context.variables);
  const htmlHash = await admissionHash(new TextEncoder().encode(html)); check(signal); context = await current();
  const expectedProvenance = {preparation_id: context.preparation_id, item_id: context.item_id, render_input_hash: context.render_input_hash,
    template_byte_sha256: templateProof.sha256, html_sha256: htmlHash, renderer: 'browserless', renderer_revision: EDUCATION_RENDERER_REVISION};

  let stagedInfo = await info(service.storage, context.staging.bucket, context.staging.path, signal, current, true, observeStage); context = await current();
  if (!stagedInfo) {
    if (context.staging.proof) fail();
    // Render only in the absence of an immutable service-owned winner. PDF bytes
    // are nondeterministic, so a retry must never render again to compare them.
    const rendered = await deps.render(html, signal); check(signal); context = await current();
    validateFaithfulPdf(rendered);
    const renderedHash = await admissionHash(rendered); check(signal); context = await current();
    let uploadedId: string | undefined;
    try {
      const upload = await service.storage.from(context.staging.bucket).upload(context.staging.path, Uint8Array.from(rendered).buffer,
        {contentType: 'application/pdf', upsert: false, cacheControl: '0', metadata: {...expectedProvenance, byte_sha256: renderedHash}});
      check(signal); if (!upload.error) uploadedId = upload.data?.id;
      // A failed/uncertain upload can still have committed. Only the trusted
      // exact immutable winner below may recover it; no overwrite or deletion.
    } catch {check(signal);}
    context = await current();
    stagedInfo = await info(service.storage, context.staging.bucket, context.staging.path, signal, current, false, observeStage); context = await current();
    if (!stagedInfo || uploadedId !== undefined && uploadedId !== stagedInfo.object_id) fail();
  }
  const stageMetadata = provenance(stagedInfo, expectedProvenance);
  const staged = await bytes(service.storage, context.staging.bucket, context.staging.path, stagedInfo, signal, stageMetadata.byte_sha256, current, observeStage); context = await current();
  const stageProof: EducationStagingProof = {object_id: stagedInfo.object_id, updated_at: stagedInfo.updated_at,
    byte_sha256: staged.sha256, byte_size: staged.bytes.length, template_byte_sha256: templateProof.sha256,
    html_sha256: htmlHash, renderer: 'browserless', renderer_revision: EDUCATION_RENDERER_REVISION};
  if (context.staging.proof) proofEqual(context.staging.proof, stageProof);
  else {
    const proof = educationStagingAttestProofSchema.parse({render_input_hash: context.render_input_hash,
      template_source_hash: context.template.ref.source.content_hash, template_object_id: template.object_id,
      template_updated_at: template.updated_at, template_byte_sha256: templateProof.sha256, html_sha256: htmlHash,
      staged_object_id: stagedInfo.object_id, staged_updated_at: stagedInfo.updated_at, byte_sha256: staged.sha256,
      byte_size: staged.bytes.length, mime_type: 'application/pdf', renderer: 'browserless', renderer_revision: EDUCATION_RENDERER_REVISION});
    await current(); check(signal);
    attestation(db(await service.rpc('uc_attest_education_issuance_staging', {...serviceArgs, p_proof: proof})), 'staging_attested', context, stagedInfo, staged.sha256);
    check(signal); context = await current();
    if (!context.staging.proof) fail(); proofEqual(context.staging.proof, stageProof);
  }

  // Stage CAS is confirmed before any original-caller UC006 upload or commit.
  if (!context.output.source) {
    await current(); check(signal);
    try {
      await caller.storage.from('org-documents').upload(context.output.file_path, Uint8Array.from(staged.bytes).buffer,
        {contentType: 'application/pdf', upsert: false, cacheControl: '0'});
      check(signal);
    } catch {check(signal);}
    context = await current();
    const uploadedInfo = await info(caller.storage, 'org-documents', context.output.file_path, signal, current, false, observeOutput); context = await current();
    if (!uploadedInfo || uploadedInfo.size !== staged.bytes.length || uploadedInfo.mime !== 'application/pdf') fail();
    await bytes(caller.storage, 'org-documents', context.output.file_path, uploadedInfo, signal, staged.sha256, current, observeOutput); context = await current();
    check(signal);
    db(await caller.rpc('commit_org_document_version', {p_document_id: context.output.document_id,
      p_organization_id: context.organization_id, p_request_id: context.output.upload_request_id, p_expected_revision: 0,
      p_upload: {file_path: context.output.file_path, file_name: context.output.file_name, file_size: staged.bytes.length,
        change_summary: 'Сформирован проверенный PDF; выдача ещё не зарегистрирована.'},
      p_restore_version_id: null, p_document: context.output.document}));
    check(signal); context = await current();
  }
  if (!context.output.source || !context.output.object) fail();
  const outputInfo = await info(caller.storage, 'org-documents', context.output.file_path, signal, current, false, observeOutput); context = await current();
  if (!outputInfo || outputInfo.size !== staged.bytes.length || outputInfo.mime !== 'application/pdf') fail();
  objectIdentity(outputInfo, context.output.object!);
  await bytes(caller.storage, 'org-documents', context.output.file_path, outputInfo, signal, staged.sha256, current, observeOutput); context = await current();
  if (!context.output.artifact) {
    const proof = educationOutputAttestProofSchema.parse({render_input_hash: context.render_input_hash,
      staged_object_id: stagedInfo.object_id, staged_updated_at: stagedInfo.updated_at, source: context.output.source,
      output_object_id: outputInfo.object_id, output_updated_at: outputInfo.updated_at, byte_sha256: staged.sha256,
      byte_size: staged.bytes.length, mime_type: 'application/pdf', renderer: 'browserless', renderer_revision: EDUCATION_RENDERER_REVISION});
    await current(); check(signal);
    attestation(db(await service.rpc('uc_attest_education_issuance_artifact', {...serviceArgs, p_proof: proof})), 'artifact_attested', context, outputInfo, staged.sha256);
    check(signal); context = await current();
  }
  if (!['rendered', 'consumed'].includes(context.mode) || !context.output.artifact) fail();
  proofEqual(context.staging.proof!, stageProof);
  const result = educationArtifactWorkerResultSchema.parse({schema_version: 1, ...input,
    status: context.mode === 'consumed' ? 'consumed' : 'rendered_unissued', final_record_id: context.final_record_id,
    artifact: context.output.artifact});
  check(signal);
  // No allocator, official issue, UC018 registration, approval or business-finalize RPC.
  return json(result);
}

export async function educationArtifactRequest(request: Request, deps: EducationArtifactDependencies): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  try {
    if (request.method !== 'POST') throw new EducationArtifactError('INVALID_INPUT', 405);
    const authorization = request.headers.get('Authorization') || '';
    if (authorization.length > 8192 || !/^Bearer [^\s]+$/i.test(authorization)) throw new EducationArtifactError('ACCESS_DENIED', 401);
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, {once: true});
    if (request.signal.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const expired = new Promise<never>((_resolve, reject) => {timer = setTimeout(() => {controller.abort(); reject(new EducationArtifactError('DEPENDENCY_UNAVAILABLE'));}, EDUCATION_ARTIFACT_MS);});
      return await Promise.race([execute(request, authorization, deps, controller.signal), expired]);
    } finally {if (timer) clearTimeout(timer); request.signal.removeEventListener('abort', abort); controller.abort();}
  } catch (error) {return educationArtifactError(error);}
}
