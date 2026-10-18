import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DocumentApplicabilitySnapshot {
  organization_id: string; requirement_id: string; revision: number; profile_revision: number; catalog_version: string;
  decision: "not_applicable" | "applicable" | null; reason: string; decided_at: string; decided_by: string;
}
export function parseApplicabilityDecision(value: unknown, organizationId: string): DocumentApplicabilitySnapshot {
  const row = value as DocumentApplicabilitySnapshot | null;
  if (!row || row.organization_id !== organizationId || typeof row.requirement_id !== "string" || !row.requirement_id ||
      !Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isSafeInteger(row.profile_revision) || row.profile_revision < 1 ||
      typeof row.catalog_version !== "string" || !row.catalog_version || ![null, "applicable", "not_applicable"].includes(row.decision) ||
      typeof row.reason !== "string" || !row.reason.trim() || typeof row.decided_at !== "string" || typeof row.decided_by !== "string") {
    throw new Error("Не удалось подтвердить решения по документам.");
  }
  return row;
}
interface State { key: string; data: DocumentApplicabilitySnapshot[] | null; loading: boolean; saving: boolean; error: string | null; conflict: boolean; uncertain: boolean; denied: boolean }
const blank = (key: string, loading: boolean): State => ({ key, data: null, loading, saving: false, error: null, conflict: false, uncertain: false, denied: false });
interface Operation { requirementId: string; decision: DocumentApplicabilitySnapshot["decision"]; reason: string; revision: number; profileRevision: number; catalogVersion: string; requestId: string }

export function useDocumentApplicabilityDecisions(organizationId: string, profileRevision: number | null, catalogVersion: string, canRead: boolean, canWrite: boolean) {
  const key = `${organizationId}:${canRead}:${profileRevision}:${catalogVersion}`;
  const currentKey = useRef(key), generation = useRef(0), busy = useRef(false), operation = useRef<Operation | null>(null);
  const rights = useRef({ canRead, canWrite }); rights.current = { canRead, canWrite };
  const [state, setState] = useState(() => blank(key, canRead));
  useLayoutEffect(() => {
    currentKey.current = key; ++generation.current; busy.current = false; operation.current = null; setState(blank(key, canRead));
    return () => { ++generation.current; };
  }, [key, canRead]);
  const reload = useCallback(async () => {
    if (!rights.current.canRead || currentKey.current !== key || busy.current) return;
    const run = ++generation.current; operation.current = null; setState(blank(key, true));
    try {
      const { data, error } = await (supabase.rpc as any)("list_organization_document_applicability_decisions", { p_organization_id: organizationId });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Invalid decisions");
      const rows = data.map(value => parseApplicabilityDecision(value, organizationId));
      if (new Set(rows.map(row => row.requirement_id)).size !== rows.length) throw new Error("Ambiguous current decisions");
      if (run === generation.current && currentKey.current === key) setState({ ...blank(key, false), data: rows });
    } catch (error) {
      if (run === generation.current && currentKey.current === key) setState({ ...blank(key, false), denied: (error as any)?.code === "42501", error: "Не удалось загрузить решения центра. Они не учтены в списке до успешной загрузки." });
    }
  }, [key, organizationId]);
  useEffect(() => { void reload(); }, [reload]);

  const save = async (requirementId: string, decision: DocumentApplicabilitySnapshot["decision"], rawReason: string): Promise<boolean> => {
    if (!rights.current.canRead || !rights.current.canWrite || currentKey.current !== key || state.key !== key || !state.data ||
        state.loading || state.conflict || state.denied || busy.current || !profileRevision || !requirementId || ![null, "applicable", "not_applicable"].includes(decision)) return false;
    const reason = rawReason.trim();
    if (!reason || reason.length > 4000) { setState(previous => ({ ...previous, error: "Укажите обоснование решения длиной до 4000 символов." })); return false; }
    const revision = state.data.find(row => row.requirement_id === requirementId)?.revision ?? 0;
    const pending = operation.current;
    const same = pending?.requirementId === requirementId && pending.decision === decision && pending.reason === reason && pending.revision === revision;
    if (state.uncertain && !same) { setState(previous => ({ ...previous, error: "Сначала повторите прежнее решение или загрузите сохранённые решения." })); return false; }
    if (!same) operation.current = { requirementId, decision, reason, revision, profileRevision, catalogVersion, requestId: crypto.randomUUID() };
    const request = operation.current!;
    const retrying = state.uncertain;
    const run = ++generation.current; busy.current = true; setState(previous => ({ ...previous, saving: true, error: null }));
    try {
      const { data, error } = await (supabase.rpc as any)("save_organization_document_applicability_decision", {
        p_organization_id: organizationId, p_requirement_id: request.requirementId, p_expected_revision: request.revision,
        p_profile_revision: request.profileRevision, p_catalog_version: request.catalogVersion,
        p_decision: request.decision, p_reason: request.reason, p_request_id: request.requestId,
      });
      if (error) throw error;
      const saved = parseApplicabilityDecision(data, organizationId);
      if (saved.requirement_id !== request.requirementId || saved.revision <= request.revision || saved.profile_revision !== request.profileRevision ||
          saved.catalog_version !== request.catalogVersion || saved.decision !== request.decision || saved.reason !== request.reason) throw new Error("Unconfirmed decision");
      if (run !== generation.current || currentKey.current !== key) return false;
      if (!rights.current.canWrite) {
        setState(previous => ({ ...previous, saving: false, uncertain: true, error: "Права изменились во время сохранения. Загрузите решения для сверки." }));
        return false;
      }
      operation.current = null;
      if (retrying) {
        try {
          const latest = await (supabase.rpc as any)("list_organization_document_applicability_decisions", { p_organization_id: organizationId });
          if (latest.error || !Array.isArray(latest.data)) throw new Error("Unconfirmed current decisions");
          const rows = latest.data.map((value: unknown) => parseApplicabilityDecision(value, organizationId));
          if (new Set(rows.map(row => row.requirement_id)).size !== rows.length ||
              !rows.some(row => row.requirement_id === saved.requirement_id && row.revision >= saved.revision)) throw new Error("Stale decisions after replay");
          if (run !== generation.current || currentKey.current !== key) return false;
          setState({ ...blank(key, false), data: rows });
        } catch {
          if (run !== generation.current || currentKey.current !== key) return false;
          setState({ ...blank(key, false), error: "Сохранение решения подтверждено. Не удалось загрузить текущие решения — обновите данные." });
        }
        return true;
      }
      setState(previous => ({ ...blank(key, false), data: [...(previous.data ?? []).filter(row => row.requirement_id !== requirementId), saved] }));
      return true;
    } catch (error) {
      if (run === generation.current && currentKey.current === key) {
        const code = (error as any)?.code, conflict = code === "40001", denied = code === "42501", uncertain = !conflict && !denied && code !== "22023";
        if (!uncertain) operation.current = null;
        setState(previous => ({ ...previous, saving: false, conflict, denied, uncertain, error: conflict
          ? "Профиль или решение уже изменились. Загрузите сохранённые данные и проверьте обоснование."
          : denied ? "Право изменить решение недоступно. Решение не подтверждено как сохранённое."
          : uncertain ? "Ответ о сохранении не получен. Повторите прежнее решение или загрузите сохранённые данные."
          : "Решение не сохранено. Проверьте обоснование и сохранённый профиль." }));
      }
      return false;
    } finally { if (run === generation.current && currentKey.current === key) busy.current = false; }
  };
  const loadHistory = async (requirementId: string, beforeRevision: number | null = null): Promise<DocumentApplicabilitySnapshot[] | null> => {
    if (!rights.current.canRead || currentKey.current !== key) return null;
    const run = generation.current;
    try {
      const { data, error } = await (supabase.rpc as any)("list_organization_document_applicability_history", {
        p_organization_id: organizationId, p_requirement_id: requirementId, p_limit: 25, p_before_revision: beforeRevision,
      });
      if (error || !Array.isArray(data)) return null;
      const rows = data.map(value => parseApplicabilityDecision(value, organizationId));
      if (rows.some(row => row.requirement_id !== requirementId || beforeRevision !== null && row.revision >= beforeRevision)) return null;
      return run === generation.current && currentKey.current === key ? rows : null;
    } catch { return null; }
  };
  return { ...(state.key === key ? state : blank(key, canRead)), reload, save, loadHistory };
}
