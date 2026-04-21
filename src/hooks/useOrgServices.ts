import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OrgService {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useOrgServices(organizationId: string | null) {
  const [services, setServices] = useState<OrgService[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) { setServices([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_services")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setServices((data || []) as OrgService[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки услуг: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsert = useCallback(async (s: Partial<OrgService> & { name: string; price: number }) => {
    if (!organizationId) return null;
    const payload: any = { ...s, organization_id: organizationId };
    const { data, error } = await supabase
      .from("org_services")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) { toast.error("Ошибка сохранения: " + error.message); return null; }
    toast.success("Сохранено");
    refresh();
    return data as OrgService;
  }, [organizationId, refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("org_services").delete().eq("id", id);
    if (error) { toast.error("Ошибка удаления"); return; }
    setServices(prev => prev.filter(s => s.id !== id));
    toast.success("Удалено");
  }, []);

  return { services, loading, refresh, upsert, remove };
}
