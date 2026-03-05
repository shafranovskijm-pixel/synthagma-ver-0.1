import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAdminAwareBackPath(defaultPath = "/organization") {
  if (localStorage.getItem("adminViewAsOrg")) return "/admin";
  return defaultPath;
}
