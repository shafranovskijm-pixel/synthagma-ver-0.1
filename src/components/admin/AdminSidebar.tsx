import { useState, useEffect } from "react";
import { 
  Building2, Users, LogOut, Store, Briefcase, MessageSquare, CreditCard, HardDrive
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminUnreadChats } from "@/hooks/useAdminUnreadChats";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";

export type AdminTabType = 
  | "analytics" 
  | "organizations" 
  | "users"
  | "content"
  | "marketplace"
  | "sales"
  | "billing"
  | "finance"
  | "ai"
  | "broadcast"
  | "chats"
  | "referrals"
  | "support"
  | "devtools"
  | "updates"
  | "staff"
  | "storage"
  | "settings";

interface NavItem {
  id: AdminTabType;
  icon: typeof Building2;
  label: string;
  badge?: number;
}

interface AdminSidebarProps {
  activeTab: AdminTabType;
  setActiveTab: (tab: AdminTabType) => void;
  userEmail?: string;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
}

export function AdminSidebar({
  activeTab,
  setActiveTab,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  onLogout
}: AdminSidebarProps) {
  const unreadChats = useAdminUnreadChats();
  const { theme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

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

  const handleTabClick = (tab: AdminTabType) => {
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  const navItems: NavItem[] = [
    { id: "organizations", icon: Building2, label: "Организации" },
    { id: "users", icon: Users, label: "Пользователи" },
    { id: "marketplace", icon: Store, label: "Маркетплейс" },
    { id: "sales", icon: Briefcase, label: "Продажи" },
    { id: "finance", icon: CreditCard, label: "Финансы" },
    { id: "storage", icon: HardDrive, label: "Хранилище и Kinescope" },
    { id: "chats", icon: MessageSquare, label: "Чаты", badge: unreadChats },
  ];

  const brandHsl = themeAccent || "220 70% 50%";

  return (
    <>
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      <aside
        role="navigation"
        aria-label="Админ навигация"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[88px] shadow-[2px_0_8px_rgba(0,0,0,0.06)] flex flex-col transition-transform duration-300",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{ backgroundColor: `hsl(${brandHsl} / 0.07)` }}
      >
        {/* Logo */}
        <div className="flex justify-center py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-card/80 shadow-sm hover:ring-2 hover:ring-primary/40 transition-all"
              >
                <SigmaLogo size="sm" showText={false} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Сменить тему</TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation pill */}
        <div className="flex-1 flex items-center justify-center overflow-y-auto scrollbar-hide px-2">
          <div
            className="rounded-[28px] p-2 shadow-md"
            style={{ backgroundColor: `hsl(${brandHsl} / 0.14)` }}
          >
            <nav className="flex flex-col items-center gap-1.5">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <Tooltip key={item.id} delayDuration={100}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleTabClick(item.id)}
                        className={cn(
                          "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                          isActive
                            ? "text-primary-foreground shadow-md"
                            : "text-foreground/70 hover:text-foreground hover:scale-105"
                        )}
                        style={{
                          backgroundColor: isActive
                            ? `hsl(${brandHsl})`
                            : `hsl(${brandHsl} / 0.12)`,
                          ...(isActive ? { boxShadow: `0 4px 14px hsl(${brandHsl} / 0.4)` } : {}),
                        }}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {(item.badge ?? 0) > 0 && (
                          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                            {item.badge! > 99 ? "99+" : item.badge}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={12}
                      className="z-[100] rounded-xl px-4 py-2 text-sm font-medium shadow-lg border-border/60"
                      style={{
                        backgroundColor: `hsl(${brandHsl})`,
                        color: 'white',
                        boxShadow: `0 4px 20px hsl(${brandHsl} / 0.3)`,
                      }}
                    >
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Logout */}
        <div className="flex justify-center py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onLogout}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Выйти"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[100]">Выйти</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}
