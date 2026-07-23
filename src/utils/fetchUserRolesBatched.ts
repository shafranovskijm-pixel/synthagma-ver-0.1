import { supabase } from "@/integrations/supabase/client";

/**
 * Batched fetch of user_roles rows for a list of user IDs.
 *
 * Why: `.in("user_id", ids)` with hundreds of UUIDs builds a URL 10+ KB long.
 * NGINX proxies (наш VDS 176.98.178.203) роняют такой запрос как
 * "upstream sent too big header" и на 10с уводят upstream в down.
 * Разбиваем на пачки по 50 UUID (~1.9 KB URL — безопасно везде).
 */
export async function fetchUserRolesBatched(
  userIds: string[],
  extraRoleFilter?: string[],
  chunkSize = 50,
): Promise<Array<{ user_id: string; role: string }>> {
  if (!userIds || userIds.length === 0) return [];

  // Dedupe to keep chunks minimal
  const unique = Array.from(new Set(userIds));

  const out: Array<{ user_id: string; role: string }> = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    let query = supabase.from("user_roles").select("user_id, role").in("user_id", slice);
    if (extraRoleFilter && extraRoleFilter.length > 0) {
      query = query.in("role", extraRoleFilter as any);
    }
    const { data, error } = await query;
    if (error) {
      console.warn("[fetchUserRolesBatched] chunk error", error);
      continue;
    }
    if (data) out.push(...(data as Array<{ user_id: string; role: string }>));
  }
  return out;
}
