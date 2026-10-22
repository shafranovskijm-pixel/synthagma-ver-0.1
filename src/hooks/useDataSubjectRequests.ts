import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { captureOfflineContext, isOfflineActorCurrent } from "@/utils/courseCache";
import { toast } from "sonner";
import type { DSRDeadlineDetails, DSRDeadlineEvent } from "@/lib/dataSubjectDeadlines";

export type DSRType = "access" | "deletion" | "withdrawal" | "correction" | "cessation";
export type DSRStatus = "pending" | "in_progress" | "resolved" | "rejected";
export interface DataSubjectRequest {
  id: string; user_id: string; organization_id: string; request_type: DSRType; status: DSRStatus;
  description: string | null; contact_email: string | null; attachment_urls: string[] | null;
  response: string | null; due_date: string | null; resolved_at: string | null; resolved_by: string | null;
  created_at: string; updated_at: string; deadline_revision: number;
  deadline_details: DSRDeadlineDetails | null; deadline_history?: DSRDeadlineEvent[];
}
export const DSR_TYPE_LABELS: Record<DSRType, string> = {
  access: "Получить копию данных", deletion: "Удалить персональные данные", withdrawal: "Отозвать согласие на обработку",
  correction: "Исправить данные", cessation: "Прекратить обработку данных",
};
export const DSR_STATUS_LABELS: Record<DSRStatus, string> = { pending: "Новый", in_progress: "В работе", resolved: "Выполнен", rejected: "Отклонён" };
export const DSR_STATUS_COLORS: Record<DSRStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  in_progress: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};
type RpcResult = { data: unknown; error: { message: string; code?: string } | null; status?: number };
const client = supabase as unknown as { rpc(name: "uc_dsr_list" | "uc_dsr_create" | "uc_dsr_apply", args: Record<string, unknown>): { setHeader(name: string, value: string): PromiseLike<RpcResult> } };
type Counts = Record<DSRStatus | "all", number>;
type Cursor = { created_at: string; id: string };
const emptyCounts = (): Counts => ({ all: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 });
function validRequest(value: unknown): value is DataSubjectRequest {
  if (!value || typeof value !== "object") return false;
  const r = value as DataSubjectRequest;
  return [r.id, r.user_id, r.organization_id].every(v => typeof v === "string" && v.length > 0)
    && Object.prototype.hasOwnProperty.call(DSR_TYPE_LABELS, r.request_type) && Object.prototype.hasOwnProperty.call(DSR_STATUS_LABELS, r.status)
    && Number.isSafeInteger(r.deadline_revision) && r.deadline_revision >= 0 && Number.isFinite(Date.parse(r.created_at))
    && (r.due_date === null || typeof r.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.due_date))
    && (r.deadline_details === null || !!r.deadline_details && ["needs_review", "calculated", "manual_review", "unsupported_calendar"].includes(r.deadline_details.state));
}
function listResult(data: unknown, organizationId: string | null, actorId: string, own: boolean, requestId: string | null = null, cursor: Cursor | null = null): { requests: DataSubjectRequest[]; counts: Counts; next_cursor: Cursor | null } {
  const value = data as { requests?: unknown; counts?: Counts; next_cursor?: Cursor | null } | null;
  if (!value || !Array.isArray(value.requests) || value.requests.length > 100 || !value.counts || !Object.keys(emptyCounts()).every(k => Number.isSafeInteger(value.counts?.[k as keyof Counts]) && value.counts![k as keyof Counts] >= 0) || value.next_cursor === undefined) throw new Error("Некорректный ответ сервера");
  const requests = value.requests;
  if (requests.some(r => !validRequest(r) || (own ? r.user_id !== actorId : r.organization_id !== organizationId) || requestId !== null && r.id !== requestId) || new Set(requests.map(r => r.id)).size !== requests.length) throw new Error("Ответ не соответствует выбранному кабинету");
  let previous = cursor;
  for (const r of requests) {
    if (previous && (Date.parse(r.created_at) > Date.parse(previous.created_at) || Date.parse(r.created_at) === Date.parse(previous.created_at) && r.id >= previous.id)) throw new Error("Нарушен порядок страниц");
    previous = { created_at: r.created_at, id: r.id };
  }
  if (value.next_cursor !== null && (!value.next_cursor || typeof value.next_cursor !== "object" || !previous || typeof value.next_cursor.created_at !== "string" || !Number.isFinite(Date.parse(value.next_cursor.created_at)) || value.next_cursor.id !== previous.id || Date.parse(value.next_cursor.created_at) !== Date.parse(previous.created_at)) || requestId !== null && value.next_cursor !== null) throw new Error("Некорректный курсор ответа");
  if (value.counts.all < requests.length || value.counts.pending + value.counts.in_progress + value.counts.resolved + value.counts.rejected !== value.counts.all) throw new Error("Некорректные счётчики ответа");
  return value as { requests: DataSubjectRequest[]; counts: Counts; next_cursor: Cursor | null };
}
function errorText(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === "42501") return "Доступ изменился. Войдите в нужный кабинет и обновите страницу.";
  return e?.code === "PT409" || e?.code === "40001" ? "Запрос изменён или занят. Обновите список перед сохранением." : e?.message || "Не удалось выполнить действие";
}
function useRequests(organizationId: string | null, ownUserId: string | null, own: boolean) {
  const auth = useAuth(); const permissions = useStaffPermissions(); const actor = captureOfflineContext();
  const identity = JSON.stringify([organizationId, ownUserId, own, auth.user?.id, auth.userRole, auth.loading, actor?.actorId, actor?.revision, permissions.loading, permissions.error, permissions.orgRole, permissions.adminRole, [...permissions.orgPermissions].sort()]);
  const generation = useRef({ identity, number: 0 });
  if (generation.current.identity !== identity) generation.current = { identity, number: generation.current.number + 1 };
  const key = identity + "|generation:" + generation.current.number;
  const current = useRef(key); current.current = key;
  const mounted = useRef(true); const sequence = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const capturedActorId = actor?.actorId ?? null; const capturedRevision = actor?.revision ?? null;
  const isCurrent = useCallback(() => mounted.current && current.current === key && !!capturedActorId && isOfflineActorCurrent(capturedActorId, capturedRevision), [key, capturedActorId, capturedRevision]);
  const enabled = !!auth.user?.id && capturedActorId === auth.user.id && !auth.loading && (own ? auth.user.id === ownUserId : !!organizationId);
  const call = useCallback(async (name: "uc_dsr_list" | "uc_dsr_create" | "uc_dsr_apply", args: Record<string, unknown>): Promise<RpcResult> => {
    if (!isCurrent()) throw { code: "42501" };
    const session = await supabase.auth.getSession();
    if (!isCurrent() || session.error || session.data.session?.user.id !== capturedActorId || !session.data.session.access_token) throw { code: "42501" };
    const result = await client.rpc(name, args).setHeader("Authorization", "Bearer " + session.data.session.access_token);
    if (!isCurrent()) throw { code: "42501" };
    if (result.status === 401 || result.status === 403) throw { code: "42501" };
    return result;
  }, [isCurrent, capturedActorId]);
  const [view, setView] = useState<{ key: string; requests: DataSubjectRequest[]; loading: boolean; counts: Counts; next: Cursor | null }>({ key, requests: [], loading: enabled, counts: emptyCounts(), next: null });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const running = useRef<string | null>(null);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    if (!enabled || !isCurrent()) return;
    setView(old => ({ key, requests: old.key === key ? old.requests : [], loading: true, counts: old.key === key ? old.counts : emptyCounts(), next: null }));
    try {
      const result = await call("uc_dsr_list", { p_organization_id: own ? null : organizationId, p_request_id: null, p_cursor: null, p_limit: 100 });
      if (result.error) throw result.error;
      const next = listResult(result.data, organizationId, capturedActorId!, own);
      if (isCurrent() && seq === sequence.current) setView({ key, requests: next.requests, counts: next.counts, next: next.next_cursor, loading: false });
    } catch (error) {
      if (isCurrent() && seq === sequence.current) { setView({ key, requests: [], loading: false, counts: emptyCounts(), next: null }); toast.error(errorText(error)); }
    }
  }, [key, enabled, isCurrent, own, organizationId, call, capturedActorId]);
  useEffect(() => { running.current = null; setSavingKey(null); setView({ key, requests: [], loading: enabled, counts: emptyCounts(), next: null }); void load(); return () => { sequence.current++; }; }, [load, key, enabled]);
  const mutate = useCallback(async (name: "uc_dsr_create" | "uc_dsr_apply", args: Record<string, unknown>) => {
    if (!enabled || !isCurrent() || running.current === key) return false;
    running.current = key; setSavingKey(key);
    try {
      const result = await call(name, args); if (result.error) throw result.error;
      if (!isCurrent()) return false;
      if (!validRequest(result.data)) throw new Error("Некорректное подтверждение сохранения");
      const saved = result.data;
      if (name === "uc_dsr_create") {
        if (saved.id !== args.p_request_id || saved.organization_id !== args.p_organization_id || saved.user_id !== capturedActorId || saved.request_type !== args.p_request_type || saved.description !== (String(args.p_description ?? "").replace(/^ +| +$/g, "") || null) || saved.contact_email !== (String(args.p_contact_email ?? "").replace(/^ +| +$/g, "") || null)) throw new Error("Подтверждение относится к другому запросу");
      } else {
        const expected = view.key === key ? view.requests.find(r => r.id === args.p_request_id) : null;
        const payload = args.p_payload as { status?: string };
        if (!expected || saved.id !== expected.id || saved.organization_id !== expected.organization_id || saved.user_id !== expected.user_id || saved.deadline_revision !== Number(args.p_expected_revision) + 1 || saved.status !== (payload.status ?? "in_progress")) throw new Error("Подтверждение не соответствует сохранённой ревизии");
      }
      await load(); if (!isCurrent()) return false;
      toast.success(name === "uc_dsr_create" ? "Запрос отправлен. Организация проверит основание и контрольный срок." : "Решение и история сохранены"); return true;
    } catch (error) { if (isCurrent()) toast.error(errorText(error)); return false; }
    finally { if (isCurrent()) { running.current = null; setSavingKey(null); } }
  }, [enabled, isCurrent, key, load, call, capturedActorId, view]);
  const readHistory = useCallback(async (id: string) => {
    if (!enabled || !isCurrent()) return null;
    try {
      const result = await call("uc_dsr_list", { p_organization_id: own ? null : organizationId, p_request_id: id, p_cursor: null, p_limit: 100 });
      if (!isCurrent()) return null;
      if (result.error) throw result.error;
      return listResult(result.data, organizationId, capturedActorId!, own, id).requests[0] ?? null;
    } catch (error) { if (isCurrent()) toast.error(errorText(error)); return null; }
  }, [enabled, isCurrent, own, organizationId, call, capturedActorId]);
  const loadMore = useCallback(async () => {
    if (!enabled || !isCurrent() || view.key !== key || view.loading || !view.next || running.current === key) return;
    const seq = ++sequence.current; running.current = key;
    setView(old => old.key === key ? { ...old, loading: true } : old);
    try {
      const result = await call("uc_dsr_list", { p_organization_id: own ? null : organizationId, p_request_id: null, p_cursor: view.next, p_limit: 100 });
      if (result.error) throw result.error;
      const next = listResult(result.data, organizationId, capturedActorId!, own, null, view.next);
      if (isCurrent() && seq === sequence.current) setView(old => old.key === key ? { key, requests: [...old.requests, ...next.requests.filter(r => !old.requests.some(prior => prior.id === r.id))], counts: next.counts, next: next.next_cursor, loading: false } : old);
    } catch (error) { if (isCurrent() && seq === sequence.current) { setView(old => old.key === key ? { ...old, loading: false } : old); toast.error(errorText(error)); } }
    finally { if (isCurrent()) running.current = null; }
  }, [enabled, isCurrent, view, key, own, organizationId, call, capturedActorId]);
  return { scopeKey: key, requests: view.key === key ? view.requests : [], loading: view.key === key ? view.loading : enabled, submitting: savingKey === key, counts: view.key === key ? view.counts : emptyCounts(), hasMore: view.key === key && !!view.next, loadedCount: view.key === key ? view.requests.length : 0, loadMore, mutate, readHistory, reload: load };
}
export function useMyDataSubjectRequests(userId: string | null) {
  const state = useRequests(null, userId, true);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const create = async (organizationId: string, requestType: DSRType, description: string, contactEmail: string) => {
    const signature = JSON.stringify([userId, organizationId, requestType, description, contactEmail]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    const ok = await state.mutate("uc_dsr_create", { p_request_id: request.current.id, p_organization_id: organizationId, p_request_type: requestType, p_description: description, p_contact_email: contactEmail });
    if (ok) request.current = null; return ok;
  };
  return { ...state, create };
}
export function useOrgDataSubjectRequests(organizationId: string | null) {
  const state = useRequests(organizationId, null, false);
  const [filter, setFilter] = useState<DSRStatus | "all">("all");
  const apply = (request: DataSubjectRequest, action: "review" | "extend" | "respond", payload: Record<string, unknown>) => {
    if (request.organization_id !== organizationId || !state.requests.some(r => r.id === request.id)) return Promise.resolve(false);
    return state.mutate("uc_dsr_apply", { p_request_id: request.id, p_expected_revision: request.deadline_revision, p_action: action, p_payload: payload });
  };
  return { ...state, requests: filter === "all" ? state.requests : state.requests.filter(r => r.status === filter), filter, setFilter, apply };
}
