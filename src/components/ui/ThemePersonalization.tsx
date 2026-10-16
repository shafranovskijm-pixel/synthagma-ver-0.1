import { useState, useEffect, useCallback } from "react";
import { Check, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSelector } from "@/components/ui/ThemeSelector";
import { useTheme } from "next-themes";
import { applyThemePreferences, applyVisualThemeColors, readDeviceThemePreferences, initializeThemeSession, ORG_THEME_ENFORCE_KEY, THEME_MODE_EVENT, THEME_PREFERENCES_EVENT, type ThemePreferences } from "@/lib/themePreferences";
import { type AnimationLevel } from "@/components/ui/ThemeAnimations";

const ACCENT_COLORS = [
  { name: "Золотой", hsl: "38 75% 55%" },
  { name: "Синий", hsl: "217 91% 60%" },
  { name: "Зелёный", hsl: "160 84% 39%" },
  { name: "Фиолетовый", hsl: "258 90% 66%" },
  { name: "Розовый", hsl: "330 81% 60%" },
  { name: "Оранжевый", hsl: "38 92% 50%" },
  { name: "Красный", hsl: "0 84% 60%" },
  { name: "Бирюзовый", hsl: "174 72% 46%" },
];

const DENSITY_OPTIONS = [
  { value: "compact", label: "Компактный" },
  { value: "default", label: "Стандартный" },
  { value: "comfortable", label: "Просторный" },
];

const RADIUS_OPTIONS = [
  { value: "sharp", label: "Острые", radius: "2px", preview: "rounded-sm" },
  { value: "default", label: "Скруглённые", radius: "8px", preview: "rounded-lg" },
  { value: "soft", label: "Мягкие", radius: "16px", preview: "rounded-2xl" },
];

const ANIMATION_OPTIONS: { value: AnimationLevel; label: string }[] = [
  { value: "full", label: "Включена" },
  { value: "reduced", label: "Уменьшена" },
  { value: "none", label: "Выключена" },
];

function AnimationLevelSelector({ level, onChange }: { level: AnimationLevel; onChange: (value: AnimationLevel) => void }) {
  return (
    <div>
      <p className="font-medium text-sm mb-1">Анимация</p>
      <p className="text-xs text-muted-foreground mb-3">Управление анимационными эффектами темы</p>
      <div className="grid grid-cols-3 gap-2">
        {ANIMATION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition-all duration-200",
              level === opt.value
                ? "border-accent bg-accent/10 text-accent-foreground"
                : "border-border hover:border-muted-foreground/30 text-muted-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function useThemePersonalization() {
  const { setTheme } = useTheme();
  useEffect(() => {
    const handler = (e: Event) => {
      applyVisualThemeColors((e as CustomEvent).detail, readDeviceThemePreferences().accentHsl);
    };
    // Keep next-themes and its header/sidebar controls in sync with shared mode.
    const modeHandler = (e: Event) => setTheme((e as CustomEvent).detail);
    window.addEventListener("visual-theme-change", handler);
    window.addEventListener(THEME_MODE_EVENT, modeHandler);
    initializeThemeSession();
    if (localStorage.getItem(ORG_THEME_ENFORCE_KEY) !== "1") applyThemePreferences(readDeviceThemePreferences());
    return () => {
      window.removeEventListener("visual-theme-change", handler);
      window.removeEventListener(THEME_MODE_EVENT, modeHandler);
    };
  }, [setTheme]);
}

interface ThemePersonalizationProps {
  isDarkMode: boolean;
  onToggleDark: (dark: boolean) => void;
  showAdminSidebar?: boolean;
  value?: ThemePreferences;
  onChange?: (patch: Partial<ThemePreferences>) => void;
  disabled?: boolean;
}

const ADMIN_SIDEBAR_ITEMS: { id: string; label: string }[] = [
  { id: "analytics", label: "Статистика" },
  { id: "organizations", label: "Организации" },
  { id: "users", label: "Пользователи" },
  { id: "marketplace", label: "Маркетплейс" },
  { id: "sales", label: "Продажи" },
  { id: "webinars-admin", label: "Вебинары" },
  { id: "companies", label: "База компаний" },
  { id: "documents", label: "Документы" },
  { id: "chats", label: "Чаты" },
];

function AdminSidebarVisibility() {
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("admin-sidebar-hidden");
      if (raw) return JSON.parse(raw);
    } catch {}
    return ["webinars-admin", "companies", "documents"];
  });
  const toggle = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id];
    setHidden(next);
    try { localStorage.setItem("admin-sidebar-hidden", JSON.stringify(next)); } catch {}
    window.dispatchEvent(new CustomEvent("admin-sidebar-visibility-change"));
  };
  return (
    <div>
      <p className="font-medium text-sm mb-1">Иконки боковой панели</p>
      <p className="text-xs text-muted-foreground mb-3">Отметьте, какие иконки показывать в боковой панели админки</p>
      <div className="grid grid-cols-2 gap-2">
        {ADMIN_SIDEBAR_ITEMS.map(item => {
          const visible = !hidden.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={cn(
                "flex items-center justify-between rounded-xl border-2 px-3 py-2 text-xs font-medium transition-all",
                visible
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground/30"
              )}
            >
              <span>{item.label}</span>
              {visible && <Check className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ThemePersonalization({ isDarkMode, onToggleDark, showAdminSidebar, value, onChange, disabled = false }: ThemePersonalizationProps) {
  const [personal, setPersonal] = useState(readDeviceThemePreferences);
  const preferences = value ?? personal;
  const { accentHsl, density, radius } = preferences;
  const dark = value ? value.themeMode === 'dark' || (value.themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) : isDarkMode;
  const [customColor, setCustomColor] = useState('#C8943E');
  useEffect(() => {
    const sync = () => setPersonal(readDeviceThemePreferences());
    window.addEventListener(THEME_PREFERENCES_EVENT, sync);
    window.addEventListener('visual-theme-change', sync);
    return () => { window.removeEventListener(THEME_PREFERENCES_EVENT, sync); window.removeEventListener('visual-theme-change', sync); };
  }, []);
  const change = useCallback((patch: Partial<ThemePreferences>) => {
    if (disabled) return;
    if (value) { onChange?.(patch); return; }
    const next = { ...readDeviceThemePreferences(), ...patch };
    applyThemePreferences(next);
    setPersonal(next);
  }, [disabled, value, onChange]);
  const selectAccent = (accentHsl: string) => change({ accentHsl });

  const handleCustomColor = (hex: string) => {
    setCustomColor(hex);
    const hsl = hexToHsl(hex);
    if (hsl) selectAccent(hsl);
  };
  const selectDensity = (density: string) => change({ density: density as ThemePreferences['density'] });
  const selectRadius = (radius: string) => change({ radius: radius as ThemePreferences['radius'] });
  const toggleDark = (dark: boolean) => {
    change({ themeMode: dark ? 'dark' : 'light' });
    if (!value && !disabled) onToggleDark(dark);
  };

  return (
    <fieldset disabled={disabled} className="space-y-6 min-w-0 disabled:opacity-60">
      {/* Theme mode cards — FIRST */}
      <div>
        <p className="font-medium text-sm mb-1">Режим оформления</p>
        <p className="text-xs text-muted-foreground mb-3">Выберите светлую или тёмную тему</p>
        <div className="grid grid-cols-2 gap-3">
          {/* Light preview card */}
          <button
            onClick={() => toggleDark(false)}
            className={cn(
              "relative rounded-xl border-2 p-1 transition-all duration-200 overflow-hidden",
              !dark ? "border-accent ring-2 ring-accent/20" : "border-border hover:border-muted-foreground/30"
            )}
          >
            <div className="rounded-lg overflow-hidden bg-[#F9F8F5]">
              <div className="flex h-20">
                <div className="w-1/4 bg-[#F0EEE9] p-1.5 flex flex-col gap-1">
                  <div className="h-1.5 w-full rounded-full bg-[#D4D0C8]" />
                  <div className="h-1.5 w-3/4 rounded-full bg-[#D4D0C8]" />
                  <div className="h-1.5 w-full rounded-full bg-[#D4D0C8]" />
                </div>
                <div className="flex-1 p-2 flex flex-col gap-1.5">
                  <div className="h-2 w-2/3 rounded-full bg-[#1F1F1F]" />
                  <div className="h-1.5 w-full rounded-full bg-[#E5E2DC]" />
                  <div className="h-1.5 w-5/6 rounded-full bg-[#E5E2DC]" />
                  <div className="flex gap-1 mt-auto">
                    <div className="h-3 w-8 rounded bg-[#1F1F1F]" />
                    <div className="h-3 w-8 rounded bg-[#E5E2DC]" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1.5">
              <Sun className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Светлая</span>
            </div>
            {!dark && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                <Check className="w-3 h-3 text-accent-foreground" />
              </div>
            )}
          </button>

          {/* Dark preview card */}
          <button
            onClick={() => toggleDark(true)}
            className={cn(
              "relative rounded-xl border-2 p-1 transition-all duration-200 overflow-hidden",
              dark ? "border-accent ring-2 ring-accent/20" : "border-border hover:border-muted-foreground/30"
            )}
          >
            <div className="rounded-lg overflow-hidden bg-[#0D0D0D]">
              <div className="flex h-20">
                <div className="w-1/4 bg-[#141414] p-1.5 flex flex-col gap-1">
                  <div className="h-1.5 w-full rounded-full bg-[#2A2A2A]" />
                  <div className="h-1.5 w-3/4 rounded-full bg-[#2A2A2A]" />
                  <div className="h-1.5 w-full rounded-full bg-[#2A2A2A]" />
                </div>
                <div className="flex-1 p-2 flex flex-col gap-1.5">
                  <div className="h-2 w-2/3 rounded-full bg-[#E8E4DC]" />
                  <div className="h-1.5 w-full rounded-full bg-[#1E1E1E]" />
                  <div className="h-1.5 w-5/6 rounded-full bg-[#1E1E1E]" />
                  <div className="flex gap-1 mt-auto">
                    <div className="h-3 w-8 rounded bg-[#E8E4DC]" />
                    <div className="h-3 w-8 rounded bg-[#1E1E1E]" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1.5">
              <Moon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Тёмная</span>
            </div>
            {dark && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                <Check className="w-3 h-3 text-accent-foreground" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Visual theme selector — AFTER mode toggle */}
      <ThemeSelector value={preferences.themeId} onChange={(themeId) => change({ themeId, accentHsl: null })} />

      {/* Animation level */}
      <AnimationLevelSelector level={preferences.animLevel} onChange={(animLevel) => change({ animLevel })} />

      {/* Accent Color */}
      <div>
        <p className="font-medium text-sm mb-1">Акцентный цвет</p>
        <p className="text-xs text-muted-foreground mb-3">Цвет кнопок, ссылок и активных элементов</p>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.hsl}
              title={c.name}
              onClick={() => selectAccent(c.hsl)}
              className={cn(
                "w-8 h-8 rounded-full border-2 transition-all duration-200 flex items-center justify-center shrink-0",
                accentHsl === c.hsl
                  ? "border-foreground scale-110 shadow-md"
                  : "border-transparent hover:scale-105"
              )}
              style={{ backgroundColor: `hsl(${c.hsl})` }}
            >
              {accentHsl === c.hsl && <Check className="w-3.5 h-3.5 text-white drop-shadow-sm" />}
            </button>
          ))}
          {/* Custom color */}
          <label
            className={cn(
              "w-8 h-8 rounded-full border-2 border-dashed cursor-pointer transition-all duration-200 flex items-center justify-center shrink-0 overflow-hidden",
              !ACCENT_COLORS.some(c => c.hsl === accentHsl)
                ? "border-foreground scale-110"
                : "border-muted-foreground/40 hover:border-muted-foreground"
            )}
            title="Свой цвет"
          >
            <input
              type="color"
              value={customColor}
              onChange={(e) => handleCustomColor(e.target.value)}
              className="absolute w-0 h-0 opacity-0"
            />
            <span className="text-[10px] font-bold text-muted-foreground">+</span>
          </label>
        </div>
      </div>

      {/* Density */}
      <div>
        <p className="font-medium text-sm mb-1">Размер интерфейса</p>
        <p className="text-xs text-muted-foreground mb-3">Отступы и размеры элементов</p>
        <div className="grid grid-cols-3 gap-2">
          {DENSITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectDensity(opt.value)}
              className={cn(
                "rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition-all duration-200",
                density === opt.value
                  ? "border-accent bg-accent/10 text-accent-foreground"
                  : "border-border hover:border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Border Radius */}
      <div>
        <p className="font-medium text-sm mb-1">Скругление углов</p>
        <p className="text-xs text-muted-foreground mb-3">Форма кнопок и карточек</p>
        <div className="grid grid-cols-3 gap-2">
          {RADIUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectRadius(opt.value)}
              className={cn(
                "border-2 px-3 py-3 text-xs font-medium transition-all duration-200 flex flex-col items-center gap-2",
                opt.preview,
                radius === opt.value
                  ? "border-accent bg-accent/10 text-accent-foreground"
                  : "border-border hover:border-muted-foreground/30 text-muted-foreground"
              )}
            >
              <div
                className="w-6 h-6 border-2 border-current"
                style={{ borderRadius: opt.radius }}
              />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {showAdminSidebar && <AdminSidebarVisibility />}
    </fieldset>
  );
}
