import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_OPERATOR_REQUISITES,
  readStoredCompanyCardRequisites,
  type OperatorRequisites,
} from "@/constants/operatorDetails";

const SETTING_KEY = "operator_requisites";

/**
 * Загружает реквизиты оператора (ИП Шафрановский М.М.) из app_settings.
 * При недоступной/отсутствующей записи использует подтверждённый счёт 408….
 * Успешно прочитанные некорректные или старые реквизиты не заменяет фолбэком.
 *
 * Может вызываться вне React-контекста (используется в генераторах счетов).
 */
async function fetchOperatorRequisites(): Promise<unknown> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", SETTING_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_OPERATOR_REQUISITES;
    return data.setting_value;
  } catch {
    return DEFAULT_OPERATOR_REQUISITES;
  }
}

export async function loadOperatorRequisites(): Promise<OperatorRequisites> {
  return readStoredCompanyCardRequisites(await fetchOperatorRequisites());
}

export async function saveOperatorRequisites(req: OperatorRequisites): Promise<void> {
  const current = readStoredCompanyCardRequisites(req);
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { setting_key: SETTING_KEY, setting_value: JSON.stringify(current), updated_at: new Date().toISOString() },
      { onConflict: "setting_key" }
    );
  if (error) throw error;
}

/**
 * React-хук для чтения/обновления реквизитов оператора.
 * Подписан на realtime-обновления app_settings.
 */
export function useOperatorRequisites() {
  const [requisites, setRequisites] = useState<OperatorRequisites>(DEFAULT_OPERATOR_REQUISITES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stored = await fetchOperatorRequisites();
      try {
        setRequisites(readStoredCompanyCardRequisites(stored));
      } catch (failure) {
        // Only the settings editor uses this hook. Keep invalid saved fields editable;
        // document generators call the strict loadOperatorRequisites instead.
        let parsed: unknown = stored;
        if (typeof stored === "string") {
          try { parsed = JSON.parse(stored); } catch { parsed = null; }
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const editable = { ...DEFAULT_OPERATOR_REQUISITES };
          for (const key of Object.keys(editable) as (keyof OperatorRequisites)[]) {
            if (typeof parsed[key] === "string") editable[key] = parsed[key];
          }
          setRequisites(editable);
        }
        throw failure;
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось загрузить реквизиты оператора.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("operator-requisites-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: `setting_key=eq.${SETTING_KEY}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { requisites, loading, error, refresh, save: saveOperatorRequisites };
}
