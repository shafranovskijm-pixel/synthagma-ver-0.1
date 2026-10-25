import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { downloadVerifiedCopyRegistryExport, verifyCopyRegistryExport } from '../export.ts';
import { group, org, record, savedExport, sha } from './fixtures.ts';

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const expected = (id: string) => ({ organizationId: org, scope: { kind: 'organization' as const }, exportId: id });
function replaceManifest(value: ReturnType<typeof savedExport>, mutate: (manifest: any) => void) {
  const manifest = JSON.parse(value.manifest_json); mutate(manifest); value.manifest_json = JSON.stringify(manifest); value.manifest_bytes = new TextEncoder().encode(value.manifest_json).length; value.manifest_sha256 = sha(value.manifest_json); return value;
}
describe('complete immutable server copy registry export', () => {
  it('verifies more than a screen page and preserves exact stored whitespace and Cyrillic UTF-8 bytes', async () => {
    const saved = savedExport(Array.from({ length: 101 }, (_, n) => record(n + 1)));
    const result = await verifyCopyRegistryExport(saved, expected(saved.id), () => true);
    expect(result.manifest.records).toHaveLength(101); expect(result.manifest.history).toHaveLength(101);
    expect(result.json).toBe(saved.manifest_json); expect(result.html).toBe(saved.html);
    expect(new TextDecoder().decode(result.jsonBytes)).toBe(saved.manifest_json);
    expect(result.json).not.toBe(JSON.stringify(result.manifest));
  });
  it.each(['hash', 'byte-count', 'missing-history', 'duplicate-record', 'foreign-org', 'extra-field', 'wrong-scope', 'latest-snapshot'])('rejects %s corruption rather than downloading a plausible table', async fault => {
    const saved = savedExport();
    if (fault === 'hash') saved.manifest_json += ' ';
    if (fault === 'byte-count') saved.html_bytes++;
    if (fault === 'missing-history') replaceManifest(saved, manifest => { manifest.history = []; manifest.counts.history = 0; });
    if (fault === 'duplicate-record') replaceManifest(saved, manifest => { manifest.records.push(manifest.records[0]); manifest.counts.records++; });
    if (fault === 'foreign-org') replaceManifest(saved, manifest => { manifest.organization_id = group; });
    if (fault === 'extra-field') replaceManifest(saved, manifest => { manifest.records[0].file_url = 'private'; });
    if (fault === 'wrong-scope') replaceManifest(saved, manifest => { manifest.scope = { kind: 'group', group_id: group }; });
    if (fault === 'latest-snapshot') replaceManifest(saved, manifest => { manifest.history[0].snapshot.data.notes = 'not current data'; });
    await expect(verifyCopyRegistryExport(saved, expected(saved.id), () => true)).rejects.toBeDefined();
  });
  it.each(['<script>alert(1)</script>', '<p style="background:url(https://other.example/tracker)">text</p>', '<img src="https://other.example/tracker">', '<p onclick="bad()">click</p>', '<style>@import "https://other.example/x.css";</style>', '<meta http-equiv="refresh" content="0;url=https://other.example">'])('rejects active or externally loading HTML: %s', async html => {
    const saved = savedExport(); saved.html = html; saved.html_bytes = new TextEncoder().encode(html).length; saved.html_sha256 = sha(html);
    await expect(verifyCopyRegistryExport(saved, expected(saved.id), () => true)).rejects.toBeDefined();
  });
  it('requires group rows to belong to the exact exported group', async () => {
    const saved = savedExport([record()], { kind: 'group', group_id: group });
    await expect(verifyCopyRegistryExport(saved, { ...expected(saved.id), scope: { kind: 'group', group_id: group } }, () => true)).rejects.toBeDefined();
  });
  it('discards both fully fetched files when actor permission ends during asynchronous digest', async () => {
    let current = true; vi.stubGlobal('crypto', { subtle: { digest: async (...args: Parameters<SubtleCrypto['digest']>) => { const result = await webcrypto.subtle.digest(...args); current = false; return result; } } });
    const saved = savedExport(); await expect(verifyCopyRegistryExport(saved, expected(saved.id), () => current)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('activates a connected download with exact raw data and removes its anchor; stale lifecycle never activates', async () => {
    vi.useFakeTimers(); const saved = savedExport(), checked = await verifyCopyRegistryExport(saved, expected(saved.id), () => true);
    const blobs: Blob[] = [], revoked: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:checked-' + blobs.length; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn((url: string) => revoked.push(url)) });
    const activated: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { expect(this.isConnected).toBe(true); activated.push(this.download); });
    downloadVerifiedCopyRegistryExport(checked, saved.id, 'json', () => true);
    expect(blobs[0].type).toBe('application/json;charset=utf-8'); expect(activated).toEqual(['copies_registry_' + saved.id + '.json']); expect(document.querySelector('a[download]')).toBeNull();
    let checks = 0;
    expect(() => downloadVerifiedCopyRegistryExport(checked, saved.id, 'html', () => ++checks === 1)).toThrow();
    expect(activated).toHaveLength(1); expect(document.querySelector('a[download]')).toBeNull(); expect(revoked).toContain('blob:checked-2');
    vi.advanceTimersByTime(1000); expect(revoked).toContain('blob:checked-1');
  });
});
