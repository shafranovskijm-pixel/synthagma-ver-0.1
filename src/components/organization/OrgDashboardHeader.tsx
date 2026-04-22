import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, FileSpreadsheet, Menu, CreditCard, HelpCircle, User, LogOut, Sparkles, ShoppingBag, Settings, FileText, Briefcase, Search, PlayCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { showLimitToast } from "@/utils/limitToast";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { OrgNotifications } from "./OrgNotifications";
import { HeroBannerSwiper } from "@/components/shared/HeroBannerSwiper";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RadioPlayerButton } from "@/components/radio/RadioPlayerButton";

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
  const { theme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const activeTab = d.tabNavigation.activeTab;
  const organizationName = d.organizationName;
  const organizationId = d.organizationId;
  const customName = d.branding.brandingSettings.customName;
  const customSubtitle = d.branding.brandingSettings.customSubtitle;
  const logoUrl = d.branding.brandingSettings.logoUrl;

  // Tariff info
  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const planName = d.subscriptionLimits?.plan;
  const { user: authUser } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    supabase.from("organizations").select("paid_until").eq("id", organizationId).single()
      .then(({ data }) => { if (data?.paid_until) setPaidUntil(data.paid_until); });
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

  const handleStudentAction = (action: () => void) => {
    const result = d.checkLimit('student');
    if (!result.allowed) { showLimitToast(result.message); return; }
    action();
  };

  const getPageTitle = () => {
    switch (activeTab) {
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
      case "payments": return "Финансы";
      case "subscription": return "Тариф";
      case "chats": return "Чаты";
      case "frdo": return "ФИС ФРДО";
      case "profile": return "Профиль";
      case "homework-review": return "Домашние работы";
      case "ai-tutors": return "ИИ-уроки";
      case "sales": return "Продажи";
      case "org-documents": return "Документы школы";
      case "whats-new": return "Что нового";
      default: return "";
    }
  };

  // Breadcrumbs: section group → page
  const getBreadcrumb = (): { section: string; page: string } | null => {
    const learning = ["courses", "homework-review", "ai-tutors", "labor-safety"];
    const clients = ["students", "organizations", "sales", "chats"];
    const tools = ["stats", "links", "library", "journals", "frdo", "documents", "services"];
    const settings = ["profile", "subscription", "payments", "org-documents", "whats-new", "settings"];
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
    const learning = ["courses", "homework-review", "ai-tutors", "labor-safety"];
    const clients = ["students", "organizations", "sales", "chats"];
    const tools = ["stats", "links", "library", "journals", "frdo", "documents", "services"];
    const settings = ["profile", "subscription", "payments", "org-documents", "whats-new", "settings"];
    if (learning.includes(activeTab)) return "learning";
    if (clients.includes(activeTab)) return "clients";
    if (tools.includes(activeTab)) return "tools";
    if (settings.includes(activeTab)) return "settings";
    return null;
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);


  return (
    <header data-org-sticky-header className="sticky top-0 z-30 bg-card border-b border-border">
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
          <RadioPlayerButton />

          {/* Notifications */}
          {organizationId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hover:scale-105 transition-transform">
                  <OrgNotifications organizationId={organizationId} />
                </div>
              </TooltipTrigger>
              <TooltipContent>Уведомления</TooltipContent>
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

      {/* Hero banner with theme swiper — hidden on course details page (course banner takes its place) */}
      {activeTab !== "course-details" && (
        <HeroBannerSwiper>
          <div className="absolute bottom-4 left-6 flex items-end gap-3 z-10">
            {logoUrl && (
              <img src={logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/90 p-1 shadow-md" />
            )}
            <div className="text-white">
              <span className="text-xs font-medium opacity-70 block mb-0.5">Онлайн-обучение</span>
              <h2 className="text-lg lg:text-2xl font-bold drop-shadow-md leading-tight">{customName || organizationName}</h2>
              {customSubtitle && <p className="text-xs lg:text-sm opacity-80 mt-0.5">{customSubtitle}</p>}
            </div>
          </div>
        </HeroBannerSwiper>
      )}

      {/* Sub-header: breadcrumbs + page title + action buttons */}
      {activeTab !== "course-details" && (
        <div className="flex items-center justify-between px-4 lg:px-6 h-12 border-t border-border/50 bg-card/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            {breadcrumb && (
              <nav aria-label="Хлебные крошки" className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                <button
                  onClick={() => d.tabNavigation.setActiveTab("courses" as any)}
                  className="hover:text-primary transition-colors truncate"
                >
                  {customName || organizationName || "Школа"}
                </button>
                <span className="opacity-50">›</span>
                <span className="text-muted-foreground/80 hidden sm:inline">{breadcrumb.section}</span>
                <span className="opacity-50 hidden sm:inline">›</span>
                <span className="font-display text-sm font-semibold text-foreground/85 truncate">
                  {breadcrumb.page}
                </span>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "links" && (
              <Button className="btn-gradient rounded-xl gap-2 text-xs" size="sm" onClick={() => d.registrationLinks.setShowCreateLinkDialog(true)}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Создать ссылку</span>
              </Button>
            )}
            {activeTab === "students" && (
              <>
                <Button variant="outline" className="rounded-xl gap-2 text-xs" size="sm" onClick={() => handleStudentAction(() => d.setShowImportDialog(true))}>
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="hidden sm:inline">Импорт</span>
                </Button>
                <Button className="btn-gradient rounded-xl gap-2 text-xs" size="sm" onClick={() => handleStudentAction(() => d.studentManagement.setShowAddStudentDialog(true))}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Добавить</span>
                </Button>
              </>
            )}
            {activeTab === "courses" && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-xl gap-2 text-xs" onClick={() => d.tabNavigation.setActiveTab("services")}>
                  <ShoppingBag className="w-4 h-4" />
                  <span className="hidden sm:inline">Добавить из магазина</span>
                </Button>
                <Button className="btn-gradient rounded-xl gap-2 text-xs" size="sm" onClick={() => navigate("/course-builder")}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Создать курс</span>
                </Button>
              </div>
            )}
            {activeTab === "organizations" && (
              <Button className="btn-gradient rounded-xl gap-2 text-xs" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('org-add-company'))}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Добавить компанию</span>
              </Button>
            )}
            {activeTab === "sales" && (
              <Button className="btn-gradient rounded-xl gap-2 text-xs" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('org-sales-create-deal'))}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Новая сделка</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
