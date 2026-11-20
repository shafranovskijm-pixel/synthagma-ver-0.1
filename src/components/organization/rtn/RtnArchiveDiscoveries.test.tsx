import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/api/rtn-archive', () => ({ listRtnArchiveCandidates: list }));
import { RtnApiError } from '@/api/rostechnadzor';
import { RtnArchiveDiscoveries } from './RtnArchiveDiscoveries';
const org = '11111111-1111-4111-8111-111111111111', actor = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const props = () => ({ organizationId: org, actorId: actor, canReadCourses: true });
const item = (id = '19539') => ({ canonical_url: `https://www.gosnadzor.ru/news/65/${id}/`, title: `Публикация ${id}`, source_date: '2026-11-20', date_precision: 'day' as const, has_conflict: false, known_rss: false });
const page = (items = [item()], cursor: string | null = null) => ({ items, next_cursor: cursor, has_more: !!cursor, scope: 'archive_discovery_not_fresh_news' as const, complete_archive: false as const, exact_publication_times_known: false as const });
const click = async (name: string) => act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
beforeEach(() => { vi.resetAllMocks(); list.mockResolvedValue(page()); });
afterEach(cleanup);
describe('archive discovery in Sources', () => {
  it('accepts the genuine PostgreSQL platform-admin UUID without imposing RFC version bits', async () => {
    render(<RtnArchiveDiscoveries {...props()} actorId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" />);
    await click('Найденные публикации'); expect(screen.getByRole('link', { name: 'Публикация 19539' })).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(org, null, expect.any(AbortSignal));
  });
  it('loads only when opened, displays printed day and official link without exact-time/freshness claims', async () => {
    render(<RtnArchiveDiscoveries {...props()} />); expect(list).not.toHaveBeenCalled();
    await click('Найденные публикации');
    expect(list).toHaveBeenCalledWith(org, null, expect.any(AbortSignal));
    expect(screen.getByText('20.11.2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Публикация 19539' })).toHaveAttribute('href', item().canonical_url);
    expect(screen.getByText('Дата указана как на сайте, без точного времени. Полнота архива не подтверждена.')).toBeInTheDocument();
  });
  it('does not call or show data without a current principal and read permission', () => {
    const view = render(<RtnArchiveDiscoveries {...props()} canReadCourses={false} />);
    view.rerender(<RtnArchiveDiscoveries {...props()} actorId={null} />);
    view.rerender(<RtnArchiveDiscoveries {...props()} organizationId="bad" />);
    expect(list).not.toHaveBeenCalled(); expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('does not equate a missing reader/network error with no publications', async () => {
    list.mockRejectedValue(new RtnApiError('network', 'Проверка не подтверждена.'));
    render(<RtnArchiveDiscoveries {...props()} />); await click('Найденные публикации');
    expect(screen.getByRole('alert')).toHaveTextContent('Проверка не подтверждена.');
    expect(screen.queryByText(/Сохранённых публикаций пока нет/)).not.toBeInTheDocument();
  });
  it('explains that a verified empty saved list is not absence of official updates', async () => {
    list.mockResolvedValue(page([])); render(<RtnArchiveDiscoveries {...props()} />); await click('Найденные публикации');
    expect(screen.getByText('Сохранённых публикаций пока нет. Это не означает, что на официальном сайте нет обновлений.')).toBeInTheDocument();
  });
  it('appends only an explicit next page and denies duplicate/cyclic continuation', async () => {
    list.mockResolvedValueOnce(page([item()], 'YWJj')).mockResolvedValueOnce(page([item()], 'YWJj'));
    render(<RtnArchiveDiscoveries {...props()} />); await click('Найденные публикации');
    await click('Показать ещё'); expect(list.mock.calls[1][1]).toBe('YWJj');
    expect(screen.getByRole('alert')).toHaveTextContent('Продолжение списка не подтверждено.');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
  it('keeps the first page when the user opens a valid continuation and stops at its verified end', async () => {
    list.mockResolvedValueOnce(page([item()], 'YWJj')).mockResolvedValueOnce(page([item('19538')]));
    render(<RtnArchiveDiscoveries {...props()} />); await click('Найденные публикации');
    expect(list).toHaveBeenCalledTimes(1); await click('Показать ещё');
    expect(screen.getByRole('link', { name: 'Публикация 19539' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Публикация 19538' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });
  it('discards an old org result immediately after scope changes and aborts its request', async () => {
    let finish!: (value: ReturnType<typeof page>) => void;
    list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<RtnArchiveDiscoveries {...props()} />); await click('Найденные публикации');
    const signal = list.mock.calls[0][2] as AbortSignal;
    view.rerender(<RtnArchiveDiscoveries {...props()} organizationId="22222222-2222-4222-8222-222222222222" />);
    expect(signal.aborted).toBe(true); await act(async () => { finish(page()); });
    expect(screen.queryByRole('link')).not.toBeInTheDocument(); expect(list).toHaveBeenCalledTimes(1);
  });
  it('hides data immediately when the actor changes or permission is revoked', async () => {
    const view = render(<RtnArchiveDiscoveries {...props()} />); await click('Найденные публикации');
    view.rerender(<RtnArchiveDiscoveries {...props()} actorId="bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    view.rerender(<RtnArchiveDiscoveries {...props()} canReadCourses={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
