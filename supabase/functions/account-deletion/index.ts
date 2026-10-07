/** S-042. Only the verified caller can create/confirm a plan. Receipt capabilities
 * expose no personal data and may only resume an already confirmed operation. */
export const ACCOUNT_DELETION_REVISION = "account-deletion-v2";
// Expand the purge scope or warning semantics only with a new consent version.
export const ACCOUNT_DELETION_CONSENT = "full-personal-data-v1";
export const ACCOUNT_DELETION_WARNING = "Удаление аккаунта необратимо. Профиль, доступ, личные файлы, переписка, прогресс и результаты из списка «Будет удалено» будут удалены из рабочей СИНТАГМЫ. Восстановить аккаунт и эти данные нельзя. Заранее скачайте нужные материалы. Отдельно указаны данные, которые сохраняются или требуют отдельной обработки. Эта операция не удаляет резервные копии и ранее выгруженные другими пользователями документы.";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json", "Cache-Control": "no-store",
};
export interface DeletionActor { id: string; email: string | null; hasVerifiedMfa: boolean }
type Result = { data: any; error: unknown };
export interface AccountDeletionDependencies {
  authenticate: (authorization: string) => Promise<DeletionActor | null>;
  reauthenticate: (actor: DeletionActor, password: string) => Promise<boolean>;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>;
  revoke: (userId: string) => Promise<void>;
  removeFiles: (bucket: string, paths: string[]) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
  authUserExists: (userId: string) => Promise<boolean>;
  randomToken?: () => string;
  hashToken?: (token: string) => Promise<string>;
}
class Failure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const tokenPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const defaultRandom = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
const defaultHash = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), b => b.toString(16).padStart(2, "0")).join("");
const knownCodes: Record<string, [number, string]> = {
  CONSENT_REQUIRED: [409, "Нужно заново прочитать предупреждение и подтвердить удаление аккаунта и связанных данных."],
  PLAN_EXPIRED: [409, "Проверка устарела. Проверьте условия удаления заново."],
  PLAN_CHANGED: [409, "Данные аккаунта изменились. Проверьте условия удаления заново."],
  OWNERSHIP_TRANSFER_REQUIRED: [409, "Сначала передайте управление организацией с другими пользователями или общими данными."],
  RETENTION_POLICY_REQUIRED: [409, "У аккаунта есть документы организации, которые требуют отдельной проверки перед удалением."],
  INVALID_RECEIPT: [404, "Сведения об операции не найдены."],
  NOT_CONFIRMED: [409, "Удаление ещё не было подтверждено."],
  DELETION_UNAVAILABLE: [503, "Не удалось проверить удаление. Повторите проверку состояния."],
};
function resultData(result: Result): any {
  if (result.error) throw new Failure(503, "DELETION_UNAVAILABLE", knownCodes.DELETION_UNAVAILABLE[1]);
  if (isObject(result.data) && typeof result.data.code === "string") {
    const [status, message] = knownCodes[result.data.code] ?? knownCodes.DELETION_UNAVAILABLE;
    throw new Failure(status, result.data.code in knownCodes ? result.data.code : "DELETION_UNAVAILABLE", message);
  }
  return result.data;
}
function checkKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some(key => !keys.includes(key))) throw new Failure(400, "INVALID_REQUEST", "Некорректный запрос.");
}

export function createAccountDeletionHandler(deps: AccountDeletionDependencies) {
  const randomToken = deps.randomToken ?? defaultRandom;
  const hash = deps.hashToken ?? defaultHash;
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const rpc = async (name: string, args: Record<string, unknown>) => resultData(await deps.rpc(name, args));
  const statusOf = async (requestId: string, receiptHash: string) => rpc("account_deletion_status", { p_request_id: requestId, p_receipt_hash: receiptHash });
  // Every external step is idempotent. The DB state remains pending until Auth
  // absence and the exact storage manifest have both been independently checked.
  const continueDeletion = async (requestId: string, receiptHash: string) => {
    const work = await rpc("account_deletion_work", { p_request_id: requestId, p_receipt_hash: receiptHash });
    if (work.status === "deleted") return statusOf(requestId, receiptHash);
    if (work.status !== "cleanup_pending" || !idPattern.test(work.userId)) throw new Failure(409, "NOT_CONFIRMED", knownCodes.NOT_CONFIRMED[1]);
    try {
      if (await deps.authUserExists(work.userId)) await deps.revoke(work.userId);
      const buckets = new Map<string, string[]>();
      for (const file of work.files as { bucket: string; path: string }[]) {
        buckets.set(file.bucket, [...(buckets.get(file.bucket) ?? []), file.path]);
      }
      for (const [bucket, paths] of buckets) {
        for (let offset = 0; offset < paths.length; offset += 50) await deps.removeFiles(bucket, paths.slice(offset, offset + 50));
      }
      await rpc("account_deletion_erase_data", { p_request_id: requestId, p_receipt_hash: receiptHash });
      if (await deps.authUserExists(work.userId)) await deps.deleteAuthUser(work.userId);
      if (await deps.authUserExists(work.userId)) throw new Error("Auth removal not confirmed");
      await rpc("account_deletion_complete", { p_request_id: requestId, p_receipt_hash: receiptHash });
      return statusOf(requestId, receiptHash);
    } catch {
      // Do not reveal database errors, passwords, tokens, object paths or PII.
      return { status: "cleanup_pending", requestId, message: "Удаление начато, но ещё не завершено. Проверьте состояние и продолжите обработку." };
    }
  };
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") return reply({ code: "INVALID_REQUEST", message: "Используйте POST." }, 405);
    try {
      const text = await request.text();
      if (text.length > 8192) throw new Failure(400, "INVALID_REQUEST", "Некорректный запрос.");
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new Failure(400, "INVALID_REQUEST", "Некорректный запрос."); }
      if (!isObject(body)) throw new Failure(400, "INVALID_REQUEST", "Некорректный запрос.");
      if (body.action === "status" || body.action === "resume") {
        checkKeys(body, ["action", "requestId", "statusToken"]);
        if (typeof body.requestId !== "string" || !idPattern.test(body.requestId) || typeof body.statusToken !== "string" || !tokenPattern.test(body.statusToken)) {
          throw new Failure(400, "INVALID_REQUEST", "Некорректный запрос.");
        }
        const receiptHash = await hash(body.statusToken);
        const state = body.action === "status" ? await statusOf(body.requestId, receiptHash) : await continueDeletion(body.requestId, receiptHash);
        return reply(state, state.status === "cleanup_pending" ? 202 : 200);
      }
      const authorization = request.headers.get("authorization");
      const actor = authorization ? await deps.authenticate(authorization) : null;
      if (!actor || !idPattern.test(actor.id)) throw new Failure(401, "AUTH_REQUIRED", "Требуется вход в аккаунт.");
      if (body.action === "preview") {
        checkKeys(body, ["action"]);
        if (actor.hasVerifiedMfa) return reply({ revision: ACCOUNT_DELETION_REVISION, consentVersion: ACCOUNT_DELETION_CONSENT, warning: ACCOUNT_DELETION_WARNING, canDelete: false, planToken: null, statusToken: null, requestId: null, expiresAt: null,
          categories: [], blockers: [{ code: "MFA_REAUTH_REQUIRED", message: "Для аккаунта включена многофакторная защита. Подтверждение удаления с дополнительным фактором пока не подключено." }] });
        const planToken = randomToken();
        const statusToken = randomToken();
        const plan = await rpc("account_deletion_prepare", { p_user_id: actor.id, p_plan_hash: await hash(planToken), p_receipt_hash: await hash(statusToken), p_consent_version: ACCOUNT_DELETION_CONSENT });
        return reply({ ...plan, revision: ACCOUNT_DELETION_REVISION, consentVersion: ACCOUNT_DELETION_CONSENT, warning: ACCOUNT_DELETION_WARNING, planToken: plan.canDelete ? planToken : null, statusToken: plan.canDelete ? statusToken : null });
      }
      if (body.action !== "confirm") throw new Failure(400, "INVALID_REQUEST", "Некорректный запрос.");
      checkKeys(body, ["action", "planToken", "password", "confirmation", "consentVersion"]);
      if (body.consentVersion !== ACCOUNT_DELETION_CONSENT || body.confirmation !== "DELETE_MY_ACCOUNT_AND_PERSONAL_DATA") {
        throw new Failure(409, "CONSENT_REQUIRED", knownCodes.CONSENT_REQUIRED[1]);
      }
      if (typeof body.planToken !== "string" || !tokenPattern.test(body.planToken) || typeof body.password !== "string" || body.password.length < 1 || body.password.length > 4096) {
        throw new Failure(400, "INVALID_REQUEST", "Некорректный запрос.");
      }
      if (actor.hasVerifiedMfa) throw new Failure(403, "MFA_REAUTH_REQUIRED", "Нужно подтверждение дополнительным фактором. Удаление не начато.");
      if (!actor.email || !await deps.reauthenticate(actor, body.password)) throw new Failure(403, "REAUTH_FAILED", "Пароль не подтверждён. Удаление не начато.");
      const work = await rpc("account_deletion_begin", { p_user_id: actor.id, p_plan_hash: await hash(body.planToken), p_consent_version: ACCOUNT_DELETION_CONSENT });
      if (!idPattern.test(work.requestId) || typeof work.receiptHash !== "string") throw new Failure(503, "DELETION_UNAVAILABLE", knownCodes.DELETION_UNAVAILABLE[1]);
      const state = await continueDeletion(work.requestId, work.receiptHash);
      return reply(state, state.status === "cleanup_pending" ? 202 : 200);
    } catch (error) {
      return reply({ code: error instanceof Failure ? error.code : "DELETION_UNAVAILABLE", message: error instanceof Failure ? error.message : knownCodes.DELETION_UNAVAILABLE[1] }, error instanceof Failure ? error.status : 503);
    }
  };
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";


const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createAccountDeletionHandler({
  authenticate: async (authorization) => {
    if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
    const { data, error } = await service.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null,
      hasVerifiedMfa: (data.user.factors ?? []).some(factor => factor.status === "verified") };
  },
  reauthenticate: async (actor, password) => {
    // A separate stateless client must never replace the caller's main session.
    const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await verifier.auth.signInWithPassword({ email: actor.email!, password });
    try { return !error && data.user?.id === actor.id && !(data.user.factors ?? []).some(factor => factor.status === "verified"); }
    finally { if (data.session) await verifier.auth.signOut({ scope: "local" }); }
  },
  rpc: (name, args) => service.rpc(name, args),
  revoke: async (userId) => {
    const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    if (error) throw error;
  },
  removeFiles: async (bucket, paths) => {
    const { error } = await service.storage.from(bucket).remove(paths);
    if (error) throw error;
  },
  deleteAuthUser: async (userId) => {
    const { error } = await service.auth.admin.deleteUser(userId, false);
    if (error) throw error;
  },
  authUserExists: async (userId) => {
    const { data, error } = await service.auth.admin.getUserById(userId);
    if (error && (error.code === "user_not_found" || error.status === 404)) return false;
    if (error) throw error;
    return !!data.user;
  },
}));
