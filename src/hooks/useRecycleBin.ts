import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RecycleBinTable =
  | "education_document_records"
  | "org_documents"
  | "company_documents"
  | "document_signatures"
  | "data_subject_requests"
  | "incoming_documents"
  | "document_issuance_log"
  | "commercial_proposals";

export interface RecycleBinItem {
  id: string;
  source_table: RecycleBinTable;
  display_name: string;
  type_label: string;
  deleted_at: string;
  deleted_by: string | null;
  organization_id: string | null;
  meta?: string;
}

const TYPE_LABELS: Record<RecycleBinTable, string> = {
  education_document_records: "Документ об образовании",
  org_documents: "Документ организации",
  company_documents: "Документ контрагента",
  document_signatures: "Подписание (ПЭП)",
  data_subject_requests: "Запрос ПД (152-ФЗ)",
  incoming_documents: "Входящий документ",
  document_issuance_log: "Запись журнала выдачи",
  commercial_proposals: "Коммерческое предложение",
};

export function useRecycleBin(organizationId: string | null) {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [edu, orgD, comp, sigs, pdReq, inc, issLog, props] = await Promise.all([
        supabase.from("education_document_records")
          .select("id, full_name, document_type, reg_number, deleted_at, deleted_by, organization_id")
          .eq("organization_id", organizationId).not("deleted_at", "is", null).limit(500),
        supabase.from("org_documents")
          .select("id, name, type, deleted_at, deleted_by, organization_id")
          .eq("organization_id", organizationId).not("deleted_at", "is", null).limit(500),
        // company_documents не имеет organization_id напрямую — фильтруем через companies
        supabase.from("company_documents")
          .select("id, name, type, deleted_at, deleted_by, companies!inner(organization_id)")
          .eq("companies.organization_id", organizationId).not("deleted_at", "is", null).limit(500),
        supabase.from("document_signatures")
          .select("id, document_title, document_type, recipient_email, deleted_at, deleted_by, organization_id")
          .eq("organization_id", organizationId).not("deleted_at", "is", null).limit(500),
        supabase.from("data_subject_requests")
          .select("id, request_type, status, deleted_at, deleted_by, organization_id")
          .eq("organization_id", organizationId).not("deleted_at", "is", null).limit(500),
        supabase.from("incoming_documents")
          .select("id, doc_type, counterparty_name, deleted_at, deleted_by, organization_id")
          .eq("organization_id", organizationId).not("deleted_at", "is", null).limit(500),
        supabase.from("document_issuance_log")
          .select("id, document_name, user_name, deleted_at, deleted_by, organization_id")
          .eq("organization_id", organizationId).not("deleted_at", "is", null).limit(500),
        supabase.from("commercial_proposals")
          .select("id, company_name, total_amount, deleted_at, deleted_by, organization_id")
          .eq("organization_id", organizationId).not("deleted_at", "is", null).limit(500),
      ]);

      const out: RecycleBinItem[] = [];
      (edu.data || []).forEach((r: any) => out.push({
        id: r.id, source_table: "education_document_records",
        display_name: `${r.full_name} — ${r.reg_number}`,
        type_label: TYPE_LABELS.education_document_records,
        meta: r.document_type,
        deleted_at: r.deleted_at, deleted_by: r.deleted_by, organization_id: r.organization_id,
      }));
      (orgD.data || []).forEach((r: any) => out.push({
        id: r.id, source_table: "org_documents",
        display_name: r.name, type_label: TYPE_LABELS.org_documents, meta: r.type,
        deleted_at: r.deleted_at, deleted_by: r.deleted_by, organization_id: r.organization_id,
      }));
      (comp.data || []).forEach((r: any) => out.push({
        id: r.id, source_table: "company_documents",
        display_name: r.name, type_label: TYPE_LABELS.company_documents, meta: r.type,
        deleted_at: r.deleted_at, deleted_by: r.deleted_by, organization_id: organizationId,
      }));
      (sigs.data || []).forEach((r: any) => out.push({
        id: r.id, source_table: "document_signatures",
        display_name: `${r.document_title} → ${r.recipient_email}`,
        type_label: TYPE_LABELS.document_signatures, meta: r.document_type,
        deleted_at: r.deleted_at, deleted_by: r.deleted_by, organization_id: r.organization_id,
      }));
      (pdReq.data || []).forEach((r: any) => out.push({
        id: r.id, source_table: "data_subject_requests",
        display_name: `Запрос: ${r.request_type}`,
        type_label: TYPE_LABELS.data_subject_requests, meta: r.status,
        deleted_at: r.deleted_at, deleted_by: r.deleted_by, organization_id: r.organization_id,
      }));
      (inc.data || []).forEach((r: any) => out.push({
        id: r.id, source_table: "incoming_documents",
        display_name: `${r.doc_type} от ${r.counterparty_name}`,
        type_label: TYPE_LABELS.incoming_documents, meta: r.doc_type,
        deleted_at: r.deleted_at, deleted_by: r.deleted_by, organization_id: r.organization_id,
      }));
      (issLog.data || []).forEach((r: any) => out.push({
        id: r.id, source_table: "document_issuance_log",
        display_name: `${r.document_name} — ${r.user_name}`,
        type_label: TYPE_LABELS.document_issuance_log,
        deleted_at: r.deleted_at, deleted_by: r.deleted_by, organization_id: r.organization_id,
      }));
      (props.data || []).forEach((r: any) => out.push({
        id: r.id, source_table: "commercial_proposals",
        display_name: `КП: ${r.company_name} (${r.total_amount} ₽)`,
        type_label: TYPE_LABELS.commercial_proposals,
        deleted_at: r.deleted_at, deleted_by: r.deleted_by, organization_id: r.organization_id,
      }));

      out.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
      setItems(out);
    } catch (e: any) {
      console.error(e);
      toast.error("Не удалось загрузить корзину: " + (e?.message || "ошибка"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const restore = useCallback(async (item: RecycleBinItem) => {
    const { data, error } = await supabase.rpc("restore_document", {
      p_table: item.source_table,
      p_id: item.id,
    });
    if (error) {
      toast.error("Ошибка восстановления: " + error.message);
      return false;
    }
    if (data) {
      toast.success("Документ восстановлен");
      setItems(prev => prev.filter(i => !(i.id === item.id && i.source_table === item.source_table)));
      return true;
    }
    return false;
  }, []);

  const restoreMany = useCallback(async (selected: RecycleBinItem[]) => {
    let ok = 0;
    for (const it of selected) {
      try {
        const { data } = await supabase.rpc("restore_document", { p_table: it.source_table, p_id: it.id });
        if (data) ok++;
      } catch {}
    }
    toast.success(`Восстановлено: ${ok} из ${selected.length}`);
    refresh();
  }, [refresh]);

  // Полное удаление (только из корзины)
  const purgeOne = useCallback(async (item: RecycleBinItem) => {
    const { error } = await (supabase.from(item.source_table as any) as any).delete().eq("id", item.id);
    if (error) {
      toast.error("Ошибка окончательного удаления: " + error.message);
      return false;
    }
    toast.success("Документ удалён окончательно");
    setItems(prev => prev.filter(i => !(i.id === item.id && i.source_table === item.source_table)));
    return true;
  }, []);

  return { items, loading, refresh, restore, restoreMany, purgeOne };
}
