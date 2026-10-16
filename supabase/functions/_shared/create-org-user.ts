import {
  AccessError, accessErrorResponse, checked, readObject,
  requireActiveUser, requirePlatformAdmin, requireUuid, type AccessDb,
} from "./privileged-access.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OrgUserDb extends AccessDb {
  auth: AccessDb["auth"] & {
    admin: {
      createUser(input: { email: string; password: string; email_confirm: boolean }): PromiseLike<{
        data: { user: { id: string } | null }; error: unknown;
      }>;
      deleteUser(id: string): PromiseLike<{ error: unknown }>;
    };
  };
}
interface Dependencies {
  db: OrgUserDb;
  reportCleanupFailure?: (userId: string, stage: string) => void;
}

export function createOrgUserHandler({ db, reportCleanupFailure = () => {} }: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    // This is assigned only after Auth confirms creation by THIS request. Never
    // look up an existing account by email for either provisioning or cleanup.
    let createdUserId: string | null = null;
    try {
      const actor = await requireActiveUser(req, db);
      await requirePlatformAdmin(db, actor);
      const body = await readObject(req);
      const organizationId = requireUuid(body.organizationId, "идентификатор организации");
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const password = body.password;
      const fullName = typeof body.fullName === "string" ? body.fullName.trim() || "Администратор" : "Администратор";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320
          || typeof password !== "string" || password.length < 6 || password.length > 4096
          || fullName.length > 300) {
        throw new AccessError(400, "Проверьте email, пароль и имя пользователя");
      }
      const organization = checked<any>(await db.from("organizations").select("id").eq("id", organizationId).maybeSingle());
      if (!organization) throw new AccessError(404, "Организация не найдена");

      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data?.user?.id) throw new AccessError(400, "Не удалось создать пользователя. Проверьте email и пароль; аккаунт с таким email может уже существовать.");
      createdUserId = requireUuid(data.user.id, "идентификатор созданного пользователя");

      // Auth's signup trigger already creates the profile and student role.
      // Change both rows in one transaction; missing rows or a failed update
      // must never become an apparent successful organization account.
      const result = await db.rpc("finalize_created_org_user", {
        p_user_id: createdUserId, p_organization_id: organizationId, p_full_name: fullName,
      });
      if (result.error || !result.data || result.data.userId !== createdUserId
          || result.data.organizationId !== organizationId || result.data.role !== "organization") {
        throw new AccessError(503, "Не удалось подтвердить создание кабинета организации. Повторите попытку.");
      }
      return new Response(JSON.stringify({ success: true, userId: createdUserId }), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    } catch (error) {
      let cleanupFailed = false;
      if (createdUserId) {
        // profiles/user_roles do not have an Auth cascade in the schema. Also
        // remove the default rows created by the signup trigger on RPC failure.
        // Attempt every step, including Auth deletion, even if one step fails.
        for (const [stage, remove] of [
          ["role", () => db.from("user_roles").delete().eq("user_id", createdUserId)],
          ["profile", () => db.from("profiles").delete().eq("user_id", createdUserId)],
          ["auth", () => db.auth.admin.deleteUser(createdUserId!)],
        ] as const) {
          try {
            const result = await remove();
            if (result.error) throw result.error;
          } catch {
            cleanupFailed = true;
            reportCleanupFailure(createdUserId, stage);
          }
        }
      }
      if (cleanupFailed) return accessErrorResponse(new AccessError(503,
        "Создание кабинета не завершено; очистка нового аккаунта требует проверки администратора."), cors);
      return accessErrorResponse(error, cors);
    }
  };
}
