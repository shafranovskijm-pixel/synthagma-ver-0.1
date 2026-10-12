import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readStoredCompanyCardRequisites, type OperatorRequisites } from "@/constants/operatorDetails";

/** Company cards require saved current bank details; network errors do not select defaults. */
export async function loadCompanyCardOperatorRequisites(): Promise<OperatorRequisites> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "operator_requisites")
    .maybeSingle();
  if (error) {
    throw new Error("Не удалось загрузить актуальные реквизиты. Повторите загрузку перед скачиванием карточки.");
  }
  return readStoredCompanyCardRequisites(data?.setting_value);
}

export function useCompanyCardOperatorRequisites() {
  const [requisites, setRequisites] = useState<OperatorRequisites | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRequisites(null);
    setError(null);
    try {
      setRequisites(await loadCompanyCardOperatorRequisites());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось загрузить актуальные реквизиты.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("company-card-operator-requisites")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "app_settings", filter: "setting_key=eq.operator_requisites",
      }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  return { requisites, loading, error, refresh };
}
