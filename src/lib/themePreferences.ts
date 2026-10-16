import { getStoredThemeId, getThemeById, storeThemeId } from "@/constants/admin-themes";

export interface ThemePreferences {
  themeId: string | null;
  themeMode: "light" | "dark" | "system";
  animLevel: "full" | "reduced" | "none";
  accentHsl: string | null;
  density: "compact" | "default" | "comfortable";
  radius: "sharp" | "default" | "soft";
}
export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  themeId: null, themeMode: "light", animLevel: "full", accentHsl: null, density: "default", radius: "default",
};
export const ORG_THEME_ENFORCE_KEY = "org-theme-enforce-active";
const PERSONAL_SNAPSHOT_KEY = "theme-personal-before-org-v1";
export const THEME_PREFERENCES_EVENT = "theme-preferences-change";
export const THEME_MODE_EVENT = "theme-preferences-mode-change";
let sessionInitialized = false;

/** Run before either startup styling or the first org load. The persisted flag
 * belongs to the previous page session, never to a public/student route. */
export function initializeThemeSession() {
  if (sessionInitialized) return;
  sessionInitialized = true;
  restorePersonalTheme();
}
export function isSharedThemeEnforced(): boolean {
  try { return localStorage.getItem(ORG_THEME_ENFORCE_KEY) === "1"; }
  catch { return false; }
}

export function normalizeThemePreferences(input: unknown): ThemePreferences {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    themeId: typeof value.themeId === "string" && getThemeById(value.themeId) ? value.themeId : null,
    themeMode: value.themeMode === "dark" || value.themeMode === "system" ? value.themeMode : "light",
    animLevel: value.animLevel === "none" || value.animLevel === "reduced" ? value.animLevel : "full",
    accentHsl: typeof value.accentHsl === "string" && /^\d{1,3}(?:\.\d+)? \d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/.test(value.accentHsl) ? value.accentHsl : null,
    density: value.density === "compact" || value.density === "comfortable" ? value.density : "default",
    radius: value.radius === "sharp" || value.radius === "soft" ? value.radius : "default",
  };
}
export function readDeviceThemePreferences(): ThemePreferences {
  try {
    return normalizeThemePreferences({
      themeId: getStoredThemeId(), themeMode: localStorage.getItem("theme"),
      animLevel: localStorage.getItem("theme-animation-level"), accentHsl: localStorage.getItem("theme-accent"),
      density: localStorage.getItem("theme-density"), radius: localStorage.getItem("theme-radius"),
    });
  } catch { return { ...DEFAULT_THEME_PREFERENCES }; }
}

export function applyVisualThemeColors(themeId: string | null, accentHsl: string | null) {
  const root = document.documentElement;
  const theme = themeId ? getThemeById(themeId) : null;
  for (const [name, value] of [
    ["--primary", theme?.accent], ["--primary-foreground", theme?.accentForeground],
    ["--accent", accentHsl || theme?.accent], ["--accent-foreground", theme?.accentForeground],
    ["--ring", accentHsl || theme?.accent],
  ]) {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
}

/** Apply effective settings; the personal snapshot is intentionally separate. */
export function applyThemePreferences(input: ThemePreferences) {
  const value = normalizeThemePreferences(input);
  storeThemeId(value.themeId);
  localStorage.setItem("theme", value.themeMode);
  localStorage.setItem("theme-animation-level", value.animLevel);
  if (value.accentHsl) localStorage.setItem("theme-accent", value.accentHsl);
  else localStorage.removeItem("theme-accent");
  localStorage.setItem("theme-density", value.density);
  localStorage.setItem("theme-radius", value.radius);
  applyVisualThemeColors(value.themeId, value.accentHsl);
  const root = document.documentElement;
  root.classList.toggle("dark", value.themeMode === "dark" || (value.themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  root.classList.remove("density-compact", "density-comfortable");
  if (value.density !== "default") root.classList.add(`density-${value.density}`);
  root.style.setProperty("--radius", { sharp: "0.125rem", default: "0.5rem", soft: "1rem" }[value.radius]);
  window.dispatchEvent(new CustomEvent("visual-theme-change", { detail: value.themeId }));
  window.dispatchEvent(new CustomEvent("visual-animation-change", { detail: value.animLevel }));
  window.dispatchEvent(new CustomEvent(THEME_MODE_EVENT, { detail: value.themeMode }));
  window.dispatchEvent(new Event(THEME_PREFERENCES_EVENT));
}

export function applySharedTheme(value: ThemePreferences) {
  // Snapshot BEFORE the first shared application. Realtime events and repeated
  // hook mounts must never replace the personal choice with an effective theme.
  if (localStorage.getItem(ORG_THEME_ENFORCE_KEY) !== "1") {
    localStorage.setItem(PERSONAL_SNAPSHOT_KEY, JSON.stringify(readDeviceThemePreferences()));
  }
  localStorage.setItem(ORG_THEME_ENFORCE_KEY, "1");
  applyThemePreferences(value);
}
export function restorePersonalTheme() {
  if (localStorage.getItem(ORG_THEME_ENFORCE_KEY) !== "1") return;
  let value = DEFAULT_THEME_PREFERENCES;
  try { value = normalizeThemePreferences(JSON.parse(localStorage.getItem(PERSONAL_SNAPSHOT_KEY) || "{}")); } catch { /* old invalid storage */ }
  localStorage.removeItem(ORG_THEME_ENFORCE_KEY);
  applyThemePreferences(value);
}
