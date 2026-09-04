import { supabase } from "@/integrations/supabase/client";

export interface OrganizationStudentGroup {
  id: string;
  name: string;
  color: string;
  organization_id: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
}

/** Shared by the list and creation dialog because both use the same query key. */
export async function fetchOrganizationStudentGroups(
  organizationId: string | null | undefined,
): Promise<OrganizationStudentGroup[]> {
  if (!organizationId) return [];
  const { data, error } = await supabase
    .from("student_groups")
    .select("id, name, color, organization_id, created_at, start_date, end_date")
    .eq("organization_id", organizationId)
    .order("name");
  // Never cache a failed read as a successful empty directory.
  if (error) throw error;
  return data ?? [];
}
