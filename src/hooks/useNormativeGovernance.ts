import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CATALOG_VERSION, CATALOG_AS_OF, LEGAL_SOURCES, REQUIREMENTS } from "@/lib/uc-compliance/catalog";
import { canonicalNormativeJson, createNormativeManifest, type NormativeManifest } from "@/lib/normativeGovernance/manifest";
import { parseGovernanceSnapshot, impactCentresPageSchema, type ImpactCentresPage, type NormativeCommand, type NormativeGovernanceSnapshot } from "@/lib/normativeGovernance/model";
interface State { key: string; data: NormativeGovernanceSnapshot | null; loading: boolean; saving: boolean; conflict: boolean; uncertain: boolean; error: string | null }
const blank = (key: string, loading = false): State => ({ key, data: null, loading, saving: false, conflict: false, uncertain: false, error: null });
interface Operation { name: "register_normative_manifest" | "record_normative_governance_event"; args: Record<string, unknown>; identity: string; kind: string; manifestId: string | null; manifestSha256: string | null }
export function useNormativeGovernance(organizationId: string, canRead: boolean, canWrite: boolean, profileRevision: number | null) {
  const key = organizationId + ":" + canRead + ":" + canWrite + ":" + profileRevision;
  const currentKey = useRef(key), epoch = useRef(0), busy = useRef(false), operation = useRef<Operation | null>(null);
  const rights = useRef({ canRead, canWrite }); rights.current = { canRead, canWrite };
  const [state, setState] = useState<State>(() => blank(key, canRead));
  useLayoutEffect(() => { currentKey.current = key; ++epoch.current; busy.current = false; operation.current = null; setState(blank(key, canRead));
    return () => { ++epoch.current; }; }, [key, canRead]);
  const current = (run: number) => currentKey.current === key && epoch.current === run && rights.current.canRead;
  const reload = useCallback(async (manifestId: string | null = null) => {
    if (!rights.current.canRead || currentKey.current !== key || busy.current) return;
    const run = ++epoch.current; operation.current = null; setState(blank(key, true));
    try {
      const { data, error } = await (supabase.rpc as any)("read_normative_governance", { p_organization_id: organizationId, p_manifest_id: manifestId });
      if (error) throw error;
      const parsed = await parseGovernanceSnapshot(data, organizationId);
      if (parsed.profileRevision !== profileRevision) throw Error("NORMATIVE_PROFILE_CHANGED");
      if (current(run)) setState({ ...blank(key), data: parsed });
    } catch { if (current(run)) setState({ ...blank(key), error: "Не удалось подтвердить журнал нормативного каталога. Статусы не считаются проверенными до загрузки." }); }
  }, [key, organizationId, profileRevision]);
  useEffect(() => { void reload(); }, [reload]);
  const perform = async (request: Operation, retry = false): Promise<boolean> => {
    if (!rights.current.canRead || !rights.current.canWrite || currentKey.current !== key || busy.current || !state.data || state.loading || state.conflict) return false;
    if (state.uncertain && (!retry || request !== operation.current)) return false;
    const run = ++epoch.current; busy.current = true; operation.current = request; setState(previous => ({ ...previous, saving: true, error: null }));
    try {
      const { data, error } = await (supabase.rpc as any)(request.name, request.args); if (error) throw error;
      const parsed = await parseGovernanceSnapshot(data?.snapshot, organizationId), receipt = data?.receipt;
      const requestId = request.args.p_request_id;
      if (parsed.profileRevision !== profileRevision) throw Error("NORMATIVE_PROFILE_CHANGED");
      if (!receipt || receipt.requestId !== requestId || receipt.actorId !== parsed.actorId || receipt.kind !== request.kind
        || request.manifestId !== null && receipt.manifestId !== request.manifestId
        || request.manifestSha256 !== null && receipt.manifestSha256 !== request.manifestSha256
        || request.kind === "register" && !parsed.manifests.some(entry => entry.id === receipt.manifestId && entry.manifest.sha256 === request.manifestSha256)) throw Error("NORMATIVE_WRITE_UNCONFIRMED");
      if (!current(run)) return false;
      if (!rights.current.canWrite) { setState(previous => ({ ...previous, saving: false, uncertain: true, error: "Права изменились во время сохранения. Загрузите журнал для сверки." })); return false; }
      operation.current = null; setState({ ...blank(key), data: parsed }); return true;
    } catch (error) {
      if (current(run)) {
        const code = (error as { code?: string })?.code, conflict = code === "40001", definite = conflict || code === "42501" || code?.startsWith("22");
        if (definite) operation.current = null;
        setState(previous => ({ ...previous, saving: false, conflict, uncertain: !definite, error: conflict ? "Журнал уже изменился. Загрузите текущую редакцию перед новым решением."
          : code === "42501" ? "Текущих прав для этого действия нет. Сохранение не подтверждено."
          : definite ? "Действие не сохранено. Проверьте источник, срок и необходимые отдельные решения."
          : "Ответ о сохранении не получен. Повторите тот же запрос или загрузите журнал; новое решение пока недоступно." }));
      }
      return false;
    } finally { if (current(run)) busy.current = false; }
  };
  const record = async (command: NormativeCommand): Promise<boolean> => {
    if (!state.data || state.key !== key || state.uncertain || state.saving || state.loading || state.conflict) return false;
    if (command.kind === "centre_accepted" ? !state.data.canAccept : !state.data.canManage) return false;
    const selected = state.data.manifests.find(entry => entry.id === command.manifestId);
    if (command.manifestId !== null && !selected) return false;
    return perform({ name: "record_normative_governance_event", identity: canonicalNormativeJson(command), kind: command.kind,
      manifestId: command.manifestId, manifestSha256: selected?.manifest.sha256 ?? null,
      args: { p_organization_id: organizationId, p_expected_sequence: command.kind === "centre_accepted" ? state.data.centreSequence : state.data.globalSequence,
        p_kind: command.kind, p_manifest_id: command.manifestId, p_body: command.body, p_request_id: crypto.randomUUID() } });
  };
  const registerCurrent = async (): Promise<boolean> => {
    if (!state.data?.canManage || state.key !== key || state.uncertain || state.saving || state.loading || state.conflict || busy.current || !rights.current.canWrite) return false;
    const run = epoch.current;
    let manifest: NormativeManifest;
    try { manifest = await createNormativeManifest({ catalogVersion: CATALOG_VERSION, asOf: CATALOG_AS_OF, sources: Object.values(LEGAL_SOURCES), requirements: REQUIREMENTS }); }
    catch { if (current(run)) setState(previous => ({ ...previous, error: "Не удалось проверить снимок встроенного каталога. Редакция не отправлена." })); return false; }
    if (!current(run)) return false;
    const { sha256, ...body } = manifest;
    if (state.data.manifests.some(entry => entry.manifest.sha256 === sha256)) { setState(previous => ({ ...previous, error: "Эта редакция уже есть в журнале. Откройте её историю; новая копия не создана." })); return false; }
    return perform({ name: "register_normative_manifest", kind: "register", manifestId: null, manifestSha256: sha256, identity: sha256,
      args: { p_organization_id: organizationId, p_expected_sequence: state.data.globalSequence, p_canonical_body: canonicalNormativeJson(body), p_sha256: sha256, p_request_id: crypto.randomUUID() } });
  };
  const retry = () => operation.current ? perform(operation.current, true) : Promise.resolve(false);
  const loadImpactCentres = async (beforeOrganizationId: string | null = null): Promise<ImpactCentresPage | null> => {
    const selected = state.data?.selectedManifestId;
    if (!state.data?.canManage || !selected || state.key !== key || !rights.current.canRead || state.loading || state.saving) return null;
    const run = epoch.current;
    try {
      const { data, error } = await (supabase.rpc as any)("list_normative_impact_centres", { p_context_organization_id: organizationId, p_manifest_id: selected, p_before_organization_id: beforeOrganizationId, p_limit: 25 });
      if (error) return null;
      const page = impactCentresPageSchema.parse(data);
      if (page.contextOrganizationId !== organizationId || page.manifestId !== selected || page.items.some(item => beforeOrganizationId !== null && item.organizationId >= beforeOrganizationId)
        || new Set(page.items.map(item => item.organizationId)).size !== page.items.length || page.complete !== (page.nextBeforeOrganizationId === null)
        || !page.complete && (page.items.length !== 25 || page.nextBeforeOrganizationId !== page.items.at(-1)?.organizationId)) return null;
      return current(run) ? page : null;
    } catch { return null; }
  };
  return { ...(state.key === key ? state : blank(key, canRead)), reload, record, registerCurrent, retry, loadImpactCentres };
}
