// Login-link management only. This endpoint never sends email or signs a user in.
export const STUDENT_LOGIN_LINK_REVISION = "student-login-link-v1";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Sintagma-Student-Login-Link-Revision",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { data: any; error: unknown };
interface Dependencies {
  authenticate: (authorization: string) => Promise<{ userId: string | null; error: unknown }>;
  db: { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result> };
  now?: () => Date;
}
class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function confirmed(result: Result) {
  if (result.error) throw new RequestError(503, "Не удалось проверить данные ссылки. Повторите попытку.");
  return result.data;
}

export function createStudentLoginLinkHandler({ authenticate, db, now = () => new Date() }: Dependencies) {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Sintagma-Student-Login-Link-Revision": STUDENT_LOGIN_LINK_REVISION },
  });
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "Используйте POST" }, 405);
    try {
      const authorization = req.headers.get("authorization");
      if (!authorization) throw new RequestError(401, "Требуется вход в систему");
      const auth = await authenticate(authorization);
      if (auth.error || !auth.userId) throw new RequestError(401, "Требуется вход в систему");
      let body: any;
      try { body = await req.json(); } catch { throw new RequestError(400, "Некорректный запрос"); }
      const { action, user_id, organization_id, token } = body ?? {};
      if (!["get", "create", "revoke"].includes(action) || typeof user_id !== "string" || !uuid.test(user_id)
          || typeof organization_id !== "string" || !uuid.test(organization_id)
          || (action === "revoke" && (typeof token !== "string" || !uuid.test(token)))) {
        throw new RequestError(400, "Некорректный запрос");
      }
      const actor = auth.userId;
      let allowed = confirmed(await db.rpc("has_role", { _user_id: actor, _role: "admin" })) === true;
      if (!allowed) allowed = confirmed(await db.rpc("is_org_owner", { _user_id: actor, _organization_id: organization_id })) === true;
      if (!allowed) {
        const staff = confirmed(await db.from("org_staff").select("expires_at")
          .eq("user_id", actor).eq("organization_id", organization_id).maybeSingle());
        if (staff && (staff.expires_at === null || new Date(staff.expires_at).getTime() > now().getTime())) {
          allowed = confirmed(await db.rpc("has_org_staff_permission", {
            _user_id: actor, _organization_id: organization_id, _permission: "students.write",
          })) === true;
        }
      }
      if (!allowed) throw new RequestError(403, "Недостаточно прав для управления ссылкой ученика");
      const profile = confirmed(await db.from("profiles").select("user_id, organization_id, archived_at")
        .eq("user_id", user_id).eq("organization_id", organization_id).maybeSingle());
      if (!profile || profile.user_id !== user_id || profile.organization_id !== organization_id || profile.archived_at) {
        throw new RequestError(404, "Активный ученик в организации не найден");
      }
      const isStudent = confirmed(await db.rpc("is_student_profile", { _target_user_id: user_id, _org_id: organization_id }));
      if (isStudent !== true) throw new RequestError(403, "Ссылку можно создать только для ученика");

      const scopedTokens = () => db.from("student_login_tokens").select("token, revoked_at")
        .eq("user_id", user_id).eq("organization_id", organization_id);
      if (action === "revoke") {
        const existing = confirmed(await scopedTokens().eq("token", token).maybeSingle());
        if (!existing) throw new RequestError(404, "Ссылка не найдена");
        if (!existing.revoked_at) {
          const updated = confirmed(await db.from("student_login_tokens").update({ revoked_at: now().toISOString() })
            .eq("user_id", user_id).eq("organization_id", organization_id).eq("token", token).select("id"));
          if (!Array.isArray(updated) || updated.length !== 1) throw new RequestError(409, "Не удалось подтвердить отзыв ссылки");
        }
        return json({ revoked: true, user_id, organization_id });
      }
      const existing = confirmed(await scopedTokens().is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle());
      if (existing || action === "get") return json({ token: existing?.token ?? null, user_id, organization_id });
      const created = confirmed(await db.from("student_login_tokens").insert({ user_id, organization_id, created_by: actor }).select("token").single());
      if (!created?.token || typeof created.token !== "string") throw new RequestError(503, "Не удалось подтвердить создание ссылки");
      return json({ token: created.token, user_id, organization_id });
    } catch (error) {
      // Do not log bearer tokens, request bodies or raw database errors.
      return json({ error: error instanceof RequestError ? error.message : "Не удалось обработать ссылку. Повторите попытку." }, error instanceof RequestError ? error.status : 503);
    }
  };
}
