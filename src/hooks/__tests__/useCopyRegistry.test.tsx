import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, base, data, org, record, uid } from '@/lib/copyRegistry/__tests__/fixtures';

const mock = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000002', organization: '00000000-0000-4000-8000-000000000001', readAllowed: true, role: 'organization', revision: 1,
  read: vi.fn(), prepare: vi.fn(), plans: [] as any[], runs: [] as any[],
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.actor }, userRole: mock.role, loading: false }) }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({ loading: false, error: null, organizationId: mock.organization, isOrgOwner: false, orgRole: 'owner', adminRole: null, orgPermissions: new Set(mock.readAllowed ? ['journals.read'] : []), can: () => mock.readAllowed }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ userId: mock.actor, revision: mock.revision }) }));
vi.mock('@/lib/copyRegistry/client', async () => {
  const errors = await import('@/lib/copyRegistry/errors');
  return { ...errors, captureCopyRegistryScope: (organizationId: string, registryScope: any, current: () => boolean) => ({ organizationId, registryScope, current }), copyRegistryScopeCurrent: (scope: any) => scope.current(), readCopyRegistry: mock.read, prepareCopyRegistryMutation: mock.prepare };
});
import { useCopyRegistry } from '../useCopyRegistry';
import { CopyRegistryError } from '@/lib/copyRegistry/errors';

const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const reply = (rows = [record()]) => ({ ...base(), kind: 'list', records: rows, next_after_id: null });
beforeEach(() => {
  vi.clearAllMocks(); mock.actor = actor; mock.organization = org; mock.readAllowed = true; mock.role = 'organization'; mock.revision = 1; mock.plans = []; mock.runs = [];
  mock.read.mockImplementation(async () => reply());
  mock.prepare.mockImplementation((scope: any, expectedRevision: number, action: any) => {
    const run = vi.fn(async () => { const result = mock.runs.shift(); if (result instanceof Error) throw result; return result; });
    const plan = { requestId: uid(50 + mock.plans.length), action: structuredClone(action), expectedRevision, run }; mock.plans.push(plan); return plan;
  });
});
afterEach(cleanup);
describe('live server copy registry hook lifetimes and uncertain mutations', () => {
  it('reloads the server for another user and a remount, never reading the old local journal', async () => {
    const readLocal = vi.spyOn(Storage.prototype, 'getItem');
    const first = renderHook(() => useCopyRegistry(org, { kind: 'organization' }));
    await waitFor(() => expect(first.result.current.records).toHaveLength(1)); first.unmount();
    mock.actor = uid(999); mock.revision++;
    const second = renderHook(() => useCopyRegistry(org, { kind: 'organization' })); await waitFor(() => expect(second.result.current.records).toHaveLength(1));
    expect(mock.read).toHaveBeenCalledTimes(2); expect(readLocal).not.toHaveBeenCalledWith('copies_duplicates_' + org); readLocal.mockRestore();
  });
  it('discards an outstanding A read after organization A → B → A and only admits the fresh A read', async () => {
    const old = deferred<any>(), fresh = deferred<any>(); let count = 0;
    mock.read.mockImplementation(() => ++count === 1 ? old.promise : fresh.promise);
    const page = renderHook(({ organizationId }) => useCopyRegistry(organizationId, { kind: 'organization' }), { initialProps: { organizationId: org } });
    const oldScope = mock.read.mock.calls[0][0]; mock.organization = uid(999); page.rerender({ organizationId: uid(999) }); mock.organization = org; page.rerender({ organizationId: org });
    expect(oldScope.current()).toBe(false); expect(page.result.current.records).toHaveLength(0);
    await act(async () => old.resolve(reply([record(2)]))); expect(page.result.current.records).toHaveLength(0);
    await act(async () => fresh.resolve(reply([record(3)]))); await waitFor(() => expect(page.result.current.records[0]?.id).toBe(record(3).id));
  });
  it('masks rows immediately on permission removal and rejects old callbacks even after the permission returns', async () => {
    const page = renderHook(() => useCopyRegistry(org, { kind: 'organization' })); await waitFor(() => expect(page.result.current.records).toHaveLength(1));
    const oldMutation = page.result.current.mutate; mock.readAllowed = false; page.rerender(); expect(page.result.current.records).toHaveLength(0); expect(page.result.current.error).toBe('ACCESS_DENIED');
    mock.readAllowed = true; page.rerender(); await waitFor(() => expect(page.result.current.records).toHaveLength(1));
    await expect(oldMutation(0, { action: 'create', data: data() })).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it('retains one uncertain request, prevents duplicate intent and retries the same frozen plan', async () => {
    const page = renderHook(() => useCopyRegistry(org, { kind: 'organization' })); await waitFor(() => expect(page.result.current.loading).toBe(false));
    mock.runs.push(new CopyRegistryError('DEPENDENCY_UNAVAILABLE'), { ...base(), kind: 'create', request_id: uid(50), replayed: true, record: record(2) });
    await act(async () => { await expect(page.result.current.mutate(0, { action: 'create', data: data(2) })).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' }); });
    expect(page.result.current.pending).toBe(true); expect(page.result.current.cancelRejected()).toBe(false);
    await expect(page.result.current.mutate(0, { action: 'create', data: data(3) })).rejects.toMatchObject({ code: 'REQUEST_MISMATCH' });
    await act(async () => { await page.result.current.retry(); });
    expect(mock.prepare).toHaveBeenCalledOnce(); expect(mock.plans[0].run).toHaveBeenCalledTimes(2); expect(page.result.current.pending).toBe(false); expect(page.result.current.records.some(row => row.id === record(2).id)).toBe(true);
  });
  it('keeps a bounded-contention create for same-ID retry, but permits explicit cancellation of the known rejection', async () => {
    const page = renderHook(() => useCopyRegistry(org, { kind: 'organization' })); await waitFor(() => expect(page.result.current.loading).toBe(false)); mock.runs.push(new CopyRegistryError('REVISION_CONFLICT'));
    await act(async () => { await expect(page.result.current.mutate(0, { action: 'create', data: data() })).rejects.toBeDefined(); });
    expect(page.result.current.pending).toBe(true); act(() => { expect(page.result.current.cancelRejected()).toBe(true); }); expect(page.result.current.pending).toBe(false);
  });
  it('clears sensitive rows when the server revokes access during a detail request', async () => {
    const page = renderHook(() => useCopyRegistry(org, { kind: 'organization' })); await waitFor(() => expect(page.result.current.records).toHaveLength(1)); mock.read.mockRejectedValueOnce(new CopyRegistryError('ACCESS_DENIED'));
    await act(async () => { await expect(page.result.current.read({ kind: 'detail', record_id: record().id })).rejects.toBeDefined(); });
    expect(page.result.current.records).toHaveLength(0); expect(page.result.current.capabilities).toBeNull();
  });
  it('masks cached private titles and stale actions on a fresh server capability downgrade before provider refresh', async () => {
    const privateRow = { ...record(), original_label: 'Private title loaded earlier', original_available: true, can_edit: true, can_transfer: true };
    mock.read.mockResolvedValueOnce(reply([privateRow]));
    const page = renderHook(() => useCopyRegistry(org, { kind: 'organization' })); await waitFor(() => expect(page.result.current.records[0]?.original_label).toBe(privateRow.original_label));
    mock.read.mockResolvedValueOnce({ ...base(), capabilities: { ...base().capabilities, can_create: false, can_write: false, can_import: false }, kind: 'exports', exports: [], next_after_id: null });
    await act(async () => { await page.result.current.read({ kind: 'exports', after_id: null, limit: 100 }); });
    expect(page.result.current.records[0]).toMatchObject({ original_label: null, original_available: false, can_edit: false, can_transfer: false, can_archive: false });
    expect(page.result.current.records[0].recipient_label).toBe(privateRow.recipient_label);
  });
});
