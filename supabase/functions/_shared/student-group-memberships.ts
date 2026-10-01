/** Shared Edge reader: never substitutes a requested group for a profile's primary group. */
export async function readEffectiveGroupProfiles(client: any, organizationId: string, groupId: string, selection: string, activeOnly = true): Promise<{ data: any[]; error: null }> {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = client.from("student_group_profiles_effective").select(selection)
      .eq("organization_id", organizationId).eq("group_id", groupId).order("user_id");
    if (activeOnly) query = query.is("archived_at", null);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return { data: rows, error: null };
  }
}
