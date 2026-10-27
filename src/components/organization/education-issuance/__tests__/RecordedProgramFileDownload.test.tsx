import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecordedProgramFileDownload } from '../RecordedProgramFileDownload';
import { captureIssuanceScope } from '@/lib/educationIssuance/client';
import { actor, org, group, issuedRecord, uid, source, stamp } from '@/lib/educationIssuance/__tests__/fixtures';
import type { IssuanceRecord } from '@/lib/educationIssuance/types';

type Request = { table: string; columns: string; filters: Array<[string, unknown]>; headers: Record<string, string>; signal?: AbortSignal };
const ports = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000001', revision: 1, actorCurrent: true, scopeOpen: true, canRead: true,
  sessionActor: '00000000-0000-4000-8000-000000000001',
  organization: '00000000-0000-4000-8000-000000000002',
  document: null as Record<string, unknown> | null, version: null as Record<string, unknown> | null,
  requests: [] as Request[], handoffs: [] as Array<{ href: string; name: string }>,
  versionWait: null as Promise<{ data: unknown; error: unknown }> | null,
  signingWait: null as Promise<Response> | null, bytesWait: null as Promise<Blob> | null,
  failure: null as null | { code: string; message: string },
  rpc: vi.fn(), storage: vi.fn(), fetch: vi.fn(), bodyReadStarted: vi.fn(), createObjectURL: vi.fn(), revokeObjectURL: vi.fn(),
}));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({
  organizationId: ports.organization, loading: false, error: null, isOrgOwner: false, orgPermissions: new Set(['documents.read']),
  can: (permission: string) => permission === 'documents.read' && ports.canRead,
}) }));
vi.mock('@/utils/courseCache', () => ({
  captureOfflineContext: () => ports.actorCurrent ? { actorId: ports.actor, revision: ports.revision } : null,
  isOfflineActorCurrent: (id: string, revision: number) => ports.actorCurrent && id === ports.actor && revision === ports.revision,
}));
vi.mock('@/utils/proxyFetch', () => ({ proxiedAssetUrl: (url: string) => url }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: ports.sessionActor }, access_token: 'synthetic-test-token' } }, error: null }),
    getUser: async () => ({ data: { user: { id: ports.sessionActor } }, error: null }),
  },
  rpc: ports.rpc, storage: { from: ports.storage },
  from: (table: string) => {
    const request: Request = { table, columns: '', filters: [], headers: {} }; ports.requests.push(request);
    const query = {
      select(columns: string) { request.columns = columns; return query; },
      eq(key: string, value: unknown) { request.filters.push([key, value]); return query; },
      maybeSingle() { return query; },
      setHeader(key: string, value: string) { request.headers[key] = value; return query; },
      abortSignal(signal: AbortSignal) { request.signal = signal; return query; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const result = ports.failure ? { data: null, error: ports.failure }
          : table === 'org_documents' ? { data: ports.document, error: null }
            : ports.versionWait ?? { data: ports.version, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    }; return query;
  },
} }));
const OriginalURL = URL;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function scope() { return captureIssuanceScope(org, { kind: 'organization' }, () => ports.scopeOpen); }
function button() { return screen.getByRole('button', { name: 'Скачать программу этой выдачи' }); }
function resetMetadata() {
  ports.document = { id: uid(23), organization_id: org, type: 'education_program' };
  ports.version = { id: uid(24), document_id: uid(23), organization_id: org, file_path: org + '/versions/' + uid(23) + '/recorded-v1.pdf', file_name: 'Программа V1.pdf', file_size: 6 };
}
function signedResponse() { return new Response(JSON.stringify({ signedURL: '/object/sign/org-documents/' + ports.version!.file_path + '?token=synthetic' }), { headers: { 'content-type': 'application/json' } }); }
function noFile() { expect(ports.handoffs).toHaveLength(0); expect(ports.createObjectURL).not.toHaveBeenCalled(); }
async function clickAndWait() { fireEvent.click(button()); await waitFor(() => expect(ports.handoffs).toHaveLength(1)); }

beforeEach(() => {
  ports.actor = actor; ports.sessionActor = actor; ports.revision = 1; ports.actorCurrent = true; ports.scopeOpen = true; ports.canRead = true; ports.organization = org;
  ports.requests.length = 0; ports.handoffs.length = 0; ports.versionWait = null; ports.signingWait = null; ports.bytesWait = null; ports.failure = null;
  ports.rpc.mockReset(); ports.storage.mockReset(); ports.fetch.mockReset(); ports.bodyReadStarted.mockReset(); ports.createObjectURL.mockReset(); ports.revokeObjectURL.mockReset();
  ports.rpc.mockImplementation(() => { throw new Error('Unexpected mutation RPC'); });
  ports.storage.mockImplementation(() => { throw new Error('Unexpected legacy signing or upload'); });
  resetMetadata();
  ports.createObjectURL.mockReturnValue('blob:recorded-program-test');
  vi.stubGlobal('URL', class extends OriginalURL { static createObjectURL = ports.createObjectURL; static revokeObjectURL = ports.revokeObjectURL; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { ports.handoffs.push({ href: this.href, name: this.download }); });
  ports.fetch.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = new OriginalURL(String(input));
    if (init?.method === 'POST' && url.pathname.startsWith('/storage/v1/object/sign/')) return ports.signingWait ?? signedResponse();
    const response = new Response(new Uint8Array([37, 80, 68, 70, 45, 49]), { headers: { 'content-type': 'application/pdf' } });
    if (ports.bytesWait) response.blob = () => { ports.bodyReadStarted(); return ports.bytesWait!; };
    return response;
  });
  vi.stubGlobal('fetch', ports.fetch);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://synthetic-project.invalid');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'synthetic-nonsecret-publishable-key');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const badMetadata: Array<[string, () => void]> = [
  ['missing programme document', () => { ports.document = null; }],
  ['missing exact version', () => { ports.version = null; }],
  ['different returned version', () => { ports.version!.id = uid(924); }],
  ['different document association', () => { ports.version!.document_id = uid(923); }],
  ['foreign organization association', () => { ports.version!.organization_id = uid(902); }],
  ['URL-only legacy locator', () => { ports.version!.file_path = null; ports.version!.file_url = 'https://foreign.invalid/never.pdf'; }],
  ['foreign organization storage path', () => { ports.version!.file_path = uid(902) + '/versions/other.pdf'; }],
  ['dot traversal storage path', () => { ports.version!.file_path = org + '/../other.pdf'; }],
  ['encoded traversal storage path', () => { ports.version!.file_path = org + '/%2e%2e/other.pdf'; }],
];
const unavailableProof: Array<[string, (record: IssuanceRecord) => void]> = [
  ['masked proof', record => { record.proof_availability = 'currently_unavailable'; record.proof = null; }],
  ['legacy unverified record', record => { record.provenance = 'legacy_unverified'; record.proof_availability = 'legacy_unverified'; record.proof = null; }],
  ['malformed version reference', record => { record.proof!.program_ref.file_version_id = 'not-a-uuid'; }],
  ['different admission programme', record => { record.proof!.admission_ref.program_ref = { ...record.proof!.program_ref, version_id: uid(922) }; }],
  ['read capability absent', record => { record.capabilities.can_read = false; }],
  ['unconfirmed programme title', record => { record.frdo_facts!.program_title = 'Несогласованный заголовок'; }],
];

describe('Recorded programme file download', () => {
  it('does nothing before a click and downloads recorded V1 without reading or falling back to current V2', async () => {
    render(<RecordedProgramFileDownload record={issuedRecord()} scope={scope()} />);
    expect(ports.requests).toHaveLength(0); expect(ports.fetch).not.toHaveBeenCalled();
    await clickAndWait();
    expect(ports.handoffs[0].name).toBe('Программа V1.pdf');
    expect(ports.requests).toHaveLength(2);
    const version = ports.requests.find(request => request.table === 'org_document_versions')!;
    expect(version.filters).toEqual([['organization_id', org], ['document_id', uid(23)], ['id', uid(24)]]);
    expect(ports.requests.every(request => !/current_version_id|file_url|uploaded_by/.test(request.columns))).toBe(true);
    expect(ports.requests.every(request => request.headers.Authorization === 'Bearer synthetic-test-token' && request.signal instanceof AbortSignal)).toBe(true);
    expect(String(ports.fetch.mock.calls[0][0])).toContain('/object/sign/org-documents/' + ports.version!.file_path);
    expect(ports.fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' });
    expect(ports.rpc).not.toHaveBeenCalled(); expect(ports.storage).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Файл передан браузеру');
  });
  it.each(badMetadata)('rejects %s without signing, fetching bytes or handing a file to the browser', async (_name, damage) => {
    damage(); render(<RecordedProgramFileDownload record={issuedRecord()} scope={scope()} />); fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    noFile(); expect(ports.fetch).not.toHaveBeenCalled(); expect(ports.rpc).not.toHaveBeenCalled();
  });
  it.each(unavailableProof)('does not offer a download for %s', (_name, damage) => {
    const record = structuredClone(issuedRecord()); damage(record); render(<RecordedProgramFileDownload record={record} scope={scope()} />);
    expect(screen.queryByRole('button')).toBeNull(); expect(ports.requests).toHaveLength(0); expect(ports.fetch).not.toHaveBeenCalled(); noFile();
  });
  it('does not offer a download outside the current record organization or group', () => {
    const wrongGroup = captureIssuanceScope(org, { kind: 'group', group_id: uid(903) }, () => ports.scopeOpen);
    const view = render(<RecordedProgramFileDownload record={issuedRecord()} scope={wrongGroup} />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<RecordedProgramFileDownload record={issuedRecord()} scope={captureIssuanceScope(uid(902), { kind: 'organization' }, () => true)} />);
    expect(screen.queryByRole('button')).toBeNull(); expect(ports.requests).toHaveLength(0); noFile();
  });
  it('requires current read permission without requiring issue permission', async () => {
    const record = structuredClone(issuedRecord()); record.capabilities.can_issue = false; record.capabilities.can_issue_duplicate = false;
    const view = render(<RecordedProgramFileDownload record={record} scope={scope()} />);
    await clickAndWait();
    ports.canRead = false; view.rerender(<RecordedProgramFileDownload record={record} scope={scope()} />);
    expect(screen.queryByRole('button')).toBeNull(); expect(ports.rpc).not.toHaveBeenCalled();
  });
  it('retains historical file access for an annulled record without rechecking current eligibility', async () => {
    const record = structuredClone(issuedRecord()); record.lifecycle = 'annulled'; record.capabilities.can_issue = false;
    record.annulment = { event_id: uid(930), recorded_at: stamp, actor_id: actor,
      basis: { source, source_availability: 'available', provision: 'Синтетическое решение', reason: 'Сохранить историю' }, reason: 'Синтетическое аннулирование' };
    render(<RecordedProgramFileDownload record={record} scope={scope()} />); await clickAndWait();
    expect(ports.rpc).not.toHaveBeenCalled(); expect(ports.requests.some(request => /status|deleted_at|current_version/.test(request.columns))).toBe(false);
  });
  it('rejects a session for another actor before reading file metadata', async () => {
    render(<RecordedProgramFileDownload record={issuedRecord()} scope={scope()} />); ports.sessionActor = uid(901); fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('текущими правами'));
    expect(ports.requests).toHaveLength(0); expect(ports.fetch).not.toHaveBeenCalled(); noFile();
  });
  it('keeps one request in flight for repeated clicks', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>(); ports.versionWait = pending.promise;
    render(<RecordedProgramFileDownload record={issuedRecord()} scope={scope()} />); fireEvent.click(button()); fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(ports.requests.filter(request => request.table === 'org_document_versions')).toHaveLength(1));
    await act(async () => { pending.resolve({ data: ports.version, error: null }); });
    await waitFor(() => expect(ports.handoffs).toHaveLength(1)); expect(ports.fetch).toHaveBeenCalledTimes(2);
  });
  it('discards a late version response after the selected issued record changes', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>(); ports.versionWait = pending.promise;
    const old = issuedRecord(), captured = scope(); const view = render(<RecordedProgramFileDownload record={old} scope={captured} />); fireEvent.click(button());
    await waitFor(() => expect(ports.requests).toHaveLength(2));
    const next = structuredClone(old); next.official.id = uid(952); view.rerender(<RecordedProgramFileDownload record={next} scope={captured} />);
    await act(async () => { pending.resolve({ data: ports.version, error: null }); });
    noFile(); expect(ports.fetch).not.toHaveBeenCalled(); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('purges download state and discards a late response when read permission is revoked', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>(); ports.versionWait = pending.promise;
    const record = issuedRecord(), captured = scope(); const view = render(<RecordedProgramFileDownload record={record} scope={captured} />); fireEvent.click(button());
    await waitFor(() => expect(ports.requests).toHaveLength(2));
    ports.canRead = false; view.rerender(<RecordedProgramFileDownload record={record} scope={captured} />);
    expect(screen.queryByRole('button')).toBeNull(); expect(screen.queryByRole('status')).toBeNull();
    await act(async () => { pending.resolve({ data: ports.version, error: null }); }); noFile(); expect(ports.fetch).not.toHaveBeenCalled();
  });
  it('discards a late signing response after the issuance scope epoch changes', async () => {
    const pending = deferred<Response>(); ports.signingWait = pending.promise;
    const record = issuedRecord(); const view = render(<RecordedProgramFileDownload record={record} scope={scope()} />); fireEvent.click(button());
    await waitFor(() => expect(ports.fetch).toHaveBeenCalledTimes(1));
    const previousRequest = ports.requests[1]; view.rerender(<RecordedProgramFileDownload record={record} scope={scope()} />);
    expect(previousRequest.signal?.aborted).toBe(true);
    await act(async () => { pending.resolve(signedResponse()); }); noFile(); expect(ports.fetch).toHaveBeenCalledTimes(1);
  });
  it('never creates a browser file when body bytes finish after unmount', async () => {
    const pending = deferred<Blob>(); ports.bytesWait = pending.promise;
    const view = render(<RecordedProgramFileDownload record={issuedRecord()} scope={scope()} />); fireEvent.click(button());
    await waitFor(() => expect(ports.bodyReadStarted).toHaveBeenCalledTimes(1)); view.unmount();
    await act(async () => { pending.resolve(new Blob(['%PDF-1'], { type: 'application/pdf' })); }); noFile();
  });
  it('shows a fixed safe error without exposing raw backend metadata', async () => {
    ports.failure = { code: 'XX000', message: 'RAW_PRIVATE_LOCATOR_DO_NOT_RENDER' };
    render(<RecordedProgramFileDownload record={issuedRecord()} scope={scope()} />); fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).not.toContain(ports.failure.message); expect(ports.fetch).not.toHaveBeenCalled(); noFile();
  });
  it('allows a clean retry after an unavailable exact version without choosing a replacement', async () => {
    ports.version = null; render(<RecordedProgramFileDownload record={issuedRecord()} scope={scope()} />); fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy()); resetMetadata(); await clickAndWait();
    expect(ports.requests.filter(request => request.table === 'org_document_versions').every(request => request.filters.some(([key, value]) => key === 'id' && value === uid(24)))).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
