export interface AdminTheme {
  id: string;
  label: string;
  emoji: string;
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

export const ADMIN_THEMES: AdminTheme[] = [
  {
    id: "freshness",
    label: "Свежесть",
    emoji: "🌿",
    bannerUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80",
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
    atmosphereOpacity: 0.25,
  },
  {
    id: "office",
    label: "Офис",
    emoji: "🏢",
    bannerUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
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
    atmosphereOpacity: 0.15,
  },
  {
    id: "office-green",
    label: "Офис с зеленью",
    emoji: "🌱",
    bannerUrl: "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200&q=80",
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
    atmosphereOpacity: 0.2,
  },
  {
    id: "newyork",
    label: "Нью-Йорк",
    emoji: "🌃",
    bannerUrl: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1200&q=80",
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
    atmosphereOpacity: 0.3,
  },
  {
    id: "sunset",
    label: "Закат",
    emoji: "🌅",
    bannerUrl: "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1200&q=80",
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
    atmosphereOpacity: 0.25,
  },
  {
    id: "hawaii",
    label: "Гавайи",
    emoji: "🌺",
    bannerUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80",
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
    atmosphereOpacity: 0.3,
  },
  {
    id: "minimalism",
    label: "Минимализм",
    emoji: "💎",
    bannerUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80",
    bgClass: "bg-gradient-to-b from-violet-50/80 via-purple-50/40 to-white",
    headerClass: "bg-gradient-to-r from-violet-100/80 to-purple-50/60",
    cardClass: "border-violet-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-violet-50 to-purple-50/60",
    accent: "270 60% 60%",
    accentForeground: "0 0% 100%",
    animation: "glow",
    bannerPosition: "center",
    previewPosition: "center",
    atmosphereSharp: true,
    atmosphereOpacity: 0.2,
  },
  {
    id: "turquoise",
    label: "Бирюза",
    emoji: "🌊",
    bannerUrl: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1200&q=80",
    bgClass: "",
    headerClass: "bg-gradient-to-r from-teal-100/80 to-cyan-50/60",
    cardClass: "border-teal-200/60 bg-white/90",
    sidebarClass: "bg-gradient-to-b from-teal-50 to-cyan-50/80",
    accent: "170 80% 50%",
    accentForeground: "0 0% 100%",
    animation: "particles",
    bannerPosition: "center 40%",
    previewPosition: "center 40%",
    atmosphereOpacity: 0.3,
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
