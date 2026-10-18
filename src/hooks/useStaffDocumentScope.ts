import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StaffDocumentScope {
  staff_id: string;
  organization_id: string;
  revision: number;
  group_ids: string[];
  scope: "organization" | "assigned_groups";
  available_groups: { id: string; name: string }[];
}

export function parseStaffDocumentScope(value: unknown, organizationId: string, staffId: string): StaffDocumentScope {
  const data = value as StaffDocumentScope | null;
  if (!data || data.staff_id !== staffId || data.organization_id !== organizationId ||
      !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !["organization", "assigned_groups"].includes(data.scope) ||
      !Array.isArray(data.group_ids) || data.group_ids.some(id => typeof id !== "string" || !id) ||
      new Set(data.group_ids).size !== data.group_ids.length || !Array.isArray(data.available_groups) ||
      data.available_groups.some(group => !group || typeof group.id !== "string" || !group.id || typeof group.name !== "string") ||
      new Set(data.available_groups.map(group => group.id)).size !== data.available_groups.length ||
      data.group_ids.some(id => !data.available_groups.some(group => group.id === id))) {
    throw new Error("Не удалось подтвердить доступ к группам. Повторите загрузку.");
  }
  return data;
}

export function useStaffDocumentScope(organizationId: string, staffId: string | null, canWrite: boolean) {
  const key = `${organizationId}:${staffId ?? ""}`;
  const currentKey = useRef(key);
  const generation = useRef(0);
  const busy = useRef(false);
  const [state, setState] = useState<{ key: string; data: StaffDocumentScope | null; loading: boolean; saving: boolean; error: string | null; conflict: boolean }>(
    { key, data: null, loading: !!staffId, saving: false, error: null, conflict: false });
  useLayoutEffect(() => {
    currentKey.current = key;
    generation.current += 1;
    busy.current = false;
    setState({ key, data: null, loading: !!staffId, saving: false, error: null, conflict: false });
    return () => { generation.current += 1; };
  }, [key, staffId]);

  const reload = useCallback(async () => {
    if (!staffId || currentKey.current !== key || busy.current) return;
    const run = ++generation.current;
    setState({ key, data: null, loading: true, saving: false, error: null, conflict: false });
    try {
      const { data, error } = await (supabase.rpc as any)("get_org_staff_document_scope", {
        p_organization_id: organizationId, p_staff_id: staffId,
      });
      if (error) throw error;
      const scope = parseStaffDocumentScope(data, organizationId, staffId);
      if (run === generation.current && currentKey.current === key) {
        setState({ key, data: scope, loading: false, saving: false, error: null, conflict: false });
      }
    } catch {
      if (run === generation.current && currentKey.current === key) {
        setState({ key, data: null, loading: false, saving: false, error: "Не удалось загрузить группы сотрудника. Повторите попытку.", conflict: false });
      }
    }
  }, [organizationId, staffId, key]);
  useEffect(() => { void reload(); }, [reload]);

  const save = async (groupIds: string[]): Promise<boolean> => {
    if (!canWrite || !staffId || currentKey.current !== key || state.key !== key || !state.data ||
        state.data.scope !== "assigned_groups" || state.loading || state.conflict || busy.current) return false;
    const ids = [...new Set(groupIds)].sort();
    if (ids.length > 500 || ids.some(id => !state.data!.available_groups.some(group => group.id === id))) return false;
    busy.current = true;
    const run = ++generation.current;
    setState(previous => ({ ...previous, saving: true, error: null }));
    try {
      const { data, error } = await (supabase.rpc as any)("set_org_staff_document_groups", {
        p_organization_id: organizationId, p_staff_id: staffId, p_group_ids: ids, p_expected_revision: state.data.revision,
      });
      if (error) throw error;
      const saved = parseStaffDocumentScope(data, organizationId, staffId);
      if (saved.scope !== "assigned_groups" || JSON.stringify([...saved.group_ids].sort()) !== JSON.stringify(ids)) {
        throw { code: "40001" };
      }
      if (run !== generation.current || currentKey.current !== key) return false;
      setState({ key, data: saved, loading: false, saving: false, error: null, conflict: false });
      return true;
    } catch (error) {
      if (run === generation.current && currentKey.current === key) {
        const conflict = (error as { code?: string })?.code === "40001";
        setState(previous => ({ ...previous, saving: false, conflict, error: conflict
          ? "Назначения изменились. Обновите список и проверьте группы перед сохранением."
          : "Не удалось подтвердить сохранение. Обновите список перед повторной попыткой." }));
      }
      return false;
    } finally {
      if (run === generation.current && currentKey.current === key) busy.current = false;
    }
  };
  const visible = state.key === key ? state : { key, data: null, loading: !!staffId, saving: false, error: null, conflict: false };
  return { ...visible, reload, save };
}
