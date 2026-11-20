import { supabase } from "@/integrations/supabase/client";
import { fetchPostpaidAccessProfile } from "@/lib/postpaidAccess";
import { resolveNotificationPath } from "./orgNotificationClick";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANDIDATE_LIMIT = 20;

export interface OrganizationPaymentNotice {
  organizationId: string;
  id: string;
  title: string;
  message: string;
  path: string;
}

/** Reads an existing reminder only. A pending invoice alone is not a debt decision. */
export async function readOrganizationPaymentNotice(organizationId: string): Promise<OrganizationPaymentNotice | null> {
  if (!UUID.test(organizationId)) return null;
  const [organization, postpaid, invoices] = await Promise.all([
    supabase.from("organizations").select("id, paid_until").eq("id", organizationId).single(),
    fetchPostpaidAccessProfile(organizationId),
    supabase.from("subscription_invoices")
      .select("id, organization_id, status, billing_kind, paid_at")
      .eq("organization_id", organizationId).eq("status", "pending").eq("billing_kind", "prepaid")
      .is("paid_at", null).order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT),
  ]);
  if (organization.error || invoices.error || organization.data?.id !== organizationId
    || postpaid.organization_id !== organizationId) throw new Error("payment_notice_unavailable");
  if (postpaid.active || postpaid.billing_mode !== "prepaid") return null;
  const paidUntil = organization.data.paid_until === null ? null : Date.parse(organization.data.paid_until);
  if (paidUntil !== null && !Number.isFinite(paidUntil)) throw new Error("payment_notice_unavailable");
  // A still-current paid term wins over an old unclosed invoice/reminder.
  if (paidUntil !== null && paidUntil >= Date.now()) return null;
  const ids = (invoices.data || []).filter(invoice => UUID.test(invoice.id)
    && invoice.organization_id === organizationId && invoice.status === "pending"
    && invoice.billing_kind === "prepaid" && invoice.paid_at === null).map(invoice => invoice.id);
  if (!ids.length) return null;
  const notices = await supabase.from("org_notifications")
    .select("id, organization_id, type, title, message, related_id, created_at")
    .eq("organization_id", organizationId).eq("type", "subscription_expiry")
    .in("related_id", ids).order("created_at", { ascending: false }).limit(1);
  if (notices.error) throw new Error("payment_notice_unavailable");
  const notice = notices.data?.[0];
  if (!notice || !UUID.test(notice.id) || notice.organization_id !== organizationId
    || notice.type !== "subscription_expiry" || !notice.related_id || !ids.includes(notice.related_id)
    || typeof notice.title !== "string" || !notice.title.trim()
    || typeof notice.message !== "string" || !notice.message.trim()) return null;
  const createdAt = Date.parse(notice.created_at);
  if (!Number.isFinite(createdAt)) return null;
  // Do not revive a previous period's reminder after a later paid term expired.
  if (paidUntil !== null && paidUntil > createdAt) return null;
  const path = resolveNotificationPath(notice, { courseFallbackPath: () => "/organization?tab=subscription" });
  return path ? { organizationId, id: notice.id, title: notice.title, message: notice.message, path } : null;
}
