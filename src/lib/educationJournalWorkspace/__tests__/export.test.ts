import { describe, expect, it, vi } from 'vitest';
import { ids, scope, page, row } from './fixtures';
import { collectEducationJournalExtract, educationJournalExtractHtml, educationJournalExtractFilename } from '../export';
import type { EducationJournalRequestScope } from '../client';
vi.mock('@/lib/customJournals/client', () => ({ captureCustomJournalScope: () => ({}), customJournalScopeCurrent: () => true }));
const request: EducationJournalRequestScope = { actorId: ids.actor, accessRevision: 1, organizationId: ids.org, target: scope };
describe('complete student journal extract', () => {
  it('collects all151 rows over two pages and pins the first witness', async () => {
    const read = vi.fn().mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => row(i)), 'page2', 151)).mockResolvedValueOnce(page(Array.from({ length: 51 }, (_, i) => row(i + 100)), null, 151));
    const result = await collectEducationJournalExtract(request, 'activity', read);
    expect(result.rows).toHaveLength(151);
    expect(read.mock.calls[0][1].snapshot_key).toBeNull();
    expect(read.mock.calls[1][1]).toMatchObject({ after: 'page2', snapshot_key: 'rows-v1' });
    const html = educationJournalExtractHtml(result);
    expect(html).toContain('Урок150'); expect(html).toContain('Иванов Иван'); expect(html).not.toContain('Петров');
  });
  it('refuses changed sources between pages', async () => {
    const next = page([row(2)], null, 2); next.snapshot_key = 'rows-v2';
    const read = vi.fn().mockResolvedValueOnce(page([row(1)], 'next', 2)).mockResolvedValueOnce(next);
    await expect(collectEducationJournalExtract(request, 'activity', read)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('refuses an incomplete final page instead of creating a partial file', async () => {
    const read = vi.fn().mockResolvedValueOnce(page([row(1)], null, 2));
    await expect(collectEducationJournalExtract(request, 'activity', read)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('refuses duplicate records across pages', async () => {
    const read = vi.fn().mockResolvedValueOnce(page([row(1)], 'next', 2)).mockResolvedValueOnce(page([row(1)], null, 2));
    await expect(collectEducationJournalExtract(request, 'activity', read)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('refuses a repeated cursor rather than looping', async () => {
    const read = vi.fn().mockResolvedValueOnce(page([row(1)], 'same', 3)).mockResolvedValueOnce(page([row(2)], 'same', 3));
    await expect(collectEducationJournalExtract(request, 'activity', read)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
  it('does not export without the current server capability', async () => {
    const value = page(); value.capabilities.can_export = false;
    await expect(collectEducationJournalExtract(request, 'activity', vi.fn().mockResolvedValue(value))).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('escapes data as text and prints source/version without fake legal signing', () => {
    const value = page(); value.rows[0].title = '<script>alert(1)</script>'; value.rows[0].student_label = 'Иванов <И>';
    const html = educationJournalExtractHtml({ page: value, rows: value.rows });
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).toContain('Версия1'.replace('1', ' 1'));
    expect(html).not.toContain('Подписано'); expect(html).not.toContain(ids.peer);
    expect(html).toContain('Подпись и заверение не проставлены'); expect(html).toContain('UTC');
    expect(html).toContain(value.rows[0].source_id); expect(html).toContain(value.snapshot_key);
  });
  it('distinguishes student files with safe readable names and the actual observation date', () => {
    const value = page(); value.context.student!.label = 'Иванов / Иван:*';
    const filename = educationJournalExtractFilename(value);
    expect(filename).toContain('Иванов _ Иван__'); expect(filename).toContain('Завершённые онлайн-уроки_2026-11-19.html');
    expect(filename).not.toMatch(/[<>:"/\\|?*]/);
    value.context.student!.label = 'Петров'; expect(educationJournalExtractFilename(value)).not.toBe(filename);
  });
});
