import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrganizationCore {
  id: string;
  name: string | null;
  description: string | null;
  branding: Record<string, unknown> | null;
  menu_settings: Record<string, unknown> | null;
  student_dashboard_settings: Record<string, unknown> | null;
  subscription_plan: string | null;
  custom_enabled_categories: string[] | null;
  frdo_enabled: boolean | null;
}

/**
 * Единый хук на чтение «ядра» организации.
 * Заменяет 4–5 отдельных SELECT-ов из useDashboardSettings/useBrandingSettings/
 * useOrgFeatures/useOrganizationDataLoader одним RPC.
 *
 * Кэш: 5 минут staleTime; инвалидация — через realtime-канал ниже.
 */
export function useOrganizationCore(organizationId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery<OrganizationCore | null>({
    queryKey: ["org-core", organizationId],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase.rpc("get_organization_core", {
        p_org_id: organizationId,
      });
      if (error) throw error;
      return (data as unknown as OrganizationCore) || null;
    },
  });

  // Один централизованный realtime-канал на UPDATE строки organizations.
  // Раньше каждый хук открывал свой канал — теперь один на всю сессию orgId.
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`org-core-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "organizations",
          filter: `id=eq.${organizationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["org-core", organizationId] });
          qc.invalidateQueries({ queryKey: ["org-features", organizationId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, qc]);

  return query;
}
