import { courseCompletedNotificationPath } from "@/lib/groups/groupContext";

export interface ClickableNotification {
  id: string;
  type: string;
  related_id?: string | null;
  user_id?: string | null;
}

export interface HandleNotificationClickDeps {
  navigate: (path: string) => void;
  /** Best-effort: ошибка не блокирует навигацию. */
  markAsRead: (id: string) => Promise<unknown> | unknown;
  close: () => void;
  courseFallbackPath: (courseId: string) => string;
  setSessionItem?: (key: string, value: string) => void;
  onMarkError?: (error: unknown) => void;
}

/**
 * Возвращает путь для уведомления или null, если переход не предусмотрен.
 * Побочные эффекты (sessionStorage) выполняются перед навигацией.
 */
export function resolveNotificationPath(
  n: ClickableNotification,
  deps: Pick<HandleNotificationClickDeps, "courseFallbackPath" | "setSessionItem">,
): string | null {
  if (n.type === "subscription_expiry" && n.related_id) {
    return `/invoice/${n.related_id}`;
  }
  if (n.type === "signature" && n.related_id) {
    // CounterpartiesSection читает это при монтировании, чтобы раскрыть нужный договор
    deps.setSessionItem?.("openSignatureId", n.related_id);
    return `/organization?tab=org-documents`;
  }
  if (n.type === "course_completed") {
    return courseCompletedNotificationPath(n, deps.courseFallbackPath);
  }
  return null;
}

/**
 * Навигация выполняется немедленно и независимо от markAsRead (best-effort).
 */
export function handleNotificationClick(
  n: ClickableNotification,
  deps: HandleNotificationClickDeps,
): string | null {
  const target = resolveNotificationPath(n, deps);
  if (target) {
    deps.close();
    deps.navigate(target);
  }

  try {
    const result = deps.markAsRead(n.id);
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch((err) => {
        console.error("markAsRead failed (navigation not blocked)", err);
        deps.onMarkError?.(err);
      });
    }
  } catch (err) {
    console.error("markAsRead failed (navigation not blocked)", err);
    deps.onMarkError?.(err);
  }

  return target;
}
