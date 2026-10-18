import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseEducationProfile, type EducationProfileV1 } from "@/lib/uc-compliance/model";

export interface EducationProfileSnapshot {
  organization_id: string;
  revision: number;
  profile: EducationProfileV1;
  updated_at: string | null;
  updated_by: string | null;
}

export function parseEducationProfileSnapshot(value: unknown, organizationId: string): EducationProfileSnapshot {
  const data = value as EducationProfileSnapshot | null;
  if (!data || data.organization_id !== organizationId || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !(data.updated_at === null || typeof data.updated_at === "string") ||
      !(data.updated_by === null || typeof data.updated_by === "string")) {
    throw new Error("Не удалось подтвердить профиль центра. Обновите данные.");
  }
  return { ...data, profile: parseEducationProfile(data.profile) };
}

interface State {
  key: string;
  data: EducationProfileSnapshot | null;
  loading: boolean;
  saving: boolean;
  denied: boolean;
  conflict: boolean;
  uncertain: boolean;
  error: string | null;
}
interface SaveOperation { profile: EducationProfileV1; revision: number; requestId: string }
const blank = (key: string, loading: boolean): State => ({ key, data: null, loading, saving: false, denied: false, conflict: false, uncertain: false, error: null });

/** Server CAS is authoritative. A lost response is retried with the same request,
 * never treated as a saved profile or replaced with inferred organization facts. */
export function useEducationComplianceProfile(organizationId: string, canRead: boolean, canWrite: boolean) {
  const key = `${organizationId}:${canRead}`;
  const currentKey = useRef(key);
  const permissions = useRef({ canRead, canWrite });
  permissions.current = { canRead, canWrite };
  const generation = useRef(0);
  const busy = useRef(false);
  const operation = useRef<SaveOperation | null>(null);
  const [state, setState] = useState<State>(() => blank(key, canRead));
  useLayoutEffect(() => {
    currentKey.current = key; ++generation.current; busy.current = false; operation.current = null;
    setState(blank(key, canRead));
    return () => { ++generation.current; };
  }, [key, canRead]);

  const reload = useCallback(async () => {
    if (!organizationId || !permissions.current.canRead || currentKey.current !== key || busy.current) return;
    const run = ++generation.current;
    operation.current = null;
    setState(blank(key, true));
    try {
      const { data, error } = await (supabase.rpc as any)("get_organization_education_profile", { p_organization_id: organizationId });
      if (error) throw error;
      const snapshot = parseEducationProfileSnapshot(data, organizationId);
      if (run === generation.current && currentKey.current === key) setState({ ...blank(key, false), data: snapshot });
    } catch (error) {
      if (run !== generation.current || currentKey.current !== key) return;
      const denied = (error as { code?: string })?.code === "42501";
      setState({ ...blank(key, false), denied, error: denied
        ? "Профиль центра доступен сотрудникам с правом работы с документами всей организации."
        : "Не удалось загрузить профиль центра. Повторите попытку." });
    }
  }, [organizationId, key]);
  useEffect(() => { void reload(); }, [reload]);

  const save = async (input: EducationProfileV1): Promise<boolean> => {
    if (!permissions.current.canRead || !permissions.current.canWrite || currentKey.current !== key || state.key !== key ||
        !state.data || state.loading || state.conflict || state.denied || busy.current) return false;
    let profile: EducationProfileV1;
    try { profile = parseEducationProfile(input); }
    catch { setState(previous => ({ ...previous, error: "Проверьте заполнение профиля. Неизвестные сведения оставьте неуказанными." })); return false; }
    if (state.uncertain && operation.current && JSON.stringify(operation.current.profile) !== JSON.stringify(profile)) {
      setState(previous => ({ ...previous, error: "Сначала повторите сохранение прежних данных или загрузите сохранённый профиль." }));
      return false;
    }
    if (!operation.current || operation.current.revision !== state.data.revision || JSON.stringify(operation.current.profile) !== JSON.stringify(profile)) {
      operation.current = { profile, revision: state.data.revision, requestId: crypto.randomUUID() };
    }
    const pending = operation.current;
    const retrying = state.uncertain;
    busy.current = true;
    const run = ++generation.current;
    setState(previous => ({ ...previous, saving: true, error: null }));
    try {
      const { data, error } = await (supabase.rpc as any)("save_organization_education_profile", {
        p_organization_id: organizationId, p_expected_revision: pending.revision,
        p_profile: pending.profile, p_request_id: pending.requestId,
      });
      if (error) throw error;
      const saved = parseEducationProfileSnapshot(data, organizationId);
      if (saved.revision <= pending.revision || JSON.stringify(saved.profile) !== JSON.stringify(pending.profile)) throw new Error("Unconfirmed saved profile");
      if (run !== generation.current || currentKey.current !== key) return false;
      if (!permissions.current.canWrite) {
        setState(previous => ({ ...previous, saving: false, uncertain: true, error: "Права изменились во время сохранения. Загрузите профиль для сверки." }));
        return false;
      }
      operation.current = null;
      if (retrying) {
        // A replay proves this request committed, but another tab may have saved
        // a later revision meanwhile. Do not present the replay as current.
        try {
          const latest = await (supabase.rpc as any)("get_organization_education_profile", { p_organization_id: organizationId });
          if (latest.error) throw latest.error;
          const current = parseEducationProfileSnapshot(latest.data, organizationId);
          if (current.revision < saved.revision) throw new Error("Stale profile after replay");
          if (run !== generation.current || currentKey.current !== key) return false;
          setState({ ...blank(key, false), data: current });
        } catch {
          if (run !== generation.current || currentKey.current !== key) return false;
          setState({ ...blank(key, false), error: "Сохранение подтверждено. Не удалось загрузить текущую версию профиля — обновите данные." });
        }
        return true;
      }
      setState({ ...blank(key, false), data: saved });
      return true;
    } catch (error) {
      if (run === generation.current && currentKey.current === key) {
        const code = (error as { code?: string })?.code;
        const conflict = code === "40001", denied = code === "42501";
        const uncertain = !conflict && !denied && code !== "22023";
        if (!uncertain) operation.current = null;
        setState(previous => ({ ...previous, saving: false, conflict, denied, uncertain, error: conflict
          ? "Профиль уже изменился. Загрузите сохранённые сведения и проверьте их перед новой правкой."
          : denied ? "Право изменять профиль недоступно. Сведения не подтверждены как сохранённые."
          : uncertain ? "Ответ о сохранении не получен. Повторите тот же запрос или загрузите сохранённый профиль."
          : "Профиль не сохранён. Проверьте сведения и привязку документа-основания." }));
      }
      return false;
    } finally { if (run === generation.current && currentKey.current === key) busy.current = false; }
  };
  const loadHistory = async (beforeRevision: number | null = null): Promise<EducationProfileSnapshot[] | null> => {
    if (!permissions.current.canRead || currentKey.current !== key) return null;
    const run = generation.current;
    try {
      const { data, error } = await (supabase.rpc as any)("list_organization_education_profile_history", {
        p_organization_id: organizationId, p_limit: 25, p_before_revision: beforeRevision,
      });
      if (error || !Array.isArray(data)) return null;
      const rows = data.map(value => parseEducationProfileSnapshot(value, organizationId));
      if (rows.some((row, index) => row.revision < 1 || beforeRevision !== null && row.revision >= beforeRevision || index > 0 && rows[index - 1].revision <= row.revision)) return null;
      return run === generation.current && currentKey.current === key ? rows : null;
    } catch { return null; }
  };
  return { ...(state.key === key ? state : blank(key, canRead)), reload, save, loadHistory };
}
