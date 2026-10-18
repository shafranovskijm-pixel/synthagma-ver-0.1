import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StaffDocumentGrants {
  id: string;
  organization_id: string;
  role: string;
  sections_access: unknown[] | null;
}
function parseGrants(value: unknown, organizationId: string, staffId: string): StaffDocumentGrants {
  const row = value as StaffDocumentGrants | null;
  if (!row || row.id !== staffId || row.organization_id !== organizationId || typeof row.role !== "string" ||
      (row.sections_access !== null && !Array.isArray(row.sections_access))) throw new Error("Invalid staff grants");
  return row;
}
export function useStaffDocumentGrants(organizationId: string, staffId: string | null,
  capabilities: { canManage: boolean; canGrantSign: boolean; canGrantIssue: boolean }) {
  const key = `${organizationId}:${staffId ?? ""}`;
  const currentKey = useRef(key);
  const generation = useRef(0);
  const busy = useRef(false);
  const [state, setState] = useState<{ key: string; data: StaffDocumentGrants | null; loading: boolean; saving: boolean; error: string | null; needsReload: boolean }>(
    { key, data: null, loading: !!staffId, saving: false, error: null, needsReload: false });
  useLayoutEffect(() => {
    currentKey.current = key; generation.current++; busy.current = false;
    setState({ key, data: null, loading: !!staffId, saving: false, error: null, needsReload: false });
    return () => { generation.current++; };
  }, [key, staffId]);
  const reload = useCallback(async () => {
    if (!staffId || key !== currentKey.current || busy.current) return;
    const run = ++generation.current;
    setState({ key, data: null, loading: true, saving: false, error: null, needsReload: false });
    try {
      const { data, error } = await (supabase.rpc as any)("get_org_staff_document_grants", { p_org: organizationId, p_staff: staffId });
      if (error) throw error;
      const row = parseGrants(data, organizationId, staffId);
      if (run === generation.current && key === currentKey.current)
        setState({ key, data: row, loading: false, saving: false, error: null, needsReload: false });
    } catch {
      if (run === generation.current && key === currentKey.current)
        setState({ key, data: null, loading: false, saving: false, error: "Не удалось загрузить права сотрудника.", needsReload: true });
    }
  }, [key, organizationId, staffId]);
  useEffect(() => { void reload(); }, [reload]);
  const save = async (sign: boolean, issue: boolean) => {
    const row = state.data;
    if (!staffId || currentKey.current !== key || state.key !== key || !row || state.loading || state.needsReload || busy.current ||
        !capabilities.canManage || ["owner", "admin"].includes(row.role)) return false;
    if ((sign && !row.sections_access?.includes("documents.sign") && !capabilities.canGrantSign) ||
        (issue && !row.sections_access?.includes("documents.issue") && !capabilities.canGrantIssue)) return false;
    busy.current = true;
    const run = ++generation.current;
    setState(previous => ({ ...previous, saving: true, error: null }));
    try {
      const { data, error } = await (supabase.rpc as any)("set_org_staff_document_grants", {
        p_org: organizationId, p_staff: staffId, p_expected_role: row.role,
        p_expected_sections_access: row.sections_access, p_sign: sign, p_issue: issue,
      });
      if (error) throw error;
      const saved = parseGrants(data, organizationId, staffId);
      if (saved.role !== row.role || !!saved.sections_access?.includes("documents.sign") !== sign ||
          !!saved.sections_access?.includes("documents.issue") !== issue) throw new Error("Unconfirmed grants");
      if (run !== generation.current || key !== currentKey.current) return false;
      setState({ key, data: saved, loading: false, saving: false, error: null, needsReload: false });
      return true;
    } catch (error) {
      if (run === generation.current && key === currentKey.current) {
        const conflict = ["40001", "409"].includes((error as { code?: string })?.code ?? "");
        setState(previous => ({ ...previous, saving: false, needsReload: true, error: conflict
          ? "Роль или права изменились. Обновите данные и проверьте выбор."
          : "Не удалось подтвердить сохранение прав. Обновите данные перед повторной попыткой." }));
      }
      return false;
    } finally { if (run === generation.current && key === currentKey.current) busy.current = false; }
  };
  const visible = state.key === key ? state : { key, data: null, loading: !!staffId, saving: false, error: null, needsReload: false };
  return { ...visible, reload, save };
}
