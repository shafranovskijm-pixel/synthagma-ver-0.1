import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ProposalPresetService {
  name: string;
  description?: string;
  price: number;
  quantity: number;
}

export interface ProposalPreset {
  id: string;
  scope: "platform" | "org";
  organization_id: string | null;
  name: string;
  description: string | null;
  category: "course_promo" | "corporate" | "webinar" | "consulting" | "subscription" | "custom";
  cover_url: string | null;
  intro_html: string;
  outro_html: string;
  default_services: ProposalPresetService[];
  default_discount_percent: number;
  linked_course_id: string | null;
  default_email_template_id: string | null;
  is_default: boolean;
  sort_order: number;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PROPOSAL_PRESET_CATEGORIES = [
  { value: "course_promo", label: "Промо курса" },
  { value: "corporate", label: "Корпоративное обучение" },
  { value: "webinar", label: "Вебинар" },
  { value: "consulting", label: "Консалтинг" },
  { value: "subscription", label: "Абонемент" },
  { value: "custom", label: "Произвольный" },
] as const;

/**
 * Загружает пресеты КП: всегда платформенные + (опционально) свои организации.
 */
export function useProposalPresets(organizationId?: string | null) {
  const [presets, setPresets] = useState<ProposalPreset[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("proposal_presets")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (organizationId) {
        q = q.or(`scope.eq.platform,and(scope.eq.org,organization_id.eq.${organizationId})`);
      } else {
        q = q.eq("scope", "platform");
      }
      const { data, error } = await q;
      if (error) throw error;
      setPresets((data || []) as unknown as ProposalPreset[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки пресетов: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsertOrgPreset = useCallback(async (input: Partial<ProposalPreset> & { name: string; category: ProposalPreset["category"] }) => {
    if (!organizationId) { toast.error("Организация не указана"); return null; }
    const payload: any = {
      ...input,
      scope: "org",
      organization_id: organizationId,
    };
    const { data, error } = await supabase
      .from("proposal_presets")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) { toast.error("Ошибка сохранения: " + error.message); return null; }
    toast.success("Пресет сохранён");
    refresh();
    return data as unknown as ProposalPreset;
  }, [organizationId, refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("proposal_presets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Ошибка удаления"); return; }
    toast.success("Пресет удалён");
    setPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const cloneFromPlatform = useCallback(async (platformPreset: ProposalPreset) => {
    if (!organizationId) { toast.error("Организация не указана"); return null; }
    return upsertOrgPreset({
      name: platformPreset.name + " (моя копия)",
      description: platformPreset.description || undefined,
      category: platformPreset.category,
      cover_url: platformPreset.cover_url || undefined,
      intro_html: platformPreset.intro_html,
      outro_html: platformPreset.outro_html,
      default_services: platformPreset.default_services,
      default_discount_percent: platformPreset.default_discount_percent,
      linked_course_id: platformPreset.linked_course_id || undefined,
      default_email_template_id: platformPreset.default_email_template_id || undefined,
      is_default: false,
    });
  }, [organizationId, upsertOrgPreset]);

  return { presets, loading, refresh, upsertOrgPreset, remove, cloneFromPlatform };
}
