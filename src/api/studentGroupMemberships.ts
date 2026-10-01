import { fetchAllRows } from "@/utils/retryFetch";

export interface EffectiveStudentGroupMembership {
  organization_id: string;
  group_id: string;
  user_id: string;
}

/** Includes the legacy primary group and additional groups, once per pair. */
export async function fetchEffectiveGroupMemberships(
  client: any,
  organizationId: string,
  userIds?: string[],
): Promise<EffectiveStudentGroupMembership[]> {
  return fetchAllRows<EffectiveStudentGroupMembership>(({ from, to }) => {
    let query = client
    .from("student_group_memberships_effective")
    .select("organization_id, group_id, user_id")
    .eq("organization_id", organizationId)
      .order("group_id").order("user_id");
    if (userIds) query = query.in("user_id", [...new Set(userIds)]);
    return query.range(from, to);
  });
}

export async function fetchEffectiveGroupProfiles<T = any>(
  client: any,
  organizationId: string,
  groupId: string,
  options: { activeOnly?: boolean; select?: string } = {},
): Promise<T[]> {
  return fetchAllRows<T>(({ from, to }) => {
    let query = client.from("student_group_profiles_effective")
      .select(options.select ?? "*")
      .eq("organization_id", organizationId)
      .eq("group_id", groupId)
      .order("user_id");
    if (options.activeOnly) query = query.is("archived_at", null);
    return query.range(from, to);
  });
}

/** A single transaction adds every requested pair and leaves primary groups intact. */
export async function addStudentsToGroups(
  client: any,
  organizationId: string,
  userIds: string[],
  groupIds: string[],
): Promise<EffectiveStudentGroupMembership[]> {
  const users = [...new Set(userIds)];
  const groups = [...new Set(groupIds)];
  if (!users.length || !groups.length) throw new Error("Выберите учеников и группы");
  const { data, error } = await client.rpc("add_students_to_groups", {
    p_organization_id: organizationId,
    p_user_ids: users,
    p_group_ids: groups,
  });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as EffectiveStudentGroupMembership[];
  const confirmed = new Set(rows.filter(row => row.organization_id === organizationId)
    .map(row => `${row.group_id}:${row.user_id}`));
  if (rows.length !== users.length * groups.length
    || groups.some(groupId => users.some(userId => !confirmed.has(`${groupId}:${userId}`)))) {
    throw new Error("База не подтвердила добавление всех учеников в выбранные группы. Обновите список перед повтором.");
  }
  return rows;
}
