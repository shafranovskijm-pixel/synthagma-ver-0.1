import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAdminAwareBackPath(defaultPath = "/organization") {
  if (localStorage.getItem("adminViewAsOrg")) return "/admin";
  return defaultPath;
}

/**
 * Возвращает путь к встроенному (в дашборд) представлению курса с открытой
 * вкладкой «Подробности курса». Это исключает «одностраничный» режим
 * без бокового меню.
 *
 * Всегда возвращает /organization: даже в режиме adminViewAsOrg администратор
 * остаётся в интерфейсе OrganizationDashboard на маршруте /organization.
 * Путь /admin используется только для выхода назад (см. getAdminAwareBackPath).
 */
export function getCourseDetailsPath(courseId: string) {
  return `/organization?tab=course-details&courseId=${courseId}`;
}
