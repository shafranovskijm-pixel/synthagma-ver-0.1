import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ContractTemplateVersion {
  id: string;
  template_id: string;
  organization_id: string;
  version: number;
  name: string;
  body_html: string;
  variables: any;
  change_summary: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export function useContractTemplateVersions(templateId: string | null) {
  const [versions, setVersions] = useState<ContractTemplateVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!templateId) {
      setVersions([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_contract_template_versions")
        .select("*")
        .eq("template_id", templateId)
        .order("version", { ascending: false });
      if (error) throw error;
      setVersions((data || []) as ContractTemplateVersion[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки версий: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const restore = useCallback(
    async (version: ContractTemplateVersion) => {
      if (!templateId) return false;
      const { error } = await supabase
        .from("org_contract_templates")
        .update({ name: version.name, body_html: version.body_html, variables: version.variables })
        .eq("id", templateId);
      if (error) {
        toast.error("Не удалось восстановить версию");
        return false;
      }
      toast.success(`Восстановлена версия №${version.version}`);
      refresh();
      return true;
    },
    [templateId, refresh]
  );

  return { versions, loading, refresh, restore };
}
