import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_OPERATOR_REQUISITES,
  type OperatorRequisites,
} from "@/constants/operatorDetails";

const SETTING_KEY = "operator_requisites";

/**
 * Загружает реквизиты оператора (ИП Шафрановский М.М.) из app_settings.
 * Возвращает DEFAULT_OPERATOR_REQUISITES, если запись отсутствует или
 * запрос завершился ошибкой (офлайн, проблемы с сетью и т.п.).
 *
 * Может вызываться вне React-контекста (используется в генераторах счетов).
 */
export async function loadOperatorRequisites(): Promise<OperatorRequisites> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", SETTING_KEY)
      .maybeSingle();
    if (error || !data?.setting_value) return DEFAULT_OPERATOR_REQUISITES;
    const parsed = JSON.parse(data.setting_value) as Partial<OperatorRequisites>;
    return { ...DEFAULT_OPERATOR_REQUISITES, ...parsed };
  } catch {
    return DEFAULT_OPERATOR_REQUISITES;
  }
}

export async function saveOperatorRequisites(req: OperatorRequisites): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { setting_key: SETTING_KEY, setting_value: JSON.stringify(req), updated_at: new Date().toISOString() },
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

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await loadOperatorRequisites();
    setRequisites(r);
    setLoading(false);
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

  return { requisites, loading, refresh, save: saveOperatorRequisites };
}
