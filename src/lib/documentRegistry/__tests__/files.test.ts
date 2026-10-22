import { beforeEach, describe, expect, it, vi } from 'vitest';
import { org, source, uid } from './fixtures';
const mock = vi.hoisted(() => ({ current: true, download: vi.fn(), session: vi.fn(), bucket: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: mock.bucket } } }));
vi.mock('../client', async () => { const { DocumentRegistryError } = await import('../errors'); return { requireRegistryScope: () => { if (!mock.current) throw new DocumentRegistryError('ACCESS_DENIED'); }, requireRegistrySession: mock.session }; });
import { loadRegistryFile, registryFilePreviewable } from '../files';
import type { DocumentRegistryScope } from '../client';
import type { RegistryFile } from '../contract';
const scope = { organizationId: org } as DocumentRegistryScope;
const file = (): RegistryFile => ({ kind: 'org_document_version', bucket: 'org-documents', path: org + '/versions/' + source.document_id + '/' + source.version_id + '.pdf', version_id: source.version_id, proof_hash: source.content_hash, file_name: 'qa.pdf', mime: 'application/pdf', size: 2 });
beforeEach(() => { vi.clearAllMocks(); mock.current = true; mock.session.mockResolvedValue('fresh-token'); mock.bucket.mockReturnValue({ download: mock.download }); mock.download.mockResolvedValue({ data: new Blob(['qa']), error: null }); });
describe('private registry file descriptors', () => {
  it('downloads only the exact private version after a fresh session check and verifies the returned size', async () => { await expect(loadRegistryFile(scope, file(), source)).resolves.toHaveProperty('size', 2); expect(mock.session).toHaveBeenCalledWith(scope); expect(mock.bucket).toHaveBeenCalledWith('org-documents'); expect(mock.download).toHaveBeenCalledWith(file().path); });
  it.each(['organization', 'version', 'proof'])('refuses a mismatched %s descriptor before storage access', async fault => { const value = file(); if (fault === 'organization') value.path = uid(999) + '/file.pdf'; if (fault === 'version' && value.kind === 'org_document_version') value.version_id = uid(999); if (fault === 'proof') value.proof_hash = 'c'.repeat(64); await expect(loadRegistryFile(scope, value, source)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' }); expect(mock.download).not.toHaveBeenCalled(); });
  it('drops returned bytes if actor access changed while downloading', async () => { mock.download.mockImplementation(async () => { mock.current = false; return { data: new Blob(['qa']), error: null }; }); await expect(loadRegistryFile(scope, file(), source)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); });
  it('refuses a truncated source, and never executes HTML or office files in the built-in preview', async () => { mock.download.mockResolvedValue({ data: new Blob(['q']), error: null }); await expect(loadRegistryFile(scope, file(), source)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' }); expect(registryFilePreviewable(file())).toBe(true); expect(registryFilePreviewable({ ...file(), mime: 'text/html' })).toBe(false); expect(registryFilePreviewable({ ...file(), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(false); });
});
