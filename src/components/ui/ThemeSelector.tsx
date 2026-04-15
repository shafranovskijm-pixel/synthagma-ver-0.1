import { useState, useEffect } from "react";
import { Check, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_THEMES, THEME_GROUPS, getStoredThemeId, storeThemeId, type AdminTheme } from "@/constants/admin-themes";

interface ThemeSelectorProps {
  onThemeChange?: (theme: AdminTheme | null) => void;
}

export function ThemeSelector({ onThemeChange }: ThemeSelectorProps) {
  const [activeId, setActiveId] = useState<string | null>(() => getStoredThemeId());
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    const stored = getStoredThemeId();
    if (!stored) return null;
    const theme = ADMIN_THEMES.find(t => t.id === stored);
    return theme?.group || null;
  });

  useEffect(() => {
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

  const toggleGroup = (groupId: string) => {
    const themesInGroup = ADMIN_THEMES.filter(t => t.group === groupId);
    // If only 1 theme in group — select/deselect it directly
    if (themesInGroup.length === 1) {
      selectTheme(themesInGroup[0]);
      return;
    }
    setOpenGroup(prev => prev === groupId ? null : groupId);
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

      <div className="space-y-1.5">
        {/* Default theme option */}
        <button
          onClick={clearTheme}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
            !activeId
              ? "bg-accent/15 text-accent-foreground ring-1 ring-accent/30"
              : "hover:bg-muted/60 text-foreground/80"
          )}
        >
          <span className="text-base">⚙️</span>
          <span className="flex-1 text-left">По умолчанию</span>
          {!activeId && (
            <Check className="w-3.5 h-3.5 text-accent-foreground" />
          )}
        </button>

        {THEME_GROUPS.map((group) => {
          const themesInGroup = ADMIN_THEMES.filter(t => t.group === group.id);
          if (themesInGroup.length === 0) return null;

          const isOpen = openGroup === group.id;
          const hasActive = themesInGroup.some(t => t.id === activeId);
          const isSingle = themesInGroup.length === 1;

          return (
            <div key={group.id}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                  hasActive
                    ? "bg-accent/15 text-accent-foreground"
                    : "hover:bg-muted/60 text-foreground/80"
                )}
              >
                <span className="text-base">{group.emoji}</span>
                <span className="flex-1 text-left">{group.label}</span>
                {hasActive && (
                  <span className="text-[10px] text-muted-foreground bg-accent/20 px-1.5 py-0.5 rounded-full">
                    {ADMIN_THEMES.find(t => t.id === activeId)?.label}
                  </span>
                )}
                {!isSingle && (
                  <ChevronDown className={cn(
                    "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180"
                  )} />
                )}
              </button>

              {/* Expanded themes */}
              {isOpen && !isSingle && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5 pl-2">
                  {themesInGroup.map((theme) => (
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
                      <div className="h-16 relative overflow-hidden">
                        <img
                          src={theme.bannerUrl}
                          alt={theme.label}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          style={{ objectPosition: theme.previewPosition || "center" }}
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      </div>
                      <div className="p-1.5 flex items-center gap-1.5 bg-card">
                        <span className="text-sm">{theme.emoji}</span>
                        <span className="text-[11px] font-medium truncate">{theme.label}</span>
                        <div
                          className="w-2.5 h-2.5 rounded-full ml-auto shrink-0 border border-white/30"
                          style={{ backgroundColor: `hsl(${theme.accent})` }}
                        />
                      </div>
                      {activeId === theme.id && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent flex items-center justify-center shadow-md">
                          <Check className="w-2.5 h-2.5 text-accent-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
