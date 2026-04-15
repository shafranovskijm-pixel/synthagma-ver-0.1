import { useState, useEffect, useCallback } from "react";
import { Check, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSelector } from "@/components/ui/ThemeSelector";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";
import { getStoredAnimationLevel, storeAnimationLevel, type AnimationLevel } from "@/components/ui/ThemeAnimations";

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

function AnimationLevelSelector() {
  const [level, setLevel] = useState<AnimationLevel>(getStoredAnimationLevel);
  const select = useCallback((v: AnimationLevel) => {
    setLevel(v);
    storeAnimationLevel(v);
  }, []);
  return (
    <div>
      <p className="font-medium text-sm mb-1">Анимация</p>
      <p className="text-xs text-muted-foreground mb-3">Управление анимационными эффектами темы</p>
      <div className="grid grid-cols-3 gap-2">
        {ANIMATION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => select(opt.value)}
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

function applyAccent(hsl: string) {
  document.documentElement.style.setProperty('--accent', hsl);
  document.documentElement.style.setProperty('--ring', hsl);
  localStorage.setItem('theme-accent', hsl);
}

function applyDensity(value: string) {
  document.documentElement.classList.remove('density-compact', 'density-comfortable');
  if (value !== 'default') document.documentElement.classList.add(`density-${value}`);
  localStorage.setItem('theme-density', value);
}

function applyRadius(value: string) {
  const map: Record<string, string> = { sharp: '0.125rem', default: '0.5rem', soft: '1rem' };
  document.documentElement.style.setProperty('--radius', map[value] || '0.5rem');
  localStorage.setItem('theme-radius', value);
}

function applyVisualTheme(themeId: string | null) {
  if (!themeId) {
    document.documentElement.style.removeProperty('--primary');
    document.documentElement.style.removeProperty('--primary-foreground');
    return;
  }
  const theme = getThemeById(themeId);
  if (theme) {
    document.documentElement.style.setProperty('--primary', theme.accent);
    document.documentElement.style.setProperty('--primary-foreground', theme.accentForeground);
  }
}

export function useThemePersonalization() {
  useEffect(() => {
    const accent = localStorage.getItem('theme-accent');
    if (accent) applyAccent(accent);
    const density = localStorage.getItem('theme-density');
    if (density) applyDensity(density);
    const radius = localStorage.getItem('theme-radius');
    if (radius) applyRadius(radius);
    // Restore visual theme
    const vt = getStoredThemeId();
    if (vt) applyVisualTheme(vt);

    // Listen for theme changes from ThemeSelector
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      applyVisualTheme(id);
    };
    window.addEventListener("visual-theme-change", handler);
    return () => window.removeEventListener("visual-theme-change", handler);
  }, []);
}

interface ThemePersonalizationProps {
  isDarkMode: boolean;
  onToggleDark: (dark: boolean) => void;
}

export function ThemePersonalization({ isDarkMode, onToggleDark }: ThemePersonalizationProps) {
  const [accentHsl, setAccentHsl] = useState(() => localStorage.getItem('theme-accent') || '174 72% 46%');
  const [density, setDensity] = useState(() => localStorage.getItem('theme-density') || 'default');
  const [radius, setRadius] = useState(() => localStorage.getItem('theme-radius') || 'default');
  const [customColor, setCustomColor] = useState('#C8943E');

  const selectAccent = useCallback((hsl: string) => {
    setAccentHsl(hsl);
    applyAccent(hsl);
  }, []);

  const handleCustomColor = useCallback((hex: string) => {
    setCustomColor(hex);
    const hsl = hexToHsl(hex);
    if (hsl) selectAccent(hsl);
  }, [selectAccent]);

  const selectDensity = useCallback((v: string) => {
    setDensity(v);
    applyDensity(v);
  }, []);

  const selectRadius = useCallback((v: string) => {
    setRadius(v);
    applyRadius(v);
  }, []);

  return (
    <div className="space-y-6">
      {/* Theme mode cards — FIRST */}
      <div>
        <p className="font-medium text-sm mb-1">Режим оформления</p>
        <p className="text-xs text-muted-foreground mb-3">Выберите светлую или тёмную тему</p>
        <div className="grid grid-cols-2 gap-3">
          {/* Light preview card */}
          <button
            onClick={() => onToggleDark(false)}
            className={cn(
              "relative rounded-xl border-2 p-1 transition-all duration-200 overflow-hidden",
              !isDarkMode ? "border-accent ring-2 ring-accent/20" : "border-border hover:border-muted-foreground/30"
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
            {!isDarkMode && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                <Check className="w-3 h-3 text-accent-foreground" />
              </div>
            )}
          </button>

          {/* Dark preview card */}
          <button
            onClick={() => onToggleDark(true)}
            className={cn(
              "relative rounded-xl border-2 p-1 transition-all duration-200 overflow-hidden",
              isDarkMode ? "border-accent ring-2 ring-accent/20" : "border-border hover:border-muted-foreground/30"
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
            {isDarkMode && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                <Check className="w-3 h-3 text-accent-foreground" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Visual theme selector — AFTER mode toggle */}
      <ThemeSelector onThemeChange={() => {}} />

      {/* Animation level */}
      <AnimationLevelSelector />

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
    </div>
  );
}
