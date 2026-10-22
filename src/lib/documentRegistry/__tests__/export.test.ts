import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { exported, filters, org, record, sha, uid } from './fixtures';
const mock = vi.hoisted(() => ({ getXLSX: vi.fn(), write: vi.fn(), sheets: [] as any[] }));
vi.mock('@/utils/xlsxHelper', () => ({ getXLSX: mock.getXLSX }));
vi.mock('../files', () => ({ downloadRegistryBlob: vi.fn() }));
import { downloadRegistryExport, verifyRegistryExport } from '../export';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('crypto', webcrypto); mock.sheets = []; mock.getXLSX.mockResolvedValue({ utils: { book_new: () => ({}), json_to_sheet: (rows: any[]) => rows, book_append_sheet: (_book: any, rows: any[], name: string) => mock.sheets.push({ rows, name }) }, writeFile: mock.write }); });
afterEach(() => vi.unstubAllGlobals());
const expected = { organizationId: org, scope: { kind: 'organization' as const }, filters };
describe('fresh complete document registry export', () => {
  it('verifies all 101 records and 202 history events beyond a UI page while preserving exact manifest bytes', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...record(index + 1), revision: 2 })), value = exported(rows);
    const verified = await verifyRegistryExport(value, expected, () => true); expect(verified.snapshot.records).toHaveLength(101); expect(verified.snapshot.events).toHaveLength(202); expect(verified.manifest_json).toBe(value.manifest_json);
    await downloadRegistryExport(async () => value, expected, 'xlsx', () => true); expect(mock.sheets[0].rows).toHaveLength(101); expect(mock.sheets[1].rows).toHaveLength(202); expect(mock.sheets[0].rows[0]).toMatchObject({ 'Внутренний номер': record().registration_id, 'Заявленный номер документа': 'З-17' }); expect(mock.write).toHaveBeenCalledOnce();
  });
  it.each(['bytes', 'hash', 'counts', 'history', 'latest', 'scope', 'filters', 'extra'])('rejects a corrupted %s snapshot before downloading', async fault => {
    const value: any = exported([{ ...record(), revision: 2 }]);
    if (fault === 'bytes') value.manifest_bytes++; if (fault === 'hash') value.manifest_sha256 = '0'.repeat(64); if (fault === 'counts') value.snapshot.record_count++; if (fault === 'history') value.snapshot.events.splice(0, 1); if (fault === 'latest') value.snapshot.events[1].snapshot.data.notes = 'unexpected'; if (fault === 'scope') value.snapshot.organization_id = uid(999); if (fault === 'filters') value.snapshot.filters.text = 'another'; if (fault === 'extra') value.snapshot.records[0].file_url = 'private';
    if (!['bytes', 'hash'].includes(fault)) { value.manifest_json = JSON.stringify(value.snapshot); value.manifest_sha256 = sha(value.manifest_json); value.manifest_bytes = new TextEncoder().encode(value.manifest_json).length; }
    await expect(downloadRegistryExport(async () => value, expected, 'xlsx', () => true)).rejects.toBeDefined(); expect(mock.write).not.toHaveBeenCalled();
  });
  it('loads Excel before the current server read and aborts after an actor change during lazy loading', async () => {
    let current = true; mock.getXLSX.mockImplementation(async () => { current = false; return {}; }); const read = vi.fn(async () => exported());
    await expect(downloadRegistryExport(read, expected, 'xlsx', () => current)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(read).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
  });
});
