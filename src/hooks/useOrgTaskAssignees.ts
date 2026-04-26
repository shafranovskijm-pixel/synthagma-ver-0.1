import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrgTaskAssignee {
  user_id: string;
  full_name: string;
  role: string;
  email: string | null;
}

/**
 * Список сотрудников организации, которым можно назначать задачи CRM.
 * Включает владельца + всех org_staff с can_receive_crm_tasks = true.
 */
export function useOrgTaskAssignees(organizationId?: string | null) {
  return useQuery({
    queryKey: ["org_task_assignees", organizationId],
    queryFn: async (): Promise<OrgTaskAssignee[]> => {
      if (!organizationId) return [];
      const { data, error } = await (supabase as any).rpc("list_org_task_assignees", {
        _org_id: organizationId,
      });
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name || r.email || "Без имени",
        role: r.role,
        email: r.email ?? null,
      }));
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}
