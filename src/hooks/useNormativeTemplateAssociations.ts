import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isCurrentOrganizationAccess, useDocumentActionPermissions } from "@/hooks/useDocumentActionPermissions";
import { captureOfflineContext, isOfflineActorCurrent } from "@/utils/courseCache";
import { supabase } from "@/integrations/supabase/client";
import { confirmTemplateReceipt, parseTemplatePage, templateCommandSchema, type TemplateAssociationPage, type TemplateCommand, type TemplateQuery } from "@/lib/normativeGovernance/templateAssociations";
interface State { key: string; page: TemplateAssociationPage | null; loading: boolean; saving: boolean; uncertain: boolean; conflict: boolean; error: string | null }
interface Operation { command: TemplateCommand; requestId: string; expectedRevision: number }
const blank = (key: string): State => ({ key, page: null, loading: false, saving: false, uncertain: false, conflict: false, error: null });
function errorCode(error: unknown): string | undefined {
  try { const value = (error as { code?: unknown })?.code; return typeof value === "string" ? value : undefined; }
  catch { return undefined; }
}
export function useNormativeTemplateAssociations(organizationId: string, manifestId: string, manifestSha256: string, allowWrite: boolean) {
  const auth = useAuth(), permissions = useStaffPermissions(), documentPermissions = useDocumentActionPermissions(organizationId), actor = captureOfflineContext();
  const readable = !auth.loading && !auth.authError && !!auth.user?.id && actor?.actorId === auth.user.id && !permissions.loading && !permissions.error
    && isCurrentOrganizationAccess(permissions, organizationId) && (permissions.can("documents.read") || permissions.can("documents.write"));
  const writable = readable && allowWrite && documentPermissions.canWrite;
  const key = JSON.stringify([organizationId, manifestId, manifestSha256, auth.user?.id, auth.userRole, auth.loading, actor?.revision, permissions.organizationId,
    permissions.loading, permissions.error, permissions.orgRole, permissions.adminRole, [...permissions.orgPermissions].sort(), readable, writable]);
  const currentKey = useRef(key); currentKey.current = key;
  const sequence = useRef(0), busy = useRef(false), pending = useRef<Operation | null>(null), lastQuery = useRef<TemplateQuery | null>(null);
  const [state, setState] = useState<State>(() => blank(key));
  const liveState = useRef(state); liveState.current = state;
  const current = useCallback((run: number) => readable && currentKey.current === key && sequence.current === run && !!actor && isOfflineActorCurrent(actor.actorId, actor.revision), [key, readable, actor?.actorId, actor?.revision]);
  useLayoutEffect(() => { ++sequence.current; busy.current = false; pending.current = null; lastQuery.current = null; setState(blank(key)); return () => { ++sequence.current; }; }, [key]);
  const read = useCallback(async (query: TemplateQuery, append = false) => {
    if (!readable || currentKey.current !== key || busy.current) return false;
    const previous = liveState.current;
    if (append && (!previous.page || previous.key !== key || previous.page.complete)) return false;
    const run = ++sequence.current; busy.current = true;
    if (!append) pending.current = null;
    lastQuery.current = query; setState(old => ({ ...(!append ? blank(key) : old), loading: true, error: null }));
    try {
      const { data, error } = await (supabase.rpc as any)("read_normative_template_associations", { p_organization_id: organizationId, p_manifest_id: manifestId, p_query: query });
      if (error) throw error;
      const page = parseTemplatePage(data, { organizationId, actorId: actor!.actorId, manifestId, manifestSha256 }, query);
      if (!current(run)) return false;
      if (append && previous.page && (previous.page.revision !== page.revision || previous.page.kind !== page.kind)) throw { code: "40001" };
      const merged = append && previous.page ? { ...page, items: [...previous.page.items, ...page.items] } as TemplateAssociationPage : page;
      if (append && new Set(merged.items.map(item => "id" in item ? item.id : item.versionId)).size !== merged.items.length) throw { code: "40001" };
      setState({ ...blank(key), page: merged }); return true;
    } catch (error) {
      if (current(run)) setState({ ...blank(key), conflict: errorCode(error) === "40001", error: "Не удалось подтвердить связи и границы страницы. Обновите список; отсутствие данных не означает отсутствие влияния." });
      return false;
    } finally { if (current(run)) busy.current = false; }
  }, [key, readable, organizationId, manifestId, manifestSha256, actor?.actorId, current]);
  const perform = useCallback(async (operation: Operation, retry: boolean) => {
    const snapshot = liveState.current;
    if (!writable || currentKey.current !== key || busy.current || snapshot.key !== key || !snapshot.page || snapshot.loading || snapshot.conflict
      || snapshot.uncertain && (!retry || pending.current !== operation)) return false;
    const run = ++sequence.current; busy.current = true; pending.current = operation;
    setState(old => ({ ...old, saving: true, error: null }));
    let confirmed = false;
    try {
      const { data, error } = await (supabase.rpc as any)("record_normative_template_association", { p_organization_id: organizationId, p_expected_revision: operation.expectedRevision, p_request_id: operation.requestId, p_command: operation.command });
      if (error) throw error;
      confirmTemplateReceipt(data, { organizationId, actorId: actor!.actorId, requestId: operation.requestId, expectedRevision: operation.expectedRevision }, operation.command);
      if (!current(run)) return false;
      pending.current = null; confirmed = true;
      setState({ ...blank(key), error: "Связь сохранена. Обновите список для чтения подтверждённой редакции." });
      return true;
    } catch (error) {
      if (current(run)) {
        const code = errorCode(error), conflict = code === "40001", definite = conflict || code === "42501" || code?.startsWith("22");
        if (definite) pending.current = null;
        setState(old => ({ ...old, saving: false, conflict, uncertain: !definite,
          error: conflict ? "Версия, источник или журнал изменились. Обновите данные перед новым действием." : definite ? "Связь не сохранена: проверьте текущие права, точную версию и источник."
            : "Ответ о сохранении не подтверждён. Повторите прежний запрос или обновите журнал; новое действие пока недоступно." }));
      }
      return false;
    } finally {
      if (current(run)) {
        busy.current = false;
        if (confirmed && lastQuery.current) { const query = lastQuery.current; void read(query.kind === "versions" ? { ...query, afterId: null } : { ...query, afterRevision: null }); }
      }
    }
  }, [key, writable, organizationId, actor?.actorId, current, read]);
  const record = useCallback((input: TemplateCommand) => {
    const snapshot = liveState.current, parsed = templateCommandSchema.safeParse(input);
    if (!parsed.success || snapshot.key !== key || !snapshot.page || snapshot.uncertain || snapshot.saving || snapshot.loading || snapshot.conflict || !writable) return Promise.resolve(false);
    // Exact caller-selected pin; the server rechecks the source and current target under its write lock.
    return perform({ command: parsed.data, expectedRevision: snapshot.page.revision, requestId: crypto.randomUUID() }, false);
  }, [key, writable, perform]);
  const retry = useCallback(() => pending.current ? perform(pending.current, true) : Promise.resolve(false), [perform]);
  useEffect(() => { void read({ kind: "versions", targetKind: "contract_template_version", afterId: null, limit: 25 }); }, [read]);
  return { ...(state.key === key ? state : blank(key)), readable, writable, read, record, retry };
}
