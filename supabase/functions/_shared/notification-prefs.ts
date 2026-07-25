// Shared helpers for reading student `notification_preferences` and writing
// personal in-app notifications. Kept in sync with `src/hooks/useStudentProfile.ts`
// via a single defaults map — do not diverge.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type NotifType =
  | "course_completed"
  | "webinar_reminder"
  | "homework"
  | "deadline_reminder"
  | "partner_changes"
  | "course_updates";

export type NotifChannel = "platform" | "email";

/** Default per-type-per-channel setting when the user has no explicit row. */
const DEFAULTS: Record<NotifType, Record<NotifChannel, boolean>> = {
  course_completed:  { platform: true,  email: true  },
  webinar_reminder:  { platform: true,  email: true  },
  homework:          { platform: true,  email: false },
  deadline_reminder: { platform: true,  email: false },
  partner_changes:   { platform: true,  email: false },
  course_updates:    { platform: true,  email: false },
};

let cachedAdmin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  cachedAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return cachedAdmin;
}

/** True if the user allows this notification on this channel. Missing row = default. */
export async function isPrefEnabled(
  userId: string,
  type: NotifType,
  channel: NotifChannel,
): Promise<boolean> {
  if (!userId) return DEFAULTS[type]?.[channel] ?? false;
  const { data } = await admin()
    .from("notification_preferences")
    .select("enabled")
    .eq("user_id", userId)
    .eq("notification_type", type)
    .eq("channel", channel)
    .maybeSingle();
  if (data && typeof data.enabled === "boolean") return data.enabled;
  return DEFAULTS[type]?.[channel] ?? false;
}

/** Batch variant — returns Set of userIds who have `channel` enabled for `type`. */
export async function filterEnabledUsers(
  userIds: string[],
  type: NotifType,
  channel: NotifChannel,
): Promise<Set<string>> {
  const enabled = new Set<string>();
  if (userIds.length === 0) return enabled;
  const { data } = await admin()
    .from("notification_preferences")
    .select("user_id, enabled")
    .in("user_id", userIds)
    .eq("notification_type", type)
    .eq("channel", channel);
  const explicit = new Map<string, boolean>();
  for (const row of data ?? []) explicit.set(row.user_id as string, !!row.enabled);
  const defaultOn = DEFAULTS[type]?.[channel] ?? false;
  for (const uid of userIds) {
    const v = explicit.has(uid) ? explicit.get(uid)! : defaultOn;
    if (v) enabled.add(uid);
  }
  return enabled;
}

/**
 * Write a personal in-app notification for a student, respecting the
 * `<type>.platform` preference. Silently no-ops when disabled or when
 * `userId` is falsy.
 */
export async function notifyStudent(params: {
  userId: string | null | undefined;
  type: NotifType;
  title: string;
  message: string;
  relatedId?: string | null;
  /** Skip the preference check (use for milestones users cannot opt out of). */
  force?: boolean;
}): Promise<void> {
  const { userId, type, title, message, relatedId = null, force = false } = params;
  if (!userId) return;
  if (!force) {
    const ok = await isPrefEnabled(userId, type, "platform");
    if (!ok) return;
  }
  const { error } = await admin().from("student_notifications").insert({
    user_id: userId,
    type,
    title,
    message,
    related_id: relatedId,
  });
  if (error) console.error("notifyStudent insert failed:", error.message);
}

/**
 * True if `email` looks like a real deliverable address.
 * Excludes служебные `<login>@student.local` заглушки, которые мы выдаём
 * ученикам без реальной почты — SMTP всё равно вернёт bounce.
 */
export function isRealEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  if (e.endsWith("@student.local")) return false;
  return true;
}

/**
 * Возвращает лучший email для ученика: сначала `profiles.contact_email`,
 * затем `auth.users.email` (если реальный). Иначе null.
 */
export async function getPreferredEmail(userId: string): Promise<string | null> {
  if (!userId) return null;
  const supa = admin();
  const { data: prof } = await supa
    .from("profiles")
    .select("contact_email")
    .eq("user_id", userId)
    .maybeSingle();
  const contact = (prof as any)?.contact_email as string | undefined;
  if (isRealEmail(contact)) return contact!.trim();
  try {
    const { data: authUser } = await supa.auth.admin.getUserById(userId);
    const authEmail = authUser?.user?.email ?? null;
    if (isRealEmail(authEmail)) return authEmail;
  } catch (_) { /* ignore */ }
  return null;
}

/** Атомарный claim ключа дедупликации; true = первый раз, false = уже отправляли. */
export async function claimDedupKey(key: string): Promise<boolean> {
  if (!key) return true;
  const { data, error } = await admin().rpc("claim_notification_dedup", { _key: key });
  if (error) {
    console.error("claim_notification_dedup failed:", error.message);
    return true; // fail-open, чтобы не потерять важное уведомление
  }
  return !!data;
}

