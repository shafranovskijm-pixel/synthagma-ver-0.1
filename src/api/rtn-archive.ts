import { supabase } from '@/integrations/supabase/client';
import { RtnApiError } from '@/api/rostechnadzor';

export type RtnArchiveCandidate = {
  canonical_url: string; title: string; source_date: string; date_precision: 'day';
  has_conflict: boolean; known_rss: boolean;
};
export type RtnArchiveCandidatePage = {
  items: RtnArchiveCandidate[]; next_cursor: string | null; has_more: boolean;
  scope: 'archive_discovery_not_fresh_news'; complete_archive: false; exact_publication_times_known: false;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARTICLE = /^https:\/\/www\.gosnadzor\.ru\/news\/[1-9][0-9]{0,5}\/[1-9][0-9]{0,11}\/$/;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
const cursorValid = (v: unknown): v is string | null => v === null || typeof v === 'string' && v.length > 0 && v.length <= 2048 && /^[A-Za-z0-9_-]+$/.test(v);
function invalid(): never { throw new RtnApiError('invalid_response', 'Не удалось подтвердить список публикаций. Обновите сведения.'); }
function day(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number), date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2200 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function page(value: unknown): RtnArchiveCandidatePage {
  if (!object(value) || !exact(value, ['items', 'next_cursor', 'has_more', 'scope', 'complete_archive', 'exact_publication_times_known'])
    || !Array.isArray(value.items) || value.items.length > 20 || typeof value.has_more !== 'boolean'
    || !cursorValid(value.next_cursor) || value.has_more !== (value.next_cursor !== null)
    || value.has_more && value.items.length === 0 || value.scope !== 'archive_discovery_not_fresh_news'
    || value.complete_archive !== false || value.exact_publication_times_known !== false) invalid();
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!object(item) || !exact(item, ['canonical_url', 'title', 'source_date', 'date_precision', 'has_conflict', 'known_rss'])
      || typeof item.canonical_url !== 'string' || !ARTICLE.test(item.canonical_url) || seen.has(item.canonical_url)
      || typeof item.title !== 'string' || item.title !== item.title.trim() || !item.title.length || Array.from(item.title).length > 500
      || /[\u0000-\u001f\u007f]/.test(item.title) || !day(item.source_date) || item.date_precision !== 'day'
      || typeof item.has_conflict !== 'boolean' || typeof item.known_rss !== 'boolean') invalid();
    seen.add(item.canonical_url);
  }
  return value as unknown as RtnArchiveCandidatePage;
}
type Reply = { data: unknown; error: unknown };
type Query = PromiseLike<Reply> & { abortSignal(signal: AbortSignal): PromiseLike<Reply> };
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Query;

/** Read saved global metadata through current organization authority. Never fetch the official site. */
export async function listRtnArchiveCandidates(organizationId: string, cursor: string | null = null, signal?: AbortSignal): Promise<RtnArchiveCandidatePage> {
  if (!UUID.test(organizationId) || !cursorValid(cursor)) invalid();
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 15_000);
  try {
    const { data, error } = await rpc('list_rtn_news_archive_candidates', {
      p_organization_id: organizationId, p_limit: 20, p_cursor: cursor,
    }).abortSignal(controller.signal);
    if (error) throw error;
    return page(data);
  } catch (error) {
    if (error instanceof RtnApiError) throw error;
    if (object(error) && error.code === '42501') throw new RtnApiError('forbidden', 'Нет доступа к публикациям этой организации.');
    throw new RtnApiError('network', 'Публикации не удалось загрузить. Отсутствие обновлений не подтверждено.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
