import { useRef, useState, useCallback, useEffect } from "react";
import { Menu, Bell, User, LogOut, Settings, FileText, Sparkles, HelpCircle, ImagePlus, Wand2, Users, Check, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import defaultCoverImg from "@/assets/default-org-cover.jpg";
import type { AdminTabType } from "./AdminSidebar";
import { HelpCenterDialog, useHelpCenterDialog } from "@/components/shared/HelpCenterDialog";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";

interface AdminDashboardHeaderProps {
  activeTab: AdminTabType;
  setActiveTab: (tab: AdminTabType) => void;
  userEmail?: string;
  onLogout: () => void;
  onMobileMenuOpen: () => void;
  notifications: any[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onNotificationClick?: (notification: any) => void;
  branding: {
    coverUrl: string | null;
    logoUrl: string | null;
    customName: string;
    customSubtitle: string;
    coverPosition: string;
  };
  onCoverUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const TAB_TITLES: Record<AdminTabType, string> = {
  analytics: "Аналитика",
  organizations: "Организации",
  marketplace: "Маркетплейс",
  sales: "Продажи",
  billing: "Биллинг",
  ai: "ИИ-провайдеры",
  broadcast: "Рассылка",
  chats: "Чаты",
  referrals: "Партнёры",
  users: "Пользователи",
  content: "Контент",
  support: "Поддержка",
  devtools: "Developer Tools",
  updates: "Обновления",
  settings: "Настройки",
  staff: "Сотрудники" };

function getInitials(email?: string): string {
  return (email || "A")[0].toUpperCase();
}

export function AdminDashboardHeader({
  activeTab,
  setActiveTab,
  userEmail,
  onLogout,
  onMobileMenuOpen,
  notifications,
  unreadCount,
  onMarkAllRead,
  onNotificationClick,
  branding,
  onCoverUpload }: AdminDashboardHeaderProps) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const helpDialog = useHelpCenterDialog();

  // Theme-aware banner
  const [themeBannerUrl, setThemeBannerUrl] = useState<string | null>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id)?.bannerUrl || null : null;
  });
  const [themeBannerPosition, setThemeBannerPosition] = useState<string | undefined>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id)?.bannerPosition : undefined;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      const theme = id ? getThemeById(id) : null;
      setThemeBannerUrl(theme?.bannerUrl || null);
      setThemeBannerPosition(theme?.bannerPosition);
    };
    window.addEventListener("visual-theme-change", handler);
    return () => window.removeEventListener("visual-theme-change", handler);
  }, []);

  const handleGenerateAICover = useCallback(async () => {
    if (isGeneratingCover) return;
    setIsGeneratingCover(true);
    toast.info("Генерируем обложку с ИИ...", { duration: 10000 });
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover", {
        body: { type: "admin" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Обложка сгенерирована!");
      window.location.reload();
    } catch (e: any) {
      console.error("AI cover generation error:", e);
      toast.error(e?.message || "Ошибка генерации обложки");
    } finally {
      setIsGeneratingCover(false);
    }
  }, [isGeneratingCover]);

  const displayCover = themeBannerUrl || branding.coverUrl || defaultCoverImg;
  const displayName = branding.customName || "СИНТАГМА";
  const initials = getInitials(userEmail);

  return (
    <>
    <header className="sticky top-0 z-30 bg-card border-b border-border">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-14">
        <div className="flex items-center gap-3">
          <button onClick={onMobileMenuOpen} className="lg:hidden p-2 rounded-lg hover:bg-secondary">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg" />
            ) : (
              <SigmaLogo size="sm" showText={false} />
            )}
            <div className="hidden sm:block">
              <span className="font-display font-bold text-sm">{displayName}</span>
              <span className="text-[10px] text-muted-foreground block -mt-0.5">Администратор</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-secondary relative" title="Уведомления">
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px]">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">Уведомления</p>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onMarkAllRead}>
                    <Check className="w-3 h-3 mr-1" />
                    Прочитать все
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-80">
                {notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет уведомлений</p>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-b border-border last:border-0 ${!n.is_read ? "bg-primary/5" : ""} ${onNotificationClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                      onClick={() => onNotificationClick?.(n)}
                    >
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.message && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{n.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ru })}
                      </p>
                    </div>
                  ))
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Profile avatar */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 hover:scale-105 transition-all font-bold text-sm">
                    {initials}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Профиль</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52 rounded-xl">
              <DropdownMenuItem onClick={() => setActiveTab("settings")} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <User className="w-4 h-4" />
                Профиль
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("settings")} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <Settings className="w-4 h-4" />
                Настройки
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("billing")} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <FileText className="w-4 h-4" />
                Документооборот
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("referrals")} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <Gift className="w-4 h-4" />
                Партнёры
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("updates")} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <Sparkles className="w-4 h-4" />
                Что нового?
              </DropdownMenuItem>
              <DropdownMenuItem onClick={helpDialog.openHelp} className="rounded-lg gap-2.5 py-2.5 focus:bg-primary/10 focus:text-primary">
                <HelpCircle className="w-4 h-4" />
                Помощь
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="rounded-lg gap-2.5 py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="w-4 h-4" />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Hero banner */}
      <div className="relative w-full h-36 lg:h-48 overflow-hidden">
        <img
          src={displayCover}
          alt="Обложка"
          className="w-full h-full"
          style={{
            objectFit: (themeBannerUrl || branding.coverUrl) ? ((branding.coverPosition === "contain" && !themeBannerUrl) ? "contain" : "cover") : "cover",
            objectPosition: themeBannerPosition || (
              branding.coverPosition === "top" ? "center top"
              : branding.coverPosition === "bottom" ? "center bottom"
              : "center center"
            ),
            backgroundColor: "hsl(var(--muted))" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        <div className="absolute bottom-4 left-6 flex items-end gap-3">
          {branding.logoUrl && (
            <img src={branding.logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/90 p-1 shadow-md" />
          )}
          <div className="text-white">
            <h2 className="text-lg lg:text-2xl font-bold drop-shadow-md leading-tight">{displayName}</h2>
            {branding.customSubtitle && <p className="text-xs lg:text-sm opacity-80 mt-0.5">{branding.customSubtitle}</p>}
          </div>
        </div>

        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button
            onClick={handleGenerateAICover}
            disabled={isGeneratingCover}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isGeneratingCover ? <SigmaSpinner size="xs" className=".5 .5" /> : <Wand2 className="w-3.5 h-3.5" />}
            {isGeneratingCover ? "Генерация..." : "Сгенерировать с ИИ"}
          </button>
          <button
            onClick={() => coverInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-lg transition-colors"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Изменить обложку
          </button>
        </div>
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onCoverUpload} />
      </div>

      {/* Sub-header: page title */}
      <div className="flex items-center px-4 lg:px-6 h-12 border-t border-border/50 bg-card/95 backdrop-blur-sm">
        <h1 className="font-display text-base font-semibold text-foreground/80">
          {TAB_TITLES[activeTab] || ""}
        </h1>
      </div>
    </header>
    <HelpCenterDialog open={helpDialog.open} onOpenChange={helpDialog.setOpen} />
    </>
  );
}
