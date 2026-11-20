import { supabase } from "@/integrations/supabase/client";
import { RtnApiError } from "./rostechnadzor";
import { parseRtnUpdateEvent } from "./rtn-updates";
import type { RtnUpdateKind } from "@/types/rtn-updates";
import type { RtnPersonalScope, RtnPreferenceEnvelope, RtnPersonalNotificationPage, RtnPersonalReadResult } from "@/types/rtn-personal-notifications";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOPIC = /^[a-z][a-z0-9_-]{0,63}$/;
const KINDS: RtnUpdateKind[] = ["news", "source_change", "bank_release"];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const nullableDate = (v: unknown) => v === null || date(v);
const strings = (v: unknown, max: number, valid: (value: string) => boolean): v is string[] => Array.isArray(v) && v.length <= max && v.every(item => typeof item === "string" && valid(item)) && new Set(v).size === v.length;
function invalid(): never { throw new RtnApiError("invalid_response", "Не удалось подтвердить личные уведомления. Обновите раздел."); }
function scopeValid(scope: RtnPersonalScope) { if (!UUID.test(scope.organizationId) || !UUID.test(scope.actorId)) invalid(); }
function identity(value: unknown, scope: RtnPersonalScope): asserts value is Record<string, unknown> {
  if (!record(value) || typeof value.organization_id !== "string" || typeof value.actor_id !== "string" || value.organization_id.toLowerCase() !== scope.organizationId.toLowerCase() || value.actor_id.toLowerCase() !== scope.actorId.toLowerCase()) invalid();
}
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
async function call(name: string, args: Record<string, unknown>) {
  try { const result = await rpc(name, args); if (result.error) throw result.error; return result.data; }
  catch (error) {
    if (error instanceof RtnApiError) throw error;
    const code = record(error) ? error.code : null;
    if (code === "40001") throw new RtnApiError("conflict", "Настройки изменены в другом окне. Загрузите актуальные настройки перед сохранением.");
    if (code === "42501") throw new RtnApiError("forbidden", "Нет доступа к личным уведомлениям этой организации.");
    if (code === "PGRST202" || code === "42883") throw new RtnApiError("unknown", "Личные уведомления пока недоступны.");
    throw new RtnApiError("network", "Не удалось загрузить личные уведомления. Повторите попытку.");
  }
}
function preference(data: unknown, scope: RtnPersonalScope): RtnPreferenceEnvelope {
  identity(data, scope);
  const s = data.subscription, o = data.options;
  if (data.delivery_mode !== "own_pull" || !record(s) || !record(o)
    || !strings(o.topics, 256, v => TOPIC.test(v)) || !o.topics.includes("general")
    || !strings(o.kinds, 3, v => KINDS.includes(v as RtnUpdateKind)) || o.kinds.length !== 3
    || !strings(s.topics, 32, v => TOPIC.test(v)) || !strings(s.kinds, 3, v => KINDS.includes(v as RtnUpdateKind))
    || !integer(s.generation) || typeof s.enabled !== "boolean" || typeof s.effective_enabled !== "boolean" || typeof s.needs_reconfiguration !== "boolean"
    || !nullableDate(s.enabled_since) || !nullableDate(s.updated_at)) invalid();
  const availableTopics = o.topics;
  const valid = s.topics.length > 0 && s.kinds.length > 0 && s.topics.every(v => availableTopics.includes(v));
  if (s.effective_enabled !== (s.enabled && valid) || s.needs_reconfiguration !== (s.enabled && !valid)
    || s.enabled && s.enabled_since === null || !s.enabled && s.enabled_since !== null
    || s.generation === 0 && (s.enabled || s.topics.length || s.kinds.length || s.updated_at !== null)
    || s.generation > 0 && s.updated_at === null) invalid();
  return { organization_id: scope.organizationId, actor_id: scope.actorId, delivery_mode: "own_pull", options: { topics: o.topics, kinds: o.kinds as RtnUpdateKind[] }, subscription: {
    enabled: s.enabled, effective_enabled: s.effective_enabled, needs_reconfiguration: s.needs_reconfiguration, topics: s.topics, kinds: s.kinds as RtnUpdateKind[], generation: s.generation,
    enabled_since: s.enabled_since as string | null, updated_at: s.updated_at as string | null,
  } };
}
export async function getMyRtnSubscription(scope: RtnPersonalScope): Promise<RtnPreferenceEnvelope> {
  scopeValid(scope); return preference(await call("get_my_rtn_subscription", { p_organization_id: scope.organizationId }), scope);
}
export async function saveMyRtnSubscription(scope: RtnPersonalScope, draft: { enabled: boolean; topics: string[]; kinds: RtnUpdateKind[]; expectedGeneration: number }): Promise<RtnPreferenceEnvelope> {
  scopeValid(scope);
  if (typeof draft.enabled !== "boolean" || !integer(draft.expectedGeneration) || !strings(draft.topics, 32, v => TOPIC.test(v)) || !strings(draft.kinds, 3, v => KINDS.includes(v as RtnUpdateKind)) || draft.enabled && (!draft.topics.length || !draft.kinds.length)) invalid();
  const result = preference(await call("save_my_rtn_subscription", { p_organization_id: scope.organizationId, p_enabled: draft.enabled, p_topics: draft.topics, p_kinds: draft.kinds, p_expected_generation: draft.expectedGeneration }), scope);
  if (result.subscription.generation < draft.expectedGeneration || result.subscription.generation > draft.expectedGeneration + 1
    || result.subscription.enabled !== draft.enabled || result.subscription.topics.length !== draft.topics.length || result.subscription.topics.some(v => !draft.topics.includes(v))
    || result.subscription.kinds.length !== draft.kinds.length || result.subscription.kinds.some(v => !draft.kinds.includes(v))) invalid();
  return result;
}
export async function getMyRtnNotifications(scope: RtnPersonalScope, filters: { beforeSequence?: number; limit?: number } = {}): Promise<RtnPersonalNotificationPage> {
  scopeValid(scope); const limit = filters.limit ?? 20;
  if (!integer(limit, 1, 50) || filters.beforeSequence !== undefined && !integer(filters.beforeSequence, 1)) invalid();
  const data = await call("get_my_rtn_notifications", { p_organization_id: scope.organizationId, p_before_sequence: filters.beforeSequence ?? null, p_limit: limit }); identity(data, scope);
  if (data.delivery_mode !== "own_pull" || !Array.isArray(data.items) || data.items.length > limit || !integer(data.unread_count) || !integer(data.materialized_count, 0, 50) || !integer(data.subscription_generation)
    || typeof data.has_more !== "boolean" || typeof data.materialization_pending !== "boolean" || typeof data.subscription_enabled !== "boolean") invalid();
  const subscriptionGeneration = data.subscription_generation;
  const items = data.items.map(item => {
    if (!record(item) || typeof item.id !== "string" || !UUID.test(item.id) || !date(item.delivered_at) || !nullableDate(item.read_at) || !integer(item.subscription_generation, 1)) invalid();
    const event = parseRtnUpdateEvent(item.event);
    if (item.subscription_generation > subscriptionGeneration || event.historical || !event.notifiable) invalid();
    return { id: item.id, event, delivered_at: item.delivered_at, read_at: item.read_at as string | null, subscription_generation: item.subscription_generation };
  });
  if (new Set(items.map(i => i.id)).size !== items.length || new Set(items.map(i => i.event.id)).size !== items.length
    || items.some((i, index) => index > 0 && i.event.sequence >= items[index - 1].event.sequence || filters.beforeSequence !== undefined && i.event.sequence >= filters.beforeSequence)
    || data.unread_count < items.filter(i => i.read_at === null).length
    || data.has_more && (!items.length || data.next_before_sequence !== items.at(-1)?.event.sequence)
    || !data.has_more && data.next_before_sequence !== null
    || !data.subscription_enabled && (data.materialization_pending || data.materialized_count !== 0)
    || data.subscription_generation === 0 && (items.length || data.unread_count || data.subscription_enabled)) invalid();
  return { organization_id: scope.organizationId, actor_id: scope.actorId, items, unread_count: data.unread_count, has_more: data.has_more, next_before_sequence: data.next_before_sequence as number | null, materialization_pending: data.materialization_pending, materialized_count: data.materialized_count, subscription_generation: data.subscription_generation, subscription_enabled: data.subscription_enabled, delivery_mode: "own_pull" };
}
export async function markMyRtnNotificationsRead(scope: RtnPersonalScope, eventIds: string[]): Promise<RtnPersonalReadResult> {
  scopeValid(scope); if (!strings(eventIds, 100, v => UUID.test(v))) invalid();
  const data = await call("mark_my_rtn_notifications_read", { p_organization_id: scope.organizationId, p_event_ids: eventIds }); identity(data, scope);
  if (!strings(data.read_event_ids, 100, v => UUID.test(v)) || !integer(data.matched_count, 0, 100) || data.matched_count !== data.read_event_ids.length || data.read_event_ids.some(id => !eventIds.some(v => v.toLowerCase() === id.toLowerCase()))) invalid();
  return { organization_id: scope.organizationId, actor_id: scope.actorId, read_event_ids: data.read_event_ids, matched_count: data.matched_count };
}
export const RTN_PERSONAL_REFRESH = "rtn-personal-refresh";
export function notifyRtnPersonalRefresh(scope: RtnPersonalScope, generation?: number) {
  window.dispatchEvent(new CustomEvent(RTN_PERSONAL_REFRESH, { detail: { ...scope, generation } }));
}
