import { useEffect, useState, useCallback } from "react";

export type ChatThemeId = "teal" | "purple" | "sunset" | "ocean" | "crimson";
export type ChatBgId = "stars" | "aurora" | "waves" | "none";

export interface ChatTheme {
  id: ChatThemeId;
  name: string;
  /** main accent in HSL components (e.g. "174 72% 46%") */
  accent: string;
  /** darker shade for gradient end */
  accentDark: string;
}

export const CHAT_THEMES: ChatTheme[] = [
  { id: "teal",    name: "Бирюза",    accent: "174 72% 46%", accentDark: "174 72% 28%" },
  { id: "purple",  name: "Пурпур",    accent: "270 60% 55%", accentDark: "270 60% 35%" },
  { id: "sunset",  name: "Закат",     accent: "24 90% 55%",  accentDark: "16 80% 38%"  },
  { id: "ocean",   name: "Океан",     accent: "210 80% 50%", accentDark: "215 80% 30%" },
  { id: "crimson", name: "Кармин",    accent: "350 75% 52%", accentDark: "345 70% 32%" },
];

export const CHAT_BACKGROUNDS: { id: ChatBgId; name: string }[] = [
  { id: "stars",  name: "Звёзды" },
  { id: "aurora", name: "Аврора" },
  { id: "waves",  name: "Волны" },
  { id: "none",   name: "Без анимации" },
];

const THEME_KEY = "sintagma_chat_theme";
const BG_KEY = "sintagma_chat_bg";
// Bump this when we want to force-reset everyone's chat appearance to the new defaults
// (e.g. to align the chat header with the landing footer's starfield look).
const DEFAULTS_VERSION_KEY = "sintagma_chat_defaults_v";
const CURRENT_DEFAULTS_VERSION = "2";
const DEFAULT_THEME: ChatThemeId = "teal";
const DEFAULT_BG: ChatBgId = "stars";

function readInitialPrefs(): { theme: ChatThemeId; bg: ChatBgId } {
  if (typeof window === "undefined") return { theme: DEFAULT_THEME, bg: DEFAULT_BG };
  try {
    const storedVersion = localStorage.getItem(DEFAULTS_VERSION_KEY);
    if (storedVersion !== CURRENT_DEFAULTS_VERSION) {
      // One-time reset so existing users get the new default look (matches landing footer).
      localStorage.setItem(THEME_KEY, DEFAULT_THEME);
      localStorage.setItem(BG_KEY, DEFAULT_BG);
      localStorage.setItem(DEFAULTS_VERSION_KEY, CURRENT_DEFAULTS_VERSION);
      return { theme: DEFAULT_THEME, bg: DEFAULT_BG };
    }
  } catch {}
  const t = (typeof window !== "undefined" && localStorage.getItem(THEME_KEY)) as ChatThemeId | null;
  const b = (typeof window !== "undefined" && localStorage.getItem(BG_KEY)) as ChatBgId | null;
  return {
    theme: t && CHAT_THEMES.some((x) => x.id === t) ? t : DEFAULT_THEME,
    bg: b && CHAT_BACKGROUNDS.some((x) => x.id === b) ? b : DEFAULT_BG,
  };
}

export function useChatTheme() {
  const [themeId, setThemeIdState] = useState<ChatThemeId>(() => readInitialPrefs().theme);
  const [bgId, setBgIdState] = useState<ChatBgId>(() => readInitialPrefs().bg);

  const setThemeId = useCallback((id: ChatThemeId) => {
    setThemeIdState(id);
    try { localStorage.setItem(THEME_KEY, id); } catch {}
  }, []);

  const setBgId = useCallback((id: ChatBgId) => {
    setBgIdState(id);
    try { localStorage.setItem(BG_KEY, id); } catch {}
  }, []);

  const theme = CHAT_THEMES.find((t) => t.id === themeId) ?? CHAT_THEMES[0];

  useEffect(() => {
    // sync across tabs / multiple widgets
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && e.newValue) setThemeIdState(e.newValue as ChatThemeId);
      if (e.key === BG_KEY && e.newValue) setBgIdState(e.newValue as ChatBgId);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { theme, themeId, setThemeId, bgId, setBgId };
}
