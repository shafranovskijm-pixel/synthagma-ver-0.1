import { AccessError, checked, readObject, requireActiveUser, requireUuid, type AccessDb } from '../_shared/privileged-access.ts';
const PLATFORM_SOURCE_ORGANIZATION = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95';
const unavailable = (): never => { throw new AccessError(503, 'Не удалось подтвердить данные заказа. Повторите попытку.'); };
const denied = (): never => { throw new AccessError(403, 'Нет доступа к уведомлению по этому заказу.'); };
function storedUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return unavailable();
  return value.toLowerCase();
}
export interface TrustedOrderNotification {
  orderId: string; courseName: string; buyerName: string; buyerType: 'organization';
  studentsCount: number; price: number; notes: string | null; sellerOrganizationId: string | null;
}
/** A readable order alone is insufficient: buyer-org members and sellers also have SELECT policies. */
export async function requireOrderNotificationAccess(req: Request, admin: AccessDb, callerFactory: (originalHeader: string) => AccessDb): Promise<TrustedOrderNotification> {
  try {
    const actor = await requireActiveUser(req, admin);
    const profile = checked<any>(await admin.from('profiles').select('blocked_at').eq('user_id', actor.userId).maybeSingle());
    if (!actor.userId || !profile || profile.blocked_at) return denied();
    const body = await readObject(req);
    const orderId = requireUuid(body.orderId, 'заказ');
    const caller = callerFactory(req.headers.get('authorization')!);
    const order = checked<any>(await caller.from('marketplace_orders').select('id,marketplace_course_id,buyer_user_id,buyer_organization_id,buyer_type,status,price,students_count,notes,paid_at').eq('id', orderId).maybeSingle());
    if (!order || order.id !== orderId || order.buyer_user_id !== actor.userId || order.buyer_type !== 'organization') return denied();
    const buyerOrganizationId = storedUuid(order.buyer_organization_id);
    const listingId = storedUuid(order.marketplace_course_id);
    if (!['paid', 'completed'].includes(order.status) || typeof order.paid_at !== 'string' || !Number.isFinite(Date.parse(order.paid_at))) return denied();
    const permission = checked(await caller.rpc('can_manage_course_files_org', { _organization_id: buyerOrganizationId, _permission: 'courses.write' }));
    if (permission !== true) return denied();
    if ((typeof order.price !== 'number' && typeof order.price !== 'string') || !String(order.price).trim() || !Number.isFinite(Number(order.price)) || Number(order.price) < 0 || typeof order.students_count !== 'number' || !Number.isSafeInteger(order.students_count) || order.students_count < 1 || (order.notes !== null && typeof order.notes !== 'string')) return unavailable();
    // All service-client course/recipient reads occur only after purchaser and original-caller permission checks.
    const delivered = checked<any>(await admin.from('courses').select('id,organization_id,source_order_id,source_course_id').eq('source_order_id', orderId).eq('organization_id', buyerOrganizationId).maybeSingle());
    if (!delivered || delivered.organization_id !== buyerOrganizationId || delivered.source_order_id !== orderId) return denied();
    const sourceCourseId = storedUuid(delivered.source_course_id);
    const listing = checked<any>(await admin.from('marketplace_courses').select('id,course_id,organization_id').eq('id', listingId).maybeSingle());
    if (!listing || listing.id !== listingId || listing.course_id !== sourceCourseId) return denied();
    const source = checked<any>(await admin.from('courses').select('id,title,organization_id').eq('id', sourceCourseId).maybeSingle());
    if (!source || source.id !== sourceCourseId || typeof source.title !== 'string' || !source.title.trim()) return unavailable();
    const sellerOrganizationId = listing.organization_id === null ? null : storedUuid(listing.organization_id);
    if (source.organization_id !== sellerOrganizationId && !(sellerOrganizationId === null && source.organization_id === PLATFORM_SOURCE_ORGANIZATION)) return denied();
    const buyer = checked<any>(await admin.from('organizations').select('name').eq('id', buyerOrganizationId).maybeSingle());
    if (!buyer || typeof buyer.name !== 'string' || !buyer.name.trim()) return unavailable();
    return { orderId, courseName: source.title, buyerName: buyer.name, buyerType: 'organization', studentsCount: order.students_count, price: Number(order.price), notes: order.notes, sellerOrganizationId };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    return unavailable();
  }
}
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeOrderNotificationText(value: string): string {
  return value.replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}
/** Existing service-only atomic claim: at most one attempt per order/channel/recipient, not proof of delivery. */
export async function claimOrderNotificationDelivery(admin: AccessDb, orderId: string, channel: 'smtp' | 'telegram', recipient: string): Promise<boolean> {
  try {
    storedUuid(orderId);
    if (!recipient || recipient.length > 1024) return unavailable();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recipient)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    const data = checked(await admin.rpc('claim_notification_dedup', { _key: 'marketplace-order-notify:v1:' + orderId + ':' + channel + ':' + digest }));
    if (data !== true && data !== false) return unavailable();
    return data;
  } catch (error) {
    if (error instanceof AccessError) throw error;
    return unavailable();
  }
}
