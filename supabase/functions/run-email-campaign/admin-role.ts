interface RoleResult {
  data: { role: string } | null;
  error: unknown;
}

interface RoleFilter {
  eq(column: string, value: string): RoleFilter;
  maybeSingle(): PromiseLike<RoleResult>;
}

export interface RoleLookupClient {
  from(table: "user_roles"): { select(columns: "role"): RoleFilter };
}

/** Caller must first authenticate via auth.getUser(); keep this user's JWT/RLS. */
export async function hasVerifiedAdminRole(
  userClient: RoleLookupClient,
  verifiedUserId: string,
): Promise<boolean> {
  if (!verifiedUserId) throw new Error("Verified user required");
  const { data, error } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", verifiedUserId)
    .eq("role", "admin")
    .maybeSingle();
  // A database failure is not a negative role lookup and never grants access.
  if (error) throw new Error("Admin role lookup failed");
  return data?.role === "admin";
}
