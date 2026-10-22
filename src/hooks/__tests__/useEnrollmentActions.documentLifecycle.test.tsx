import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, org, pupil, uid } from '@/lib/documentRegistry/__tests__/fixtures';
const mock = vi.hoisted(() => ({ from: vi.fn(), fetch: vi.fn(), insert: vi.fn(), generate: vi.fn(), current: true, delete: vi.fn(), update: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn(), invalidate: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mock.invalidate }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mock.from } }));
vi.mock('@/api/students', () => ({ fetchStudentsByUserIds: mock.fetch, deleteStudent: vi.fn() }));
vi.mock('@/api/enrollments', () => ({ insertEnrollmentsVerified: mock.insert, EnrollmentPersistenceError: class extends Error {} }));
vi.mock('@/utils/generateEnrollmentOrder', () => ({ generateEnrollmentOrder: mock.generate }));
vi.mock('@/lib/customJournals/client', () => ({ captureCustomJournalScope: (organizationId: string, current: () => boolean) => ({ organizationId, actorId: '00000000-0000-4000-8000-000000000002', accessRevision: 1, current }), customJournalScopeCurrent: (scope: any) => mock.current && (!scope.current || scope.current()) }));
vi.mock('sonner', () => ({ toast: { error: mock.error, info: mock.info, success: mock.success, warning: vi.fn() } }));
import { useEnrollmentActions } from '../useEnrollmentActions';
let rows: any[];
beforeEach(() => { vi.clearAllMocks(); mock.current = true; rows = [{ id: uid(7), user_id: pupil, course_id: uid(8), status: 'active', progress: 100, courses: { title: 'Фактический курс', organization_id: org } }]; mock.fetch.mockResolvedValue({ students: [{ user_id: pupil, name: 'Подтверждённый ученик' }] }); mock.insert.mockResolvedValue([{ id: uid(7), user_id: pupil, course_id: uid(8) }]); mock.from.mockImplementation(() => { let columns = ''; const chain: any = { select: vi.fn((value: string) => { columns = value; return chain; }), eq: vi.fn(() => chain), in: vi.fn(async () => ({ data: columns === 'user_id' ? [] : rows, error: null })), delete: mock.delete, update: mock.update }; return chain; }); });
afterEach(cleanup);
describe('enrollment facts are distinct from document issuance', () => {
  it('confirms actual enrollment persistence and clearly reports that no automatic numbered order was created', async () => {
    const changed = vi.fn(), hook = renderHook(() => useEnrollmentActions(org, 'QA организация', changed, vi.fn()));
    await act(async () => expect(await hook.result.current.bulkEnroll(uid(8), [pupil], [{ id: uid(8), title: 'Курс' }] as any)).toBe(true));
    expect(mock.insert).toHaveBeenCalledWith([{ user_id: pupil, course_id: uid(8), status: 'active', progress: 0 }]); expect(mock.generate).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalledWith('org_documents'); expect(mock.from).not.toHaveBeenCalledWith('organizations');
    expect(mock.info).toHaveBeenCalledWith(expect.stringContaining('Приказ автоматически не оформлен')); expect(changed).toHaveBeenCalledOnce();
  });
  it('prepares exact enrollment/user/course facts without deleting, changing status/progress or claiming an expulsion', async () => {
    const changed = vi.fn(), hook = renderHook(() => useEnrollmentActions(org, 'QA', changed, vi.fn()));
    await act(async () => expect(await hook.result.current.bulkUnenroll([uid(7)])).toBe(true));
    expect(hook.result.current.withdrawalPreparation?.rows).toEqual([{ enrollment_id: uid(7), user_id: pupil, course_id: uid(8), student_name: 'Подтверждённый ученик', course_title: 'Фактический курс', status: 'active', progress: 100 }]);
    expect(mock.delete).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled(); expect(mock.insert).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled(); expect(rows[0]).toMatchObject({ status: 'active', progress: 100 }); expect(mock.info).toHaveBeenCalledWith(expect.stringContaining('приказ и событие отчисления не создавались'));
  });
  it.each(['missing', 'foreign-org', 'missing-profile'])('refuses %s preparation without changing or inventing data', async fault => {
    if (fault === 'missing') rows = []; if (fault === 'foreign-org') rows[0].courses.organization_id = uid(99); if (fault === 'missing-profile') mock.fetch.mockResolvedValue({ students: [] });
    const hook = renderHook(() => useEnrollmentActions(org, 'QA', vi.fn(), vi.fn())); await act(async () => expect(await hook.result.current.bulkUnenroll([uid(7)])).toBe(false)); expect(hook.result.current.withdrawalPreparation).toBeNull(); expect(mock.delete).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled();
  });
  it('discards preparation after actor access changes while profiles are loading', async () => {
    mock.fetch.mockImplementation(async () => { mock.current = false; return { students: [{ user_id: pupil, name: 'Подтверждённый ученик' }] }; }); const hook = renderHook(() => useEnrollmentActions(org, 'QA', vi.fn(), vi.fn()));
    await act(async () => expect(await hook.result.current.bulkUnenroll([uid(7)])).toBe(false)); expect(hook.result.current.withdrawalPreparation).toBeNull(); expect(mock.info).not.toHaveBeenCalled(); expect(mock.delete).not.toHaveBeenCalled();
  });
  it('clears an earlier preparation when a different enrollment selection is staged, without changing the preserved records', async () => {
    const hook = renderHook(() => useEnrollmentActions(org, 'QA', vi.fn(), vi.fn())); await act(async () => { await hook.result.current.bulkUnenroll([uid(7)]); }); expect(hook.result.current.withdrawalPreparation?.rows[0].enrollment_id).toBe(uid(7));
    act(() => hook.result.current.setSelectedEnrollmentIds([uid(99)])); expect(hook.result.current.withdrawalPreparation).toBeNull(); expect(hook.result.current.selectedEnrollmentIds).toEqual([uid(99)]); expect(rows[0].id).toBe(uid(7)); expect(mock.delete).not.toHaveBeenCalled();
  });

});
