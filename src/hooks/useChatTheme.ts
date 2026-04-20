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

export function useChatTheme() {
  const [themeId, setThemeIdState] = useState<ChatThemeId>(() => {
    const v = (typeof window !== "undefined" && localStorage.getItem(THEME_KEY)) as ChatThemeId | null;
    return v && CHAT_THEMES.some((t) => t.id === v) ? v : "teal";
  });
  const [bgId, setBgIdState] = useState<ChatBgId>(() => {
    const v = (typeof window !== "undefined" && localStorage.getItem(BG_KEY)) as ChatBgId | null;
    return v && CHAT_BACKGROUNDS.some((b) => b.id === v) ? v : "stars";
  });

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
