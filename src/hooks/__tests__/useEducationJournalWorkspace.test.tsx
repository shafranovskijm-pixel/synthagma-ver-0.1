import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEducationJournalWorkspace } from '../useEducationJournalWorkspace';
import { ids, page, row, scope, summary } from '@/lib/educationJournalWorkspace/__tests__/fixtures';
import type { EducationJournalRead } from '@/lib/educationJournalWorkspace/contract';

const mock = vi.hoisted(() => ({ read: vi.fn(), collect: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/educationJournalWorkspace/client', () => ({
  captureEducationJournalScope: (organizationId: string, target: unknown, current: () => boolean) => ({ organizationId, target, current }),
  readEducationJournalWorkspace: (...args: unknown[]) => mock.read(...args),
  normalizeEducationJournalError: (e: { code?: string }) => ({ code: e.code || 'DEPENDENCY_UNAVAILABLE' }),
  educationJournalMessages: { DEPENDENCY_UNAVAILABLE: 'Не удалось подтвердить записи', SOURCE_CHANGED: 'Данные изменились', ACCESS_DENIED: 'Нет доступа' },
}));
vi.mock('@/lib/educationJournalWorkspace/export', () => ({ collectEducationJournalExtract: (...args: unknown[]) => mock.collect(...args), downloadEducationJournalExtract: (...args: unknown[]) => mock.download(...args) }));
const pending = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => { mock.read.mockReset(); mock.collect.mockReset(); mock.download.mockReset(); });
afterEach(cleanup);

describe('journal workspace scope and generation boundaries', () => {
  it('hides an old learner immediately and ignores the late old summary', async () => {
    const first = pending<EducationJournalRead>(), next = pending<EducationJournalRead>();
    mock.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    const hook = renderHook(({ target }) => useEducationJournalWorkspace(ids.org, target, null), { initialProps: { target: scope } });
    hook.rerender({ target: { ...scope, student_user_id: ids.peer } });
    await act(async () => { first.resolve(summary()); });
    expect(hook.result.current.summary).toBeNull(); expect(hook.result.current.loading).toBe(true);
    const newer = summary(); newer.scope = { ...scope, student_user_id: ids.peer }; newer.context.student = { user_id: ids.peer, label: 'Другой ученик' };
    await act(async () => { next.resolve(newer); });
    expect(hook.result.current.summary?.context.student?.label).toBe('Другой ученик');
  });
  it('keeps a newer refresh when an older same-scope read finishes last', async () => {
    const first = pending<EducationJournalRead>(), newer = pending<EducationJournalRead>();
    mock.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(newer.promise);
    const hook = renderHook(() => useEducationJournalWorkspace(ids.org, scope, null));
    act(() => hook.result.current.refresh());
    const fresh = summary(); fresh.journals[0].record_count = 3;
    await act(async () => { newer.resolve(fresh); });
    await act(async () => { first.resolve(summary()); });
    expect(hook.result.current.summary?.journals[0].record_count).toBe(3);
  });
  it('does not open unavailable rows or turn unknown counts into zero', async () => {
    const value = summary(); value.journals[0] = { ...value.journals[0], state: 'unavailable', record_count: null, exportable: false, reason: 'Нужны критерии' };
    mock.read.mockResolvedValue(value);
    const hook = renderHook(() => useEducationJournalWorkspace(ids.org, scope, 'activity'));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(mock.read).toHaveBeenCalledTimes(1); expect(hook.result.current.page).toBeNull();
    expect(hook.result.current.summary?.journals[0].record_count).toBeNull();
  });
  it('starts rows with their own witness and uses it for later pages', async () => {
    mock.read.mockResolvedValueOnce(summary()).mockResolvedValueOnce(page([row(1)], 'next', 2)).mockResolvedValueOnce(page([row(2)], null, 2));
    const hook = renderHook(() => useEducationJournalWorkspace(ids.org, scope, 'activity'));
    await waitFor(() => expect(hook.result.current.page?.rows).toHaveLength(1));
    expect(mock.read.mock.calls[1][1]).toMatchObject({ kind: 'rows', snapshot_key: null });
    await act(async () => hook.result.current.loadMore());
    expect(mock.read.mock.calls[2][1]).toMatchObject({ snapshot_key: 'rows-v1', after: 'next' });
    expect(hook.result.current.page?.rows).toHaveLength(2);
  });
  it('denies repeated load-more clicks and rejects duplicate source rows', async () => {
    const more = pending<EducationJournalRead>();
    mock.read.mockResolvedValueOnce(summary()).mockResolvedValueOnce(page([row(1)], 'next', 2)).mockReturnValueOnce(more.promise);
    const hook = renderHook(() => useEducationJournalWorkspace(ids.org, scope, 'activity'));
    await waitFor(() => expect(hook.result.current.page).toBeTruthy());
    let loading!: Promise<void>;
    act(() => { loading = hook.result.current.loadMore(); void hook.result.current.loadMore(); });
    expect(mock.read).toHaveBeenCalledTimes(3);
    await act(async () => { more.resolve(page([row(1)], null, 2)); await loading; });
    expect(hook.result.current.page).toBeNull(); expect(hook.result.current.error).toBeTruthy();
  });
  it('clears previously loaded facts when permission is revoked and sends no new read', async () => {
    mock.read.mockResolvedValue(summary());
    const hook = renderHook(({ enabled }) => useEducationJournalWorkspace(ids.org, scope, null, enabled, enabled ? 'allowed' : 'revoked'), { initialProps: { enabled: true } });
    await waitFor(() => expect(hook.result.current.summary).toBeTruthy());
    hook.rerender({ enabled: false });
    expect(hook.result.current.summary).toBeNull(); expect(hook.result.current.page).toBeNull();
    expect(mock.read).toHaveBeenCalledTimes(1);
  });
  it('does not download a completed export after the actor/access context changes', async () => {
    const exportRead = pending<{ page: ReturnType<typeof page>; rows: ReturnType<typeof row>[] }>();
    mock.read.mockResolvedValue(summary()); mock.collect.mockReturnValueOnce(exportRead.promise);
    const hook = renderHook(({ actor }) => useEducationJournalWorkspace(ids.org, scope, null, true, actor), { initialProps: { actor: 'first' } });
    await waitFor(() => expect(hook.result.current.summary).toBeTruthy());
    let exporting!: Promise<void>; act(() => { exporting = hook.result.current.exportExtract('activity'); });
    hook.rerender({ actor: 'second' });
    await act(async () => { exportRead.resolve({ page: page(), rows: [row()] }); await exporting; });
    expect(mock.download).not.toHaveBeenCalled();
  });
  it('reports a changed source and requires refresh rather than showing stale rows', async () => {
    mock.read.mockResolvedValueOnce(summary()).mockResolvedValueOnce(page([row(1)], 'next', 2)).mockRejectedValueOnce({ code: 'SOURCE_CHANGED' });
    const hook = renderHook(() => useEducationJournalWorkspace(ids.org, scope, 'activity'));
    await waitFor(() => expect(hook.result.current.page).toBeTruthy());
    await act(async () => hook.result.current.loadMore());
    expect(hook.result.current.error).toBe('Данные изменились'); expect(hook.result.current.page).toBeNull();
  });
});
