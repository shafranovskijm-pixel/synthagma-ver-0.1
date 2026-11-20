import { supabase } from '@/integrations/supabase/client';
import { RtnApiError } from '@/api/rostechnadzor';
import type { RtnNewsCheckState, RtnNewsManualReceipt, RtnNewsRunReceipt, RtnNewsRunStatus } from '@/types/rtn-news-check';
import type { RtnNewsSourceHealth } from '@/types/rtn-updates';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses: RtnNewsRunStatus[] = ['queued', 'running', 'changed', 'unchanged', 'error'];
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(v, key));
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 200;
const errorCode = (v: unknown) => typeof v === 'string' && /^RTN_NEWS_[A-Z0-9_]{1,100}$/.test(v);
function date(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) return false;
  const [year, month, day, hour, minute, second] = v.slice(0, 19).split(/[-T:]/).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day && hour < 24 && minute < 60 && second < 60;
}
const nullableDate = (v: unknown) => v === null || date(v);
function invalid(): never { throw new RtnApiError('invalid_response', 'Не удалось подтвердить состояние проверки новостей. Обновите сведения.'); }
function denied(): never { throw new RtnApiError('forbidden', 'Нет прав на проверку новостей этой организации.'); }
function unavailable(): never { throw new RtnApiError('network', 'Результат проверки новостей не подтверждён. Обновите состояние перед повторным запуском.'); }

function receipt(v: unknown): RtnNewsRunReceipt {
  const keys = ['run_id', 'status', 'queued_at', 'completed_at', 'new_event_count', 'correction_count', 'unchanged_count', 'error_code', 'replayed', 'last_success_at', 'cooldown_until'];
  if (!record(v) || !exact(v, keys) || typeof v.run_id !== 'string' || !UUID.test(v.run_id) || !statuses.includes(v.status as RtnNewsRunStatus)
    || !date(v.queued_at) || !nullableDate(v.completed_at) || !count(v.new_event_count) || !count(v.correction_count) || !count(v.unchanged_count)
    || v.new_event_count + v.correction_count + v.unchanged_count > 200 || typeof v.replayed !== 'boolean'
    || !nullableDate(v.last_success_at) || !nullableDate(v.cooldown_until) || !(v.error_code === null || errorCode(v.error_code))) invalid();
  const pending = v.status === 'queued' || v.status === 'running';
  if (pending && (v.completed_at !== null || v.error_code !== null || v.new_event_count + v.correction_count + v.unchanged_count !== 0)
    || !pending && (v.completed_at === null || Date.parse(v.completed_at as string) < Date.parse(v.queued_at))
    || v.status === 'error' && v.error_code === null || v.status !== 'error' && v.error_code !== null
    || v.status === 'changed' && v.new_event_count + v.correction_count === 0
    || v.status === 'unchanged' && v.new_event_count + v.correction_count !== 0) invalid();
  return v as unknown as RtnNewsRunReceipt;
}
function manual(v: unknown): RtnNewsManualReceipt {
  if (record(v) && exact(v, ['run_id', 'status']) && typeof v.run_id === 'string' && UUID.test(v.run_id) && (v.status === 'queued' || v.status === 'running')) {
    return { run_id: v.run_id, status: v.status };
  }
  return receipt(v);
}
// Same public health contract as1300; dates and failure/coverage relationships
// are checked here rather than inferring a successful check from empty events.
function health(v: unknown): RtnNewsSourceHealth {
  const keys = ['code', 'feed_url', 'last_checked_at', 'last_success_at', 'status', 'coverage_kind', 'coverage_from', 'coverage_until', 'error_code', 'complete_archive'];
  if (!record(v) || !exact(v, keys) || v.code !== 'official-news-rss' || v.feed_url !== 'https://www.gosnadzor.ru/news/rss/' || v.complete_archive !== false
    || !['never_checked', 'success', 'partial', 'error', 'blocked'].includes(String(v.status))
    || !['unknown', 'finite_rss_window', 'verified_archive_interval'].includes(String(v.coverage_kind))
    || !['last_checked_at', 'last_success_at', 'coverage_from', 'coverage_until'].every(key => nullableDate(v[key]))
    || !(v.error_code === null || errorCode(v.error_code)) || (v.coverage_from === null) !== (v.coverage_until === null)
    || v.coverage_from !== null && Date.parse(v.coverage_from as string) > Date.parse(v.coverage_until as string)
    || v.last_success_at !== null && (v.last_checked_at === null || Date.parse(v.last_success_at as string) > Date.parse(v.last_checked_at as string))
    || v.status === 'never_checked' && (v.last_checked_at !== null || v.last_success_at !== null || v.coverage_kind !== 'unknown')
    || ['success', 'partial'].includes(String(v.status)) && v.last_success_at === null
    || ['error', 'blocked'].includes(String(v.status)) && (v.error_code === null || v.last_checked_at === null)
    || !['error', 'blocked'].includes(String(v.status)) && v.error_code !== null
    || v.coverage_kind === 'verified_archive_interval' && v.coverage_from === null) invalid();
  return v as unknown as RtnNewsSourceHealth;
}

type Reply = { data: unknown; error: unknown };
type Query = PromiseLike<Reply> & { abortSignal(signal: AbortSignal): PromiseLike<Reply> };
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Query;
export async function getRtnNewsCheckState(organizationId: string, signal?: AbortSignal): Promise<RtnNewsCheckState> {
  if (!UUID.test(organizationId)) invalid();
  try {
    const query = rpc('get_rtn_news_check_state', { p_organization_id: organizationId });
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    if (error) throw error;
    if (!record(data) || !exact(data, ['check', 'source_health', 'can_request', 'next_due_at']) || typeof data.can_request !== 'boolean' || !date(data.next_due_at)) invalid();
    return { check: data.check === null ? null : receipt(data.check), source_health: health(data.source_health), can_request: data.can_request, next_due_at: data.next_due_at };
  } catch (error) {
    if (error instanceof RtnApiError) throw error;
    if (record(error) && error.code === '42501') denied();
    unavailable();
  }
}

/** Non2xx JSON can contain a valid terminal error receipt. Read that small body
 * through the SDK's authenticated response, never a second request or raw URL. */
async function errorBody(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !response.body) unavailable();
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];let size = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => undefined); reject(new Error('deadline')); }, 5000); });
  try {
    while (true) {
      const item = await Promise.race([reader.read(), timeout]);
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 16384) { void reader.cancel().catch(() => undefined); unavailable(); }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size);let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { unavailable(); }
  finally { clearTimeout(timer);reader.releaseLock(); }
}
export async function checkRtnNewsNow(organizationId: string, signal?: AbortSignal): Promise<RtnNewsManualReceipt> {
  if (!UUID.test(organizationId)) invalid();
  try {
    const result = await supabase.functions.invoke<unknown>('rtn-news-check', { body: { organizationId }, timeout: 90_000, ...(signal ? { signal } : {}) });
    if (!result.error) return manual(result.data);
    const response = result.response ?? (record(result.error) && result.error.context instanceof Response ? result.error.context : null);
    if (!response) unavailable();
    if (response.status === 401 || response.status === 403) denied();
    const data = await errorBody(response);
    if (response.status === 503 && record(data) && data.status === 'error') return receipt(data);
    unavailable();
  } catch (error) {
    if (error instanceof RtnApiError) throw error;
    unavailable();
  }
}
