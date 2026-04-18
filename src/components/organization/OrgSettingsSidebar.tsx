import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { User, FileText, Sparkles, HelpCircle, LogOut, ArrowLeft } from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { HelpCenterDialog } from "@/components/shared/HelpCenterDialog";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";
import type { TabType } from "@/components/organization/OrgSidebar";

const settingsNavItems = [
  { icon: User, label: "Профиль", tab: "profile" as TabType, path: "/organization/profile" },
  { icon: FileText, label: "Документы", tab: "org-documents" as TabType, path: "/organization/documents" },
  { icon: Sparkles, label: "Что нового", tab: "whats-new" as TabType, path: "/organization/whats-new" },
  { icon: HelpCircle, label: "Помощь", tab: "__help_dialog__" as any, path: "__help_dialog__" },
];

interface OrgSettingsSidebarProps {
  embedded?: boolean;
}

export function OrgSettingsSidebar({ embedded }: OrgSettingsSidebarProps) {
  const d = useOrgDashboard();
  const navigate = useNavigate();
  const location = useLocation();
  const logoUrl = d.branding.brandingSettings.logoUrl;
  const isMobileSidebarOpen = d.isMobileSidebarOpen;
  const setIsMobileSidebarOpen = d.setIsMobileSidebarOpen;
  const [helpOpen, setHelpOpen] = useState(false);
  const [themeAccent, setThemeAccent] = useState<string | null>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id)?.accent || null : null;
  });
  const [themeSidebarClass, setThemeSidebarClass] = useState<string | null>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id)?.sidebarClass || null : null;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      const theme = id ? getThemeById(id) : null;
      setThemeAccent(theme?.accent || null);
      setThemeSidebarClass(theme?.sidebarClass || null);
    };
    window.addEventListener("visual-theme-change", handler);
    return () => window.removeEventListener("visual-theme-change", handler);
  }, []);

  const activeTab = d.tabNavigation.activeTab;
  const secondaryTabs: TabType[] = ["profile", "org-documents", "whats-new"];

  const handleItemClick = (item: typeof settingsNavItems[0]) => {
    if (item.path === "__help_dialog__") {
      setHelpOpen(true);
    } else if (embedded) {
      d.tabNavigation.setActiveTab(item.tab);
    } else {
      navigate(item.path);
    }
    setIsMobileSidebarOpen(false);
  };

  const handleBack = () => {
    if (embedded) {
      d.tabNavigation.setActiveTab("courses");
    } else {
      navigate("/organization");
    }
  };

  const isItemActive = (item: typeof settingsNavItems[0]) => {
    if (item.path === "__help_dialog__") return false;
    if (embedded) return activeTab === item.tab;
    return location.pathname === item.path;
  };

  return (
    <>
      {!embedded && isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      <aside
        role="navigation"
        aria-label="Навигация настроек"
        className={cn(
          "z-50 w-[88px] shadow-[2px_0_8px_rgba(0,0,0,0.06)] bg-card/50 flex flex-col transition-all duration-300",
          embedded
            ? "fixed inset-y-0 left-0 lg:translate-x-0"
            : cn(
                "fixed inset-y-0 left-0",
                isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
              ),
          themeSidebarClass
        )}
        style={themeAccent ? { "--primary": themeAccent } as React.CSSProperties : undefined}
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
                onClick={handleBack}
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
              {settingsNavItems.map((item) => {
                const active = isItemActive(item);
                return (
                  <Tooltip key={item.path} delayDuration={100}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                          active
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "text-foreground/70 hover:text-primary hover:bg-primary/10 hover:scale-110"
                        )}
                        style={active ? { boxShadow: "0 4px 14px hsl(var(--primary) / 0.4)" } : undefined}
                        aria-current={active ? "page" : undefined}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
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

        {/* Logout */}
        <div className="flex justify-center py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={d.handleLogout}
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
      <HelpCenterDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
