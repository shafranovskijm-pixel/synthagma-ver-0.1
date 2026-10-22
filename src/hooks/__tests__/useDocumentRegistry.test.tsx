import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, base, capabilities, data, filters, incoming, org, record, uid } from '@/lib/documentRegistry/__tests__/fixtures';
const mock = vi.hoisted(() => ({ actor: '00000000-0000-4000-8000-000000000002', organization: '00000000-0000-4000-8000-000000000001', permissions: ['journals.read'], revision: 1, read: vi.fn(), prepare: vi.fn(), plans: [] as any[], runs: [] as any[] }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.actor }, userRole: 'organization', loading: false }) }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({ loading: false, error: null, organizationId: mock.organization, orgRole: 'teacher', adminRole: null, orgPermissions: new Set(mock.permissions), can: (permission: string) => mock.permissions.includes(permission) }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: mock.actor, revision: mock.revision }) }));
vi.mock('@/lib/documentRegistry/client', async () => ({ ...(await import('@/lib/documentRegistry/errors')), captureDocumentRegistryScope: (organizationId: string, registryScope: any, current: () => boolean) => ({ organizationId, registryScope, current }), registryScopeCurrent: (scope: any) => scope.current(), readDocumentRegistry: mock.read, prepareDocumentRegistryMutation: mock.prepare }));
import { useDocumentRegistry } from '../useDocumentRegistry';
import { DocumentRegistryError } from '@/lib/documentRegistry/errors';
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(yes => { resolve = yes; }); return { promise, resolve }; };
const reply = (rows = [record()]) => ({ ...base(), kind: 'list', records: rows, next_cursor: null, counts: { total: rows.length, incoming: 0, outgoing: rows.length, contracts: 0, orders: rows.length } });
beforeEach(() => { vi.clearAllMocks(); mock.actor = actor; mock.organization = org; mock.permissions = ['journals.read']; mock.revision = 1; mock.plans = []; mock.runs = []; mock.read.mockImplementation(async () => reply()); mock.prepare.mockImplementation((_scope: any, expectedRevision: number, action: any) => { const run = vi.fn(async () => { const result = mock.runs.shift(); if (result instanceof Error) throw result; return result; }); const plan = { action: structuredClone(action), expectedRevision, run }; mock.plans.push(plan); return plan; }); });
afterEach(cleanup);
describe('document registry hook lifetimes and source authority', () => {
  it('reads fresh shared records for another account/remount, with no local source of authority', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem'); const first = renderHook(() => useDocumentRegistry(org, { kind: 'organization' })); await waitFor(() => expect(first.result.current.records).toHaveLength(1)); first.unmount();
    mock.actor = uid(99); mock.revision++; const second = renderHook(() => useDocumentRegistry(org, { kind: 'organization' })); await waitFor(() => expect(second.result.current.records).toHaveLength(1)); expect(mock.read).toHaveBeenCalledTimes(2); expect(get).not.toHaveBeenCalled(); get.mockRestore();
  });
  it('rejects an old A response after organization A → B → A', async () => {
    const old = deferred(), fresh = deferred(); let count = 0; mock.read.mockImplementation(() => ++count === 1 ? old.promise : fresh.promise);
    const page = renderHook(({ organizationId }) => useDocumentRegistry(organizationId, { kind: 'organization' }), { initialProps: { organizationId: org } }); const oldScope = mock.read.mock.calls[0][0];
    mock.organization = uid(99); page.rerender({ organizationId: uid(99) }); mock.organization = org; page.rerender({ organizationId: org }); expect(oldScope.current()).toBe(false);
    await act(async () => old.resolve(reply([record(2)]))); expect(page.result.current.records).toHaveLength(0);
    await act(async () => fresh.resolve(reply([record(3)]))); await waitFor(() => expect(page.result.current.records[0]?.id).toBe(record(3).id));
  });
  it('does not let an old filter response replace a newer server-filtered list or counters', async () => {
    const old = deferred(), next = deferred(); let count = 0; mock.read.mockImplementation(() => ++count === 1 ? old.promise : next.promise);
    const page = renderHook(() => useDocumentRegistry(org, { kind: 'organization' })); await act(async () => page.result.current.setFilters({ ...filters, text: 'новая выборка' })); expect(page.result.current.records).toHaveLength(0);
    await act(async () => old.resolve(reply([record(1)]))); expect(page.result.current.records).toHaveLength(0);
    await act(async () => next.resolve(reply([record(2)]))); await waitFor(() => expect(page.result.current.records[0]?.id).toBe(record(2).id)); expect(mock.read.mock.calls.at(-1)[1].filters.text).toBe('новая выборка'); expect(page.result.current.counts.total).toBe(1);
  });
  it('supports docs.write-only incoming capture bootstrap without journal or old-document metadata access', async () => {
    mock.permissions = ['documents.write']; mock.read.mockResolvedValue({ ...base(), capabilities: { ...capabilities, can_read: false, can_read_incoming: false, can_open_file: false, can_register: false, can_register_incoming: false }, kind: 'incoming', incoming: [], next_after_id: null });
    const page = renderHook(() => useDocumentRegistry(org, { kind: 'organization' }, 'incoming')); await waitFor(() => expect(page.result.current.loading).toBe(false));
    expect(mock.read.mock.calls[0][1]).toEqual({ kind: 'incoming', after_id: null, limit: 100 }); expect(page.result.current.incoming).toHaveLength(0); expect(page.result.current.capabilities?.can_capture_incoming).toBe(true);
    await expect(page.result.current.mutate(0, { action: 'register', data: data(), reason: 'Основание' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('masks private source fields on a server capability downgrade before the permission provider changes', async () => {
    const page = renderHook(() => useDocumentRegistry(org, { kind: 'organization' })); await waitFor(() => expect(page.result.current.records).toHaveLength(1));
    mock.read.mockResolvedValue({ ...base(), kind: 'source', source: { label: 'Собственный файл', source: data().source }, capabilities: { ...capabilities, can_open_file: false, can_correct: false } });
    await act(async () => { await page.result.current.read({ kind: 'source', document_id: data().source.document_id, version_id: data().source.version_id }); });
    expect(page.result.current.records[0]).toMatchObject({ source_label: null, source_available: false, can_open_file: false, can_correct: false });
  });
  it('retains one frozen unknown request and rejects new intent until the exact retry is confirmed', async () => {
    const page = renderHook(() => useDocumentRegistry(org, { kind: 'organization' })); await waitFor(() => expect(page.result.current.loading).toBe(false));
    mock.runs.push(new DocumentRegistryError('DEPENDENCY_UNAVAILABLE'), { ...base(), kind: 'register', request_id: uid(50), replayed: true, record: record(2) });
    await act(async () => { await expect(page.result.current.mutate(0, { action: 'register', data: data(), reason: 'Проверено' })).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' }); });
    expect(page.result.current.pending).toBe(true); expect(page.result.current.cancelRejected()).toBe(false); await expect(page.result.current.mutate(0, { action: 'register', data: data(), reason: 'Новая попытка' })).rejects.toMatchObject({ code: 'REQUEST_MISMATCH' });
    await act(async () => { await page.result.current.retry(); }); expect(mock.prepare).toHaveBeenCalledOnce(); expect(mock.plans[0].run).toHaveBeenCalledTimes(2); expect(page.result.current.pending).toBe(false);
    expect(page.result.current.records[0].id).toBe(record().id); await act(async () => page.result.current.reload()); expect(mock.read).toHaveBeenCalledTimes(2);
  });
  it('removes old rows immediately after permission loss and refuses earlier callbacks even when rights return', async () => {
    const page = renderHook(() => useDocumentRegistry(org, { kind: 'organization' })); await waitFor(() => expect(page.result.current.records).toHaveLength(1)); const stale = page.result.current.mutate;
    mock.permissions = []; page.rerender(); expect(page.result.current.records).toHaveLength(0); mock.permissions = ['journals.read']; page.rerender(); await waitFor(() => expect(page.result.current.records).toHaveLength(1));
    await expect(stale(0, { action: 'register', data: data(), reason: 'Основание' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(mock.prepare).not.toHaveBeenCalled();
  });
});
