import { useCallback } from "react";

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

/**
 * Виджет поддержки имеет фиксированный фирменный вид и НЕ зависит от:
 *  - текущей темы организации (admin/org theme),
 *  - light/dark mode,
 *  - пользовательских настроек.
 *
 * Используется бирюза (teal) + звёздное поле — как в подвале главной страницы.
 */
const FIXED_THEME = CHAT_THEMES[0]; // teal
const FIXED_BG: ChatBgId = "stars";

export function useChatTheme() {
  const noop = useCallback((_id: ChatThemeId | ChatBgId) => {}, []);
  return {
    theme: FIXED_THEME,
    themeId: FIXED_THEME.id,
    setThemeId: noop as (id: ChatThemeId) => void,
    bgId: FIXED_BG,
    setBgId: noop as (id: ChatBgId) => void,
  };
}
