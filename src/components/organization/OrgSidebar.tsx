import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  BookOpen, Users, Settings, LogOut, Upload,
  Building2, HardHat, HardDrive, CreditCard, Lock, MessageCircle, Wallet,
  BarChart3, Link, ShoppingBag, FileText, ClipboardList, FileSpreadsheet, BookCheck, Radio,
  User, Sparkles, HelpCircle
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";
import { HelpCenterDialog } from "@/components/shared/HelpCenterDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type TabType = 
  | "courses" 
  | "organizations" 
  | "students" 
  | "chats"
  | "homework-review"
  | "library" 
  | "stats" 
  | "links" 
  | "documents" 
  | "documents-orders" 
  | "documents-protocols" 
  | "documents-certificates" 
  | "documents-diplomas" 
  | "documents-testimonials" 
  | "journals" 
  | "labor-safety"
  | "subscription"
  | "payments"
  | "services" 
  | "settings" 
  | "staff"
  | "webinars"
  | "frdo"
  | "profile"
  | "whats-new"
  | "org-documents"
  | "course-details"
  | "contract-editor"
  | "student-details";

const tabCategoryMap: Record<string, string> = {
  courses: "courses",
  organizations: "companies",
  students: "students",
  library: "library",
  links: "links",
  documents: "documents",
  journals: "journals",
  "labor-safety": "labor_safety",
  frdo: "frdo",
  services: "services",
};

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
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

function normalizeBrandColor(color?: string): string {
  if (!color) return "174 72% 46%";
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) return hexToHsl(trimmed) ?? "174 72% 46%";
  if (trimmed.startsWith("hsl(")) return trimmed.replace(/^hsl\((.*)\)$/i, "$1");
  return trimmed;
}

interface NavItem {
  id: TabType;
  icon: typeof BookOpen;
  label: string;
  category?: string;
  badge?: number;
}

export function OrgSidebar() {
  const d = useOrgDashboard();
  const activeTab = d.tabNavigation.activeTab;
  const setActiveTab = d.tabNavigation.setActiveTab;
  const logoUrl = d.branding.brandingSettings.logoUrl;
  const primaryColor = d.branding.brandingSettings.primaryColor;
  const isEnabled = d.isEnabled;
  const menuSettings = d.dashboardSettings.menuSettings;
  const isMobileSidebarOpen = d.isMobileSidebarOpen;
  const setIsMobileSidebarOpen = d.setIsMobileSidebarOpen;
  const onLogout = d.handleLogout;
  const { handleLogoUpload, isUploadingLogo } = d.branding;
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

  const brandHsl = themeAccent || normalizeBrandColor(primaryColor);

  const isLocked = (category: string) => !isEnabled(category as any);

  const navigate = useNavigate();
  const location = useLocation();

  const handleTabClick = useCallback((tab: TabType | "__help_dialog__") => {
    if (tab === "__help_dialog__") {
      setHelpOpen(true);
      return;
    }
    const category = tabCategoryMap[tab];
    if (category && isLocked(category)) {
      setUpgradeDialogOpen(true);
      return;
    }
    if (location.pathname !== "/organization") {
      navigate(`/organization?tab=${tab}`);
    } else {
      setActiveTab(tab);
    }
    setIsMobileSidebarOpen(false);
  }, [isEnabled, setActiveTab, setIsMobileSidebarOpen, location.pathname, navigate]);

  const handleGoToSubscription = () => {
    setUpgradeDialogOpen(false);
    setActiveTab("subscription");
    setIsMobileSidebarOpen(false);
  };

  // Build nav items dynamically based on menu settings
  const navItems: NavItem[] = [];
  
  if (menuSettings.showCourses !== false) navItems.push({ id: "courses", icon: BookOpen, label: "Курсы", category: "courses" });
  if (menuSettings.showCompanies !== false) navItems.push({ id: "organizations", icon: Building2, label: "Компании", category: "companies" });
  if (menuSettings.showStudents !== false) navItems.push({ id: "students", icon: Users, label: "Ученики", category: "students" });
  
  if (menuSettings.showStats) navItems.push({ id: "stats", icon: BarChart3, label: "Статистика" });
  if (menuSettings.showLinks) navItems.push({ id: "links", icon: Link, label: "Ссылки", category: "links" });
  
  if (menuSettings.showLaborSafety !== false) navItems.push({ id: "labor-safety", icon: HardHat, label: "Охрана труда", category: "labor_safety" });
  navItems.push({ id: "payments", icon: Wallet, label: "Финансы" });

  navItems.push({ id: "homework-review", icon: BookCheck, label: "Задания" });
  
  navItems.push({ id: "chats", icon: MessageCircle, label: "Чаты", badge: d.unreadChatsCount });

  // Settings section - always visible, like in admin panel
  navItems.push({ id: "profile", icon: User, label: "Профиль" });
  navItems.push({ id: "settings", icon: Settings, label: "Настройки" });
  navItems.push({ id: "org-documents", icon: FileText, label: "Документы" });
  navItems.push({ id: "whats-new", icon: Sparkles, label: "Что нового" });
  navItems.push({ id: "__help_dialog__" as any, icon: HelpCircle, label: "Помощь" });


  return (
    <>
      {/* Mobile overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      <aside
        role="navigation"
        aria-label="Основная навигация"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[88px] shadow-[2px_0_8px_rgba(0,0,0,0.06)] flex flex-col transition-transform duration-300",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{ backgroundColor: `hsl(${brandHsl} / 0.07)` }}
      >
        {/* Logo – click to change */}
        <div className="flex justify-center py-4">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => logoInputRef.current?.click()}
                className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-card/80 shadow-sm hover:ring-2 hover:ring-primary/40 transition-all group/logo"
              >
                {isUploadingLogo ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Логотип" className="h-10 w-10 object-contain" />
                ) : (
                  <SigmaLogo size="sm" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/logo:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                  <Upload className="w-4 h-4 text-white" />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[100]">Нажмите, чтобы изменить значок</TooltipContent>
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
                const locked = item.category ? isLocked(item.category) : false;

                return (
                  <Tooltip key={item.id} delayDuration={100}>
                    <TooltipTrigger asChild>
                      <button
                        data-onboarding={item.id === "courses" ? "courses" : item.id === "students" ? "students" : item.id === "settings" ? "settings" : undefined}
                        onClick={() => handleTabClick(item.id)}
                        className={cn(
                          "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                          locked && "opacity-50",
                          isActive
                            ? "text-primary-foreground shadow-md"
                            : "text-foreground/70 hover:text-foreground hover:scale-110"
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
                        {locked && <Lock className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-muted-foreground/60" />}
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

      <AlertDialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Недоступно на вашем тарифе</AlertDialogTitle>
            <AlertDialogDescription>
              Эта функция недоступна на вашем текущем тарифе. Хотите расширить тариф?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Закрыть</AlertDialogCancel>
            <AlertDialogAction onClick={handleGoToSubscription}>
              Перейти к тарифам
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
