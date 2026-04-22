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
  | "commercial_proposals"
  | "org_billing_documents";

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

const PAGE_SIZE = 100;

export function useRecycleBin(organizationId: string | null) {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async (overrides?: { search?: string; offset?: number; append?: boolean }) => {
    if (!organizationId) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = overrides?.search ?? search;
      const off = overrides?.offset ?? offset;
      const { data, error } = await supabase.rpc("list_recycle_bin", {
        p_organization_id: organizationId,
        p_search: q || null,
        p_limit: PAGE_SIZE,
        p_offset: off,
      });
      if (error) throw error;
      const rows = (data || []) as any[];
      const totalCount = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
      setTotal(totalCount);
      const mapped: RecycleBinItem[] = rows.map((r) => ({
        id: r.id,
        source_table: r.source_table,
        display_name: r.display_name,
        type_label: r.type_label,
        meta: r.meta || undefined,
        deleted_at: r.deleted_at,
        deleted_by: r.deleted_by,
        organization_id: r.organization_id,
      }));
      if (overrides?.append) {
        setItems((prev) => [...prev, ...mapped]);
      } else {
        setItems(mapped);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Не удалось загрузить корзину: " + (e?.message || "ошибка"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, search, offset]);

  // Initial load + reload on org change or search change
  useEffect(() => {
    setOffset(0);
    fetchPage({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      fetchPage({ search, offset: 0 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const refresh = useCallback(() => {
    setOffset(0);
    return fetchPage({ offset: 0 });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    return fetchPage({ offset: next, append: true });
  }, [offset, fetchPage]);

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
      setItems((prev) => prev.filter((i) => !(i.id === item.id && i.source_table === item.source_table)));
      setTotal((t) => Math.max(0, t - 1));
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
      } catch {/* ignore */}
    }
    toast.success(`Восстановлено: ${ok} из ${selected.length}`);
    refresh();
  }, [refresh]);

  // Окончательное удаление: только для своей организации (RLS отрежет чужое, но дополнительно проверяем)
  const purgeOne = useCallback(async (item: RecycleBinItem) => {
    if (item.organization_id !== organizationId) {
      toast.error("Невозможно удалить чужой документ");
      return false;
    }
    const { error } = await (supabase.from(item.source_table as any) as any).delete().eq("id", item.id);
    if (error) {
      toast.error("Ошибка окончательного удаления: " + error.message);
      return false;
    }
    toast.success("Документ удалён окончательно");
    setItems(prev => prev.filter(i => !(i.id === item.id && i.source_table === item.source_table)));
    setTotal((t) => Math.max(0, t - 1));
    return true;
  }, [organizationId]);

  return {
    items,
    total,
    loading,
    search,
    setSearch,
    hasMore: items.length < total,
    refresh,
    loadMore,
    restore,
    restoreMany,
    purgeOne,
  };
}
