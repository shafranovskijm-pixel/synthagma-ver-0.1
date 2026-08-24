import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  BookOpen, Users, Settings, LogOut, Upload,
  Building2, HardHat, HardDrive, CreditCard, Lock, MessageCircle,
  BarChart3, Link, ShoppingBag, FileText, ClipboardList, FileSpreadsheet, BookCheck, Briefcase,
  PanelLeftClose, PanelLeftOpen, Pin, PinOff, ExternalLink, HelpCircle, UserRound, UserCog,
  Home, ChevronDown, Send, UserPlus, FolderOpen, Handshake
} from "lucide-react";
import { toast } from "sonner";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";
import { useTheme } from "next-themes";

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
import { organizationTabPath } from "@/lib/organization/workspaceNavigation";
import { isMailingEnabled } from "@/lib/mailing/mailingAccess";

export type TabType = 
  | "home"
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
  | "student-details"
  | "group-folder";


const tabCategoryMap: Record<string, string> = {
  courses: "courses",
  organizations: "companies",
  students: "students",
  library: "library",
  links: "links",
  documents: "documents",
  "org-documents": "documents",
  journals: "journals",
  "labor-safety": "labor_safety",
  frdo: "frdo",
  services: "services",
};

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
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
  id: string;
  tab?: TabType;
  href: string;
  icon: typeof BookOpen;
  label: string;
  description?: string;
  category?: string;
  badge?: number;
  hasNew?: boolean;
  statusBadge?: "Beta";
  forceLocked?: boolean;
  pinnable?: boolean;
  neverActive?: boolean;
}

interface NavGroup {
  id: "courses" | "students" | "communications" | "documents";
  icon: typeof BookOpen;
  label: string;
  description: string;
  items: NavItem[];
  badge?: number;
  hasNew?: boolean;
}

const SHOW_LABELS_KEY = "org-sidebar-show-labels";
const EXPANDED_KEY = "org-sidebar-expanded";
const MODE_KEY = "org-sidebar-mode";

type SidebarMode = "expanded" | "compact" | "icons";
const MODE_WIDTH: Record<SidebarMode, number> = { expanded: 220, compact: 88, icons: 64 };

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
  const mailingEnabled = isMailingEnabled(
    planName,
    d.subscriptionLimits?.limits.emailCampaignsEnabled,
  );
  const planLabel = planName === 'free' ? 'Бесплатный' : planName === 'start' ? 'Старт' : planName === 'standard' ? 'Стандарт' : planName === 'professional' ? 'Профессиональный' : planName === 'maximum' ? 'Максимальный' : '';
  const { handleLogoUpload, isUploadingLogo } = d.branding;
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Pinned items + "new" indicators
  const { pinned, toggle: togglePin, isPinned } = useOrgSidebarPinned();
  const newIndicators = useOrgNewIndicators(d.organizationId);

  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const { theme: currentTheme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(currentTheme === "dark" ? "light" : "dark");

  // Sidebar mode: 3 states (expanded / compact-with-captions / icons-only).
  // Capture this before effects persist the initial state. Otherwise the
  // persistence effect makes a first-time visitor look like an existing one
  // and prevents the tablet auto-collapse effect from running.
  const hadSavedSidebarPreference = useRef<boolean>((() => {
    try {
      return !!localStorage.getItem(MODE_KEY)
        || localStorage.getItem(EXPANDED_KEY) !== null
        || localStorage.getItem(SHOW_LABELS_KEY) !== null;
    } catch {
      return false;
    }
  })());
  const [mode, setMode] = useState<SidebarMode>(() => {
    try {
      const raw = localStorage.getItem(MODE_KEY) as SidebarMode | null;
      if (raw === "expanded" || raw === "compact" || raw === "icons") return raw;
      const legacyExpanded = localStorage.getItem(EXPANDED_KEY);
      if (legacyExpanded === "1") return "expanded";
      const legacyLabels = localStorage.getItem(SHOW_LABELS_KEY);
      if (legacyExpanded !== null || legacyLabels !== null) {
        return legacyLabels === "0" ? "icons" : "compact";
      }
      return "expanded";
    } catch { return "expanded"; }
  });

  const isMobile = useIsMobile();
  const effectiveMode: SidebarMode = mode === "expanded" && isMobile ? "compact" : mode;
  const effectiveExpanded = effectiveMode === "expanded";
  const showLabels = effectiveMode === "compact";
  const width = MODE_WIDTH[effectiveMode];

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(EXPANDED_KEY, effectiveExpanded ? "1" : "0");
      localStorage.setItem(SHOW_LABELS_KEY, showLabels ? "1" : "0");
    } catch {
      // The sidebar continues with its in-memory preferences.
    }
    window.dispatchEvent(new CustomEvent("org-sidebar-expanded-change", { detail: effectiveExpanded }));
    window.dispatchEvent(new CustomEvent("org-sidebar-width-change", { detail: width }));
  }, [mode, effectiveExpanded, showLabels, width]);

  // Auto-collapse only on first load when user has no saved preference
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (hadSavedSidebarPreference.current) return;
    const mq = window.matchMedia("(max-width: 1279px)");
    if (mq.matches && mode === "expanded") setMode("compact");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cycle: expanded -> compact -> icons -> expanded
  const handleCycleMode = useCallback(() => {
    setMode((m) => {
      const next: SidebarMode = m === "expanded" ? "compact" : m === "compact" ? "icons" : "expanded";
      try {
        const shown = localStorage.getItem("org-sidebar-mode-hint-shown");
        if (!shown) {
          const desc = next === "expanded" ? "Полные названия рядом с иконками." : next === "compact" ? "Иконки с короткими подписями." : "Только иконки — минимум места.";
          toast(next === "expanded" ? "Развёрнутое меню" : next === "compact" ? "Компактное меню" : "Меню — только иконки", { description: desc, duration: 3500 });
          localStorage.setItem("org-sidebar-mode-hint-shown", "1");
        }
      } catch {
        // Mode switching still works when the hint cannot be persisted.
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

  const isLocked = useCallback(
    (category: string) => !isEnabled(category as Parameters<typeof isEnabled>[0]),
    [isEnabled],
  );

  const navigate = useNavigate();
  const location = useLocation();

  const handleTabClick = useCallback((tab: TabType | "__help_dialog__") => {
    if (tab === "__help_dialog__") {
      navigate("/help");
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
  }, [isLocked, setActiveTab, setIsMobileSidebarOpen, location.pathname, navigate]);

  const handleGoToSubscription = () => {
    setUpgradeDialogOpen(false);
    setActiveTab("subscription");
    setIsMobileSidebarOpen(false);
  };

  const canShowTab = (tab: TabType) => permsLoading || canSeeOrgTab(tab);
  const makeTabItem = (
    tab: TabType,
    options: Omit<NavItem, "tab" | "href"> & { href?: string },
  ): NavItem => ({
    ...options,
    tab,
    href: options.href ?? organizationTabPath(tab),
  });

  const orderPinnedFirst = (items: NavItem[]) => {
    const pinnedOrder = new Map(pinned.map((id, index) => [id, index]));
    return [...items].sort((a, b) => {
      const aIndex = pinnedOrder.get(a.id);
      const bIndex = pinnedOrder.get(b.id);
      if (aIndex === undefined && bIndex === undefined) return 0;
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      return aIndex - bIndex;
    });
  };

  // Seven stable roots. Existing workspaces remain available as children, so
  // the menu is calmer without removing a feature or bypassing staff rights.
  const mainItems: NavItem[] = [];
  if (canShowTab("home")) {
    mainItems.push(makeTabItem("home", {
      id: "home",
      icon: Home,
      label: "Главная",
      description: "Стартовый экран организации",
      pinnable: false,
    }));
  }

  const courseItems: NavItem[] = [];
  if (menuSettings.showCourses !== false && canShowTab("courses")) {
    courseItems.push(makeTabItem("courses", {
      id: "courses",
      icon: BookOpen,
      label: "Все курсы",
      description: "Создание и редактирование учебных программ",
      category: "courses",
    }));
  }
  if (canShowTab("homework-review")) courseItems.push(makeTabItem("homework-review", {
    id: "homework-review", icon: BookCheck, label: "Домашние работы",
    description: "Проверка ответов учеников", hasNew: newIndicators.homework > 0,
  }));
  if (menuSettings.showLibrary !== false && canShowTab("library")) courseItems.push(makeTabItem("library", {
    id: "library", icon: HardDrive, label: "Хранилище",
    description: "Файлы и учебные материалы", category: "library",
  }));
  if (menuSettings.showLaborSafety !== false && canShowTab("labor-safety")) courseItems.push(makeTabItem("labor-safety", {
    id: "labor-safety", icon: HardHat, label: "Охрана труда",
    description: "Изолированный модуль обучения по ОТ", category: "labor_safety",
  }));
  if (menuSettings.showServices !== false && canShowTab("services")) courseItems.push(makeTabItem("services", {
    id: "services", icon: ShoppingBag, label: "Готовые курсы",
    description: "Магазин готовых учебных программ", category: "services", statusBadge: "Beta",
  }));

  const studentItems: NavItem[] = [];
  if (menuSettings.showStudents !== false && canShowTab("students")) {
    studentItems.push(makeTabItem("students", {
      id: "students", icon: Users, label: "Ученики и группы",
      description: "Список учеников, группы и прогресс", category: "students",
    }));
    studentItems.push(makeTabItem("students", {
      id: "students-enrollment", icon: UserPlus, label: "Зачисление",
      description: "Выбор учеников и зачисление на курс", category: "students", pinnable: false, neverActive: true,
      href: "/organization?tab=students&studentsView=active",
    }));
  }
  if (menuSettings.showLinks && canShowTab("links")) studentItems.push(makeTabItem("links", {
    id: "links", icon: Link, label: "Ссылки регистрации",
    description: "Ссылки регистрации на курсы и группы", category: "links",
  }));

  if (menuSettings.showCompanies !== false && canShowTab("organizations")) {
    mainItems.push(makeTabItem("organizations", {
      id: "organizations", icon: Building2, label: "Компании",
      description: "Корпоративные клиенты и их сотрудники", category: "companies", pinnable: false,
    }));
  }

  const communicationItems: NavItem[] = [];
  if (canShowTab("chats")) communicationItems.push(makeTabItem("chats", {
    id: "chats", icon: MessageCircle, label: "Чаты",
    description: "Переписка с учениками и компаниями", badge: d.unreadChatsCount,
  }));
  // Mailing shares the existing sales permission, while plan limits decide
  // whether the entry opens or offers an upgrade. Free users still see where
  // the function lives instead of discovering it through an undocumented URL.
  if (canShowTab("sales")) communicationItems.push({
    id: "mailing",
    icon: Send,
    label: "Рассылки",
    description: mailingEnabled
      ? "Кампании, база, шаблоны и отправители"
      : "Доступно с тарифа «Старт»",
    href: "/mailing/app?tab=overview",
    forceLocked: !mailingEnabled,
  });

  const documentItems: NavItem[] = [];
  if (menuSettings.showDocuments === true && canShowTab("documents")) {
    documentItems.push(makeTabItem("documents", {
      id: "documents", icon: BarChart3, label: "Сводка",
      description: "Состояние документооборота", category: "documents",
    }));
    if (canShowTab("students")) {
      documentItems.push(makeTabItem("documents", {
        id: "documents-files", icon: FolderOpen, label: "Личные дела и документы групп",
        description: "Группы, личные дела и учебные документы", category: "documents", pinnable: false, neverActive: true,
        href: "/organization?tab=students&studentsView=groups",
      }));
    }
    if (canShowTab("organizations")) {
      documentItems.push(makeTabItem("documents", {
        id: "documents-contracts", icon: Handshake, label: "Договоры и закрывающие",
        description: "Открыть компании и их договорные документы", category: "documents", pinnable: false, neverActive: true,
        href: "/organization?tab=documents&documentView=counterparties&counterpartyView=closing",
      }));
    }
  }
  if (menuSettings.showJournals !== false && canShowTab("journals")) documentItems.push(makeTabItem("journals", {
    id: "journals", icon: ClipboardList, label: "Журналы",
    description: "Журналы обучения и регистрации", category: "journals",
  }));
  if (menuSettings.showFrdo !== false && canShowTab("frdo")) documentItems.push(makeTabItem("frdo", {
    id: "frdo", icon: FileSpreadsheet, label: "ФИС ФРДО",
    description: "Подготовка и выгрузка сведений в ФРДО", category: "frdo",
  }));

  const navGroups: NavGroup[] = [];
  if (courseItems.length > 0) navGroups.push({
    id: "courses", icon: BookOpen, label: "Курсы", description: "Курсы и учебные материалы",
    items: orderPinnedFirst(courseItems), hasNew: newIndicators.homework > 0,
  });
  if (studentItems.length > 0) navGroups.push({
    id: "students", icon: Users, label: "Ученики", description: "Ученики, группы и зачисление",
    items: orderPinnedFirst(studentItems),
  });
  if (communicationItems.length > 0) navGroups.push({
    id: "communications", icon: MessageCircle, label: "Коммуникации", description: "Чаты и рассылки",
    items: orderPinnedFirst(communicationItems), badge: d.unreadChatsCount,
  });
  if (documentItems.length > 0) navGroups.push({
    id: "documents", icon: FileText, label: "Документы", description: "Весь документооборот организации",
    items: orderPinnedFirst(documentItems),
  });

  const salesItem = menuSettings.showSales === true
    && d.subscriptionLimits?.limits.salesCrmEnabled
    && canShowTab("sales")
    ? makeTabItem("sales", {
        id: "sales", icon: Briefcase, label: "Продажи",
        description: "Лиды, КП, договоры, канбан сделок", hasNew: newIndicators.sales > 0,
        statusBadge: "Beta", pinnable: false,
      })
    : null;

  const reportsItem = canShowTab("stats")
    ? makeTabItem("stats", {
        id: "stats", icon: BarChart3, label: "Отчёты",
        description: d.subscriptionLimits?.limits.reportsEnabled
          ? "Аналитика обучения и доходов"
          : "Расширенная аналитика доступна на старших тарифах",
        forceLocked: d.subscriptionLimits?.limits.reportsEnabled === false,
        pinnable: false,
      })
    : null;

  const settingsItems = orderPinnedFirst([
    ...(canShowTab("settings") ? [makeTabItem("settings", {
      id: "settings", icon: Settings, label: "Настройки платформы",
      description: "Разделы меню и параметры кабинета",
    })] : []),
    ...(canShowTab("profile") ? [makeTabItem("profile", {
      id: "profile", icon: UserRound, label: "Профиль организации",
      description: "Реквизиты, брендинг и уведомления",
    })] : []),
    ...(canShowTab("staff") ? [makeTabItem("staff", {
      id: "staff", icon: UserCog, label: "Сотрудники и доступы",
      description: "Роли и права сотрудников",
    })] : []),
    ...(menuSettings.showSubscription !== false && canShowTab("subscription") ? [makeTabItem("subscription", {
      id: "subscription", icon: CreditCard, label: "Тариф и оплата",
      description: "Тариф, лимиты, счета и оплата",
    })] : []),
  ]);

  const isItemActive = (item: NavItem) => {
    if (item.neverActive) return false;
    if (item.href.startsWith("/mailing/app")) return location.pathname === "/mailing/app";
    return !!item.tab && activeTab === item.tab;
  };

  const activeGroupId = navGroups.find((group) => group.items.some(isItemActive))?.id ?? null;
  const [expandedGroup, setExpandedGroup] = useState<NavGroup["id"] | null>(null);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  useEffect(() => {
    setExpandedGroup(activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    if (settingsItems.some(isItemActive)) setSettingsExpanded(true);
  // The active tab is the intended trigger; settingsItems is rebuilt from the
  // current permission snapshot and must not cause an expansion loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);



  // Render single nav button (used by both pinned and section blocks)
  const renderNavItem = (item: NavItem, nested = false, forceExpanded = false) => {
    const isActive = isItemActive(item);
    const locked = item.forceLocked || (item.category ? isLocked(item.category) : false);
    const itemPinned = item.pinnable !== false && isPinned(item.id);
    const itemHref = item.href;
    const itemExpanded = effectiveExpanded || forceExpanded;
    const itemShowLabels = !itemExpanded && showLabels;

    const button = (
      <a
        href={locked ? undefined : itemHref}
        data-onboarding={item.id === "courses" ? "courses" : item.id === "students" ? "students" : item.id === "settings" ? "settings" : undefined}
        onClick={(event) => {
          if (locked) {
            event.preventDefault();
            setUpgradeDialogOpen(true);
            return;
          }
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          if (!item.tab || item.href !== organizationTabPath(item.tab) || location.pathname !== "/organization") {
            navigate(item.href);
            setIsMobileSidebarOpen(false);
          } else {
            handleTabClick(item.tab);
          }
          if (!effectiveExpanded) setExpandedGroup(null);
        }}
        className={cn(
          "relative rounded-lg transition-all duration-150 animate-fade-in",
          itemExpanded
            ? cn("flex items-center gap-3 h-10 w-full text-left", nested ? "pl-7 pr-2" : "px-2.5")
            : cn(
                "flex flex-col items-center justify-center px-1 py-1.5",
                itemShowLabels ? "w-[68px] gap-0.5" : "w-10 h-10"
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
        {itemExpanded ? (
          <span
            className={cn(
              "text-[13px] font-medium truncate flex-1",
              isActive ? "text-primary-foreground" : "text-foreground/85"
            )}
          >
            {item.label}
          </span>
        ) : itemShowLabels ? (
          <span
            className={cn(
              "text-[9px] leading-tight font-medium text-center max-w-[64px] line-clamp-2",
              isActive ? "text-primary-foreground/95" : "text-foreground/70"
            )}
          >
            {item.label}
          </span>
        ) : null}
        {item.statusBadge && (
          <span
            className={cn(
              "rounded-full border font-semibold uppercase tracking-wide",
              itemExpanded
                ? "border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[8px] text-primary"
                : "absolute right-0 top-0 border-primary/30 bg-card px-1 py-px text-[7px] text-primary",
              isActive && "border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground",
            )}
            aria-label="Бета-версия"
          >
            {item.statusBadge}
          </span>
        )}
        {itemExpanded && itemPinned && (
          <Pin className={cn("w-3 h-3 shrink-0", isActive ? "text-primary-foreground/90" : "text-muted-foreground/60")} />
        )}
      </a>
    );

    return (
      <ContextMenu key={item.id}>
        <ContextMenuTrigger asChild>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            {!itemExpanded && (
              <TooltipContent
                side="right"
                sideOffset={12}
                className="z-[100] rounded-xl p-3 shadow-lg border-border/60 max-w-[240px] bg-card"
              >
                <div className="flex items-center gap-2 mb-1">
                  <item.icon className="w-4 h-4" style={{ color: `hsl(${brandHsl})` }} />
                  <span className="font-semibold text-sm text-foreground">{item.label}</span>
                  {item.statusBadge && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-primary">
                      {item.statusBadge}
                    </span>
                  )}
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
          {!locked && (
            <ContextMenuItem
              onClick={() => window.open(itemHref, "_blank", "noopener,noreferrer")}
              className="rounded-lg gap-2 py-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Открыть в новой вкладке
            </ContextMenuItem>
          )}
          {item.pinnable !== false && (
            <ContextMenuItem onClick={() => togglePin(item.id)} className="rounded-lg gap-2 py-2">
              {itemPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              {itemPinned ? "Открепить" : "Поднять в подразделе"}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderNavGroup = (group: NavGroup) => {
    const open = expandedGroup === group.id;
    const active = group.items.some(isItemActive);
    const GroupIcon = group.icon;
    const groupButton = (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`org-nav-${group.id}`}
        aria-label={group.label}
        title={!effectiveExpanded ? `${group.label}: ${group.description}` : undefined}
        // In compact modes Radix Popover owns the trigger state. Handling the
        // same click here as well makes a second click toggle twice and leaves
        // the flyout open. Expanded mode is not wrapped in Popover, so it keeps
        // the explicit accordion toggle.
        onClick={effectiveExpanded
          ? () => setExpandedGroup((current) => current === group.id ? null : group.id)
          : undefined}
        className={cn(
          "relative rounded-lg transition-all duration-150",
          effectiveExpanded
            ? "flex h-10 w-full items-center gap-3 px-2.5 text-left"
            : cn("flex flex-col items-center justify-center px-1 py-1.5", showLabels ? "w-[68px] gap-0.5" : "h-10 w-10"),
          active
            ? "bg-primary/10 text-primary"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
        )}
      >
        <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <GroupIcon className="h-[18px] w-[18px]" />
          {(group.badge ?? 0) > 0 && (
            <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {group.badge! > 99 ? "99+" : group.badge}
            </span>
          )}
          {!group.badge && group.hasNew && (
            <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-card" aria-label="Есть новое" />
          )}
        </span>
        {effectiveExpanded ? (
          <>
            <span className="flex-1 truncate text-[13px] font-medium">{group.label}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </>
        ) : showLabels ? (
          <span className="max-w-[64px] text-center text-[9px] font-medium leading-tight">{group.label}</span>
        ) : null}
      </button>
    );

    if (!effectiveExpanded) {
      return (
        <Popover
          key={group.id}
          open={open}
          onOpenChange={(nextOpen) => setExpandedGroup(nextOpen ? group.id : null)}
        >
          <PopoverTrigger asChild>{groupButton}</PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={10}
            className="z-[90] w-[280px] rounded-2xl border-border/70 p-2 shadow-2xl"
          >
            <div className="border-b border-border/60 px-2.5 pb-2 pt-1">
              <div className="flex items-center gap-2 font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <GroupIcon className="h-4 w-4" />
                </span>
                {group.label}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{group.description}</p>
            </div>
            <nav
              id={`org-nav-${group.id}`}
              aria-label={`${group.label}: подразделы`}
              className="mt-1 flex flex-col gap-0.5"
            >
              {group.items.map((item) => renderNavItem(item, false, true))}
            </nav>
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <div key={group.id} className="w-full">
        {groupButton}

        {open && (
          <nav
            id={`org-nav-${group.id}`}
            aria-label={`${group.label}: подразделы`}
            className="mt-0.5 flex flex-col gap-0.5"
          >
            {group.items.map((item) => renderNavItem(item, true))}
          </nav>
        )}
      </div>
    );
  };

  const renderFooterAction = ({
    label,
    icon: Icon,
    href,
    active = false,
    onActivate,
  }: {
    label: string;
    icon: typeof BookOpen;
    href: string;
    active?: boolean;
    onActivate: () => void;
  }) => {
    const link = (
      <a
        href={href}
        onClick={(event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onActivate();
        }}
        className={cn(
          "rounded-lg transition-colors",
          effectiveExpanded
            ? "flex h-9 w-full items-center gap-3 px-2.5 text-left"
            : showLabels
              ? "flex min-h-11 w-[68px] flex-col items-center justify-center gap-0.5 px-1 py-1.5"
              : "flex h-9 w-9 items-center justify-center",
          active
            ? "bg-primary/15 text-primary"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
        )}
        aria-current={active ? "page" : undefined}
        aria-label={label}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {effectiveExpanded ? (
          <span className="text-[13px] font-medium">{label}</span>
        ) : showLabels ? (
          <span className="max-w-[64px] text-center text-[9px] font-medium leading-tight">
            {label}
          </span>
        ) : null}
      </a>
    );

    return (
      <Tooltip key={label}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        {!effectiveExpanded && (
          <TooltipContent side="right" className="z-[100]">
            {label}
          </TooltipContent>
        )}
      </Tooltip>
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
          "fixed inset-y-0 left-0 z-50 shadow-[2px_0_12px_rgba(0,0,0,0.04)] flex flex-col transition-[transform,width] duration-300",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{
          width,
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          backgroundColor: `hsl(${brandHsl} / 0.06)`,
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
                className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background/40 shadow-sm hover:ring-2 hover:ring-primary/40 transition-all group/logo"
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

        {/* Seven semantic roots; details appear only inside the selected root. */}
        <div className={cn("flex flex-1 flex-col justify-start overflow-y-auto py-2 scrollbar-hide", effectiveExpanded ? "gap-0.5 px-2" : "items-center gap-0.5 px-2")}>
          <nav aria-label="Основные разделы" className={cn("flex w-full flex-col gap-0.5", !effectiveExpanded && "items-center")}>
            {mainItems.filter((item) => item.id === "home").map((item) => renderNavItem(item))}
            {navGroups.find((group) => group.id === "courses") && renderNavGroup(navGroups.find((group) => group.id === "courses")!)}
            {navGroups.find((group) => group.id === "students") && renderNavGroup(navGroups.find((group) => group.id === "students")!)}
            {mainItems.filter((item) => item.id === "organizations").map((item) => renderNavItem(item))}
            {navGroups.find((group) => group.id === "communications") && renderNavGroup(navGroups.find((group) => group.id === "communications")!)}
            {navGroups.find((group) => group.id === "documents") && renderNavGroup(navGroups.find((group) => group.id === "documents")!)}
            {salesItem && renderNavItem(salesItem)}
            {reportsItem && renderNavItem(reportsItem)}
          </nav>
        </div>

        {/* Footer: stable help/settings actions, display mode and logout */}
        <div className={cn("py-3 border-t border-border/40", effectiveExpanded ? "px-2 flex flex-col gap-1" : "flex flex-col items-center gap-1.5")}>

          {settingsItems.length > 0 && (effectiveExpanded ? (
            <div className="w-full">
              {settingsExpanded && (
                <nav id="org-nav-settings" aria-label="Настройки: подразделы" className="mb-1 flex flex-col gap-0.5">
                  {settingsItems.map((item) => renderNavItem(item, true))}
                </nav>
              )}
              <button
                type="button"
                aria-expanded={settingsExpanded}
                aria-controls="org-nav-settings"
                onClick={() => setSettingsExpanded((open) => !open)}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors",
                  settingsItems.some(isItemActive)
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
                )}
                aria-label="Настройки"
              >
                <Settings className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 text-[13px] font-medium">Настройки</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", settingsExpanded && "rotate-180")} />
              </button>
            </div>
          ) : (
            <Popover open={settingsExpanded} onOpenChange={setSettingsExpanded}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-expanded={settingsExpanded}
                  aria-controls="org-nav-settings"
                  className={cn(
                    "rounded-lg transition-colors",
                    showLabels
                      ? "flex min-h-11 w-[68px] flex-col items-center justify-center gap-0.5 px-1 py-1.5"
                      : "flex h-9 w-9 items-center justify-center",
                    settingsItems.some(isItemActive)
                      ? "bg-primary/15 text-primary"
                      : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
                  )}
                  aria-label="Настройки"
                  title="Настройки платформы, профиля и доступов"
                >
                  <Settings className="h-[18px] w-[18px] shrink-0" />
                  {showLabels && (
                    <span className="max-w-[64px] text-center text-[9px] font-medium leading-tight">Настройки</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="end"
                sideOffset={10}
                className="z-[90] w-[280px] rounded-2xl border-border/70 p-2 shadow-2xl"
              >
                <div className="border-b border-border/60 px-2.5 pb-2 pt-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Settings className="h-4 w-4" />
                    </span>
                    Настройки
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Платформа, профиль организации, сотрудники и тариф</p>
                </div>
                <nav id="org-nav-settings" aria-label="Настройки: подразделы" className="mt-1 flex flex-col gap-0.5">
                  {settingsItems.map((item) => renderNavItem(item, false, true))}
                </nav>
              </PopoverContent>
            </Popover>
          ))}

          {renderFooterAction({
            label: "Помощь",
            icon: HelpCircle,
            href: "/help",
            onActivate: () => {
              navigate("/help");
              setIsMobileSidebarOpen(false);
            },
          })}

          {/* Cycle mode (desktop only): expanded → compact → icons → expanded */}
          {(() => {
            const nextMode: SidebarMode = effectiveMode === "expanded" ? "compact" : effectiveMode === "compact" ? "icons" : "expanded";
            const nextLabel = nextMode === "expanded" ? "Развернуть" : nextMode === "compact" ? "С подписями" : "Только иконки";
            const currentLabel = effectiveMode === "expanded" ? "Развёрнуто" : effectiveMode === "compact" ? "С подписями" : "Только иконки";
            const Icon = nextMode === "expanded" ? PanelLeftOpen : PanelLeftClose;
            if (effectiveExpanded) {
              return (
                <button
                  onClick={handleCycleMode}
                  className="hidden lg:flex items-center justify-center gap-2 h-9 w-full rounded-lg border border-primary/30 bg-transparent text-primary hover:bg-primary/10 hover:border-primary/50 transition-colors text-[12px] font-medium"
                  aria-label={`Переключить режим меню: ${nextLabel}`}
                  title={`Сейчас: ${currentLabel}. Далее: ${nextLabel}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{nextLabel}</span>
                </button>
              );
            }
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCycleMode}
                    className={cn(
                      "hidden lg:flex items-center justify-center gap-1 h-8 rounded-lg border border-primary/30 bg-transparent text-primary hover:bg-primary/10 hover:border-primary/50 transition-colors",
                      showLabels ? "w-[68px]" : "w-9"
                    )}
                    aria-label={`Переключить режим меню: ${nextLabel}`}
                  >
                    <Icon className="h-4 w-4" />
                    {showLabels && <span className="text-[10px] font-medium">{nextLabel}</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="z-[100] max-w-[220px]">
                  <div className="font-semibold text-sm mb-0.5">Режим меню</div>
                  <div className="text-xs text-muted-foreground">
                    Сейчас: {currentLabel}. Клик — {nextLabel}.
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })()}



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
    </>
  );
}
