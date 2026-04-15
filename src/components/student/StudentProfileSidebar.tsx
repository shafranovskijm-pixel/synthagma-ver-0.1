import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Bell, Video, FileCheck, FileText, Trophy, Palette, Users, LogOut, ArrowLeft } from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
}

interface StudentProfileSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  logoUrl?: string | null;
  consentBadge?: number;
  docsBadge?: number;
  showAchievements?: boolean;
  isAdminView?: boolean;
  onLogout: () => void;
  onBack: () => void;
}

export function StudentProfileSidebar({
  activeTab,
  onTabChange,
  logoUrl,
  consentBadge = 0,
  docsBadge = 0,
  showAchievements = false,
  isAdminView = false,
  onLogout,
  onBack,
}: StudentProfileSidebarProps) {
  const navigate = useNavigate();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: "profile", icon: User, label: "Профиль" },
    { id: "notifications", icon: Bell, label: "Уведомления" },
    { id: "identification", icon: Video, label: "Идентификация" },
    { id: "consent", icon: FileCheck, label: "Согласие на ПД", badge: consentBadge },
    { id: "documents", icon: FileText, label: "Документы", badge: docsBadge },
    ...(showAchievements ? [{ id: "achievements", icon: Trophy, label: "Достижения" }] : []),
    { id: "theme", icon: Palette, label: "Тема" },
    { id: "partner", icon: Users, label: "Партнёрская программа" },
  ];

  return (
    <>
      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileOpen(false)} />
      )}

      <aside
        role="navigation"
        aria-label="Навигация профиля"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[88px] shadow-[2px_0_8px_rgba(0,0,0,0.06)] bg-card/50 flex flex-col transition-transform duration-300",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex justify-center py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card/80 shadow-sm">
            {logoUrl ? (
              <img src={logoUrl} alt="Логотип" className="h-10 w-10 object-contain" />
            ) : (
              <SigmaLogo size="sm" />
            )}
          </div>
        </div>

        {/* Back to dashboard */}
        <div className="flex justify-center pb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate("/student")}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-foreground/60 hover:text-primary hover:bg-primary/10 hover:scale-110 transition-all duration-200"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[100]">Назад к дашборду</TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation pill */}
        <div className="flex-1 flex items-center justify-center px-2">
          <div className="rounded-[28px] bg-primary/10 p-2 shadow-sm">
            <nav className="flex flex-col items-center gap-1.5">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <Tooltip key={item.id} delayDuration={100}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          onTabChange(item.id);
                          setIsMobileOpen(false);
                        }}
                        className={cn(
                          "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "text-foreground/70 hover:text-primary hover:bg-primary/10 hover:scale-110"
                        )}
                        style={isActive ? { boxShadow: "0 4px 14px hsl(var(--primary) / 0.4)" } : undefined}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {(item.badge ?? 0) > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={12}
                      className="z-[100] rounded-xl px-4 py-2 text-sm font-medium shadow-lg border-border/60 bg-primary text-primary-foreground"
                      style={{ boxShadow: "0 4px 20px hsl(var(--primary) / 0.3)" }}
                    >
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom action */}
        <div className="flex justify-center py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={isAdminView ? onBack : onLogout}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  isAdminView
                    ? "text-foreground/60 hover:text-primary hover:bg-primary/10"
                    : "text-destructive hover:bg-destructive/10"
                )}
                aria-label={isAdminView ? "Вернуться в панель" : "Выйти"}
              >
                {isAdminView ? <ArrowLeft className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[100]">
              {isAdminView ? "Вернуться в панель" : "Выйти"}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}
