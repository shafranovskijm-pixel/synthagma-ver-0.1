import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, FileSpreadsheet, Menu, CreditCard, HelpCircle, User, LogOut, Handshake, Sparkles, ShoppingBag, Settings, FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { showLimitToast } from "@/utils/limitToast";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
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
      case "organizations": return "Компании";
      case "library": return "Хранилище";
      case "stats": return "Статистика";
      case "links": return "Ссылки регистрации";
      case "documents": return "Документооборот";
      case "journals": return "Журналы";
      case "labor-safety": return "Охрана труда";
      case "services": return "Магазин курсов";
      case "settings": return "Настройки";
      case "payments": return "Финансы";
      case "subscription": return "Тариф";
      case "chats": return "Чаты";
      case "frdo": return "ФИС ФРДО";
      case "profile": return "Профиль";
      default: return "";
    }
  };

  

  return (
    <header className="sticky top-0 z-30 bg-card border-b border-border">
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
              <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg" />
            ) : (
              <SigmaLogo size="sm" showText={false} />
            )}
            <span className="font-display font-bold text-sm hidden sm:inline">{customName || organizationName || "СИНТАГМА"}</span>
          </div>
        </div>

        {/* Right: Tariff + Partner + Notifications + Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
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

          {/* Partner program — icon only */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => d.tabNavigation.setActiveTab("profile" as any)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Handshake className="w-4.5 h-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Партнёрам</TooltipContent>
          </Tooltip>

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
              <DropdownMenuItem onClick={() => d.tabNavigation.setActiveTab("settings" as any)} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <Settings className="w-4 h-4" />
                Настройки
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => d.tabNavigation.setActiveTab("org-documents" as any)} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <FileText className="w-4 h-4" />
                Документы
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => d.tabNavigation.setActiveTab("whats-new" as any)} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <Sparkles className="w-4 h-4" />
                Что нового?
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("https://t.me/sintagma_support", "_blank")} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <HelpCircle className="w-4 h-4" />
                Помощь
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

      {/* Hero banner with theme swiper */}
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

      {/* Sub-header: page title + action buttons */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-12 border-t border-border/50 bg-card/95 backdrop-blur-sm">
        <h1 className="font-display text-base font-semibold text-foreground/80">
          {getPageTitle()}
        </h1>

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
        </div>
      </div>
    </header>
  );
}
