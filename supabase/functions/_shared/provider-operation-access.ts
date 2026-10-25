import { AccessError, checked, requireActiveUser, requireUuid, type AccessDb } from './privileged-access.ts';
export interface LookupActor { userId: string; profile: { organization_id: string | null; blocked_at: string | null }; caller: AccessDb }
/** Read a small JSON object without trusting Content-Length or retaining an unbounded body. */
export async function readProviderOperationObject(message: Request | Response, maxBytes = 4096, status = 400): Promise<Record<string, unknown>> {
 const fail = () => new AccessError(status, status === 400 ? 'Некорректный запрос.' : 'Источник данных временно недоступен.');
 if (!message.body) throw fail();
 const reader = message.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
 try { for (;;) { const {value, done} = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw fail(); } chunks.push(value); } }
 finally { reader.releaseLock(); }
 const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
 try { const value: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>; } catch { /* fixed client/upstream message below */ }
 throw fail();
}
export async function requireProviderOperationActor(req: Request, admin: AccessDb, callerFactory: (header: string) => AccessDb): Promise<LookupActor> {
 const actor = await requireActiveUser(req, admin);
 if (!actor.userId || actor.service) throw new AccessError(403, 'Требуется действующий пользователь.');
 const profile = checked<any>(await admin.from('profiles').select('organization_id,blocked_at').eq('user_id', actor.userId).maybeSingle());
 if (!profile || profile.blocked_at) throw new AccessError(403, 'Доступ к аккаунту ограничен.');
 const caller = callerFactory(req.headers.get('authorization')!);
 if (checked(await caller.rpc('account_deletion_access_allowed', {})) !== true) throw new AccessError(403, 'Доступ к аккаунту отозван.');
 return {userId: actor.userId, profile, caller};
}
export async function requireOrganizationLookup(admin: AccessDb, actor: LookupActor, suppliedOrganizationId: unknown): Promise<void> {
 const role = checked<any>(await admin.from('user_roles').select('role').eq('user_id', actor.userId).eq('role', 'admin').maybeSingle());
 if (suppliedOrganizationId != null) {
  const organizationId = requireUuid(suppliedOrganizationId, 'организация');
  if (role?.role === 'admin') return;
  await requireLookupPermission(actor.caller, organizationId); return;
 }
 if (role?.role === 'admin') return;
 if (checked(await admin.rpc('is_platform_sales_manager', {_uid: actor.userId})) === true) return;
 if (!actor.profile.organization_id) throw new AccessError(403, 'Выберите организацию, в которой у вас есть право работать с реквизитами.');
 await requireLookupPermission(actor.caller, requireUuid(actor.profile.organization_id, 'организация'));
}
async function requireLookupPermission(caller: AccessDb, organizationId: string): Promise<void> {
 // Existing write operations whose forms use company requisites; no new role or permission token.
 for (const permission of ['settings.write', 'billing.write', 'documents.write', 'sales.write']) {
  const allowed = checked(await caller.rpc('can_access_organization', {_organization_id: organizationId, _permission: permission}));
  if (allowed === true) return;
 }
 throw new AccessError(403, 'Нет прав на поиск реквизитов для выбранной организации. Введите сведения вручную.');
}
export function providerOperationError(error: unknown, cors: Record<string, string>): Response {
 const status = error instanceof AccessError ? error.status : 503;
 const message = error instanceof AccessError ? error.message : 'Не удалось выполнить операцию. Повторите позже.';
 return new Response(JSON.stringify({error: message}), {status, headers: {...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
}
export function providerOperationJSON(value: unknown, cors: Record<string, string>): Response { return new Response(JSON.stringify(value), {headers: {...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}}); }
export interface ProviderRateResult { allowed: boolean; retryAfterSeconds?: number }
export function requireProviderRate(result: ProviderRateResult): void { if (!result.allowed) throw new AccessError(429, 'Слишком много запросов. Подождите минуту и повторите.'); }
