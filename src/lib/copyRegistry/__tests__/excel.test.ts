import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { downloadCopyRegistryExcel } from '../excel.ts';
import { org, record, savedExport } from './fixtures.ts';

const mock = vi.hoisted(() => ({ lazy: vi.fn(), sheets: [] as any[], write: vi.fn() }));
vi.mock('@/utils/xlsxHelper', () => ({ getXLSX: mock.lazy }));
const workbook = () => ({ utils: { book_new: () => ({}), json_to_sheet: (rows: any[]) => rows, book_append_sheet: (_book: unknown, rows: any[], name: string) => mock.sheets.push({ name, rows }) }, writeFile: mock.write });
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.clearAllMocks(); mock.sheets = []; mock.lazy.mockResolvedValue(workbook()); });
afterEach(() => vi.unstubAllGlobals());
describe('copy registry workbook current-access boundary', () => {
  it('reads a fresh complete authorized snapshot after the lazy module loads, including all history', async () => {
    const saved = savedExport(Array.from({ length: 101 }, (_, index) => record(index + 1)));
    const calls: string[] = []; mock.lazy.mockImplementation(async () => { calls.push('module'); return workbook(); });
    const read = vi.fn(async () => { calls.push('fresh-server-read'); return saved; });
    await downloadCopyRegistryExcel(read, { organizationId: org, scope: { kind: 'organization' }, exportId: saved.id }, () => true);
    expect(calls).toEqual(['module', 'fresh-server-read']); expect(read).toHaveBeenCalledOnce(); expect(mock.sheets.map(sheet => sheet.rows.length)).toEqual([101, 101]);
    expect(mock.sheets[0].rows[0]['Передача зафиксирована']).toBe('Нет'); expect(mock.write).toHaveBeenCalledOnce();
  });
  it('does not fetch or write after actor/scope changes while the module is loading', async () => {
    let current = true; const read = vi.fn(); mock.lazy.mockImplementation(async () => { current = false; return workbook(); });
    const saved = savedExport();
    await expect(downloadCopyRegistryExcel(read, { organizationId: org, scope: { kind: 'organization' }, exportId: saved.id }, () => current)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(read).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled(); expect(mock.sheets).toHaveLength(0);
  });
  it('does not turn a denied current server read into a workbook from earlier screen data', async () => {
    const read = vi.fn(async () => { throw new Error('access now revoked'); }); const saved = savedExport();
    await expect(downloadCopyRegistryExcel(read, { organizationId: org, scope: { kind: 'organization' }, exportId: saved.id }, () => true)).rejects.toThrow();
    expect(mock.write).not.toHaveBeenCalled(); expect(mock.sheets).toHaveLength(0);
  });
});
