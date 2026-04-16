import { useState, useEffect } from "react";
import { BookOpen, Library, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";
import { useTheme } from "next-themes";

export type StudentTab = "catalog" | "library" | "chat" | "profile";

interface StudentSidebarProps {
  activeTab: StudentTab;
  setActiveTab: (tab: StudentTab) => void;
  branding: { logoUrl: string; showOrgName: boolean; primaryColor?: string } | null;
  orgName: string | null;
  showAiChat: boolean;
  isPreviewMode?: boolean;
  isAdminView?: boolean;
}

const navItems: { id: StudentTab; icon: typeof BookOpen; label: string }[] = [
  { id: "catalog", icon: BookOpen, label: "Каталог" },
  { id: "chat", icon: MessageCircle, label: "Чат" },
];

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function normalizeBrandColor(color?: string): string {
  if (!color) return "174 72% 46%";

  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    return hexToHsl(trimmed) ?? "174 72% 46%";
  }

  if (trimmed.startsWith("hsl(")) {
    return trimmed.replace(/^hsl\((.*)\)$/i, "$1");
  }

  return trimmed;
}

export function StudentSidebar({
  activeTab, setActiveTab, branding, orgName, showAiChat,
  isPreviewMode, isAdminView,
}: StudentSidebarProps) {
  const { theme: currentTheme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(currentTheme === "dark" ? "light" : "dark");

  // Theme-aware accent
  const [themeAccent, setThemeAccent] = useState<string | null>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id)?.accent || null : null;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      setThemeAccent(id ? getThemeById(id)?.accent || null : null);
    };
    window.addEventListener("visual-theme-change", handler);
    return () => window.removeEventListener("visual-theme-change", handler);
  }, []);

  const brandHsl = themeAccent || normalizeBrandColor(branding?.primaryColor);

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen w-[88px] shrink-0 shadow-[2px_0_8px_rgba(0,0,0,0.06)]",
        (isPreviewMode || isAdminView) && "top-10 h-[calc(100vh-40px)]"
      )}
      style={{ backgroundColor: `hsl(${brandHsl} / 0.07)` }}
    >
      <div className="flex h-full flex-col items-center px-2 py-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (!branding?.logoUrl) toggleTheme();
              }}
              className={cn(
                "mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-card/80 shadow-sm transition-all",
                !branding?.logoUrl && "hover:ring-2 hover:ring-primary/40 cursor-pointer"
              )}
            >
              {branding?.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={orgName ? `Логотип ${orgName}` : "Логотип"}
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <SigmaLogo size="sm" />
              )}
            </button>
          </TooltipTrigger>
          {!branding?.logoUrl && <TooltipContent side="right">Сменить тему</TooltipContent>}
        </Tooltip>

        <div className="flex flex-1 items-center justify-center w-full">
          <div
            className="rounded-[28px] p-2 shadow-md"
            style={{ backgroundColor: `hsl(${brandHsl} / 0.14)` }}
          >
            <nav className="flex flex-col items-center gap-2">
              {navItems.map((item) => {
                if (item.id === "chat" && !showAiChat) return null;
                const isActive = activeTab === item.id;

                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                          "flex min-h-[64px] w-[64px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 transition-all duration-200",
                          isActive
                            ? "text-primary-foreground shadow-md"
                            : "text-foreground/80 hover:text-foreground"
                        )}
                        style={{
                          backgroundColor: isActive
                            ? `hsl(${brandHsl})`
                            : `hsl(${brandHsl} / 0.18)`,
                        }}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span
                          className={cn(
                            "text-[10px] font-medium leading-tight text-center",
                            isActive ? "text-primary-foreground" : "text-foreground/80"
                          )}
                        >
                          {item.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </aside>
  );
}
