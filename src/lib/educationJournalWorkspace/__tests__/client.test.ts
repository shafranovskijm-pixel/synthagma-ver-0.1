import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, scope, summary, page } from './fixtures';
import { captureEducationJournalScope, readEducationJournalWorkspace, normalizeEducationJournalError } from '../client';

const mock = vi.hoisted(() => ({ current: true, sessionActor: '', data: null as any, error: null as any, status: 200, header: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/customJournals/client', () => ({ captureCustomJournalScope: (organizationId: string, current: () => boolean) => ({ organizationId, actorId: '10000000-0000-4000-8000-000000000002', accessRevision: 1, current }), customJournalScopeCurrent: (value: any) => mock.current && (!value.current || value.current()) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: mock.sessionActor }, access_token: 'existing-session' } }, error: null }) }, rpc: (...args: unknown[]) => { mock.rpc(...args); return { setHeader: async (...header: unknown[]) => { mock.header(...header); return { data: mock.data, error: mock.error, status: mock.status }; } }; } } }));
beforeEach(() => { mock.current = true; mock.sessionActor = ids.actor; mock.data = summary(); mock.error = null; mock.status = 200; mock.rpc.mockClear(); mock.header.mockClear(); });
const query = { kind: 'rows' as const, journal_type: 'activity' as const, after: null, limit: 100, snapshot_key: null };
describe('education journal subject read', () => {
  it.each(['SOURCE_CHANGED', 'NOT_FOUND', 'LIMIT_EXCEEDED'])('preserves the whitelisted %s reason under SQL22023', code => {
    expect(normalizeEducationJournalError({ code: '22023', message: `UC_EDUCATION_JOURNAL_${code}` }).code).toBe(code);
  });
  it('binds the ordinary existing session and exact organization/subject', async () => {
    const request = captureEducationJournalScope(ids.org, scope);
    await expect(readEducationJournalWorkspace(request, { kind: 'summary' })).resolves.toEqual(summary());
    expect(mock.rpc).toHaveBeenCalledWith('uc_read_education_journal_workspace', { p_organization_id: ids.org, p_scope: scope, p_query: { kind: 'summary' } });
    expect(mock.header).toHaveBeenCalledWith('Authorization', 'Bearer existing-session');
  });
  it('refuses a different actor before the RPC', async () => {
    mock.sessionActor = ids.peer;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, scope), { kind: 'summary' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([ids.peer, null])('refuses a peer or nonpersonal row in student scope (%s)', async userId => {
    mock.data = page(); mock.data.rows[0].student_user_id = userId;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, scope), query)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('refuses a row from another enrollment', async () => {
    mock.data = page(); mock.data.rows[0].enrollment_id = ids.peer;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, scope), query)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it.each(['activity', 'current_control'] as const)('accepts %s with no historical group witness in exact student scope', async type => {
    mock.data = page(); mock.data.journal_type = type; mock.data.rows[0].journal_type = type; mock.data.rows[0].group_id = null; mock.data.rows[0].group_label = null;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, scope), { ...query, journal_type: type })).resolves.toMatchObject({ kind: 'rows' });
  });
  it.each(['activity', 'current_control'] as const)('accepts %s without group witness in current-membership group scope', async type => {
    mock.data = page(); mock.data.scope = { kind: 'group', group_id: ids.group }; mock.data.context.student = null; mock.data.context.enrollment = null;
    mock.data.journal_type = type; mock.data.rows[0].journal_type = type; mock.data.rows[0].group_id = null; mock.data.rows[0].group_label = null;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, { kind: 'group', group_id: ids.group }), { ...query, journal_type: type })).resolves.toMatchObject({ kind: 'rows' });
  });
  it.each([scope, { kind: 'group' as const, group_id: ids.group }])('still rejects a source explicitly bound to another group in $kind scope', async target => {
    mock.data = page(); mock.data.scope = target; mock.data.rows[0].group_id = ids.peer;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, target), query)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it.each([scope, { kind: 'group' as const, group_id: ids.group }])('does not accept a missing group witness for a controlled journal in $kind scope', async target => {
    mock.data = page(); mock.data.scope = target; mock.data.journal_type = 'conducted_sessions'; mock.data.rows[0].journal_type = 'conducted_sessions'; mock.data.rows[0].group_id = null;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, target), { ...query, journal_type: 'conducted_sessions' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('refuses a foreign organization envelope', async () => {
    mock.data = summary(); mock.data.organization_id = ids.peer;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, scope), { kind: 'summary' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('keeps unavailable counts unknown, never a confirmed zero', async () => {
    mock.data = summary(); mock.data.journals[0] = { ...mock.data.journals[0], state: 'unavailable', record_count: 0, exportable: false };
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, scope), { kind: 'summary' })).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
  it('rejects duplicate journal summaries', async () => {
    mock.data = summary(); mock.data.journals.push(mock.data.journals[0]);
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, scope), { kind: 'summary' })).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
  it('rejects changed snapshot witness without exposing server text', async () => {
    mock.data = page();
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, scope), { ...query, snapshot_key: 'older' })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(normalizeEducationJournalError({ message: 'UC_EDUCATION_JOURNAL_SOURCE_CHANGED private values' }).message).toBe('SOURCE_CHANGED');
  });
  it('requires the captured context to remain current after the async RPC', async () => {
    const request = captureEducationJournalScope(ids.org, scope, () => false);
    await expect(readEducationJournalWorkspace(request, { kind: 'summary' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('accepts an organization-level nonpersonal registry row', async () => {
    mock.data = page(); mock.data.scope = { kind: 'organization' }; mock.data.context = { ...mock.data.context, student: null, group: null, enrollment: null }; mock.data.rows[0].student_user_id = null;
    await expect(readEducationJournalWorkspace(captureEducationJournalScope(ids.org, { kind: 'organization' }), query)).resolves.toMatchObject({ kind: 'rows' });
  });
});
