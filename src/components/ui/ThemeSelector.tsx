import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_THEMES, getStoredThemeId, storeThemeId, type AdminTheme } from "@/constants/admin-themes";

interface ThemeSelectorProps {
  onThemeChange?: (theme: AdminTheme | null) => void;
}

export function ThemeSelector({ onThemeChange }: ThemeSelectorProps) {
  const [activeId, setActiveId] = useState<string | null>(() => getStoredThemeId());

  useEffect(() => {
    // Dispatch event so other components can react
    window.dispatchEvent(new CustomEvent("visual-theme-change", { detail: activeId }));
  }, [activeId]);

  const selectTheme = (theme: AdminTheme) => {
    const newId = activeId === theme.id ? null : theme.id;
    setActiveId(newId);
    storeThemeId(newId);
    const resolved = newId ? ADMIN_THEMES.find(t => t.id === newId) || null : null;
    onThemeChange?.(resolved);
    window.dispatchEvent(new CustomEvent("visual-theme-change", { detail: newId }));
  };

  const clearTheme = () => {
    setActiveId(null);
    storeThemeId(null);
    onThemeChange?.(null);
    window.dispatchEvent(new CustomEvent("visual-theme-change", { detail: null }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-medium text-sm">Визуальная тема</p>
          <p className="text-xs text-muted-foreground">Баннер, анимации и атмосферные эффекты</p>
        </div>
        {activeId && (
          <button
            onClick={clearTheme}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" />
            Сбросить
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ADMIN_THEMES.map((theme) => (
          <button
            key={theme.id}
            onClick={() => selectTheme(theme)}
            className={cn(
              "relative rounded-xl border-2 overflow-hidden transition-all duration-200 group",
              activeId === theme.id
                ? "border-accent ring-2 ring-accent/20 scale-[1.02]"
                : "border-border hover:border-muted-foreground/40 hover:scale-[1.01]"
            )}
          >
            <div className="h-20 relative overflow-hidden">
              <img
                src={theme.bannerUrl}
                alt={theme.label}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                style={{ objectPosition: theme.previewPosition || "center" }}
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
            <div className="p-2 flex items-center gap-2 bg-card">
              <span className="text-base">{theme.emoji}</span>
              <span className="text-xs font-medium truncate">{theme.label}</span>
              <div
                className="w-3 h-3 rounded-full ml-auto shrink-0 border border-white/30"
                style={{ backgroundColor: `hsl(${theme.accent})` }}
              />
            </div>
            {activeId === theme.id && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow-md">
                <Check className="w-3 h-3 text-accent-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
