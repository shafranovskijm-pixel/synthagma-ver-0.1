export interface AdminTheme {
  id: string;
  label: string;
  emoji: string;
  group: "nature" | "office" | "sunset" | "style" | "water";
  bannerUrl: string;
  bgClass: string;
  headerClass: string;
  cardClass: string;
  sidebarClass: string;
  accent: string;
  accentForeground: string;
  animation: "leaves" | "fade" | "lights" | "gradient" | "glow" | "particles" | "sand" | "none";
  forceLight?: boolean;
  bannerPosition?: string;
  previewPosition?: string;
  atmosphereBlur?: string;
  atmosphereOpacity?: number;
  atmosphereSharp?: boolean;
}

export const THEME_GROUPS = [
  { id: "nature" as const, label: "Природа", emoji: "🟢" },
  { id: "office" as const, label: "Офис", emoji: "⚪" },
  { id: "sunset" as const, label: "Закат", emoji: "🟠" },
  { id: "style" as const, label: "Стиль", emoji: "🟣" },
  { id: "water" as const, label: "Вода", emoji: "🔵" },
];

export const ADMIN_THEMES: AdminTheme[] = [
  {
    id: "freshness",
    label: "Свежесть",
    emoji: "🌿",
    group: "nature",
    bannerUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-green-50 via-emerald-50/60 to-white",
    headerClass: "bg-gradient-to-r from-green-100/80 to-emerald-50/60",
    cardClass: "border-green-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-green-50 to-emerald-50/80",
    accent: "152 60% 45%",
    accentForeground: "0 0% 100%",
    animation: "leaves",
    forceLight: true,
    bannerPosition: "center 40%",
    previewPosition: "center 40%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.35,
  },
  {
    id: "monstera",
    label: "Монстера",
    emoji: "🌴",
    group: "nature",
    bannerUrl: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-emerald-50/80 via-green-50/50 to-white",
    headerClass: "bg-gradient-to-r from-emerald-100/80 to-green-50/60",
    cardClass: "border-emerald-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-emerald-50 to-green-50/80",
    accent: "145 55% 42%",
    accentForeground: "0 0% 100%",
    animation: "leaves",
    forceLight: true,
    bannerPosition: "center 50%",
    previewPosition: "center 50%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.45,
  },
  {
    id: "office",
    label: "Офис",
    emoji: "🏢",
    group: "office",
    bannerUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-slate-100 via-gray-50 to-white",
    headerClass: "bg-gradient-to-r from-slate-200/80 to-gray-100/60",
    cardClass: "border-slate-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-slate-100 to-gray-50/80",
    accent: "215 16% 42%",
    accentForeground: "0 0% 100%",
    animation: "fade",
    forceLight: true,
    bannerPosition: "center 30%",
    previewPosition: "center 30%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.25,
  },
  {
    id: "office-green",
    label: "Офис с зеленью",
    emoji: "🌱",
    group: "office",
    bannerUrl: "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-emerald-50/80 via-green-50/40 to-white",
    headerClass: "bg-gradient-to-r from-emerald-100/80 to-green-50/60",
    cardClass: "border-emerald-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-emerald-50 to-green-50/80",
    accent: "160 50% 40%",
    accentForeground: "0 0% 100%",
    animation: "leaves",
    forceLight: true,
    bannerPosition: "center 40%",
    previewPosition: "center 40%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.35,
  },
  {
    id: "newyork",
    label: "Нью-Йорк",
    emoji: "🌃",
    group: "sunset",
    bannerUrl: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-amber-50/80 via-orange-50/40 to-white",
    headerClass: "bg-gradient-to-r from-amber-100/80 to-orange-50/60",
    cardClass: "border-amber-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-amber-50 to-orange-50/60",
    accent: "38 92% 50%",
    accentForeground: "0 0% 100%",
    animation: "lights",
    bannerPosition: "center 60%",
    previewPosition: "center 60%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.4,
  },
  {
    id: "sunset",
    label: "Закат",
    emoji: "🌅",
    group: "sunset",
    bannerUrl: "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-orange-50 via-rose-50/40 to-white",
    headerClass: "bg-gradient-to-r from-orange-100/80 to-rose-50/60",
    cardClass: "border-orange-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-orange-50 to-rose-50/60",
    accent: "25 95% 53%",
    accentForeground: "0 0% 100%",
    animation: "sand",
    bannerPosition: "center 50%",
    previewPosition: "center 50%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.35,
  },
  {
    id: "hawaii",
    label: "Гавайи",
    emoji: "🌺",
    group: "sunset",
    bannerUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-rose-50/80 via-orange-50/40 to-amber-50/30",
    headerClass: "bg-gradient-to-r from-rose-100/80 to-orange-50/60",
    cardClass: "border-rose-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-rose-50 to-orange-50/60",
    accent: "15 85% 55%",
    accentForeground: "0 0% 100%",
    animation: "sand",
    bannerPosition: "center 60%",
    previewPosition: "center 60%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.4,
  },
  {
    id: "beach-sunset",
    label: "Пляж",
    emoji: "🏖️",
    group: "sunset",
    bannerUrl: "https://images.unsplash.com/photo-1476673160081-cf065f7a4890?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-amber-50/80 via-orange-50/50 to-rose-50/30",
    headerClass: "bg-gradient-to-r from-amber-100/80 to-orange-50/60",
    cardClass: "border-amber-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-amber-50 to-orange-50/60",
    accent: "20 90% 50%",
    accentForeground: "0 0% 100%",
    animation: "sand",
    bannerPosition: "center 60%",
    previewPosition: "center 60%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.4,
  },
  {
    id: "minimalism",
    label: "Минимализм",
    emoji: "💎",
    group: "style",
    bannerUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-violet-50/80 via-purple-50/40 to-white",
    headerClass: "bg-gradient-to-r from-violet-100/80 to-purple-50/60",
    cardClass: "border-violet-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-violet-50 to-purple-50/60",
    accent: "265 55% 52%",
    accentForeground: "0 0% 100%",
    animation: "glow",
    bannerPosition: "center 60%",
    previewPosition: "center 60%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.35,
  },
  {
    id: "aurora",
    label: "Аврора",
    emoji: "🌌",
    group: "style",
    bannerUrl: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-indigo-50/80 via-violet-50/40 to-white",
    headerClass: "bg-gradient-to-r from-indigo-100/80 to-violet-50/60",
    cardClass: "border-indigo-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-indigo-50 to-violet-50/60",
    accent: "245 58% 50%",
    accentForeground: "0 0% 100%",
    animation: "glow",
    bannerPosition: "center 50%",
    previewPosition: "center 50%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.4,
  },
  {
    id: "lavender",
    label: "Лаванда",
    emoji: "💜",
    group: "style",
    bannerUrl: "https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-purple-50/80 via-fuchsia-50/30 to-white",
    headerClass: "bg-gradient-to-r from-purple-100/80 to-fuchsia-50/60",
    cardClass: "border-purple-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-purple-50 to-fuchsia-50/60",
    accent: "280 50% 55%",
    accentForeground: "0 0% 100%",
    animation: "glow",
    bannerPosition: "center 40%",
    previewPosition: "center 40%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.35,
  },
  {
    id: "twilight",
    label: "Сумерки",
    emoji: "🌙",
    group: "style",
    bannerUrl: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-slate-100/80 via-violet-50/30 to-white",
    headerClass: "bg-gradient-to-r from-slate-200/60 to-violet-100/50",
    cardClass: "border-slate-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-slate-100 to-violet-50/60",
    accent: "250 45% 48%",
    accentForeground: "0 0% 100%",
    animation: "glow",
    bannerPosition: "center 60%",
    previewPosition: "center 60%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.35,
  },
  {
    id: "turquoise",
    label: "Бирюза",
    emoji: "🌊",
    group: "water",
    bannerUrl: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=85",
    bgClass: "",
    headerClass: "bg-gradient-to-r from-teal-100/80 to-cyan-50/60",
    cardClass: "border-teal-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-teal-50 to-cyan-50/80",
    accent: "170 80% 50%",
    accentForeground: "0 0% 100%",
    animation: "particles",
    bannerPosition: "center 40%",
    previewPosition: "center 40%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.4,
  },
  {
    id: "ocean",
    label: "Океан",
    emoji: "🐋",
    group: "water",
    bannerUrl: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&q=85",
    bgClass: "bg-gradient-to-b from-blue-50/80 via-cyan-50/40 to-white",
    headerClass: "bg-gradient-to-r from-blue-100/80 to-cyan-50/60",
    cardClass: "border-blue-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-blue-50 to-cyan-50/80",
    accent: "210 80% 55%",
    accentForeground: "0 0% 100%",
    animation: "particles",
    bannerPosition: "center 40%",
    previewPosition: "center 40%",
    atmosphereSharp: true,
    atmosphereOpacity: 0.4,
  },
];

export function getThemeById(id: string): AdminTheme | undefined {
  return ADMIN_THEMES.find(t => t.id === id);
}

export function getStoredThemeId(): string | null {
  return localStorage.getItem("visual-theme");
}

export function storeThemeId(id: string | null) {
  if (id) localStorage.setItem("visual-theme", id);
  else localStorage.removeItem("visual-theme");
}

export function getStoredBannerFit(): string {
  return localStorage.getItem("admin-banner-fit") || "cover";
}

export function storeBannerFit(fit: string) {
  localStorage.setItem("admin-banner-fit", fit);
}
