import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { actor, base, data, group, org, preview, record, sha, uid } from './fixtures';

const mock = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), current: true, afterAuth: null as null | (() => void), afterRpc: null as null | (() => void), queue: [] as any[], calls: [] as any[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mock.session }, rpc: mock.rpc } }));
vi.mock('@/lib/customJournals/client', () => ({ captureCustomJournalScope: (organizationId: string, current?: () => boolean) => ({ organizationId, actorId: '00000000-0000-4000-8000-000000000002', current }), customJournalScopeCurrent: (scope: any) => mock.current && (!scope.current || scope.current()) }));
import { captureCopyRegistryScope, prepareCopyRegistryMutation, readCopyRegistry } from '../client';
import { copyActionSchema, copyReadSchema } from '../contract';

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('crypto', webcrypto); mock.current = true; mock.afterAuth = null; mock.afterRpc = null; mock.queue = []; mock.calls = [];
  mock.session.mockImplementation(async () => { mock.afterAuth?.(); return { data: { session: { user: { id: actor }, access_token: 'synthetic-only' } }, error: null }; });
  mock.rpc.mockImplementation((name: string, args: any) => ({ setHeader: async (header: string, token: string) => { mock.calls.push({ name, args: structuredClone(args), header, token }); const result = mock.queue.shift(); mock.afterRpc?.(); return { status: 200, error: null, ...result }; } }));
});
afterEach(() => vi.unstubAllGlobals());
const scope = () => captureCopyRegistryScope(org, { kind: 'organization' });
const listQuery = { kind: 'list' as const, after_id: null, limit: 100, archived: true };
const listReply = (records = [record()]) => ({ ...base(), kind: 'list', records, next_after_id: null });

describe('authoritative copy registry client', () => {
  it('binds a fresh authenticated bearer, organization and exact scope to every request', async () => {
    mock.queue.push({ data: listReply() });
    await expect(readCopyRegistry(scope(), listQuery)).resolves.toMatchObject({ records: [{ id: record().id }] });
    expect(mock.calls[0]).toEqual({ name: 'read_copy_registry', args: { p_org: org, p_scope: { kind: 'organization' }, p_query: listQuery }, header: 'Authorization', token: 'Bearer synthetic-only' });
  });
  it.each(['before', 'after-auth', 'after-rpc'])('refuses a stale actor at %s boundary', async when => {
    const captured = scope(); mock.queue.push({ data: listReply() });
    if (when === 'before') mock.current = false;
    if (when === 'after-auth') mock.afterAuth = () => { mock.current = false; };
    if (when === 'after-rpc') mock.afterRpc = () => { mock.current = false; };
    await expect(readCopyRegistry(captured, listQuery)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    if (when !== 'after-rpc') expect(mock.calls).toHaveLength(0);
  });
  it('rejects a different authenticated account before the RPC', async () => {
    mock.session.mockResolvedValue({ data: { session: { user: { id: uid(999) }, access_token: 'other-account' } }, error: null });
    await expect(readCopyRegistry(scope(), listQuery)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(['organization', 'scope', 'group-row', 'group-raw-access', 'cursor', 'order', 'extra-field'])('rejects a mismatched %s response', async fault => {
    let captured = scope(); const reply: any = listReply();
    if (fault === 'organization') reply.organization_id = uid(999);
    if (fault === 'scope') reply.scope = { kind: 'group', group_id: group };
    if (fault.startsWith('group-')) { captured = captureCopyRegistryScope(org, { kind: 'group', group_id: group }); Object.assign(reply, base({ kind: 'group', group_id: group })); reply.records[0].group_id = fault === 'group-row' ? uid(999) : group; if (fault === 'group-raw-access') reply.capabilities.can_inventory_local = true; }
    if (fault === 'cursor') reply.next_after_id = uid(999);
    if (fault === 'order') reply.records = [record(2), record(1)];
    if (fault === 'extra-field') reply.records[0].file_url = 'private-path';
    mock.queue.push({ data: reply }); await expect(readCopyRegistry(captured, listQuery)).rejects.toBeDefined();
  });
  it('does not invent a verified original, official issue or implicit transfer', () => {
    const unverified = preview().rows[0].candidate!;
    expect(copyActionSchema.safeParse({ action: 'create', data: unverified }).success).toBe(false);
    expect(copyActionSchema.safeParse({ action: 'update', record_id: record().id, data: unverified, reason: 'Исправление исторической записи' }).success).toBe(true);
    expect(copyReadSchema.safeParse({ ...listReply(), records: [{ ...record(), transfers: [] }] }).success).toBe(false);
    expect(copyActionSchema.safeParse({ action: 'transfer', record_id: record().id, reason: 'Основание', transfer: { method: 'mail', reported_date: '2026-02-30', note: 'Со слов сотрудника', evidence: null } }).success).toBe(false);
  });
  it('retries exactly the frozen request and payload after an uncertain transport response', async () => {
    const input = data(), id = uid(50); const plan = prepareCopyRegistryMutation(scope(), 0, { action: 'create', data: input }, id);
    input.notes = 'a later edit must not change the uncertain request';
    mock.queue.push({ error: { code: 'NETWORK', message: 'unavailable' } }, { data: { ...base(), kind: 'create', request_id: id, replayed: true, record: record() } });
    await expect(plan.run()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' }); await expect(plan.run()).resolves.toMatchObject({ replayed: true });
    expect(mock.calls[1].args).toEqual(mock.calls[0].args); expect(mock.calls[1].args.p_action.data.notes).toBe(''); expect(mock.calls[1].args.p_request_id).toBe(id);
  });
  it('preserves a same-ID create retry after bounded server contention', async () => {
    const id = uid(50), plan = prepareCopyRegistryMutation(scope(), 0, { action: 'create', data: data() }, id);
    mock.queue.push({ status: 409, error: { code: 'PT409', message: 'COPY_REGISTRY_REVISION_CONFLICT' } }, { data: { ...base(), kind: 'create', request_id: id, replayed: false, record: record() } });
    await expect(plan.run()).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); await expect(plan.run()).resolves.toMatchObject({ record: { sequence_number: 1 } });
    expect(mock.calls[1].args).toEqual(mock.calls[0].args);
  });
  it.each(['wrong-id', 'wrong-data', 'wrong-revision', 'wrong-actor'])('refuses an unbound %s mutation receipt', async fault => {
    const id = uid(50), row: any = record(); let plan;
    if (fault === 'wrong-actor') { row.revision = 2; row.latest_transfer = { method: 'mail', reported_date: '2026-10-21', note: 'Отправлено', evidence: null, recorded_at: '2026-10-22T05:00:00.000Z', recorded_by: uid(999) }; plan = prepareCopyRegistryMutation(scope(), 1, { action: 'transfer', record_id: row.id, reason: 'Запись передачи', transfer: { method: 'mail', reported_date: '2026-10-21', note: 'Отправлено', evidence: null } }, id); }
    else { plan = prepareCopyRegistryMutation(scope(), 0, { action: 'create', data: data() }, id); if (fault === 'wrong-data') row.data.notes = 'unexpected'; if (fault === 'wrong-revision') row.revision = 2; }
    mock.queue.push({ data: { ...base(), kind: fault === 'wrong-actor' ? 'transfer' : 'create', request_id: fault === 'wrong-id' ? uid(999) : id, replayed: false, record: row } });
    await expect(plan.run()).rejects.toBeDefined();
  });
  it('rejects partial import previews, changed raw bytes, and silently empty invalid JSON', async () => {
    for (const variant of ['partial', 'raw-changed', 'invalid-empty']) {
      const value = preview(101);
      if (variant === 'partial') { value.rows = value.rows.slice(0, 100); value.row_count = 100; }
      if (variant === 'raw-changed') value.source_raw += ' ';
      if (variant === 'invalid-empty') { value.source_raw = '{broken'; value.source_sha256 = sha(value.source_raw); value.rows = []; value.row_count = 0; }
      mock.queue.push({ data: { ...base(), kind: 'import', import: value } });
      await expect(readCopyRegistry(scope(), { kind: 'import', import_id: value.id })).rejects.toBeDefined();
    }
  });
  it('preserves explicit whole-source JSONB refusal with exact raw hash, even for a syntactically valid JS array', async () => {
    const value = preview(2); value.source_raw = '[{"x":"\\u0000"},{"x":2}]'; value.source_sha256 = sha(value.source_raw); value.row_count = 1;
    value.rows = [{ index: 0, source_digest: value.source_sha256, legacy_id: null, conflicts: ['UNSUPPORTED_FORMAT'], valid: false, existing_id: null, candidate: null, unknown_fields: [] }];
    mock.queue.push({ data: { ...base(), kind: 'import', import: value } });
    await expect(readCopyRegistry(scope(), { kind: 'import', import_id: value.id })).resolves.toMatchObject({ import: { source_raw: value.source_raw, row_count: 1 } });
  });
  it('refuses a transfer receipt bound to another record and a different history stream', async () => {
    const row = record(); mock.queue.push({ data: { ...base(), kind: 'history', history: [{ id: uid(99), record_id: uid(999), revision: 1, action: 'create', reason: '', snapshot: { data: row.data, archived: false, latest_transfer: null }, recorded_at: row.registered_at, recorded_by: actor, recorded_by_label: null }], next_after_revision: null } });
    await expect(readCopyRegistry(scope(), { kind: 'history', record_id: row.id, after_revision: null, limit: 100 })).rejects.toBeDefined();
  });
  it('allows nullable erased staff attribution while preserving the actual subject, recipient and explicit transfer event', async () => {
    const row = record(); row.recorded_by = null; row.recorded_by_label = null;
    row.data.subject = { kind: 'person', user_id: uid(800) }; row.data.recipient = { kind: 'person', user_id: uid(801) };
    row.latest_transfer = { method: 'mail', reported_date: '2026-10-21', note: 'Сообщение о передаче', evidence: null, recorded_at: row.registered_at, recorded_by: null };
    mock.queue.push({ data: listReply([row]) });
    await expect(readCopyRegistry(scope(), listQuery)).resolves.toMatchObject({ records: [{ recorded_by: null, data: { subject: { user_id: uid(800) }, recipient: { user_id: uid(801) } }, latest_transfer: { recorded_by: null } }] });
  });
});
