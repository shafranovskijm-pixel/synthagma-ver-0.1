import { useState, useEffect } from "react";
import { Menu, CreditCard, HelpCircle, User, LogOut, FileText, Search, PlayCircle, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { OrgNotifications } from "./OrgNotifications";
import { AnnouncementsBell } from "@/components/shared/AnnouncementsBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RadioPlayerButton } from "@/components/radio/RadioPlayerButton";
import { SectionBreadcrumbDropdown } from "./SectionBreadcrumbDropdown";
import { QuickActionChips } from "./QuickActionChips";
import { useOrgNewIndicators } from "@/hooks/useOrgNewIndicators";
import { hasOrganizationCourse } from "@/lib/organization/firstRun";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";

function getUserInitials(email?: string | null, name?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() || "?";
  }
  if (email) return email[0]?.toUpperCase() || "?";
  return "?";
}

export function OrgDashboardHeader() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  const { can } = useStaffPermissions();
  const { theme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const activeTab = d.tabNavigation.activeTab;
  const isCoursesFirstRun =
    activeTab === "courses" &&
    !d.isLoadingCourses &&
    can("courses.write") &&
    can("students.write") &&
    can("documents.write") &&
    !hasOrganizationCourse(d.courses);
  const organizationName = d.organizationName;
  const organizationId = d.organizationId;
  const customName = d.branding.brandingSettings.customName;
  const logoUrl = d.branding.brandingSettings.logoUrl;

  // Tariff info
  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const planName = d.subscriptionLimits?.plan;
  const { user: authUser } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const newIndicators = useOrgNewIndicators(organizationId);

  const [showRadio, setShowRadio] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    supabase.from("organizations").select("paid_until, student_dashboard_settings").eq("id", organizationId).single()
      .then(({ data }) => {
        if (data?.paid_until) setPaidUntil(data.paid_until);
        const s = (data?.student_dashboard_settings ?? null) as Record<string, unknown> | null;
        setShowRadio(s?.showRadio === true);
        setShowAnnouncements(s?.showAnnouncements === true);
      });
  }, [organizationId]);


  useEffect(() => {
    if (!authUser?.id) return;
    supabase.from("profiles").select("avatar_url").eq("user_id", authUser.id).single()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url); });
  }, [authUser?.id]);

  const daysRemaining = paidUntil ? Math.max(0, differenceInDays(new Date(paidUntil), new Date())) : null;

  const planLabel = planName === 'free' ? 'Бесплатный' : planName === 'start' ? 'Старт' : planName === 'standard' ? 'Стандарт' : planName === 'professional' ? 'Профессиональный' : planName === 'maximum' ? 'Максимальный' : 'Тариф';

  const userEmail = d.user?.email;
  const initials = getUserInitials(userEmail);

  const getPageTitle = () => {
    switch (activeTab) {
      case "home": return "Главная";
      case "courses": return "Курсы";
      case "students": return "Ученики";
      case "organizations": return "Клиенты-компании";
      case "library": return "Хранилище";
      case "stats": return "Статистика";
      case "links": return "Ссылки регистрации";
      case "documents": return "Документы учеников";
      case "journals": return "Журналы";
      case "labor-safety": return "Охрана труда";
      case "services": return "Готовые программы";
      case "settings": return "Настройки";
      case "subscription": return "Тариф";
      case "chats": return "Чаты";
      case "frdo": return "ФИС ФРДО";
      case "profile": return "Профиль";
      case "homework-review": return "Домашние работы";
      case "mailing": return "Рассылки";
      case "org-documents": return "Документы школы";
      case "whats-new": return "Что нового";
      default: return "";
    }
  };

  // Breadcrumbs: section group → page
  const getBreadcrumb = (): { section: string; page: string } | null => {
    if (activeTab === "home") return { section: "Школа", page: "Главная" };
    const learning = ["courses", "homework-review", "labor-safety"];
    const clients = ["students", "organizations", "mailing", "chats"];
    const tools = ["stats", "links", "library", "journals", "frdo", "documents", "services"];
    const settings = ["profile", "subscription", "org-documents", "whats-new", "settings"];
    const title = getPageTitle();
    if (!title) return null;
    if (learning.includes(activeTab)) return { section: "Обучение", page: title };
    if (clients.includes(activeTab)) return { section: "Клиенты", page: title };
    if (tools.includes(activeTab)) return { section: "Инструменты", page: title };
    if (settings.includes(activeTab)) return { section: "Настройки", page: title };
    return { section: "Школа", page: title };
  };

  const breadcrumb = getBreadcrumb();

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  // Map active tab to section id for breadcrumb dropdown
  const getSectionId = (): "learning" | "clients" | "tools" | "settings" | null => {
    const learning = ["courses", "homework-review", "labor-safety"];
    const clients = ["students", "organizations", "mailing", "chats"];
    const tools = ["stats", "links", "library", "journals", "frdo", "documents", "services"];
    const settings = ["profile", "subscription", "org-documents", "whats-new", "settings"];
    if (learning.includes(activeTab)) return "learning";
    if (clients.includes(activeTab)) return "clients";
    if (tools.includes(activeTab)) return "tools";
    if (settings.includes(activeTab)) return "settings";
    return null;
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);


  return (
    <header data-org-sticky-header className="sticky top-0 z-30 bg-card border-b border-border group/orgheader">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-14">
        {/* Left: Mobile menu + Logo + Org name */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => d.setIsMobileSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-secondary"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={toggleTheme} className="hover:opacity-80 transition-opacity">
                    <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Сменить тему</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={toggleTheme} className="hover:opacity-80 transition-opacity">
                    <SigmaLogo size="sm" showText={false} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Сменить тему</TooltipContent>
              </Tooltip>
            )}
            <span className="font-display font-bold text-sm hidden sm:inline">{customName || organizationName || "СИНТАГМА"}</span>
          </div>
        </div>

        {/* Center: Omnibox-style global search */}
        <button
          onClick={openCommandPalette}
          className="hidden md:flex flex-1 max-w-xl mx-6 items-center gap-2.5 px-4 h-9 rounded-xl border border-border/70 bg-muted/30 hover:bg-muted hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all shadow-sm"
          aria-label="Найти раздел, ученика, курс, документ"
        >
          <Search className="w-4 h-4 shrink-0 text-primary/70" />
          <span className="text-sm font-medium flex-1 text-left truncate">
            Найти раздел, ученика, курс, документ…
          </span>
          <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-card text-[10px] font-mono text-muted-foreground">
            {isMac ? "⌘" : "Ctrl"}+K
          </kbd>
        </button>

        {/* Right: Tariff + Partner + Notifications + Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Search mobile */}
          <button
            onClick={openCommandPalette}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground"
            aria-label="Поиск"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Tariff badge with days */}
          <button
            onClick={() => d.tabNavigation.setActiveTab("subscription" as any)}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-primary/10 rounded-full border border-primary/20 hover:bg-primary/15 transition-colors"
          >
            <CreditCard className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary">
              {planLabel}
              {daysRemaining !== null && planName !== 'free' && (
                <span className="ml-1 text-primary/70">— {daysRemaining} дн.</span>
              )}
            </span>
          </button>

          {/* Radio */}
          {showRadio && <RadioPlayerButton />}

          {/* Новости платформы */}
          {showAnnouncements && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hover:scale-105 transition-transform">
                  <AnnouncementsBell />
                </div>
              </TooltipTrigger>
              <TooltipContent>Новости платформы</TooltipContent>
            </Tooltip>
          )}


          {/* Notifications */}
          {organizationId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hover:scale-105 transition-transform">
                  <OrgNotifications organizationId={organizationId} />
                </div>
              </TooltipTrigger>
              <TooltipContent>Уведомления об обучении</TooltipContent>
            </Tooltip>
          )}

          {/* Profile avatar */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                 <DropdownMenuTrigger asChild>
                  <button className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 hover:scale-105 transition-all font-bold text-sm overflow-hidden">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Аватар" className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Профиль</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52 rounded-xl">
              <DropdownMenuItem onClick={() => d.tabNavigation.setActiveTab("profile" as any)} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <User className="w-4 h-4" />
                Профиль
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => d.tabNavigation.setActiveTab("org-documents" as any)} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <FileText className="w-4 h-4" />
                Документы школы
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => d.tabNavigation.setActiveTab("subscription" as any)} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <CreditCard className="w-4 h-4" />
                Тариф и оплата
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  try {
                    localStorage.setItem("whats-new-last-seen", String(Date.now()));
                  } catch {
                    // The destination still opens when local storage is unavailable.
                  }
                  d.tabNavigation.setActiveTab("whats-new" as any);
                }}
                className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary"
              >
                <Star className="w-4 h-4" />
                <span className="flex-1">Что нового</span>
                {newIndicators.whatsNew > 0 && (
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: "hsl(var(--warning))" }}
                    aria-label="Есть новое"
                  />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate("/help")}
                className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary"
              >
                <HelpCircle className="w-4 h-4" />
                Помощь
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => d.setShowOnboarding?.(true)}
                className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary"
              >
                <PlayCircle className="w-4 h-4" />
                Перезапустить тур
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={d.handleLogout} className="rounded-lg gap-2.5 py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="w-4 h-4" />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Compact contextual actions stay visible: no hidden hover-only controls. */}
      {!isCoursesFirstRun && (
        <QuickActionChips />
      )}

      {/* Sub-header: breadcrumbs + page title + action buttons */}
      {activeTab !== "course-details" && (
        <div className="flex items-center justify-between px-4 lg:px-6 h-12 border-t border-border/50 bg-card/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            {breadcrumb && (
              <nav aria-label="Хлебные крошки" className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                <button
                  onClick={() => d.tabNavigation.setActiveTab("home")}
                  className="hover:text-primary transition-colors truncate"
                >
                  {customName || organizationName || "Школа"}
                </button>
                <span className="opacity-50">›</span>
                <span className="hidden sm:inline">
                  <SectionBreadcrumbDropdown
                    section={getSectionId()}
                    label={breadcrumb.section}
                    activeTab={activeTab}
                  />
                </span>
                <span className="opacity-50 hidden sm:inline">›</span>
                <span className="font-display text-sm font-semibold text-foreground/85 truncate">
                  {breadcrumb.page}
                </span>
              </nav>
            )}
          </div>

        </div>
      )}
    </header>
  );
}
