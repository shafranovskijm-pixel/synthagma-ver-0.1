import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { exported, filters, org, record, sha, uid } from './fixtures';
import { observeOfflineAccess, setOfflineAuthActor } from '@/utils/courseCache';
const mock = vi.hoisted(() => ({ getXLSX: vi.fn(), write: vi.fn(), sheets: [] as any[] }));
vi.mock('@/utils/xlsxHelper', () => ({ getXLSX: mock.getXLSX }));
vi.mock('../files', () => ({ downloadRegistryBlob: vi.fn() }));
import { downloadRegistryExport, prepareRegistryExport, REGISTRY_PREPARED_EXPORT_TTL_MS, verifyRegistryExport } from '../export';
import { downloadRegistryBlob } from '../files';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('crypto', webcrypto); mock.sheets = []; mock.write.mockReturnValue(new Uint8Array([80, 75, 3, 4, 0]).buffer); mock.getXLSX.mockResolvedValue({ utils: { book_new: () => ({}), json_to_sheet: (rows: any[]) => rows, book_append_sheet: (_book: any, rows: any[], name: string) => mock.sheets.push({ rows, name }) }, write: mock.write }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setOfflineAuthActor(null); });
const expected = { organizationId: org, scope: { kind: 'organization' as const }, filters };
const blobBytes = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob); });
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
  it('retains exact verified JSON bytes for an explicit second click without re-reading or claiming the browser saved them', async () => {
    const value = exported(Array.from({ length: 101 }, (_, index) => ({ ...record(index + 1), revision: 2 }))), read = vi.fn(async () => value);
    const prepared = await prepareRegistryExport(read, expected, 'json', () => true);
    expect(downloadRegistryBlob).not.toHaveBeenCalled(); expect(prepared.recordCount).toBe(101); expect(prepared.eventCount).toBe(202); expect(prepared.manifestHash).toBe(value.manifest_sha256);
    prepared.download(); prepared.download(); expect(read).toHaveBeenCalledOnce(); expect(downloadRegistryBlob).toHaveBeenCalledTimes(2);
    const first = vi.mocked(downloadRegistryBlob).mock.calls[0][0], second = vi.mocked(downloadRegistryBlob).mock.calls[1][0];
    expect(second).toBe(first); expect(new TextDecoder().decode(await blobBytes(first))).toBe(value.manifest_json);
    prepared.dispose(); expect(prepared.available()).toBe(false); expect(() => prepared.download()).toThrow(); expect(downloadRegistryBlob).toHaveBeenCalledTimes(2);
  });
  it('prepares a real XLSX with all101 records and202 events once and downloads the same immutable workbook bytes twice', async () => {
    const actual = await import('xlsx'); mock.getXLSX.mockResolvedValue(actual);
    const value = exported(Array.from({ length: 101 }, (_, index) => ({ ...record(index + 1), revision: 2 })));
    const prepared = await prepareRegistryExport(async () => value, expected, 'xlsx', () => true); prepared.download(); prepared.download();
    const blob = vi.mocked(downloadRegistryBlob).mock.calls[0][0], workbook = actual.read(await blobBytes(blob), { type: 'array' });
    expect(actual.utils.sheet_to_json(workbook.Sheets['Регистрация'])).toHaveLength(101); expect(actual.utils.sheet_to_json(workbook.Sheets['История'])).toHaveLength(202);
    expect(vi.mocked(downloadRegistryBlob).mock.calls[1][0]).toBe(blob); expect(mock.getXLSX).toHaveBeenCalledOnce(); prepared.dispose();
  });
  it('rejects a deferred preparation after A→B→A even if the old UI current callback still returns true', async () => {
    setOfflineAuthActor('QA-A'); let resolve!: (value: ReturnType<typeof exported>) => void;
    const pending = prepareRegistryExport(() => new Promise(done => { resolve = done; }), expected, 'json', () => true);
    setOfflineAuthActor('QA-B'); setOfflineAuthActor('QA-A'); resolve(exported());
    await expect(pending).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(downloadRegistryBlob).not.toHaveBeenCalled();
  });
  it('invalidates prepared bytes on an observed same-account access change before the actual click', async () => {
    setOfflineAuthActor('QA-A'); const prepared = await prepareRegistryExport(async () => exported(), expected, 'json', () => true);
    observeOfflineAccess('QA-A', 'documents-and-journals-revoked'); expect(prepared.available()).toBe(false);
    expect(() => prepared.download()).toThrow(); expect(downloadRegistryBlob).not.toHaveBeenCalled();
  });
  it('expires the retained file after the finite5-minute lifetime', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T00:00:00Z'));
    const prepared = await prepareRegistryExport(async () => exported(), expected, 'json', () => true);
    vi.setSystemTime(new Date(prepared.preparedAt + REGISTRY_PREPARED_EXPORT_TTL_MS));
    expect(prepared.available()).toBe(false); expect(() => prepared.download()).toThrow(); expect(downloadRegistryBlob).not.toHaveBeenCalled();
  });
});
