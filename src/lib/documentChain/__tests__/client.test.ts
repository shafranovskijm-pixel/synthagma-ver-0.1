import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, course, enrollment, envelope, group, id, list, org, pupil, row, source, target } from './fixtures';
const m = vi.hoisted(() => ({ actor: '', revision: 1, result: null as any, session: vi.fn(), rpc: vi.fn(), headers: vi.fn(), abort: vi.fn() }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: m.actor, revision: m.revision }), isOfflineActorCurrent: (a: string, r: number) => a === m.actor && r === m.revision }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: m.session }, rpc: m.rpc } }));
import { captureDocumentChainScope, readDocumentChain } from '../client';
const scoped = (scope = target) => captureDocumentChainScope(org, scope, () => true);
const query = { kind: 'list' as const, after_enrollment_id: null, limit: 20 };
beforeEach(() => {
  vi.clearAllMocks(); m.actor = actor; m.revision = 1; m.result = { data: list(), error: null };
  m.session.mockImplementation(async () => ({ data: { session: { user: { id: m.actor }, access_token: 'synthetic-session' } }, error: null }));
  m.rpc.mockImplementation(() => { const pending: any = { setHeader: (...args: unknown[]) => { m.headers(...args); return pending; }, abortSignal: (signal: AbortSignal) => { m.abort(signal); return pending; }, then: (yes: any, no: any) => Promise.resolve(m.result).then(yes, no) }; return pending; });
});
describe('scoped document chain read', () => {
  it('uses the genuine scoped bearer and returns unregistered drafts as such', async () => {
    m.result.data.rows[0].admission_order = { ...m.result.data.rows[0].admission_order, state: 'needs_information', why_code: 'ambiguous_group', why: 'Выберите группу для этого обучения.' };
    const value = await readDocumentChain(scoped(), query);
    expect(value.kind === 'list' && value.rows[0].admission_order.state).toBe('needs_information');
    expect(m.rpc).toHaveBeenCalledWith('uc_read_document_chain', { p_organization_id: org, p_scope: target, p_query: query });
    expect(m.headers).toHaveBeenCalledWith('Authorization', 'Bearer synthetic-session');
  });
  it.each(['organization', 'student', 'enrollment', 'group'])('rejects a reply for another %s', async changed => {
    const scope = { ...target, enrollment_id: enrollment, group_id: group };
    m.result.data.scope = scope;
    if (changed === 'organization') m.result.data.organization_id = id(90);
    if (changed === 'student') m.result.data.rows[0].student_user_id = id(90);
    if (changed === 'enrollment') m.result.data.rows[0].enrollment_id = id(90);
    if (changed === 'group') m.result.data.rows[0].group_id = id(90);
    await expect(readDocumentChain(scoped(scope), query)).rejects.toBeDefined();
  });
  it('does not call the server after the actor access revision changed', async () => {
    const captured = scoped(); m.revision++;
    await expect(readDocumentChain(captured, query)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(m.rpc).not.toHaveBeenCalled();
  });
  it('discards a delayed reply after the actor changed', async () => {
    let finish!: (value: any) => void; m.result = new Promise(resolve => { finish = resolve; });
    const result = readDocumentChain(scoped(), query); await vi.waitFor(() => expect(m.rpc).toHaveBeenCalledOnce());
    m.actor = id(90); finish({ data: list(), error: null });
    await expect(result).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('cancels a scoped request and never accepts its later data', async () => {
    const controller = new AbortController(); let finish!: (value: any) => void;
    m.result = new Promise(resolve => { finish = resolve; });
    const result = readDocumentChain(captureDocumentChainScope(org, target, () => true, controller.signal), query);
    await vi.waitFor(() => expect(m.abort).toHaveBeenCalledWith(controller.signal)); controller.abort(); finish({ data: list(), error: null });
    await expect(result).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('preserves an unavailable result instead of accepting a fabricated zero', async () => {
    m.result.data = { ...list(), availability: 'unavailable', why: 'Источник временно недоступен.', rows: [], total_count: null };
    await expect(readDocumentChain(scoped(), query)).resolves.toMatchObject({ availability: 'unavailable', total_count: null });
    m.result.data.total_count = 0;
    await expect(readDocumentChain(scoped(), query)).rejects.toBeDefined();
  });
  it('accepts a server-confirmed unique group when detail has no explicit group filter', async () => {
    const scope = { ...target, enrollment_id: enrollment };
    m.result.data = { ...envelope(scope), kind: 'detail', availability: 'available', why: null, row: row() };
    await expect(readDocumentChain(scoped(scope), { kind: 'detail', enrollment_id: enrollment, group_id: null })).resolves.toMatchObject({ row: { group_id: group } });
  });
  it('rejects repeated pagination identifiers and a mismatched continuation', async () => {
    m.result.data.rows.push(row()); m.result.data.total_count = 2;
    await expect(readDocumentChain(scoped(), query)).rejects.toBeDefined();
    m.result.data = list(); m.result.data.next_after_enrollment_id = id(91);
    await expect(readDocumentChain(scoped(), query)).rejects.toBeDefined();
  });
  it('rejects a swapped source revision before any file API can run', async () => {
    const value = source(); m.result.data = value; value.target = { kind: 'registry_record', record_id: id(8), revision: 3 };
    await expect(readDocumentChain(scoped(), { kind: 'source', enrollment_id: enrollment, group_id: group, source: value.source })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('never opens a complete registry group order for the self viewer', async () => {
    m.actor = pupil; const value: any = source(); value.viewer = 'self'; m.result.data = value;
    await expect(readDocumentChain(scoped(), { kind: 'source', enrollment_id: enrollment, group_id: group, source: value.source })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('rejects a staff projection for an explicitly own-only request', async () => {
    m.actor = pupil; const scope = scoped(); scope.expectedViewer = 'self';
    await expect(readDocumentChain(scope, query)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('accepts an unsupported journal source only as explicitly unavailable with no made-up identity', async () => {
    const q = { kind: 'journal_source' as const, journal_type: 'activity' as const, row_id: 'lesson:synthetic', source_id: id(15), source_revision: null, enrollment_id: enrollment, group_id: null };
    m.result.data = { ...envelope(), kind: 'journal_source', availability: 'unavailable', why: 'Откройте персональную выписку журнала.', source: null, target: null, context: { organization_id: org, student_user_id: pupil, enrollment_id: enrollment, course_id: course, group_id: null } };
    await expect(readDocumentChain(scoped(), q)).resolves.toMatchObject({ source: null, target: null });
  });
  it('refuses an arbitrary source URL or unknown input without a request', async () => {
    await expect(readDocumentChain(scoped(), { kind: 'source', enrollment_id: enrollment, group_id: group, source: { kind: 'url', url: 'https://foreign.invalid' } } as any)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
