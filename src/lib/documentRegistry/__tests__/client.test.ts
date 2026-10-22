import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { actor, base, capabilities, data, filters, group, incoming, legacy, org, pupil, record, source, uid } from './fixtures';
const mock = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), current: true, afterAuth: null as null | (() => void), afterRpc: null as null | (() => void), queue: [] as any[], calls: [] as any[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mock.session }, rpc: mock.rpc } }));
vi.mock('@/lib/customJournals/client', () => ({ captureCustomJournalScope: (organizationId: string, current?: () => boolean) => ({ organizationId, actorId: '00000000-0000-4000-8000-000000000002', current }), customJournalScopeCurrent: (scope: any) => mock.current && (!scope.current || scope.current()) }));
import { captureDocumentRegistryScope, prepareDocumentRegistryMutation, readDocumentRegistry } from '../client';
import { registryActionSchema, registryReadSchema } from '../contract';
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('crypto', webcrypto); mock.current = true; mock.afterAuth = null; mock.afterRpc = null; mock.queue = []; mock.calls = [];
  mock.session.mockImplementation(async () => { mock.afterAuth?.(); return { data: { session: { user: { id: actor }, access_token: 'synthetic-only' } }, error: null }; });
  mock.rpc.mockImplementation((name: string, args: any) => ({ setHeader: async (header: string, token: string) => { mock.calls.push({ name, args: structuredClone(args), header, token }); const value = mock.queue.shift(); mock.afterRpc?.(); return { status: 200, error: null, ...value }; } }));
});
afterEach(() => vi.unstubAllGlobals());
const scope = () => captureDocumentRegistryScope(org, { kind: 'organization' }, () => true);
const query = { kind: 'list' as const, filters, after: null, limit: 100 };
const reply = (records = [record()]) => ({ ...base(), kind: 'list', records, next_cursor: null, counts: { total: records.length, incoming: 0, outgoing: records.length, contracts: 0, orders: records.length } });
describe('authoritative document registry wire and identity', () => {
  it('uses a fresh actor bearer and exact scope, and does not invent file, recipient or official-number fields', async () => {
    mock.queue.push({ data: reply() }); await readDocumentRegistry(scope(), query);
    expect(mock.calls[0]).toEqual({ name: 'read_document_registry', args: { p_org: org, p_scope: { kind: 'organization' }, p_query: query }, header: 'Authorization', token: 'Bearer synthetic-only' });
    expect(registryActionSchema.safeParse({ action: 'register', data: { ...data(), file_url: 'guessed', recorded_by: actor }, reason: 'Основание' }).success).toBe(false);
    expect(registryActionSchema.safeParse({ action: 'register', data: { ...data(), source: null }, reason: 'Основание' }).success).toBe(false);
  });
  it.each(['before', 'after-auth', 'after-rpc'])('discards a stale actor at %s boundary', async when => {
    const captured = scope(); mock.queue.push({ data: reply() });
    if (when === 'before') mock.current = false; if (when === 'after-auth') mock.afterAuth = () => { mock.current = false; }; if (when === 'after-rpc') mock.afterRpc = () => { mock.current = false; };
    await expect(readDocumentRegistry(captured, query)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); if (when !== 'after-rpc') expect(mock.calls).toHaveLength(0);
  });
  it('refuses a different account before transport', async () => { mock.session.mockResolvedValue({ data: { session: { user: { id: uid(999) }, access_token: 'other' } }, error: null }); await expect(readDocumentRegistry(scope(), query)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(mock.rpc).not.toHaveBeenCalled(); });
  it.each(['org', 'scope', 'extra', 'count', 'cursor', 'context', 'capability'])('rejects a mismatched %s read envelope', async fault => {
    const value: any = reply(); if (fault === 'org') value.organization_id = uid(999); if (fault === 'scope') value.scope = { kind: 'group', group_id: group }; if (fault === 'extra') value.records[0].file_path = 'private'; if (fault === 'count') value.counts.total = 0; if (fault === 'cursor') value.next_cursor = 'same'; if (fault === 'context') value.records[0].context_binding.enrollment_id = uid(999); if (fault === 'capability') value.capabilities.can_read = false;
    mock.queue.push({ data: value }); await expect(readDocumentRegistry(scope(), { ...query, after: fault === 'cursor' ? 'same' : null })).rejects.toBeDefined();
  });
  it('accepts a server-authorized factual group view of an owner organization-scope registration without broadening the requested scope', async () => {
    const captured = captureDocumentRegistryScope(org, { kind: 'group', group_id: group }, () => true);
    mock.queue.push({ data: { ...reply(), ...base({ kind: 'group', group_id: group }) } });
    await expect(readDocumentRegistry(captured, query)).resolves.toMatchObject({ records: [{ group_id: null, context_binding: { user_id: pupil } }] });
    expect(mock.calls[0].args.p_scope).toEqual({ kind: 'group', group_id: group });
  });
  it('keeps own-upload proof and empty incoming bootstrap separate from broad metadata access', async () => {
    const caps = { ...capabilities, can_read: false, can_read_incoming: false, can_open_file: false, can_register: false, can_correct: false, can_read_legacy: false, can_register_incoming: false };
    mock.queue.push({ data: { ...base(), capabilities: caps, kind: 'incoming', incoming: [], next_after_id: null } }, { data: { ...base(), capabilities: caps, kind: 'source', source: { label: 'Собственный исходник', source } } }, { data: { ...base(), capabilities: caps, kind: 'incoming', incoming: [incoming()], next_after_id: null } });
    await expect(readDocumentRegistry(scope(), { kind: 'incoming', after_id: null, limit: 100 })).resolves.toMatchObject({ incoming: [] });
    await expect(readDocumentRegistry(scope(), { kind: 'source', document_id: source.document_id, version_id: source.version_id })).resolves.toMatchObject({ source: { source } });
    await expect(readDocumentRegistry(scope(), { kind: 'incoming', after_id: null, limit: 100 })).rejects.toBeDefined();
  });
  it('binds exact source proofs and refuses another source or private legacy URL fields', async () => {
    mock.queue.push({ data: { ...base(), kind: 'source', source: { label: 'Файл', source: { ...source, version_id: uid(999) } } } });
    await expect(readDocumentRegistry(scope(), { kind: 'source', document_id: source.document_id, version_id: source.version_id })).rejects.toBeDefined();
    const old = legacy(); expect(old.claim.stored_user_id).toBe(actor); expect(old.student?.user_id).toBe(pupil);
    expect(registryReadSchema.safeParse({ ...base(), kind: 'legacy_issuance', legacy_records: [{ ...old, file_url: 'guessed-from-title' }], next_after_id: null }).success).toBe(false);
    mock.queue.push({ data: { ...base(), kind: 'legacy_issuance', legacy_records: [old], next_after_id: null } }); await expect(readDocumentRegistry(scope(), { kind: 'legacy_issuance', after_id: null, limit: 100 })).resolves.toMatchObject({ legacy_records: [{ student: { user_id: pupil }, can_open_file: false }] });
  });
  it('retains exact mutation intent across uncertain transport and bounded create contention', async () => {
    const input = data(), requestId = uid(50), plan = prepareDocumentRegistryMutation(scope(), 0, { action: 'register', data: input, reason: 'Проверено' }, requestId); input.notes = 'later change';
    mock.queue.push({ error: { code: 'NETWORK' } }, { status: 409, error: { code: 'PT409', message: 'DOCUMENT_REGISTRY_REVISION_CONFLICT' } }, { data: { ...base(), kind: 'register', request_id: requestId, replayed: true, record: record() } });
    await expect(plan.run()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' }); await expect(plan.run()).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); await expect(plan.run()).resolves.toMatchObject({ replayed: true });
    expect(mock.calls[1].args).toEqual(mock.calls[0].args); expect(mock.calls[2].args).toEqual(mock.calls[0].args); expect(mock.calls[2].args.p_action.data.notes).toBe('');
    expect(mock.calls[2].args).not.toHaveProperty('official_number');
  });
  it.each(['id', 'data', 'revision', 'kind'])('refuses an unbound %s registration receipt', async fault => {
    const requestId = uid(50), row = record(), result: any = { ...base(), kind: 'register', request_id: requestId, replayed: false, record: row };
    if (fault === 'id') result.request_id = uid(999); if (fault === 'data') row.data.recipient = { kind: 'student', user_id: uid(999) }; if (fault === 'revision') row.revision = 2; if (fault === 'kind') result.kind = 'correct';
    mock.queue.push({ data: result }); await expect(prepareDocumentRegistryMutation(scope(), 0, { action: 'register', data: data(), reason: 'Проверено' }, requestId).run()).rejects.toBeDefined();
  });
  it('does not invent an incoming UUID for validation and keeps unregistered capture out of the numbered stream', async () => {
    const { origin: _origin, ...input } = data(); input.direction = 'incoming'; input.sender = { kind: 'external', entity_type: 'organization', name: 'Контрагент', inn: null }; input.recipient = { kind: 'organization', organization_id: org };
    mock.queue.push({ data: { ...base(), kind: 'validate_incoming', validation: { valid: true, data: input, context_binding: record().context_binding, source_label: 'Файл', sender_label: 'Контрагент', recipient_label: 'Организация', subject_label: 'Ученик', context_label: 'Подтверждённое зачисление' } } });
    await readDocumentRegistry(scope(), { kind: 'validate_incoming', incoming: { kind: 'new' }, data: input }); expect(mock.calls[0].args.p_query.data).not.toHaveProperty('origin');
    const capture = { doc_type: 'other' as const, title: 'Входящий исходник', counterparty_name: 'Контрагент', counterparty_inn: null, doc_number: 'ВХ-1', doc_date: '2026-10-22', notes: '', source };
    mock.queue.push({ data: { ...base(), kind: 'capture_incoming', request_id: uid(50), replayed: false, incoming: incoming() } });
    await expect(prepareDocumentRegistryMutation(scope(), 0, { action: 'capture_incoming', data: capture }, uid(50)).run()).resolves.toMatchObject({ incoming: { registration_id: null, registry_record_id: null } });
    expect(mock.calls[1].args.p_action).not.toHaveProperty('registration_id'); expect(mock.calls[1].args.p_action).not.toHaveProperty('event');
  });
});
