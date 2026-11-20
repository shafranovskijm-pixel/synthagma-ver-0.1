import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { getRtnUpdate, getRtnUpdates, getRtnUpdateSummary } from './rtn-updates';

const org = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-11-20T10:00:00+00:00';
const health = () => ({ code: 'official-news-rss', feed_url: 'https://www.gosnadzor.ru/news/rss/', last_checked_at: null, last_success_at: null,
  status: 'never_checked', coverage_kind: 'unknown', coverage_from: null, coverage_until: null, error_code: null, complete_archive: false });
const event = () => ({ id, sequence: 5, kind: 'news', topic: 'industrial-safety', previous_event_id: null, bank_id: null, source_revision_id: null,
  release_id: null, canonical_url: 'https://www.gosnadzor.ru/news/64/12345/', title: 'Новая публикация', source_excerpt: '', own_summary: 'Краткое описание',
  published_at: stamp, effective_from: null, observed_at: stamp, historical: false, notifiable: true });
const page = () => ({ events: [event()], has_more: false, next_before_sequence: null, source_health: health() });
const reply = (data: unknown) => rpc.mockResolvedValue({ data, error: null });
beforeEach(() => rpc.mockReset());

describe('authorized RTN event read boundary', () => {
  it('preserves never-checked coverage separately from an empty known-event set', async () => {
    reply({ ...page(), events: [] });
    const result = await getRtnUpdates(org);
    expect(result.events).toEqual([]);
    expect(result.source_health).toMatchObject({ status: 'never_checked', coverage_kind: 'unknown', last_success_at: null });
  });
  it('sends only tenant and bounded presentation filters, with no actor/owner selector', async () => {
    reply({ ...page(), has_more: true, next_before_sequence: 5 });
    await getRtnUpdates(org, { kind: 'news', topic: 'industrial-safety', beforeSequence: 10, limit: 2 });
    expect(rpc).toHaveBeenCalledWith('get_rtn_updates', { p_organization_id: org, p_kind: 'news', p_topic: 'industrial-safety', p_before_sequence: 10, p_limit: 2 });
  });
  it('does not reinterpret known-event counts as personal unread counts', async () => {
    reply({ latest_event: event(), event_count: 1000, count_is_lower_bound: true, count_semantics: 'known_events_not_unread', source_health: health() });
    expect(await getRtnUpdateSummary(org)).toMatchObject({ event_count: 1000, count_is_lower_bound: true, count_semantics: 'known_events_not_unread' });
  });
  it('rejects a detail response for a different canonical event', async () => {
    reply({ event: { ...event(), id: org }, source_health: health() });
    await expect(getRtnUpdate(org, id)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it.each(['https://www.gosnadzor.ru.evil.example/news/64/12345/', 'javascript:alert(1)', 'http://www.gosnadzor.ru/news/64/12345/'])('rejects a substituted unsafe source link: %s', async canonical_url => {
    reply({ ...page(), events: [{ ...event(), canonical_url }] });
    await expect(getRtnUpdates(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it.each([
    { events: [event(), event()] },
    { events: [event(), { ...event(), id: org, sequence: 6 }] },
    { has_more: true, next_before_sequence: 6 },
  ])('rejects duplicate or unstable pages instead of silently dropping records', async delta => {
    reply({ ...page(), ...delta });
    await expect(getRtnUpdates(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rejects a news item presented as a verified operative date', async () => {
    reply({ ...page(), events: [{ ...event(), effective_from: stamp }] });
    await expect(getRtnUpdates(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rejects a claimed complete archive when the source contract is a bounded window', async () => {
    reply({ ...page(), source_health: { ...health(), complete_archive: true } });
    await expect(getRtnUpdates(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rejects successful source status without a last successful check', async () => {
    reply({ ...page(), source_health: { ...health(), status: 'success' } });
    await expect(getRtnUpdates(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rejects an unknown event count instead of converting it to zero', async () => {
    reply({ latest_event: null, event_count: null, count_is_lower_bound: false, count_semantics: 'known_events_not_unread', source_health: health() });
    await expect(getRtnUpdateSummary(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('preserves denied access as an error and performs no fallback reader', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(getRtnUpdates(org)).rejects.toMatchObject({ code: 'forbidden' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('reports an absent rollout RPC as unavailable rather than no changes', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(getRtnUpdates(org)).rejects.toMatchObject({ code: 'unknown', message: 'Раздел изменений пока недоступен.' });
  });
  it('rejects unsafe input before requesting data', async () => {
    await expect(getRtnUpdates(org, { beforeSequence: Number.MAX_SAFE_INTEGER + 1 })).rejects.toMatchObject({ code: 'invalid_response' });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('projects the public event fields rather than forwarding an accidental private payload', async () => {
    reply({ ...page(), events: [{ ...event(), answers: { secret: 'not a public event field' }, recipient_id: org }] });
    const result = await getRtnUpdates(org);
    expect(result.events[0]).not.toHaveProperty('answers');
    expect(result.events[0]).not.toHaveProperty('recipient_id');
  });
  it('rejects a returned event outside the requested topic filter', async () => {
    reply(page());
    await expect(getRtnUpdates(org, { topic: 'energy' })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('loads source changes and bank releases in one questions-filter cursor', async () => {
    const sourceChange = { ...event(), kind: 'source_change', bank_id: org, source_revision_id: id, published_at: null,
      canonical_url: 'https://www.gosnadzor.ru/energy/energy/questions.xlsx' };
    const release = { ...sourceChange, id: org, sequence: 4, kind: 'bank_release', release_id: id, published_at: stamp, effective_from: '2026-11-20' };
    reply({ ...page(), events: [sourceChange, release], has_more: true, next_before_sequence: 4 });
    const result = await getRtnUpdates(org, { kind: 'questions' });
    expect(result.events.map(item => item.kind)).toEqual(['source_change', 'bank_release']);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_rtn_updates', expect.objectContaining({ p_kind: 'questions' }));
  });
  it('rejects a news item returned under the questions-only filter', async () => {
    reply(page());
    await expect(getRtnUpdates(org, { kind: 'questions' })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rejects a nonexistent calendar effective date from a release response', async () => {
    reply({ ...page(), events: [{ ...event(), kind: 'bank_release', bank_id: org, source_revision_id: id, release_id: id,
      canonical_url: 'https://www.gosnadzor.ru/energy/energy/questions.xlsx', effective_from: '2026-02-30' }] });
    await expect(getRtnUpdates(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('accepts the SQL-shaped official upload source and release links', async () => {
    const change = { ...event(), kind: 'source_change', bank_id: org, source_revision_id: id, published_at: null,
      canonical_url: 'https://www.gosnadzor.ru/upload/lab-a.pdf' };
    const release = { ...change, id: org, sequence: 4, kind: 'bank_release', release_id: id, published_at: stamp, effective_from: '2026-11-20' };
    reply({ ...page(), events: [change, release] });
    expect((await getRtnUpdates(org, { kind: 'questions' })).events.map(item => item.canonical_url)).toEqual([change.canonical_url, release.canonical_url]);
  });
  it('uses PostgreSQL codepoint limits for a valid astral-character title', async () => {
    reply({ ...page(), events: [{ ...event(), title: '📰'.repeat(1000) }] });
    expect((await getRtnUpdates(org)).events[0].title).toBe('📰'.repeat(1000));
  });
});
