import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packet, summary, uid, actor, org, group } from '@/lib/frdoPackets/__tests__/uiFixtures';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const mock = vi.hoisted(() => ({ actor: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002', revision: 1, permissions: ['documents.read', 'documents.write'], read: vi.fn(), mutate: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.actor }, userRole: 'organization', loading: false }) }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({ loading: false, error: null, organizationId: mock.org, orgRole: 'owner', adminRole: null, orgPermissions: new Set(mock.permissions), can: (p: string) => mock.permissions.includes(p) }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineAuthRevision: () => mock.revision }));
vi.mock('@/hooks/useEducationIssuance', async () => { const { useCallback } = await import('react'); return { useEducationIssuanceScope: (organizationId: string, groupId: string | null, key: string) => useCallback(() => ({ organizationId, actorId: mock.actor, accessRevision: mock.revision, issuanceScope: groupId ? { kind: 'group', group_id: groupId } : { kind: 'organization' }, current: () => true }), [organizationId, groupId, key]) }; });
vi.mock('@/lib/educationIssuance/client', () => ({ issuanceScopeCurrent: (scope: any) => scope.current() }));
vi.mock('@/lib/frdoPackets/client', async original => ({ ...(await original<any>()), readFrdoPackets: mock.read, mutateFrdoPacket: mock.mutate }));
import { useFrdoPackets } from '../useFrdoPackets';
import { FrdoPacketError } from '@/lib/frdoPackets/client';
const deferred = () => { let resolve!: (v: any) => void; const promise = new Promise<any>(yes => { resolve = yes; }); return { promise, resolve }; };
let p: Awaited<ReturnType<typeof packet>>;
beforeEach(async () => { vi.clearAllMocks(); p = await packet(); mock.actor = actor; mock.org = org; mock.revision = 1; mock.permissions = ['documents.read', 'documents.write']; mock.read.mockResolvedValue({ kind: 'packets', packets: [summary(p)], next_cursor: null }); });
afterEach(cleanup);
describe('FRDO hook authorization epochs and exact retry', () => {
  it('keeps an unconfirmed command and retries the identical request without a second generated ID', async () => {
    mock.mutate.mockRejectedValueOnce(new FrdoPacketError('DEPENDENCY_UNAVAILABLE', true)).mockResolvedValueOnce({ packets: [p] });
    const h = renderHook(() => useFrdoPackets(org, group)); await waitFor(() => expect(h.result.current.packets).toHaveLength(1));
    const action = { kind: 'generate_file' as const, packet: p.ref, expected_template: p.capture.source_cas.template };
    await act(async () => { await expect(h.result.current.run(action)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' }); });
    expect(h.result.current.pending?.request_id).toBeTruthy(); const original = mock.mutate.mock.calls[0][1];
    await act(async () => { await h.result.current.run(); }); expect(mock.mutate.mock.calls[1][1]).toEqual(original); expect(h.result.current.pending).toBeNull();
  });
  it('does not mix another action into an unconfirmed request', async () => {
    mock.mutate.mockRejectedValue(new FrdoPacketError('DEPENDENCY_UNAVAILABLE', true)); const h = renderHook(() => useFrdoPackets(org, group)); await waitFor(() => expect(h.result.current.current && !h.result.current.busy).toBe(true));
    await act(async () => { await h.result.current.run({ kind: 'generate_file', packet: p.ref, expected_template: p.capture.source_cas.template }).catch(() => {}); });
    await act(async () => { await expect(h.result.current.run({ kind: 'abandon_correction', packet: p.ref, reason: 'Другой запрос' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' }); }); expect(mock.mutate).toHaveBeenCalledTimes(1);
    act(() => h.result.current.setAsidePending()); expect(h.result.current.pending).toBeNull();
  });
  it('drops A → B → A stale pages and clears visible pupil data before a fresh response', async () => {
    const old = deferred(), fresh = deferred(); let count = 0; mock.read.mockImplementation(() => ++count === 1 ? old.promise : fresh.promise);
    const h = renderHook(({ organizationId }) => useFrdoPackets(organizationId, group), { initialProps: { organizationId: org } });
    h.rerender({ organizationId: uid(999) }); h.rerender({ organizationId: org });
    await act(async () => old.resolve({ kind: 'packets', packets: [summary(p)], next_cursor: null })); expect(h.result.current.packets).toEqual([]);
    await act(async () => fresh.resolve({ kind: 'packets', packets: [], next_cursor: null })); await waitFor(() => expect(h.result.current.busy).toBe(false)); expect(h.result.current.packets).toEqual([]);
  });
  it('clears pending and packet state when actor or access revision changes', async () => {
    mock.mutate.mockRejectedValue(new FrdoPacketError('DEPENDENCY_UNAVAILABLE', true)); const h = renderHook(() => useFrdoPackets(org, group)); await waitFor(() => expect(h.result.current.current).toBe(true));
    await act(async () => { await h.result.current.run({ kind: 'generate_file', packet: p.ref, expected_template: p.capture.source_cas.template }).catch(() => {}); });
    expect(h.result.current.pending).not.toBeNull(); mock.actor = uid(998); mock.revision++; h.rerender(); expect(h.result.current.pending).toBeNull(); expect(h.result.current.packet).toBeNull(); await waitFor(() => expect(h.result.current.busy).toBe(false));
  });
  it('advances an empty opaque page and does not persist PII in local storage', async () => {
    const cursor = 'v1.' + 'a'.repeat(64), get = vi.spyOn(Storage.prototype, 'getItem'); mock.read.mockResolvedValueOnce({ kind: 'packets', packets: [], next_cursor: cursor }).mockResolvedValueOnce({ kind: 'packets', packets: [summary(p)], next_cursor: null });
    const h = renderHook(() => useFrdoPackets(org, group)); await waitFor(() => expect(h.result.current.after).toBe(cursor)); await act(async () => h.result.current.refresh(true)); expect(mock.read.mock.calls[1][1].after_cursor).toBe(cursor); expect(h.result.current.packets).toHaveLength(1); expect(get).not.toHaveBeenCalled(); get.mockRestore();
  });
});
