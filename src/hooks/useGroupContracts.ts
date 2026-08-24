import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GroupContractRow {
  id: string;
  organization_id: string;
  name: string;
  contract_number: string | null;
  contract_date: string | null;
  file_url: string | null;
  file_path: string | null;
  status: string;
  student_user_id: string | null;
  student_group_id: string | null;
  company_id: string | null;
  counterparty_type: "individual" | "legal" | null;
  template_id: string | null;
  template_version: number | null;
  body_html: string | null;
  /** DOCX-first договоры (шаблон клиента) */
  template_format?: "html" | "docx_ooxml" | null;
  template_registry_key?: string | null;
  template_version_label?: string | null;
  docx_path?: string | null;
  pdf_path?: string | null;
  pdf_status?: "unavailable" | "pending" | "ready" | null;
  generation_status?: "draft" | "generated" | "failed" | null;
  students: Array<{ user_id: string; full_name: string; email?: string | null }>;
  variables: Record<string, any>;
  created_at: string;
  // enriched client-side
  student_name?: string | null;
  company_name?: string | null;
}

export function useGroupContracts(organizationId: string | null, groupId: string | null) {
  const [contracts, setContracts] = useState<GroupContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId || !groupId) { setContracts([]); setLoading(false); return; }
    setLoading(true);
    try {
      // Собираем ID учеников группы, чтобы захватить и договоры, привязанные
      // к ученику без явного student_group_id.
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("organization_id", organizationId)
        .eq("student_group_id", groupId)
        .is("archived_at", null);
      const userIds = (profiles || []).map((p: any) => p.user_id);
      const nameByUser = new Map<string, string>((profiles || []).map((p: any) => [p.user_id, p.full_name || "—"]));

      let query = (supabase as any)
        .from("org_contracts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      // Договоры группы = либо явно привязанные к группе, либо к её ученикам.
      if (userIds.length > 0) {
        query = query.or(`student_group_id.eq.${groupId},student_user_id.in.(${userIds.join(",")})`);
      } else {
        query = query.eq("student_group_id", groupId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as GroupContractRow[];

      // Подтягиваем названия компаний одним запросом.
      const companyIds = Array.from(new Set(rows.map(r => r.company_id).filter(Boolean))) as string[];
      let companyMap = new Map<string, string>();
      if (companyIds.length > 0) {
        const { data: companies } = await (supabase as any)
          .from("companies")
          .select("id, name")
          .in("id", companyIds);
        companyMap = new Map((companies || []).map((c: any) => [c.id, c.name]));
      }

      setContracts(
        rows.map(r => ({
          ...r,
          student_name: r.student_user_id ? nameByUser.get(r.student_user_id) || null : null,
          company_name: r.company_id ? companyMap.get(r.company_id) || null : null,
        }))
      );
    } catch (e: any) {
      console.error(e);
      toast.error("Не удалось загрузить договоры", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [organizationId, groupId]);

  useEffect(() => { refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const row = contracts.find(c => c.id === id);
    const { error } = await (supabase as any)
      .from("org_contracts")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", id);
    if (error) {
      toast.error("Не удалось удалить договор", { description: error.message });
      return false;
    }
    setContracts(prev => prev.filter(c => c.id !== id));

    const filePaths = Array.from(new Set(
      [row?.file_path, row?.docx_path, row?.pdf_path].filter((path): path is string => !!path),
    ));
    let cleanupFailed = false;
    if (filePaths.length > 0) {
      try {
        const { error: cleanupError } = await supabase.storage
          .from("billing-documents")
          .remove(filePaths);
        cleanupFailed = !!cleanupError;
      } catch {
        cleanupFailed = true;
      }
    }

    if (cleanupFailed) {
      toast.warning("Договор удалён, но файл не удалось очистить", {
        description: "Запись уже удалена. Повторная очистка файла будет выполнена администратором.",
      });
    } else {
      toast.success("Договор удалён");
    }
    return true;
  }, [contracts, organizationId]);

  return { contracts, loading, refresh, remove };
}
