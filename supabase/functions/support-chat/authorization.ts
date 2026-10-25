import { AccessError, checked, requireActiveUser, requireUuid, type AccessDb } from '../_shared/privileged-access.ts';
export interface SupportPrincipal { userId: string | null; guestToken: string | null }
export interface SupportConversation { id: string; status: string; telegram_topic_id: number | null; ai_failures_count: number; unread_for_user: number }
function guestCapability(value: unknown): string {
  // Keep existing opaque capabilities byte-exact; do not turn a public conversation ID into authorization.
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || !value.trim()) throw new AccessError(400, 'Не удалось подтвердить доступ к диалогу.');
  return value;
}
export async function requireSupportPrincipal(req: Request, db: AccessDb, anonKey: string, suppliedGuestToken: unknown): Promise<SupportPrincipal> {
  try {
    if (req.method !== 'POST') throw new AccessError(405, 'Используйте POST');
    const header = req.headers.get('authorization') || '';
    const bearer = /^Bearer\s+(\S+)$/i.exec(header);
    // Supabase's guest invoke sends the configured public anon key. It grants no user authority.
    if (!header || (anonKey.length > 0 && bearer?.[1] === anonKey)) return { userId: null, guestToken: guestCapability(suppliedGuestToken) };
    const actor = await requireActiveUser(req, db);
    const profile = checked<any>(await db.from('profiles').select('blocked_at').eq('user_id', actor.userId).maybeSingle());
    if (!actor.userId || !profile || profile.blocked_at) throw new AccessError(403, 'Доступ к аккаунту ограничен.');
    return { userId: actor.userId, guestToken: null };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, 'Не удалось подтвердить доступ к диалогу. Повторите попытку.');
  }
}
export async function requireSupportConversation(db: AccessDb, principal: SupportPrincipal, value: unknown): Promise<SupportConversation> {
  try {
    const id = requireUuid(value, 'диалог');
    // Only authorization/routing metadata is read before ownership has been proved; no message history or contacts.
    const conv = checked<any>(await db.from('support_conversations').select('id,user_id,guest_token,status,telegram_topic_id,ai_failures_count,unread_for_user').eq('id', id).maybeSingle());
    const allowed = conv && (principal.userId ? conv.user_id === principal.userId : conv.user_id === null && principal.guestToken !== null && conv.guest_token === principal.guestToken);
    if (!allowed) throw new AccessError(404, 'Диалог не найден.');
    return { id: conv.id, status: conv.status, telegram_topic_id: conv.telegram_topic_id, ai_failures_count: conv.ai_failures_count, unread_for_user: conv.unread_for_user ?? 0 };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, 'Не удалось подтвердить доступ к диалогу. Повторите попытку.');
  }
}
