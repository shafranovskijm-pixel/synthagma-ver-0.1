import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ScopedOrgDocumentTransport } from "@/lib/programFiles";
import { canApproveWorkflow, normalizeWorkflowLinks, parseWorkflowEnvelope, validApprovalDate, workflowCandidatesSchema, workflowSchema,
  type WorkflowCandidates, type WorkflowEnvelope, type WorkflowLink } from "@/lib/orgDocumentWorkflow";

type State = { key: string; data: WorkflowEnvelope | null; candidates: WorkflowCandidates | null; loading: boolean; saving: boolean;
  error: string | null; denied: boolean; conflict: boolean; saved: boolean };
const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);
export function useOrgDocumentWorkflow(organizationId: string, documentId: string | null, refreshKey?: string | null, transport?: ScopedOrgDocumentTransport) {
  const key = `${organizationId}:${documentId ?? ""}:${refreshKey ?? ""}${transport ? ':' + transport.key : ''}`;
  const currentScope = () => { try { transport?.assertCurrent(); return true; } catch { return false; } };
  const active = useRef(key), generation = useRef(0), busy = useRef(false);
  const pending = useRef<{ key: string; requestId: string } | null>(null);
  const empty = (): State => ({ key, data: null, candidates: null, loading: !!documentId, saving: false, error: null, denied: false, conflict: false, saved: false });
  const [state, setState] = useState<State>(empty);
  useLayoutEffect(() => {
    active.current = key; ++generation.current; busy.current = false; pending.current = null; setState(empty());
    return () => { ++generation.current; };
  }, [key]);

  const readCurrent = useCallback(async () => {
    const result = await (transport?.rpc ?? rpc)("get_org_document_workflow", { p_document_id: documentId });
    transport?.assertCurrent();
    if (result.error) throw result.error;
    const data = parseWorkflowEnvelope(result.data, documentId!, organizationId);
    // Selector RPC is write-only. A read-only history view must not require it.
    if (!data.capabilities.can_configure) return { data, candidates: null };
    const choices = await (transport?.rpc ?? rpc)("list_org_document_review_candidates", { p_document_id: documentId });
    transport?.assertCurrent();
    if (choices.error) throw choices.error;
    return { data, candidates: workflowCandidatesSchema.parse(choices.data) };
  }, [documentId, organizationId, transport]);
  const reload = useCallback(async () => {
    if (!documentId || active.current !== key || busy.current || !currentScope()) return;
    const run = ++generation.current;
    setState(empty());
    try {
      const loaded = await readCurrent();
      if (active.current !== key || run !== generation.current || !currentScope()) return;
      pending.current = null;
      setState({ ...empty(), ...loaded, loading: false });
    } catch (error: any) {
      if (active.current !== key || run !== generation.current || !currentScope()) return;
      setState({ ...empty(), loading: false, denied: error?.code === "42501",
        error: error?.code === "42501" ? "Внутреннее согласование этого документа недоступно с вашими правами." : "Не удалось загрузить согласование. Повторите загрузку." });
    }
  }, [key, documentId, readCurrent]);
  useEffect(() => { void reload(); }, [reload]);

  const mutate = async (name: string, args: Record<string, unknown>): Promise<boolean> => {
    if (!documentId || active.current !== key || state.key !== key || !state.data || state.loading || state.conflict || busy.current || !currentScope()) return false;
    const requestKey = JSON.stringify([name, args]);
    if (pending.current && pending.current.key !== requestKey) {
      setState(s => ({ ...s, error: "Исход предыдущего сохранения не подтверждён. Повторите его или обновите документ перед другим действием." }));
      return false;
    }
    pending.current ??= { key: requestKey, requestId: crypto.randomUUID() };
    busy.current = true;
    const run = ++generation.current;
    setState(s => ({ ...s, saving: true, error: null, saved: false }));
    let committed = false;
    try {
      const result = await (transport?.rpc ?? rpc)(name, { ...args, p_request_id: pending.current.requestId });
      if (result.error) throw result.error;
      const w = workflowSchema.parse(result.data);
      if (w.document_id !== documentId || w.organization_id !== organizationId || w.version_id !== state.data.document.current_version_id) throw new Error("Unexpected workflow result");
      committed = true;
      if (active.current !== key || run !== generation.current || !currentScope()) return false;
      pending.current = null;
      // A replay is the original receipt, not necessarily the current workflow.
      const loaded = await readCurrent();
      if (active.current !== key || run !== generation.current || !currentScope()) return false;
      setState({ ...empty(), ...loaded, loading: false, saved: true });
      return true;
    } catch (error: any) {
      if (active.current !== key || run !== generation.current || !currentScope()) return false;
      const conflict = error?.code === "40001" || error?.code === "55000" || !!transport && error?.code === "PT409";
      if (conflict || error?.code === "42501" || error?.code === "22023") pending.current = null;
      setState(s => ({ ...s, data: committed ? null : s.data, candidates: committed ? null : s.candidates,
        saving: false, loading: false, conflict, denied: error?.code === "42501", saved: committed,
        error: committed ? "Изменение сохранено, но текущее состояние не загрузилось. Обновите документ перед следующим действием."
          : conflict ? "Документ или согласование изменились. Обновите и проверьте текущую версию."
          : error?.code === "42501" ? "Действие недоступно: проверьте права и назначенных сотрудников."
          : error?.code === "22023" ? "Проверьте выбранных сотрудников, связи и данные решения."
          : "Сохранение не подтверждено. Повторите то же действие или обновите документ." }));
      return false;
    } finally { if (active.current === key && run === generation.current) busy.current = false; }
  };
  const usable = state.key === key && state.data && !state.loading && !state.saving && !state.conflict && !state.denied;
  const saveDraft = async (responsible: string, reviewer: string, links: WorkflowLink[]) => {
    const d = state.data;
    if (!usable || !d?.capabilities.can_configure || !d.document.current_version_id || !state.candidates
      || d.workflow && !["draft", "changes_requested"].includes(d.workflow.state)
      || [responsible, reviewer].some(user => !state.candidates!.actors.some(a => a.user_id === user))) return false;
    return mutate("save_org_document_review_draft", { p_document_id: documentId, p_version_id: d.document.current_version_id,
      p_expected_document_revision: d.document.document_revision, p_expected_workflow_revision: d.revision,
      p_responsible_user_id: responsible, p_reviewer_user_id: reviewer, p_links: normalizeWorkflowLinks(links) });
  };
  const transition = async (action: "submit" | "request_changes" | "approve" | "cancel", note = "", number = "", date = "") => {
    const d = state.data, w = d?.workflow;
    if (!usable || !d || !w) return false;
    if (action === "submit" && (!d.capabilities.can_submit || !["draft", "changes_requested"].includes(w.state))) return false;
    if (action === "request_changes" && (!d.capabilities.can_request_changes || w.state !== "in_review" || !note.trim())) return false;
    if (action === "approve" && (!canApproveWorkflow(d) || !number.trim() || number.length > 200 || !validApprovalDate(date))) return false;
    if (action === "cancel" && !d.capabilities.can_cancel) return false;
    return mutate("transition_org_document_review", { p_review_id: w.id, p_expected_workflow_revision: w.revision,
      p_expected_document_revision: d.document.document_revision, p_action: action, p_note: note.trim() || null,
      p_approval_number: action === "approve" ? number.trim() : null, p_approval_date: action === "approve" ? date : null });
  };
  const addComment = async (text: string, quote: string | null = null, anchor: unknown = null) => {
    const d = state.data, w = d?.workflow;
    if (!usable || !d?.capabilities.can_comment || !w || !text.trim() || text.length > 4000) return false;
    return mutate("add_org_document_review_comment", { p_review_id: w.id, p_version_id: w.version_id,
      p_expected_workflow_revision: w.revision, p_text: text.trim(), p_quote: quote, p_anchor: anchor });
  };
  const resolveComment = async (commentId: string, resolution: "accepted" | "declined", reply = "") => {
    const d = state.data, w = d?.workflow;
    if (!usable || !d?.capabilities.can_decide || !w || !["in_review", "changes_requested"].includes(w.state) || !w.comments.some(c => c.id === commentId && !c.resolved)) return false;
    return mutate("resolve_org_document_review_comment", { p_comment_id: commentId, p_expected_workflow_revision: w.revision,
      p_resolution: resolution, p_reply: reply.trim() || null });
  };
  return { ...(state.key === key && currentScope() ? state : empty()), reload, saveDraft, transition, addComment, resolveComment };
}
