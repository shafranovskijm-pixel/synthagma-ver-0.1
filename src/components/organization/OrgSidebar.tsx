import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  BookOpen, Users, Settings, LogOut, Upload,
  Building2, HardHat, HardDrive, CreditCard, Lock, MessageCircle, Wallet,
  BarChart3, Link, ShoppingBag, FileText, ClipboardList, FileSpreadsheet, BookCheck, Radio, Sparkles, Briefcase,
  HelpCircle, Star, PanelLeftClose, PanelLeftOpen, Pin, PinOff
} from "lucide-react";
import { toast } from "sonner";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";
import { useTheme } from "next-themes";
import { HelpCenterDialog } from "@/components/shared/HelpCenterDialog";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { useOrgNewIndicators } from "@/hooks/useOrgNewIndicators";
import { useOrgSidebarPinned } from "@/hooks/useOrgSidebarPinned";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  | "ai-tutors"
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
  | "sales"
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

type SectionId = "learning" | "clients" | "tools";

interface NavItem {
  id: TabType;
  icon: typeof BookOpen;
  label: string;
  description?: string;
  category?: string;
  badge?: number;
  hasNew?: boolean;
  section: SectionId;
}

const SECTION_LABELS: Record<SectionId, string> = {
  learning: "Обучение",
  clients: "Клиенты",
  tools: "Инструменты",
};

const SHOW_LABELS_KEY = "org-sidebar-show-labels";
const EXPANDED_KEY = "org-sidebar-expanded";

export function OrgSidebar() {
  const d = useOrgDashboard();
  const { canSeeOrgTab, loading: permsLoading } = useStaffPermissions();
  const activeTab = d.tabNavigation.activeTab;
  const setActiveTab = d.tabNavigation.setActiveTab;
  const logoUrl = d.branding.brandingSettings.logoUrl;
  const primaryColor = d.branding.brandingSettings.primaryColor;
  const isEnabled = d.isEnabled;
  const menuSettings = d.dashboardSettings.menuSettings;
  const isMobileSidebarOpen = d.isMobileSidebarOpen;
  const setIsMobileSidebarOpen = d.setIsMobileSidebarOpen;
  const onLogout = d.handleLogout;
  const organizationName = d.organizationName;
  const customName = d.branding.brandingSettings.customName;
  const planName = d.subscriptionLimits?.plan;
  const planLabel = planName === 'free' ? 'Бесплатный' : planName === 'start' ? 'Старт' : planName === 'standard' ? 'Стандарт' : planName === 'professional' ? 'Профессиональный' : planName === 'maximum' ? 'Максимальный' : '';
  const { handleLogoUpload, isUploadingLogo } = d.branding;
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Pinned items + "new" indicators
  const { pinned, toggle: togglePin, isPinned } = useOrgSidebarPinned();
  const newIndicators = useOrgNewIndicators(d.organizationId);

  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { theme: currentTheme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(currentTheme === "dark" ? "light" : "dark");

  // Mini-labels under icons (for new orgs / sensor screens)
  const [showLabels, setShowLabels] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(SHOW_LABELS_KEY);
      return v === null ? true : v === "1";
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(SHOW_LABELS_KEY, showLabels ? "1" : "0"); } catch {}
  }, [showLabels]);

  // Expanded mode (icon+text full panel) — desktop only.
  // Raw `expanded` persists across devices so desktop users keep their pref;
  // `effectiveExpanded` forces compact layout on mobile so the 220px panel
  // doesn't overlap page content.
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(EXPANDED_KEY) === "1"; } catch { return false; }
  });
  const isMobile = useIsMobile();
  const effectiveExpanded = expanded && !isMobile;
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_KEY, expanded ? "1" : "0"); } catch {}
    // Notify layout to adjust main content margin
    window.dispatchEvent(new CustomEvent("org-sidebar-expanded-change", { detail: effectiveExpanded }));
  }, [expanded, effectiveExpanded]);

  // Auto-collapse on screens < 1280px to prevent content squeeze
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 1279px)");
    const apply = () => { if (mq.matches && expanded) setExpanded(false); };
    apply();
    const handler = () => apply();
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [expanded]);

  // One-time hint to explain the expanded mode
  const handleToggleExpanded = useCallback(() => {
    setExpanded((v) => {
      const next = !v;
      if (next) {
        try {
          const shown = localStorage.getItem("org-sidebar-expanded-hint-shown");
          if (!shown) {
            toast("Меню развёрнуто", {
              description: "Теперь видны полные названия пунктов. Свернуть обратно — той же кнопкой.",
              duration: 5000,
            });
            localStorage.setItem("org-sidebar-expanded-hint-shown", "1");
          }
        } catch {}
      }
      return next;
    });
  }, []);

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
      window.dispatchEvent(new CustomEvent('open-support-chat'));
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

  // Build nav items grouped by section
  const rawItems: NavItem[] = [];

  // === ОБУЧЕНИЕ ===
  if (menuSettings.showCourses !== false) rawItems.push({ id: "courses", icon: BookOpen, label: "Курсы", description: "Создание и редактирование учебных программ", category: "courses", section: "learning" });
  rawItems.push({ id: "homework-review", icon: BookCheck, label: "Домашние работы", description: "Проверка ответов учеников", hasNew: newIndicators.homework > 0, section: "learning" });
  if (menuSettings.showAITutors !== false) {
    rawItems.push({ id: "ai-tutors", icon: Sparkles, label: "ИИ-уроки", description: "Голосовые ИИ-преподаватели для уроков", section: "learning" });
  }
  if (menuSettings.showLaborSafety !== false) rawItems.push({ id: "labor-safety", icon: HardHat, label: "Охрана труда", description: "Изолированный модуль обучения по ОТ", category: "labor_safety", section: "learning" });

  // === КЛИЕНТЫ ===
  if (menuSettings.showStudents !== false) rawItems.push({ id: "students", icon: Users, label: "Ученики", description: "Список учеников и их прогресс", category: "students", section: "clients" });
  if (menuSettings.showCompanies !== false) rawItems.push({ id: "organizations", icon: Building2, label: "Клиенты-компании", description: "Корпоративные клиенты и их сотрудники", category: "companies", section: "clients" });
  // «Продажи» всегда видны (видимость регулируется правами sales.read).
  rawItems.push({ id: "sales", icon: Briefcase, label: "Продажи", description: "Лиды, КП, договоры, канбан сделок", hasNew: newIndicators.sales > 0, section: "clients" });
  rawItems.push({ id: "chats", icon: MessageCircle, label: "Чаты", description: "Переписка с учениками и компаниями", badge: d.unreadChatsCount, section: "clients" });

  // === ИНСТРУМЕНТЫ ===
  if (menuSettings.showStats) rawItems.push({ id: "stats", icon: BarChart3, label: "Статистика", description: "Аналитика обучения и доходов", section: "tools" });
  if (menuSettings.showLinks) rawItems.push({ id: "links", icon: Link, label: "Ссылки", description: "Ссылки регистрации на курсы и группы", category: "links", section: "tools" });
  // «Финансы» убраны — открываются изнутри «Тариф».

  // Фильтр по правам сотрудника
  const navItems: NavItem[] = permsLoading ? rawItems : rawItems.filter(item => canSeeOrgTab(item.id));

  // Pinned items (preserve order from `pinned` array)
  const pinnedItems = pinned
    .map((id) => navItems.find((i) => i.id === id))
    .filter((i): i is NavItem => !!i);

  // Group preserving section order
  const sectionOrder: SectionId[] = ["learning", "clients", "tools"];
  const grouped = sectionOrder
    .map((sec) => ({ section: sec, items: navItems.filter((i) => i.section === sec) }))
    .filter((g) => g.items.length > 0);



  // Render single nav button (used by both pinned and section blocks)
  const renderNavItem = (item: NavItem) => {
    const isActive = activeTab === item.id;
    const locked = item.category ? isLocked(item.category) : false;
    const itemPinned = isPinned(item.id);

    const button = (
      <button
        data-onboarding={item.id === "courses" ? "courses" : item.id === "students" ? "students" : item.id === "settings" ? "settings" : undefined}
        onClick={() => handleTabClick(item.id)}
        className={cn(
          "relative rounded-lg transition-all duration-150 animate-fade-in",
          effectiveExpanded
            ? "flex items-center gap-3 px-2.5 h-10 w-full text-left"
            : cn(
                "flex flex-col items-center justify-center w-[68px] px-1 py-1.5",
                showLabels ? "gap-0.5" : "h-10"
              ),
          locked && "opacity-50",
          isActive
            ? "text-primary-foreground shadow-sm scale-[1.02]"
            : "text-foreground/70 hover:text-foreground hover:bg-foreground/5 hover:scale-[1.02]"
        )}
        style={{
          backgroundColor: isActive ? `hsl(${brandHsl})` : undefined,
          ...(isActive ? { boxShadow: `0 2px 10px hsl(${brandHsl} / 0.3)` } : {}),
        }}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.label}
      >
        <span className="relative flex items-center justify-center shrink-0" style={{ width: 18, height: 18 }}>
          <item.icon className="h-[18px] w-[18px]" />
          {locked && <Lock className="absolute -top-1 -right-2 w-2.5 h-2.5 text-muted-foreground/60" />}
          {(item.badge ?? 0) > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {item.badge! > 99 ? "99+" : item.badge}
            </span>
          )}
          {/* "New" indicator dot */}
          {!item.badge && item.hasNew && (
            <span
              className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full ring-2 ring-card animate-pulse"
              style={{ backgroundColor: "hsl(var(--warning))" }}
              aria-label="Есть новое"
            />
          )}
        </span>
        {effectiveExpanded ? (
          <span
            className={cn(
              "text-[13px] font-medium truncate flex-1",
              isActive ? "text-primary-foreground" : "text-foreground/85"
            )}
          >
            {item.label}
          </span>
        ) : showLabels ? (
          <span
            className={cn(
              "text-[9px] leading-tight font-medium text-center max-w-[64px] line-clamp-2",
              isActive ? "text-primary-foreground/95" : "text-foreground/70"
            )}
          >
            {item.label}
          </span>
        ) : null}
        {effectiveExpanded && itemPinned && (
          <Pin className={cn("w-3 h-3 shrink-0", isActive ? "text-primary-foreground/90" : "text-muted-foreground/60")} />
        )}
      </button>
    );

    return (
      <ContextMenu key={item.id}>
        <ContextMenuTrigger asChild>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            {!effectiveExpanded && (
              <TooltipContent
                side="right"
                sideOffset={12}
                className="z-[100] rounded-xl p-3 shadow-lg border-border/60 max-w-[240px] bg-card"
              >
                <div className="flex items-center gap-2 mb-1">
                  <item.icon className="w-4 h-4" style={{ color: `hsl(${brandHsl})` }} />
                  <span className="font-semibold text-sm text-foreground">{item.label}</span>
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground leading-snug">{item.description}</p>
                )}
                <div className="text-[10px] text-muted-foreground/70 mt-2 pt-2 border-t border-border/50">
                  ПКМ — {itemPinned ? "открепить" : "закрепить"}
                </div>
              </TooltipContent>
            )}
          </Tooltip>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44 rounded-xl">
          <ContextMenuItem onClick={() => togglePin(item.id)} className="rounded-lg gap-2 py-2">
            {itemPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            {itemPinned ? "Открепить" : "Закрепить наверху"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

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
          "fixed inset-y-0 left-0 z-50 bg-card border-r border-border/60 shadow-[2px_0_12px_rgba(0,0,0,0.04)] flex flex-col transition-[transform,width] duration-300",
          effectiveExpanded ? "w-[220px]" : "w-[88px]",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          // Subtle vertical brand stripe for accent without losing opacity
          boxShadow: `inset 3px 0 0 hsl(${brandHsl} / 0.5), 2px 0 12px rgba(0,0,0,0.04)`,
        }}
      >
        {/* Header: logo + (expanded) school name + collapse toggle */}
        <div className={cn("px-3 pt-4 pb-3 border-b border-border/40", effectiveExpanded ? "flex items-center gap-2.5" : "flex flex-col items-center gap-2")}>
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
                onClick={logoUrl ? () => logoInputRef.current?.click() : toggleTheme}
                className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card shadow-sm hover:ring-2 hover:ring-primary/40 transition-all group/logo"
              >
                {isUploadingLogo ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Логотип" className="h-9 w-9 object-contain" />
                ) : (
                  <SigmaLogo size="sm" />
                )}
                {logoUrl && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/logo:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                    <Upload className="w-4 h-4 text-white" />
                  </div>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[100]">
              {logoUrl ? "Нажмите, чтобы изменить значок" : "Сменить тему"}
            </TooltipContent>
          </Tooltip>

          {effectiveExpanded && (
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-foreground leading-tight truncate">
                {customName || organizationName || "Школа"}
              </div>
              {planLabel && (
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {planLabel} тариф
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation grouped by section */}
        <div className={cn("flex-1 flex flex-col overflow-y-auto scrollbar-hide py-2", effectiveExpanded ? "px-2 gap-2" : "items-center gap-2 px-2")}>

          {/* Pinned items (favorites) */}
          {pinnedItems.length > 0 && (
            <div className="w-full flex flex-col">
              <div className={cn("px-1", effectiveExpanded ? "text-left" : "text-center")}>
                <span
                  className="text-[9px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70 select-none inline-flex items-center gap-1"
                  aria-hidden
                >
                  <Pin className="w-2.5 h-2.5" /> Закреплено
                </span>
              </div>
              <nav className={cn("flex flex-col gap-0.5 mt-1", effectiveExpanded ? "items-stretch" : "items-center")}>
                {pinnedItems.map((item) => renderNavItem(item))}
              </nav>
            </div>
          )}

          {grouped.map((group, gIdx) => (
            <div key={group.section} className="w-full flex flex-col">
              {/* Section heading: plain caps text, no plate */}
              <div className={cn("px-1", (gIdx > 0 || pinnedItems.length > 0) ? "mt-2" : "mt-0", effectiveExpanded ? "text-left" : "text-center")}>
                <span
                  className="text-[9px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70 select-none"
                  aria-hidden
                >
                  {SECTION_LABELS[group.section]}
                </span>
              </div>

              <nav className={cn("flex flex-col gap-0.5 mt-1", effectiveExpanded ? "items-stretch" : "items-center")}>
                {group.items.map((item) => renderNavItem(item))}
              </nav>
            </div>
          ))}
        </div>

        {/* Footer: Help, What's new, Logout (collapse moved to header) */}
        <div className={cn("py-3 border-t border-border/40", effectiveExpanded ? "px-2 flex flex-col gap-1" : "flex flex-col items-center gap-1.5")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-support-chat'))}
                className={cn(
                  "rounded-lg text-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors",
                  effectiveExpanded ? "flex items-center gap-3 px-2.5 h-9 w-full text-left" : "flex h-9 w-9 items-center justify-center"
                )}
                aria-label="Помощь"
              >
                <HelpCircle className="h-[18px] w-[18px] shrink-0" />
                {effectiveExpanded && <span className="text-[13px] font-medium">Помощь</span>}
              </button>
            </TooltipTrigger>
            {!effectiveExpanded && <TooltipContent side="right" className="z-[100]">Помощь</TooltipContent>}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  try { localStorage.setItem("whats-new-last-seen", String(Date.now())); } catch {}
                  handleTabClick("whats-new" as TabType);
                }}
                className={cn(
                  "relative rounded-lg text-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors",
                  effectiveExpanded ? "flex items-center gap-3 px-2.5 h-9 w-full text-left" : "flex h-9 w-9 items-center justify-center"
                )}
                aria-label="Что нового"
              >
                <Star className="h-[18px] w-[18px] shrink-0" />
                {effectiveExpanded && <span className="text-[13px] font-medium flex-1">Что нового</span>}
                {newIndicators.whatsNew > 0 && (
                  <span
                    className={cn(
                      "rounded-full ring-2 ring-card animate-pulse",
                      effectiveExpanded ? "w-2 h-2" : "absolute top-1.5 right-1.5 w-2 h-2"
                    )}
                    style={{ backgroundColor: "hsl(var(--warning))" }}
                    aria-label="Есть новое"
                  />
                )}
              </button>
            </TooltipTrigger>
            {!effectiveExpanded && <TooltipContent side="right" className="z-[100]">Что нового</TooltipContent>}
          </Tooltip>

          {/* Collapse / Expand toggle (desktop only) — between «Что нового» and Aa */}
          {effectiveExpanded ? (
            <button
              onClick={handleToggleExpanded}
              className="hidden lg:flex items-center justify-center gap-2 h-9 w-full rounded-lg border border-border/60 bg-muted/40 text-foreground/80 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors text-[12px] font-medium"
              aria-label="Свернуть меню в иконки"
            >
              <PanelLeftClose className="h-4 w-4" />
              <span>Свернуть в иконки</span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleToggleExpanded}
                  className="hidden lg:flex items-center justify-center gap-1 h-8 w-[68px] rounded-lg border border-border/60 bg-muted/40 text-foreground/70 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                  aria-label="Развернуть меню — показать названия пунктов"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                  <span className="text-[10px] font-medium">Шире</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[100] max-w-[220px]">
                <div className="font-semibold text-sm mb-0.5">Развернуть меню</div>
                <div className="text-xs text-muted-foreground">
                  Покажет полные названия пунктов рядом с иконками. Удобно для новых пользователей.
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          {!effectiveExpanded && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowLabels((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 transition-colors text-[10px] font-bold"
                  aria-label={showLabels ? "Скрыть подписи" : "Показать подписи"}
                >
                  {showLabels ? "Aa" : "·"}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[100]">
                {showLabels ? "Скрыть подписи" : "Показать подписи"}
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onLogout}
                className={cn(
                  "rounded-lg text-destructive hover:bg-destructive/10 transition-colors mt-1",
                  effectiveExpanded ? "flex items-center gap-3 px-2.5 h-9 w-full text-left" : "flex h-9 w-9 items-center justify-center"
                )}
                aria-label="Выйти"
              >
                <LogOut className="h-[18px] w-[18px] shrink-0" />
                {effectiveExpanded && <span className="text-[13px] font-medium">Выйти</span>}
              </button>
            </TooltipTrigger>
            {!effectiveExpanded && <TooltipContent side="right" className="z-[100]">Выйти</TooltipContent>}
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
      <HelpCenterDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
