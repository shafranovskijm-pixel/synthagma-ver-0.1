import { supabase } from '@/integrations/supabase/client';
import { RtnApiError } from '@/api/rostechnadzor';
import type { RtnNewsSourceHealth, RtnUpdateEvent, RtnUpdateKind, RtnUpdateFilter, RtnUpdatePage, RtnUpdateSummary } from '@/types/rtn-updates';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOPIC = /^[a-z][a-z0-9_-]{0,63}$/;
const KINDS: RtnUpdateKind[] = ['news', 'source_change', 'bank_release'];
const FILTERS: RtnUpdateFilter[] = [...KINDS, 'questions'];
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const nullableUuid = (value: unknown) => value === null || typeof value === 'string' && UUID.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const nullableDate = (value: unknown) => value === null || date(value);
const calendarDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const plain = (value: unknown, max: number, min = 0): value is string => typeof value === 'string' && [...value].length >= min && [...value].length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(value);
function invalid(): never { throw new RtnApiError('invalid_response', 'Не удалось подтвердить сведения об изменениях. Обновите раздел.'); }

// These RPCs resolve the tenant/actor on the server. No user or owner selector is accepted.
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error: unknown}>;
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const result = await rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  } catch (error) {
    if (error instanceof RtnApiError) throw error;
    const value = record(error) ? error : {};
    if (value.code === '42501') throw new RtnApiError('forbidden', 'Нет доступа к этим изменениям.');
    if (value.code === 'PGRST202' || value.code === '42883') throw new RtnApiError('unknown', 'Раздел изменений пока недоступен.');
    throw new RtnApiError('network', 'Не удалось загрузить изменения. Повторите попытку.');
  }
}
function officialUrl(value: unknown, kind: RtnUpdateKind): value is string {
  if (typeof value !== 'string' || /[\\\u0000-\u0020\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.gosnadzor.ru', 'gosnadzor.ru'].includes(url.hostname) || url.port || url.username || url.password || url.hash) return false;
    return kind === 'news' ? /^https:\/\/www\.gosnadzor\.ru\/news\/[1-9]\d{0,5}\/[1-9]\d{0,11}\/$/.test(value)
      // Display an already server-validated original link, including official
      // /upload files. This does not change either network-fetch allowlist.
      : ['/energy/', '/service/list/', '/upload/'].some(prefix => url.pathname.startsWith(prefix));
  } catch { return false; }
}
function event(value: unknown): RtnUpdateEvent {
  if (!record(value) || typeof value.id !== 'string' || !UUID.test(value.id) || !integer(value.sequence)
    || !KINDS.includes(value.kind as RtnUpdateKind) || typeof value.topic !== 'string' || !TOPIC.test(value.topic)
    || !['previous_event_id', 'bank_id', 'source_revision_id', 'release_id'].every(key => nullableUuid(value[key]))
    || !officialUrl(value.canonical_url, value.kind as RtnUpdateKind) || !plain(value.title, 1000, 1)
    || !plain(value.source_excerpt, 600) || !plain(value.own_summary, 600)
    || !nullableDate(value.published_at) || !(value.effective_from === null || calendarDate(value.effective_from)) || !date(value.observed_at)
    || typeof value.historical !== 'boolean' || typeof value.notifiable !== 'boolean'
    || value.historical && value.notifiable
    || value.kind === 'news' && (value.published_at === null || value.effective_from !== null || value.bank_id !== null || value.source_revision_id !== null || value.release_id !== null)
    || value.kind === 'source_change' && (value.bank_id === null || value.source_revision_id === null || value.release_id !== null || value.published_at !== null || value.effective_from !== null)
    || value.kind === 'bank_release' && (value.bank_id === null || value.source_revision_id === null || value.release_id === null || value.published_at === null || value.effective_from === null)) invalid();
  const { id, sequence, kind, topic, previous_event_id, bank_id, source_revision_id, release_id, canonical_url, title, source_excerpt, own_summary, published_at, effective_from, observed_at, historical, notifiable } = value;
  return { id, sequence, kind, topic, previous_event_id, bank_id, source_revision_id, release_id, canonical_url, title, source_excerpt, own_summary, published_at, effective_from, observed_at, historical, notifiable } as RtnUpdateEvent;
}
function health(value: unknown): RtnNewsSourceHealth {
  if (!record(value) || value.code !== 'official-news-rss' || value.feed_url !== 'https://www.gosnadzor.ru/news/rss/'
    || !['never_checked', 'success', 'partial', 'error', 'blocked'].includes(String(value.status))
    || !['unknown', 'finite_rss_window', 'verified_archive_interval'].includes(String(value.coverage_kind))
    || !['last_checked_at', 'last_success_at', 'coverage_from', 'coverage_until'].every(key => nullableDate(value[key]))
    || !(value.error_code === null || typeof value.error_code === 'string' && /^[A-Z0-9_]{1,100}$/.test(value.error_code))
    || value.complete_archive !== false
    || value.status === 'never_checked' && (value.last_checked_at !== null || value.last_success_at !== null || value.coverage_kind !== 'unknown')
    || value.coverage_kind === 'verified_archive_interval' && (value.coverage_from === null || value.coverage_until === null)
    || value.status === 'success' && value.last_success_at === null) invalid();
  const { code, feed_url, last_checked_at, last_success_at, status, coverage_kind, coverage_from, coverage_until, error_code, complete_archive } = value;
  return { code, feed_url, last_checked_at, last_success_at, status, coverage_kind, coverage_from, coverage_until, error_code, complete_archive } as RtnNewsSourceHealth;
}
export async function getRtnUpdates(organizationId: string, filters: {kind?: RtnUpdateFilter; topic?: string; beforeSequence?: number; limit?: number} = {}): Promise<RtnUpdatePage> {
  const limit = filters.limit ?? 20;
  if (!UUID.test(organizationId) || filters.kind !== undefined && !FILTERS.includes(filters.kind) || filters.topic !== undefined && !TOPIC.test(filters.topic)
    || filters.beforeSequence !== undefined && !integer(filters.beforeSequence) || !integer(limit, 1, 50)) invalid();
  const data = await call('get_rtn_updates', { p_organization_id: organizationId, p_kind: filters.kind ?? null, p_topic: filters.topic ?? null, p_before_sequence: filters.beforeSequence ?? null, p_limit: limit });
  if (!record(data) || !Array.isArray(data.events) || data.events.length > limit || typeof data.has_more !== 'boolean') invalid();
  const events = data.events.map(event);
  if (new Set(events.map(item => item.id)).size !== events.length || events.some((item, i) => i > 0 && item.sequence >= events[i - 1].sequence
      || filters.beforeSequence !== undefined && item.sequence >= filters.beforeSequence || filters.kind !== undefined && (filters.kind === 'questions' ? item.kind === 'news' : item.kind !== filters.kind) || filters.topic !== undefined && item.topic !== filters.topic)
    || data.has_more && (!events.length || data.next_before_sequence !== events.at(-1)?.sequence)
    || !data.has_more && data.next_before_sequence !== null) invalid();
  return { events, has_more: data.has_more, next_before_sequence: data.next_before_sequence as number | null, source_health: health(data.source_health) };
}
export async function getRtnUpdate(organizationId: string, eventId: string): Promise<{event: RtnUpdateEvent; source_health: RtnNewsSourceHealth}> {
  if (!UUID.test(organizationId) || !UUID.test(eventId)) invalid();
  const data = await call('get_rtn_update', { p_organization_id: organizationId, p_event_id: eventId });
  if (!record(data)) invalid();
  const result = event(data.event);
  if (result.id.toLowerCase() !== eventId.toLowerCase()) invalid();
  return { event: result, source_health: health(data.source_health) };
}
export async function getRtnUpdateSummary(organizationId: string): Promise<RtnUpdateSummary> {
  if (!UUID.test(organizationId)) invalid();
  const data = await call('get_rtn_update_summary', { p_organization_id: organizationId });
  if (!record(data) || !integer(data.event_count, 0, 1000) || typeof data.count_is_lower_bound !== 'boolean' || data.count_semantics !== 'known_events_not_unread'
    || data.latest_event === null && data.event_count !== 0 || data.latest_event !== null && data.event_count === 0
    || data.count_is_lower_bound && data.event_count !== 1000) invalid();
  return { latest_event: data.latest_event === null ? null : event(data.latest_event), event_count: data.event_count, count_is_lower_bound: data.count_is_lower_bound,
    count_semantics: 'known_events_not_unread', source_health: health(data.source_health) };
}
