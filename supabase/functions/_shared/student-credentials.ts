// Shared, server-authoritative learner credential workflow. No client-supplied
// email/password is ever used to compose a credentials email.
export const STUDENT_CREDENTIALS_REVISION = "s047-credentials-20261012";
type Result = { data: any; error: any };
export interface CredentialsDb {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>;
}
interface Dependencies {
  db: CredentialsDb;
  authenticate: (authorization: string) => Promise<{ userId: string | null; error: unknown }>;
  updateAuthUser?: (userId: string, values: Record<string, unknown>) => Promise<{ error: unknown }>;
  sendEmail?: (message: { to: string; subject: string; html: string }) => Promise<void>;
  now?: () => Date;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const profileColumns = "user_id,organization_id,full_name,email,login,generated_password";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Sintagma-Function-Revision",
  "X-Sintagma-Function-Revision": STUDENT_CREDENTIALS_REVISION,
};
export class CredentialsError extends Error {
  constructor(readonly status: number, message: string, readonly partial = false) { super(message); }
}
function confirmed(result: Result) {
  if (result.error) throw new CredentialsError(503, "Не удалось подтвердить данные ученика. Повторите попытку.");
  return result.data;
}
const active = (row: any, now: Date) => row.expires_at === null || new Date(row.expires_at).getTime() > now.getTime();
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function resolveLegacyId(db: CredentialsDb, body: any): Promise<string> {
  // Compatibility with already-open older frontends: resolve the exact stored
  // login/email pair, never forward their supplied credentials or destination.
  if (typeof body.login !== "string" || typeof body.email !== "string" || !body.login.trim() || !body.email.trim()) {
    throw new CredentialsError(400, "Укажите ученика. Обновите страницу и повторите отправку.");
  }
  const matches: any[] = [];
  for (const table of ["profiles", "labor_safety_profiles"]) {
    const rows = confirmed(await db.from(table).select("user_id")
      .eq("login", body.login.trim()).eq("email", body.email.trim()).limit(2));
    if (!Array.isArray(rows)) throw new CredentialsError(503, "Не удалось подтвердить ученика");
    matches.push(...rows);
  }
  const ids = [...new Set(matches.map(row => row.user_id))];
  if (ids.length !== 1 || !uuid.test(ids[0] as string)) throw new CredentialsError(404, "Не удалось однозначно определить ученика. Обновите страницу.");
  return ids[0] as string;
}

async function authorizeTarget(db: CredentialsDb, actor: string, userId: string, requestedOrg: unknown, now: Date) {
  const revocations = confirmed(await db.from("account_deletion_revocations").select("user_id")
    .in("user_id", [actor, userId]).limit(1));
  if (!Array.isArray(revocations)) throw new CredentialsError(503, "Не удалось проверить доступ");
  if (revocations.length) throw new CredentialsError(403, "Доступ к аккаунту отозван");
  const profile = confirmed(await db.from("profiles").select(profileColumns + ",archived_at")
    .eq("user_id", userId).maybeSingle());
  const labor = confirmed(await db.from("labor_safety_profiles").select(profileColumns)
    .eq("user_id", userId).maybeSingle());
  if (profile?.archived_at) throw new CredentialsError(403, "Учётная запись ученика находится в архиве");
  const orgIds = [...new Set([profile?.organization_id, labor?.organization_id].filter(Boolean))];
  if (orgIds.length !== 1) throw new CredentialsError(409, "Не удалось однозначно подтвердить организацию ученика");
  const orgId = orgIds[0] as string;
  if (requestedOrg != null && requestedOrg !== orgId) throw new CredentialsError(403, "Ученик не относится к выбранной организации");
  const source = profile?.organization_id === orgId ? profile : labor;
  if (!source || source.user_id !== userId) throw new CredentialsError(404, "Ученик не найден");

  const adminRole = confirmed(await db.from("user_roles").select("role")
    .eq("user_id", actor).eq("role", "admin").limit(1).maybeSingle());
  // has_role is overloaded in production; do not use its ambiguous RPC signature.
  let allowed = adminRole?.role === "admin";
  if (!allowed) allowed = confirmed(await db.rpc("is_org_owner", { _user_id: actor, _organization_id: orgId })) === true;
  if (!allowed) {
    const membership = confirmed(await db.from("org_staff").select("expires_at")
      .eq("user_id", actor).eq("organization_id", orgId).maybeSingle());
    if (membership && active(membership, now)) allowed = confirmed(await db.rpc("has_org_staff_permission", {
      _user_id: actor, _organization_id: orgId, _permission: "students.write",
    })) === true;
  }
  if (!allowed) throw new CredentialsError(403, "Недостаточно прав для управления данными входа ученика");

  const student = confirmed(await db.rpc("is_student_profile", { _target_user_id: userId, _org_id: orgId }));
  const roles = confirmed(await db.from("user_roles").select("role").eq("user_id", userId));
  const targetMemberships = confirmed(await db.from("org_staff").select("expires_at").eq("user_id", userId));
  if (student !== true || !Array.isArray(roles) || !roles.some(r => r.role === "student")
    || roles.some(r => r.role !== "student") || !Array.isArray(targetMemberships)
    || targetMemberships.some(row => active(row, now))) {
    throw new CredentialsError(403, "Эта операция доступна только для ученика, а не сотрудника или владельца");
  }
  return { userId, orgId, source, profile, labor };
}

async function storedPassword(db: CredentialsDb, value: unknown): Promise<string> {
  if (typeof value !== "string" || !value) throw new CredentialsError(409, "У ученика нет сохранённого пароля. Сначала задайте данные входа.");
  const password = confirmed(await db.rpc("decrypt_password", { p_text: value }));
  // Never fall back to ciphertext if decryption failed or returned no password.
  if (typeof password !== "string" || !password) throw new CredentialsError(409, "Не удалось прочитать сохранённый пароль. Задайте новый пароль ученику.");
  return password;
}

export function createStudentCredentialsHandler(action: "send" | "update", dependencies: Dependencies) {
  const { db, authenticate, now = () => new Date() } = dependencies;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {
    ...cors, "Content-Type": "application/json", "Cache-Control": "no-store",
  } });
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "Используйте POST" }, 405);
    try {
      const authorization = req.headers.get("authorization");
      if (!authorization) throw new CredentialsError(401, "Требуется вход в систему");
      const auth = await authenticate(authorization);
      if (auth.error || !auth.userId) throw new CredentialsError(401, "Сессия истекла. Войдите повторно.");
      let body: any;
      try { body = await req.json(); } catch { throw new CredentialsError(400, "Некорректный запрос"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new CredentialsError(400, "Некорректный запрос");
      const userId = body.user_id ?? (action === "send" ? await resolveLegacyId(db, body) : null);
      if (typeof userId !== "string" || !uuid.test(userId) || (body.organization_id != null && (typeof body.organization_id !== "string" || !uuid.test(body.organization_id)))) {
        throw new CredentialsError(400, "Некорректный идентификатор ученика или организации");
      }
      const target = await authorizeTarget(db, auth.userId, userId, body.organization_id, now());
      if (action === "send") {
        const { source, profile, labor } = target;
        const email = (source.email || profile?.email || labor?.email || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /@(?:student\.local|[^@]*\.invalid)$/i.test(email)) {
          throw new CredentialsError(400, "У ученика не указан адрес электронной почты для отправки");
        }
        if (!source.login) throw new CredentialsError(409, "У ученика нет логина для входа");
        const password = await storedPassword(db, source.generated_password);
        const organization = confirmed(await db.from("organizations").select("name").eq("id", target.orgId).maybeSingle());
        const name = source.full_name ? `, ${escapeHtml(source.full_name)}` : "";
        const orgName = organization?.name ? escapeHtml(organization.name) : "СИНТАГМА";
        if (!dependencies.sendEmail) throw new Error("Missing sender");
        await dependencies.sendEmail({ to: email, subject: `Данные для входа — ${organization?.name || "СИНТАГМА"}`,
          html: `<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;color:#222"><h1>${orgName}</h1><p>Здравствуйте${name}!</p><p>Ваши данные для входа в кабинет ученика:</p><p>Логин: <b>${escapeHtml(source.login)}</b><br>Пароль: <b>${escapeHtml(password)}</b></p><p><a href="https://xn--80aaiswd0ak.xn--p1ai/login">Войти в СИНТАГМУ</a></p><p>Не передавайте пароль другим людям.</p></body></html>` });
        return json({ success: true, user_id: userId, organization_id: target.orgId });
      }

      const login = body.new_login;
      const password = body.new_password;
      if (login === undefined && password === undefined) throw new CredentialsError(400, "Укажите новый логин или пароль");
      if (login !== undefined && (typeof login !== "string" || !/^[a-zA-Z0-9_]{3,30}$/.test(login))) throw new CredentialsError(400, "Логин должен содержать 3–30 символов: латинские буквы, цифры или подчёркивание");
      if (password !== undefined && (typeof password !== "string" || password.length < 6 || password.length > 256)) throw new CredentialsError(400, "Пароль должен содержать от 6 до 256 символов");
      if (login !== undefined) for (const table of ["profiles", "labor_safety_profiles"]) {
        const matches = confirmed(await db.from(table).select("user_id").eq("login", login).neq("user_id", userId).limit(1));
        if (!Array.isArray(matches)) throw new CredentialsError(503, "Не удалось проверить логин");
        if (matches.length) throw new CredentialsError(409, "Этот логин уже занят");
      }
      const authValues: Record<string, unknown> = {};
      const profileValues: Record<string, unknown> = {};
      if (login !== undefined) { authValues.email = `${login}@student.local`; authValues.email_confirm = true; profileValues.login = login; }
      if (password !== undefined) { authValues.password = password; profileValues.generated_password = password; }
      if (!dependencies.updateAuthUser) throw new Error("Missing auth updater");
      const authResult = await dependencies.updateAuthUser(userId, authValues);
      if (authResult.error) throw new CredentialsError(409, "Не удалось изменить данные входа. Проверьте, не занят ли логин, и повторите попытку.");
      // GoTrue and public profiles are separate writes. Report a partial change
      // explicitly if persistence cannot be confirmed; never claim full success.
      try {
        for (const [table, row] of [["profiles", target.profile], ["labor_safety_profiles", target.labor]] as const) {
          if (!row) continue;
          let query = db.from(table).update(profileValues).eq("user_id", userId);
          query = row.organization_id === null ? query.is("organization_id", null) : query.eq("organization_id", target.orgId);
          const changed = confirmed(await query.select("user_id"));
          if (!Array.isArray(changed) || changed.length !== 1 || changed[0].user_id !== userId) throw new Error("Unconfirmed profile write");
        }
      } catch {
        throw new CredentialsError(409, "Вход в аккаунт обновлён, но сохранение данных ученика подтверждено не полностью. Обновите карточку и повторите сохранение тех же данных.", true);
      }
      return json({ success: true, user_id: userId, organization_id: target.orgId, login: login ?? target.source.login,
        ...(password !== undefined ? { password } : {}), message: "Учётные данные обновлены" });
    } catch (error) {
      return json({ error: error instanceof CredentialsError ? error.message : "Не удалось выполнить операцию. Повторите попытку.",
        ...(error instanceof CredentialsError && error.partial ? { partial_success: true } : {}) }, error instanceof CredentialsError ? error.status : 503);
    }
  };
}
