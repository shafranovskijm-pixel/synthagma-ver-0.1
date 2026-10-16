// Authorization for legacy service-role handlers. A valid JWT alone never
// authorizes an operation on an organization or another user's document.
export class AccessError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface AccessDb {
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: unknown }>;
}
export interface Actor { userId: string | null; service: boolean }
export function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new AccessError(503, "Не удалось подтвердить права доступа. Повторите попытку.");
  return result.data;
}
export function requireUuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AccessError(400, `Некорректный ${name}`);
  }
  return value.toLowerCase();
}
export async function readObject(req: Request): Promise<Record<string, any>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch { /* invalid body */ }
  throw new AccessError(400, "Некорректный запрос");
}

export async function requireActiveUser(req: Request, db: AccessDb, internalServiceKey?: string): Promise<Actor> {
  if (req.method !== "POST") throw new AccessError(405, "Используйте POST");
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "");
  if (!match) throw new AccessError(401, "Требуется вход в систему");
  const token = match[1];
  // Opt in only for a documented server-to-server workflow (signing or import).
  // Never trust a caller-provided role claim or merely decode the JWT.
  if (internalServiceKey && token === internalServiceKey) return { userId: null, service: true };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) throw new AccessError(401, "Сессия истекла. Войдите повторно.");
  const revoked = checked(await db.from("account_deletion_revocations").select("user_id")
    .eq("user_id", data.user.id).maybeSingle());
  if (revoked) throw new AccessError(403, "Доступ к аккаунту отозван");
  return { userId: data.user.id, service: false };
}

async function isAdmin(db: AccessDb, actor: Actor): Promise<boolean> {
  if (!actor.userId) return false;
  const role = checked<any>(await db.from("user_roles").select("role")
    .eq("user_id", actor.userId).eq("role", "admin").maybeSingle());
  return role?.role === "admin";
}
export async function requirePlatformAdmin(db: AccessDb, actor: Actor) {
  if (!await isAdmin(db, actor)) throw new AccessError(403, "Требуются права администратора платформы");
}
export async function requirePlatformSales(db: AccessDb, actor: Actor) {
  if (await isAdmin(db, actor)) return;
  if (!actor.userId || checked(await db.rpc("is_platform_sales_manager", { _uid: actor.userId })) !== true) {
    throw new AccessError(403, "Недостаточно прав для работы с базой продаж платформы");
  }
}

export async function requireMigrationCourse(db: AccessDb, actor: Actor, courseId: string, organizationId: string) {
  await requirePlatformAdmin(db, actor);
  const course = checked<any>(await db.from("courses").select("id,organization_id").eq("id", courseId).maybeSingle());
  if (!course) throw new AccessError(404, "Курс не найден");
  if (course.organization_id !== organizationId) throw new AccessError(403, "Курс не относится к выбранной организации");
}

export async function requireSignatureAccess(db: AccessDb, actor: Actor, signatureId: string, now = new Date()) {
  // Fetch only authorization metadata until the caller is authorized. In
  // particular, do not read the signing token, IP or PEP agreement here.
  const signature = checked<any>(await db.from("document_signatures")
    .select("id,organization_id,recipient_user_id,deleted_at").eq("id", signatureId).maybeSingle());
  if (!signature || signature.deleted_at) throw new AccessError(404, "Документ не найден");
  if (actor.service || signature.recipient_user_id === actor.userId || await isAdmin(db, actor)) return;
  const orgId = signature.organization_id;
  if (!actor.userId || !orgId) throw new AccessError(403, "Нет доступа к документу");
  if (checked(await db.rpc("is_org_owner", { _user_id: actor.userId, _organization_id: orgId })) === true) return;
  const staff = checked<any>(await db.from("org_staff").select("expires_at")
    .eq("user_id", actor.userId).eq("organization_id", orgId).maybeSingle());
  const active = staff && (staff.expires_at === null || new Date(staff.expires_at).getTime() > now.getTime());
  if (active && checked(await db.rpc("has_org_staff_permission", {
    _user_id: actor.userId, _organization_id: orgId, _permission: "documents.read",
  })) === true) return;
  throw new AccessError(403, "Нет доступа к документу");
}

export function accessErrorResponse(error: unknown, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: error instanceof AccessError ? error.message : "Не удалось выполнить операцию" }), {
    status: error instanceof AccessError ? error.status : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
