import {vi} from 'vitest';
import {admissionHash} from '../admission-case-access';
import {educationArtifactRequest, type EducationArtifactDependencies} from '../education-issuance-artifact';
import type {EducationArtifactContext} from '../education-issuance-artifact-contract';

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const actor = id(1), subject = id(2), org = id(3), prep = id(4), item = id(5), requestId = id(6);
export const stamp = '2026-10-23T00:00:00.000000Z';
export const input = {organization_id: org, preparation_id: prep, item_id: item, input_revision: 1, request_id: requestId};
export const vars = {organization_name: 'Учебный центр «Синтетический»', organization_inn: '0000000000', organization_ogrn: '0000000000000',
  organization_director_name: 'Пример Руководителя', organization_director_position: 'Директор', organization_director_authority: 'Тестовый устав',
  full_name: 'Пример Ученика', birth_date: '1990-01-01', document_type_label: 'Удостоверение', document_series: '',
  document_number: 'ПРОЕКТ-0001', reg_number: 'ПРОЕКТ-Р-0001', issue_date: '2026-10-23', program_title: 'Синтетическая программа',
  program_type_label: 'Повышение квалификации', academic_hours: '16', qualification_name: '', profession: '',
  attestation_outcome: 'Зачтено', attestation_recorded_date: '2026-10-22'};
export const templateText = '<!DOCTYPE html><html><head><style>@page{size:A4;margin:12mm}table{border-collapse:collapse}td{border:1px solid #000}</style></head><body><p>{{organization_name}}</p><h1>{{document_type_label}}</h1><p>{{full_name}}</p><p>{{document_number}}</p><p>{{reg_number}} · {{issue_date}}</p><table><tr><td>{{program_title}}</td></tr></table></body></html>';
export const pdf = (marker = 'A') => new TextEncoder().encode(`%PDF-1.7\n% SYNTHETIC UNIT FIXTURE ${marker}\n1 0 obj\n<</Type /Catalog>>\nendobj\ntrailer\n<</Root 1 0 R>>\n%%EOF\n`);
export const post = (body: unknown = input, signal?: AbortSignal) => new Request('https://synthetic.invalid/functions/v1/education-issuance-artifact', {
  method: 'POST', headers: {Authorization: 'Bearer SYNTHETIC_ORIGINAL', 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal,
});
const camel = (value: string) => value.replace(/_([a-z])/g, (_all, letter: string) => letter.toUpperCase());
const camelMetadata = (value: Record<string, string>) => Object.fromEntries(Object.entries(value).map(([key, item]) => [camel(key), item]));
type Stored = {bytes: Uint8Array; id: string; metadata: Record<string, string>};

export async function fixture() {
  const templateBytes = new TextEncoder().encode(templateText), templateHash = await admissionHash(templateBytes);
  const source = {kind: 'org_document_version' as const, document_id: id(10), version_id: id(11), content_hash: 'c'.repeat(64)};
  const state: EducationArtifactContext = {schema_version: 1, ...input, user_id: actor, subject_user_id: subject, scope: {kind: 'group', group_id: id(7)},
    mode: 'prepared', final_record_id: null, render_input_hash: 'a'.repeat(64),
    template: {ref: {source, review_id: id(12), review_revision: 1}, storage: {bucket: 'org-documents',
      path: `${org}/versions/${source.document_id}/${source.version_id}.html`, object_id: id(13), updated_at: stamp,
      byte_size: templateBytes.length, mime_type: 'text/html', metadata_hash: source.content_hash, known_sha256: templateHash}},
    variables: {...vars}, staging: {bucket: 'education-issuance-staging', path: `${subject}/${org}/${prep}/${item}/${'a'.repeat(64)}.pdf`, proof: null},
    output: {document_id: id(20), upload_request_id: id(21), expected_revision: 0,
      file_path: `${org}/versions/${id(20)}/${id(21)}.pdf`, file_name: 'Синтетический проект.pdf',
      document: {name: 'Синтетический проект', type: 'other', issue_date: '2026-10-23', status: 'active'}, source: null, object: null, artifact: null}};
  const events: string[] = [];
  let stage: Stored | null = null, output: Stored | null = null;
  const getUser = vi.fn(async () => ({data: {user: {id: actor}}, error: null}));
  const contextHook = vi.fn((_context: EducationArtifactContext) => {});
  const infoOf = (bucket: string, path: string, stored: Stored, mime = 'application/pdf') => ({
    id: stored.id, bucketId: bucket, name: path, lastModified: stamp, size: stored.bytes.length, contentType: mime,
    metadata: Object.keys(stored.metadata).length ? camelMetadata(stored.metadata) : {},
  });
  const callerInfo = vi.fn(async (path: string) => {
    events.push('caller.info');
    if (path === state.template.storage.path) return {data: infoOf('org-documents', path, {bytes: templateBytes, id: id(13), metadata: {}}, 'text/html'), error: null};
    return output ? {data: infoOf('org-documents', path, output), error: null} : {data: null, error: {statusCode: '404'}};
  });
  const callerDownload = vi.fn(async (path: string) => {
    events.push('caller.download');
    const isTemplate = path === state.template.storage.path, value = isTemplate ? templateBytes : output?.bytes;
    return value ? {data: new Blob([Uint8Array.from(value).buffer], {type: isTemplate ? 'text/html' : 'application/pdf'}), error: null}
      : {data: null, error: {statusCode: '404'}};
  });
  const callerUpload = vi.fn(async (_path: string, bytes: ArrayBuffer, options: {upsert: false}) => {
    events.push('caller.upload');
    if (options.upsert !== false) throw new Error('No overwrite');
    if (output) return {data: null, error: {statusCode: '409'}};
    output = {bytes: new Uint8Array(bytes), id: id(22), metadata: {}};
    return {data: {id: id(22)}, error: null};
  });
  const callerRpc = vi.fn(async (name: string, _args: Record<string, unknown>): Promise<{data: unknown; error: unknown}> => {
    events.push(name);
    if (name === 'uc_education_artifact_context') {const copy = structuredClone(state); contextHook(copy); return {data: copy, error: null};}
    if (name === 'commit_org_document_version') {
      if (!state.staging.proof || !output) throw new Error('Stage must be attested before UC006');
      state.output.source = {kind: 'org_document_version', document_id: state.output.document_id, version_id: id(23), content_hash: 'd'.repeat(64)};
      state.output.object = {object_id: output.id, updated_at: stamp};
      return {data: {fixture: 'UC006 response is deliberately not trusted as the artifact'}, error: null};
    }
    throw new Error(`Unexpected business RPC: ${name}`);
  });
  const serviceInfo = vi.fn(async (path: string) => {
    events.push('service.info');
    return stage ? {data: infoOf(state.staging.bucket, path, stage), error: null} : {data: null, error: {statusCode: '404'}};
  });
  const serviceDownload = vi.fn(async () => {
    events.push('service.download');
    return stage ? {data: new Blob([Uint8Array.from(stage.bytes).buffer], {type: 'application/pdf'}), error: null} : {data: null, error: {statusCode: '404'}};
  });
  const serviceUpload = vi.fn(async (_path: string, bytes: ArrayBuffer, options: {upsert: false; metadata?: Record<string, string>}) => {
    events.push('service.upload');
    if (options.upsert !== false) throw new Error('No overwrite');
    if (stage) return {data: null, error: {statusCode: '409'}};
    stage = {bytes: new Uint8Array(bytes), id: id(30), metadata: {...options.metadata}};
    return {data: {id: id(30)}, error: null};
  });
  const serviceRpc = vi.fn(async (name: string, args: Record<string, unknown>): Promise<{data: unknown; error: unknown}> => {
    events.push(name);
    const p = args.p_proof as Record<string, any>;
    let object: Stored;
    if (name === 'uc_attest_education_issuance_staging') {
      if (!stage) throw new Error('No actual stage'); object = stage;
      state.staging.proof = {object_id: p.staged_object_id, updated_at: p.staged_updated_at, byte_sha256: p.byte_sha256,
        byte_size: p.byte_size, template_byte_sha256: p.template_byte_sha256, html_sha256: p.html_sha256,
        renderer: 'browserless', renderer_revision: 'uc019-v1'};
      state.mode = 'staged';
    } else if (name === 'uc_attest_education_issuance_artifact') {
      if (!output || !state.staging.proof || !state.output.source) throw new Error('No actual saved output'); object = output;
      state.output.artifact = {source: state.output.source, byte_sha256: p.byte_sha256, byte_size: p.byte_size,
        render_input_hash: state.render_input_hash, template_byte_sha256: state.staging.proof.template_byte_sha256,
        html_sha256: state.staging.proof.html_sha256, renderer: 'browserless', renderer_revision: 'uc019-v1', output_review: null};
      state.mode = 'rendered';
    } else throw new Error(`Unexpected service RPC: ${name}`);
    return {data: {schema_version: 1, kind: name.endsWith('_staging') ? 'staging_attested' : 'artifact_attested',
      organization_id: org, preparation_id: prep, item_id: item, input_revision: 1, render_input_hash: state.render_input_hash,
      byte_sha256: p.byte_sha256, byte_size: p.byte_size, object_id: object.id, updated_at: stamp}, error: null};
  });
  const caller = {auth: {getUser}, rpc: callerRpc, storage: {from: vi.fn((_bucket: string) => ({info: callerInfo, download: callerDownload, upload: callerUpload}))}};
  const service = {rpc: serviceRpc, storage: {from: vi.fn((_bucket: string) => ({info: serviceInfo, download: serviceDownload, upload: serviceUpload}))}};
  const render = vi.fn(async () => {events.push('render'); return pdf();});
  const deps: EducationArtifactDependencies = {configured: true, createCaller: vi.fn(() => caller), createService: vi.fn(() => service), render};
  return {state, templateBytes, templateHash, events, caller, service, deps, getUser, contextHook, callerRpc, callerInfo, callerDownload,
    callerUpload, serviceRpc, serviceInfo, serviceDownload, serviceUpload, render,
    getStage: () => stage, setStage: (value: Stored | null) => {stage = value;}, getOutput: () => output,
    run: (body: unknown = input, signal?: AbortSignal) => educationArtifactRequest(post(body, signal), deps)};
}
