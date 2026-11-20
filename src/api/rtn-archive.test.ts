// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc, abortSignal, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, functions: { invoke } } }));
import { listRtnArchiveCandidates } from './rtn-archive';
const org = '11111111-1111-4111-8111-111111111111';
const item = () => ({ canonical_url: 'https://www.gosnadzor.ru/news/65/19539/', title: 'Публикация', source_date: '2026-11-20', date_precision: 'day', has_conflict: false, known_rss: false });
const page = () => ({ items: [item()], next_cursor: null, has_more: false, scope: 'archive_discovery_not_fresh_news', complete_archive: false, exact_publication_times_known: false });
function reply(data: unknown, error: unknown = null) { abortSignal.mockResolvedValue({ data, error }); rpc.mockReturnValue({ abortSignal }); }
beforeEach(() => { vi.resetAllMocks(); reply(page()); });
afterEach(() => vi.useRealTimers());
describe('saved archive candidate boundary', () => {
  it('accepts500 Unicode codepoints even when astral characters use1000 UTF16 code units', async () => {
    const value = { ...item(), title: '📖'.repeat(500) }; reply({ ...page(), items: [value] });
    expect((await listRtnArchiveCandidates(org)).items[0].title).toBe(value.title);
  });
  it('rejects501 Unicode codepoints consistently with the server/parser title limit', async () => {
    reply({ ...page(), items: [{ ...item(), title: '📖'.repeat(501) }] });
    await expect(listRtnArchiveCandidates(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('reads at most20 saved rows through the scoped RPC with cancellation and no source invocation', async () => {
    const controller = new AbortController();
    expect(await listRtnArchiveCandidates(org, 'YWJj', controller.signal)).toEqual(page());
    expect(rpc).toHaveBeenCalledWith('list_rtn_news_archive_candidates', { p_organization_id: org, p_limit: 20, p_cursor: 'YWJj' });
    expect(abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal); expect(invoke).not.toHaveBeenCalled();
  });
  it.each(['bad', 'https://attacker.test/', '11111111-1111-1111-1111-111111111111'])('refuses malformed org before read %s', async value => {
    await expect(listRtnArchiveCandidates(value)).rejects.toMatchObject({ code: 'invalid_response' }); expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['a=', '//foreign', 'a'.repeat(2049)])('refuses nonopaque/oversized cursors before read', async cursor => {
    await expect(listRtnArchiveCandidates(org, cursor)).rejects.toMatchObject({ code: 'invalid_response' }); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { items: [{ ...item(), canonical_url: 'https://www.gosnadzor.ru@attacker.test/news/65/19539/' }] },
    { items: [{ ...item(), canonical_url: 'https://www.gosnadzor.ru/news/65/19539/?token=private' }] },
    { items: [{ ...item(), source_date: '2026-02-30' }] },
    { items: [{ ...item(), published_at: '2026-11-20T00:00:00Z' }] },
    { items: [item(), item()] }, { items: Array.from({ length: 21 }, item) },
    { complete_archive: true }, { exact_publication_times_known: true },
    { next_cursor: 'YWJj', has_more: false }, { next_cursor: null, has_more: true },
    { original_path: 'news/archive/private.html' }, { scope: 'fresh_news' },
  ])('rejects private/unverified/contradictory discovery metadata %j', async delta => {
    reply({ ...page(), ...delta }); await expect(listRtnArchiveCandidates(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('keeps permission denial distinct and conceals raw schema errors', async () => {
    reply(null, { code: '42501', message: 'private staff details' });
    await expect(listRtnArchiveCandidates(org)).rejects.toMatchObject({ code: 'forbidden', message: 'Нет доступа к публикациям этой организации.' });
    reply(null, { code: 'PGRST202', message: 'private endpoint' });
    await expect(listRtnArchiveCandidates(org)).rejects.toMatchObject({ code: 'network', message: 'Публикации не удалось загрузить. Отсутствие обновлений не подтверждено.' });
  });
  it('aborts a stalled RPC at15seconds without substituting an empty list', async () => {
    vi.useFakeTimers();
    abortSignal.mockImplementation((signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })));
    const read = listRtnArchiveCandidates(org); const asserted = expect(read).rejects.toMatchObject({ code: 'network' });
    await vi.advanceTimersByTimeAsync(15_000); await asserted; expect(rpc).toHaveBeenCalledTimes(1);
  });
});
