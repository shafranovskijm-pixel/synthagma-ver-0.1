import { File as NodeFile } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ current: true, session: vi.fn(), identity: vi.fn(), upload: vi.fn(), rpc: vi.fn(), read: vi.fn(), fetch: vi.fn(), headers: vi.fn(), docs: [] as any[], versions: [] as any[] }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: '00000000-0000-4000-8000-000000000001', revision: 1 }), isOfflineActorCurrent: () => m.current }));
vi.mock('@/utils/proxyFetch',()=>({proxiedAssetUrl:(url:string)=>url}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: m.session, getUser: m.identity },
  storage: { from: () => ({ upload: m.upload, getPublicUrl: (path: string) => ({ data: { publicUrl: 'https://safe.invalid/storage/v1/object/public/org-documents/' + path } }) }) },
  rpc: m.rpc,
  from: (table: string) => {
    const state: any = { table, filters: {}, ids: null, single: false, columns: '' };
    const q: any = { select: (columns: string) => { state.columns = columns; return q; }, eq: (key: string, value: unknown) => { state.filters[key] = value; return q; },
      is: () => q, order: () => q, limit: () => q, gt: (key: string, value: string) => { state.after = value; return q; },
      in: (_key: string, ids: string[]) => { state.ids = ids; return q; }, single: () => { state.single = true; return q; }, maybeSingle: () => { state.single = true; return q; },
      setHeader: (...args: unknown[]) => { m.headers(...args); return m.read(state); } }; return q;
  },
} }));
import { createScopedOrgDocumentTransport, listProgramFiles, prepareProgramFile, PROGRAM_FILE_MAX_BYTES, readProgramFile, validateProgramPdf } from '../programFiles';
import { downloadPrivateFile } from '@/utils/storageHelpers';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), org = id(2), version = id(3);
const scope = { actorId: actor, organizationId: org, accessRevision: 1, key: 'actor-org-epoch1', current: () => true };
const pdf = (text = '%PDF-1.7\nОбразец программы\n%%EOF', name = 'программа.pdf', mime = 'application/pdf') => new File([text], name, { type: mime });
const doc = (documentId: string, currentVersion: string | null = version) => ({ id: documentId, organization_id: org, type: 'education_program', name: 'Программа', document_revision: 1, current_version_id: currentVersion, status: 'active', deleted_at: null, created_at: '2026-10-23T01:00:00Z' });
const ver = (documentId: string, versionId = version) => ({ id: versionId, document_id: documentId, organization_id: org, version_number: 1, file_url: null, file_path: null, file_size: null, file_name: null, change_summary: null, uploaded_by: actor, uploaded_by_name: 'QA', created_at: '2026-10-23T01:00:00Z', event_kind: 'upload', restored_from_version_id: null, request_id: null, result_revision: 1 });
beforeEach(() => {
  vi.clearAllMocks(); m.current = true; m.docs = []; m.versions = [];
  vi.stubGlobal('File', NodeFile); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', m.fetch);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://safe.invalid'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  m.session.mockResolvedValue({ data: { session: { user: { id: actor }, access_token: 'synthetic-token' } }, error: null });
  m.identity.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  m.upload.mockResolvedValue({ error: null });
  m.rpc.mockImplementation((_name, args) => ({ setHeader: async (...headers: unknown[]) => {
    m.headers(...headers); const d = doc(args.p_document_id);
    m.docs = [d]; m.versions = [{ ...ver(d.id), request_id: args.p_request_id, file_path: args.p_upload.file_path, file_name: args.p_upload.file_name, file_size: args.p_upload.file_size }];
    return { data: { document_id: d.id, revision: 1, version_id: version, version_number: 1, replayed: false }, error: null };
  } }));
  m.read.mockImplementation(async (q: any) => ({ error: null, data: q.table === 'org_documents'
    ? q.single ? m.docs.find(d => d.id === q.filters.id) ?? null : m.docs.filter(d => !q.after || d.id > q.after).slice(0, 51)
    : m.versions.filter(v => q.ids ? q.ids.includes(v.id) : v.document_id === q.filters.document_id) }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('independent programme PDF custody', () => {
  it('creates a NEW type/id/revision0 and keeps exact Cyrillic PDF bytes; file columns come only from exact version rows', async () => {
    const source = pdf(), prepared = await prepareProgramFile(scope, ' Программа ', source), result = await prepared.run(scope);
    const [path, body, options] = m.upload.mock.calls[0];
    expect(new Uint8Array(await body.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()));
    expect(path).toBe(`${org}/versions/${prepared.documentId}/${prepared.requestId}.pdf`);
    expect(options).toMatchObject({ upsert: false, contentType: 'application/pdf', headers: { Authorization: 'Bearer synthetic-token' } });
    expect(m.rpc).toHaveBeenCalledWith('commit_org_document_version', expect.objectContaining({ p_document_id: prepared.documentId, p_expected_revision: 0, p_restore_version_id: null, p_document: { name: 'Программа', type: 'education_program', status: 'active' } }));
    expect(result.currentVersion?.file_name).toBe('программа.pdf');
    for (const [q] of m.read.mock.calls) if (q.table === 'org_documents') expect(q.columns).not.toMatch(/file_name|file_size/);
    expect(m.identity).toHaveBeenCalledWith('synthetic-token');
  });
  it.each([['<html>not PDF</html>', 'renamed.pdf', 'application/pdf'], ['%PDF-x', 'wrong.html', 'application/pdf'], ['%PDF-x', 'wrong.pdf', 'text/html'], ['', 'empty.pdf', 'application/pdf']])('rejects format/MIME/empty input before storage (%s; row %#)', async (body, name, mime) => {
    await expect(prepareProgramFile(scope, 'Программа', pdf(body, name, mime))).rejects.toThrow(); expect(m.upload).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
  });
  it('normalizes empty browser MIME without altering bytes and enforces the explicit technical cap', async () => {
    const source = pdf('%PDF-1.7', 'файл.PDF', ''), canonical = await validateProgramPdf(source);
    expect(canonical.type).toBe('application/pdf'); expect(await canonical.arrayBuffer()).toEqual(await source.arrayBuffer());
    const bytes = new Uint8Array(PROGRAM_FILE_MAX_BYTES); bytes.set([37,80,68,70,45]);
    await expect(validateProgramPdf(new File([bytes], 'max.pdf', { type: 'application/pdf' }))).resolves.toHaveProperty('size', PROGRAM_FILE_MAX_BYTES);
    await expect(validateProgramPdf(new File([bytes, new Uint8Array([1])], 'large.pdf', { type: 'application/pdf' }))).rejects.toThrow(/20 МБ/);
  });
  it('does not allocate a second request or upload twice after an unknown commit', async () => {
    const prepared = await prepareProgramFile(scope, 'Программа', pdf()), normal = m.rpc.getMockImplementation()!; let attempts = 0;
    m.rpc.mockImplementation((...args) => ++attempts === 1 ? { setHeader: async () => { throw new Error('unknown'); } } : normal(...args));
    await expect(prepared.run(scope)).rejects.toThrow('unknown'); await expect(prepared.run(scope)).resolves.toHaveProperty('document.id', prepared.documentId);
    expect(m.upload).toHaveBeenCalledTimes(1); expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);
  });
  it.each([{ statusCode: 409 }, { name: 'StorageApiError', status: 400, statusCode: 'Duplicate', message: 'The resource already exists' }])('recovers only exact authenticated original bytes after known duplicate %j', async error => {
    const source = pdf(), prepared = await prepareProgramFile(scope, 'Программа', source);
    m.upload.mockResolvedValue({ error }); m.fetch.mockResolvedValue(new Response(await source.arrayBuffer(), { headers: { 'content-type': 'application/pdf' } }));
    await expect(prepared.run(scope)).resolves.toHaveProperty('document.id', prepared.documentId);
    expect(m.fetch).toHaveBeenCalledWith(`https://safe.invalid/storage/v1/object/authenticated/org-documents/${m.upload.mock.calls[0][0]}`, expect.objectContaining({ headers: { Authorization: 'Bearer synthetic-token', apikey: 'public-test-key' }, credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal) }));
  });
  it('refuses another object body or arbitrary400 without commit/upsert/delete', async () => {
    const prepared = await prepareProgramFile(scope, 'Программа', pdf()); m.upload.mockResolvedValue({ error: { statusCode: 409 } });
    m.fetch.mockResolvedValue(new Response('%PDF-other', { headers: { 'content-type': 'application/pdf' } }));
    await expect(prepared.run(scope)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' }); expect(m.rpc).not.toHaveBeenCalled();
    m.upload.mockResolvedValue({ error: { name: 'StorageApiError', status: 400, message: 'Invalid input' } });
    await expect(prepared.run(scope)).rejects.toMatchObject({ message: 'Invalid input' }); expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(m.upload.mock.calls.every(call => call[2].upsert === false)).toBe(true);
  });
  it('keeps original v1 confirmation valid when current version has legitimately advanced to v2', async () => {
    const prepared = await prepareProgramFile(scope, 'Программа', pdf()), normal = m.rpc.getMockImplementation()!;
    m.rpc.mockImplementation((...args) => ({ setHeader: async (...headers: unknown[]) => {
      const receipt = await normal(...args).setHeader(...headers); m.docs[0] = { ...m.docs[0], document_revision: 2, current_version_id: id(4) }; m.versions.push({ ...ver(prepared.documentId, id(4)), version_number: 2, result_revision: 2 }); return receipt;
    } }));
    await expect(prepared.run(scope)).resolves.toMatchObject({ document: { document_revision: 2 }, currentVersion: { id: id(4), version_number: 2 } });
  });
  it('rejects a mismatched immutable receipt version/request/path tuple', async () => {
    const prepared = await prepareProgramFile(scope, 'Программа', pdf()), normal = m.rpc.getMockImplementation()!;
    m.rpc.mockImplementation((...args) => ({ setHeader: async (...headers: unknown[]) => { const receipt = await normal(...args).setHeader(...headers); m.versions[0].request_id = id(99); return receipt; } }));
    await expect(prepared.run(scope)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('stops after a deferred upload when the captured scope closes, even if a later caller returns to A', async () => {
    let live = true, resolve!: (v: any) => void; const old = { ...scope, current: () => live };
    const prepared = await prepareProgramFile(old, 'Программа', pdf()); m.upload.mockReturnValue(new Promise(done => { resolve = done; }));
    const running = prepared.run(old); await vi.waitFor(() => expect(m.upload).toHaveBeenCalledOnce()); live = false; resolve({ error: null });
    await expect(running).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(m.rpc).not.toHaveBeenCalled();
    m.current = false; await expect(prepared.run(scope)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('checks actual getUser identity, not only a stale local session id', async () => {
    const prepared = await prepareProgramFile(scope, 'Программа', pdf()); m.identity.mockResolvedValue({ data: { user: { id: id(999) } }, error: null });
    await expect(prepared.run(scope)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(m.upload).not.toHaveBeenCalled();
  });
  it('applies one45second deadline to a trickled duplicate body and never commits it', async () => {
    vi.useFakeTimers(); const prepared = await prepareProgramFile(scope, 'Программа', pdf()); m.upload.mockResolvedValue({ error: { statusCode: 409 } }); const cancel = vi.fn();
    m.fetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(controller) { setTimeout(() => controller.enqueue(new TextEncoder().encode('%PDF-')), 30000); }, cancel }), { headers: { 'content-type': 'application/pdf' } }));
    const running = prepared.run(scope), rejection = expect(running).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' }); await vi.advanceTimersByTimeAsync(45000); await rejection;
    expect(cancel).toHaveBeenCalledOnce(); expect(m.rpc).not.toHaveBeenCalled();
  });
  it('pages51 rows without truncating or pretending file metadata belongs to org_documents', async () => {
    m.docs = Array.from({ length: 51 }, (_, i) => doc(id(100 + i), id(200 + i))); m.versions = m.docs.map((d,i) => ({ ...ver(d.id, id(200+i)), file_name: `Программа${i}.pdf` }));
    const first = await listProgramFiles(scope); expect(first.items).toHaveLength(50); expect(first.next).toBe(id(149));
    const second = await listProgramFiles(scope, first.next); expect(second.items.map(i => i.document.id)).toEqual([id(150)]); expect(second.next).toBeNull();
    expect(first.items[0].currentVersion?.document_id).toBe(first.items[0].document.id);
  });
  it('rejects cross-document current-version joins and wrong organization/type rows', async () => {
    m.docs = [doc(id(100))]; m.versions = [ver(id(999))]; await expect(listProgramFiles(scope)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    m.docs[0] = { ...doc(id(100)), type: 'charter' }; await expect(listProgramFiles(scope)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    m.docs[0] = { ...doc(id(100)), organization_id: id(999) }; await expect(listProgramFiles(scope)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('rereads an exact selected later-page document and never treats a missing file as ready', async () => {
    m.docs = [doc(id(999))]; m.versions = [ver(id(999))]; await expect(readProgramFile(scope,id(999))).resolves.toHaveProperty('document.id',id(999));
    m.docs = []; await expect(readProgramFile(scope,id(999))).resolves.toBeNull();
  });
  it('pins opt-in standard workflow RPCs and refuses a late result after actor/access change', async () => {
    let live = true; const transport = createScopedOrgDocumentTransport({ ...scope, current: () => live });
    m.rpc.mockReturnValue({ setHeader: async (key: string, value: string) => { m.headers(key,value); live = false; return { data: {}, error: null }; } });
    await expect(transport.rpc('get_org_document_workflow', { p_document_id: id(90) })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(m.headers).toHaveBeenCalledWith('Authorization','Bearer synthetic-token');
  });
  it('shares one45second budget across session verification and RPC rather than resetting it at every phase', async () => {
    vi.useFakeTimers();
    m.session.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({data:{session:{user:{id:actor},access_token:'synthetic-token'}},error:null}),30000)));
    m.identity.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({data:{user:{id:actor}},error:null}),20000)));
    const transport=createScopedOrgDocumentTransport(scope),running=transport.rpc('get_org_document_workflow',{p_document_id:id(90)});
    const rejection=expect(running).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
    await vi.advanceTimersByTimeAsync(45000);await rejection;expect(m.rpc).not.toHaveBeenCalled();
  });
  it('pins signing to the verified original bearer after a local session swap, then denies its late URL and browser handoff',async()=>{
    const path=`${org}/versions/${id(60)}/${id(61)}.pdf`;let finish!:(r:Response)=>void;
    m.identity.mockImplementation(async()=>{m.session.mockResolvedValue({data:{session:{user:{id:id(99)},access_token:'new-actor-token'}},error:null});return {data:{user:{id:actor}},error:null};});
    m.fetch.mockReturnValue(new Promise<Response>(resolve=>{finish=resolve;}));
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined);
    const transport=createScopedOrgDocumentTransport(scope),running=downloadPrivateFile('org-documents',path,'Программа.pdf',{assertCurrent:transport.assertCurrent,signUrl:transport.signUrl});
    await vi.waitFor(()=>expect(m.fetch).toHaveBeenCalledOnce());
    expect(m.fetch.mock.calls[0]).toEqual([`https://safe.invalid/storage/v1/object/sign/org-documents/${path}`,expect.objectContaining({method:'POST',headers:{Authorization:'Bearer synthetic-token',apikey:'public-test-key','Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600}),credentials:'omit',redirect:'error'})]);
    m.current=false;finish(new Response(JSON.stringify({signedURL:`/object/sign/org-documents/${path}?token=synthetic-signed-token`}),{headers:{'content-type':'application/json'}}));
    await expect(running).resolves.toBe(false);expect(m.fetch).toHaveBeenCalledOnce();expect(click).not.toHaveBeenCalled();
  });
  it('signs an exact encoded own path and preserves a space/Cyrillic download name without a public or foreign URL fallback',async()=>{
    const path=org+'/Архив/Программа 1.pdf',encoded=path.split('/').map(encodeURIComponent).join('/');
    m.fetch.mockResolvedValue(new Response(JSON.stringify({signedURL:'/object/sign/org-documents/'+encoded+'?token=synthetic'}),{headers:{'content-type':'application/json'}}));
    const result=await createScopedOrgDocumentTransport(scope).signUrl({bucket:'org-documents',path,expiresIn:60,downloadName:'Учебная программа № 1.pdf',signal:new AbortController().signal,deadline:Date.now()+45000});
    const url=new URL(result!);expect(decodeURIComponent(url.pathname)).toBe('/storage/v1/object/sign/org-documents/'+path);expect(url.searchParams.get('download')).toBe('Учебная программа № 1.pdf');
    expect(m.fetch.mock.calls[0][0]).toBe('https://safe.invalid/storage/v1/object/sign/org-documents/'+encoded);
  });
  it.each(['https://foreign.invalid/object/sign/org-documents/other?token=x','/object/sign/org-documents/foreign/file.pdf?token=x'])('refuses a signing response for another origin/path (%s)',async signedURL=>{
    m.fetch.mockResolvedValue(new Response(JSON.stringify({signedURL}),{headers:{'content-type':'application/json'}}));
    await expect(createScopedOrgDocumentTransport(scope).signUrl({bucket:'org-documents',path:org+'/versions/'+id(60)+'/'+id(61)+'.pdf',expiresIn:60,downloadName:'Программа.pdf',signal:new AbortController().signal,deadline:Date.now()+45000})).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  });
});
