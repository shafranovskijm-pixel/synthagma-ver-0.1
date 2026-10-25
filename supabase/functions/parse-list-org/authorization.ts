import { AccessError, checked, requireActiveUser, requirePlatformSales, type AccessDb } from "../_shared/privileged-access.ts";

// The same platform sales operation contract as convert-company-to-lead.
// No service-key bypass and no caller-provided role or organization claim.
export async function requireCompanyEnrichmentAccess(req: Request, db: AccessDb): Promise<void> {
  try {
    const actor = await requireActiveUser(req, db);
    if (!actor.userId) throw new AccessError(401, "Требуется вход в систему");
    const profile = checked<any>(await db.from("profiles").select("blocked_at")
      .eq("user_id", actor.userId).maybeSingle());
    if (!profile || profile.blocked_at) throw new AccessError(403, "Доступ к аккаунту ограничен");
    await requirePlatformSales(db, actor);
  } catch (error: unknown) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, "Не удалось подтвердить права доступа. Повторите попытку.");
  }
}
