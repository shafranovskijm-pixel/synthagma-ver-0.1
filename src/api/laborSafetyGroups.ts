import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type GroupRow = Database["public"]["Tables"]["labor_safety_groups"]["Row"];

export type LaborSafetyGroupRow = GroupRow & { records_count?: number };

export interface LaborSafetyGroupsResult {
  groups: LaborSafetyGroupRow[];
  countsUnavailable: boolean;
  countsError: unknown | null;
}

/** Keep groups accessible if the optional embedded record count fails. */
export async function fetchLaborSafetyGroups(
  organizationId: string,
): Promise<LaborSafetyGroupsResult> {
  let countsError: unknown;

  try {
    const { data, error } = await supabase
      .from("labor_safety_groups")
      .select("*, labor_safety_records(count)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Labor safety group list response is missing");

    const groups: LaborSafetyGroupRow[] = data.map(({ labor_safety_records, ...group }) => {
      const count = labor_safety_records?.[0]?.count;
      return {
        ...group,
        records_count: typeof count === "number" && Number.isInteger(count) && count >= 0
          ? count
          : undefined,
      };
    });
    const countsUnavailable = groups.some((group) => group.records_count === undefined);

    return {
      groups,
      countsUnavailable,
      countsError: countsUnavailable ? new Error("Labor safety record counts are missing") : null,
    };
  } catch (error) {
    countsError = error;
    // Preserve the first failure even when the following plain query also fails.
    console.warn("Labor safety group count query failed; loading groups without counts:", error);
  }

  // Same organization filter and RLS as the original request; no elevated access.
  const { data, error } = await supabase
    .from("labor_safety_groups")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Labor safety group list response is missing");

  return {
    groups: data.map((group) => ({ ...group, records_count: undefined })),
    countsUnavailable: true,
    countsError,
  };
}
