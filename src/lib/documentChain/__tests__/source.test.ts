import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, course, enrollment, group, id, org, pupil, source, target } from './fixtures';
const m = vi.hoisted(() => ({ current: true, chain: vi.fn(), registry: vi.fn(), file: vi.fn(), draft: vi.fn(), issuance: vi.fn(), download: vi.fn() }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: '00000000-0000-4000-8000-000000000002', revision: 1 }), isOfflineActorCurrent: () => m.current }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('../client', async original => ({ ...await original<typeof import('../client')>(), readDocumentChain: m.chain }));
vi.mock('@/lib/documentRegistry/client', () => ({ captureDocumentRegistryScope: () => ({}), readDocumentRegistry: m.registry }));
vi.mock('@/lib/documentRegistry/files', () => ({ loadRegistryFile: m.file }));
vi.mock('@/lib/admissionDocuments/client', () => ({ captureAdmissionDocumentScope: () => ({}), readAutomaticAdmissionDraft: m.draft }));
vi.mock('@/lib/educationIssuance/client', () => ({ captureIssuanceScope: () => ({}), readEducationIssuance: m.issuance }));
vi.mock('@/lib/educationIssuance/artifactDownload', () => ({ downloadIssuedPdf: m.download }));
import { captureDocumentChainScope } from '../client';
import { downloadChainEducationDocument, openDocumentChainSource } from '../source';
const scoped = () => captureDocumentChainScope(org, target);
const query = () => ({ kind: 'source' as const, enrollment_id: enrollment, group_id: group, source: source().source });
function registryRecord() { return { id: id(8), revision: 2, can_open_file: true, data: { title: 'Сохранённый приказ', subject: { kind: 'student', user_id: pupil }, source: { kind: 'org_document_version', document_id: id(9), version_id: id(10), content_hash: 'a'.repeat(64) } }, context_binding: { kind: 'enrollment', organization_id: org, user_id: pupil, enrollment_id: enrollment, course_id: course } }; }
beforeEach(() => {
  vi.clearAllMocks(); m.current = true; m.chain.mockResolvedValue(source());
  m.registry.mockImplementation(async (_scope, query) => query.kind === 'detail' ? { kind: 'detail', record: registryRecord() } : { kind: 'file', file: { file_name: 'Приказ.pdf', mime: 'application/pdf' } });
  m.file.mockResolvedValue(new Blob(['synthetic stored bytes'], { type: 'application/pdf' }));
});
describe('document chain source opening', () => {
  it('opens the existing registered version even when no draft preview is involved', async () => {
    await expect(openDocumentChainSource(scoped(), query())).resolves.toMatchObject({ kind: 'file', title: 'Сохранённый приказ', fileName: 'Приказ.pdf' });
    expect(m.registry.mock.calls.map(call => call[1])).toEqual([{ kind: 'detail', record_id: id(8) }, { kind: 'file', record_id: id(8), record_revision: 2 }]);
    expect(m.draft).not.toHaveBeenCalled();
  });
  it.each(['version', 'student', 'enrollment', 'revision'])('refuses a changed registered %s before loading bytes', async changed => {
    const record = registryRecord();
    if (changed === 'version') record.data.source.version_id = id(90);
    if (changed === 'student') record.context_binding.user_id = id(90);
    if (changed === 'enrollment') record.context_binding.enrollment_id = id(90);
    if (changed === 'revision') record.revision = 3;
    m.registry.mockResolvedValue({ kind: 'detail', record });
    await expect(openDocumentChainSource(scoped(), query())).rejects.toMatchObject({ code: 'SOURCE_CHANGED' }); expect(m.file).not.toHaveBeenCalled();
  });
  it('keeps the server explanation when an individual file is unavailable', async () => {
    m.chain.mockResolvedValue({ ...source(), availability: 'unavailable', why: 'Для ученика доступна персональная выписка, а не общий приказ.', target: null });
    await expect(openDocumentChainSource(scoped(), query())).rejects.toThrow('Для ученика доступна персональная выписка'); expect(m.registry).not.toHaveBeenCalled();
  });
  it('never calls the staff registry API for an own-only viewer', async () => {
    m.chain.mockResolvedValue({ ...source(), viewer: 'self' });
    await expect(openDocumentChainSource(scoped(), query())).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(m.registry).not.toHaveBeenCalled();
  });
  it('discards a file after access changes while bytes are loading', async () => {
    m.file.mockImplementationOnce(async () => { m.current = false; return new Blob(['synthetic']); });
    await expect(openDocumentChainSource(scoped(), query())).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('passes the exact education revision into the immutable PDF downloader', async () => {
    const value: any = { kind: 'education', title: 'Документ', number: '1', recordId: id(16), revision: 4, scope: {} };
    await downloadChainEducationDocument(value); expect(m.download).toHaveBeenCalledWith(value.scope, id(16), 4);
    expect(m.issuance).not.toHaveBeenCalled();
    m.download.mockRejectedValueOnce({ code: 'SOURCE_CHANGED' });
    await expect(downloadChainEducationDocument(value)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
});
