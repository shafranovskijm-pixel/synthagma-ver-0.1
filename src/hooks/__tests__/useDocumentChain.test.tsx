import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { id, list, org, pupil, target } from '@/lib/documentChain/__tests__/fixtures';
const m = vi.hoisted(() => ({ read: vi.fn(), captured: [] as any[] }));
vi.mock('@/lib/documentChain/client', () => ({
  captureDocumentChainScope: (_organizationId: string, _target: unknown, current: () => boolean, signal: AbortSignal) => { const scope = { current, signal }; m.captured.push(scope); return scope; },
  documentChainScopeCurrent: (scope: any) => !scope.signal.aborted && scope.current(),
  normalizeChainError: () => new Error('Не удалось подтвердить документы.'), readDocumentChain: m.read,
}));
import { useDocumentChain } from '../useDocumentChain';
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { vi.clearAllMocks(); m.captured = []; });
describe('document chain request lifetime', () => {
  it('discards a delayed prior student response after switching cards', async () => {
    const first = deferred(), second = deferred(); m.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = renderHook(({ pupil }) => useDocumentChain(org, { kind: 'student', student_user_id: pupil, enrollment_id: null, group_id: null }, true, 'access1'), { initialProps: { pupil } });
    await waitFor(() => expect(m.read).toHaveBeenCalledTimes(1)); view.rerender({ pupil: id(90) });
    await waitFor(() => expect(m.read).toHaveBeenCalledTimes(2)); expect(m.captured[0].signal.aborted).toBe(true);
    await act(async () => { first.resolve(list()); await first.promise; }); expect(view.result.current.rows).toEqual([]);
    const fresh = list(); fresh.rows[0].student_user_id = id(90); fresh.rows[0].course_label = 'Новое обучение';
    await act(async () => { second.resolve(fresh); await second.promise; }); expect(view.result.current.rows[0].course_label).toBe('Новое обучение');
  });
  it('does not repeat a read for equivalent scope objects on render', async () => {
    m.read.mockResolvedValue(list()); const view = renderHook(({ tick }) => useDocumentChain(org, { ...target }, true, String(tick > -1)), { initialProps: { tick: 0 } });
    await waitFor(() => expect(view.result.current.loading).toBe(false)); view.rerender({ tick: 1 }); expect(m.read).toHaveBeenCalledTimes(1);
  });
  it('invalidates and aborts on a changed access key', async () => {
    const first = deferred(); m.read.mockReturnValue(first.promise);
    const view = renderHook(({ access }) => useDocumentChain(org, target, true, access), { initialProps: { access: 'before' } });
    await waitFor(() => expect(m.read).toHaveBeenCalledTimes(1)); view.rerender({ access: 'after' });
    await waitFor(() => expect(m.read).toHaveBeenCalledTimes(2)); expect(m.captured[0].signal.aborted).toBe(true);
    await act(async () => { first.resolve(list()); await first.promise; });
  });
  it('never starts a disabled projection and aborts when unmounted', async () => {
    const request = deferred(); m.read.mockReturnValue(request.promise);
    const view = renderHook(({ enabled }) => useDocumentChain(org, target, enabled, 'access'), { initialProps: { enabled: false } });
    expect(m.read).not.toHaveBeenCalled(); view.rerender({ enabled: true }); await waitFor(() => expect(m.read).toHaveBeenCalledOnce());
    view.unmount(); expect(m.captured[0].signal.aborted).toBe(true);
    await act(async () => { request.resolve(list()); await request.promise; });
  });
  it('requests strict self replies for a genuine own-view projection', async () => {
    m.read.mockResolvedValue(list()); const view = renderHook(() => useDocumentChain(org, target, true, 'self-access', true));
    await waitFor(() => expect(view.result.current.loading).toBe(false)); expect(m.captured[0].expectedViewer).toBe('self');
  });
});
