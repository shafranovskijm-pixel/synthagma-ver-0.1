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
 */
export function getCourseDetailsPath(courseId: string) {
  const base = localStorage.getItem("adminViewAsOrg") ? "/admin" : "/organization";
  return `${base}?tab=course-details&courseId=${courseId}`;
}
