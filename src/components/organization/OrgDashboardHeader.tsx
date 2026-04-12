import { Button } from "@/components/ui/button";
import { Plus, FileSpreadsheet, Menu, CreditCard, Bell, HelpCircle, User, LogOut, Handshake } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { showLimitToast } from "@/utils/limitToast";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

export function OrgDashboardHeader() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  
  const activeTab = d.tabNavigation.activeTab;
  const organizationName = d.organizationName;
  const customName = d.branding.brandingSettings.customName;
  const logoUrl = d.branding.brandingSettings.logoUrl;
  const coverUrl = d.branding.brandingSettings.coverUrl;
  const coverPosition = d.branding.brandingSettings.coverPosition;

  const [showNotifications, setShowNotifications] = useState(false);

  const handleStudentAction = (action: () => void) => {
    const result = d.checkLimit('student');
    if (!result.allowed) {
      showLimitToast(result.message);
      return;
    }
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
              <img src={logoUrl} alt="Logo" className="w-7 h-7 object-contain rounded-lg" />
            ) : (
              <SigmaLogo size="sm" showText={false} />
            )}
            <span className="font-display font-bold text-sm">{customName || organizationName || "СИНТАГМА"}</span>
          </div>
        </div>

        {/* Right: Tariff + Partner + Notifications + Profile */}
        <div className="flex items-center gap-2">
          {/* Tariff badge */}
          <button
            onClick={() => d.tabNavigation.setActiveTab("subscription" as any)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20 hover:bg-primary/15 transition-colors"
          >
            <CreditCard className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">
              {d.subscriptionLimits?.plan === 'free' ? 'Бесплатный' : d.subscriptionLimits?.plan === 'start' ? 'Старт' : d.subscriptionLimits?.plan === 'standard' ? 'Стандарт' : 'Тариф'}
            </span>
          </button>

          {/* Partner program */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="hidden lg:flex rounded-full gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-3"
            onClick={() => navigate("/partner")}
          >
            <Handshake className="w-4 h-4" />
            Партнёрам
          </Button>

          {/* Notifications */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-8 w-8"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="w-4 h-4" />
            </Button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50">
                <div className="p-4">
                  <h3 className="font-semibold text-sm mb-2">Уведомления</h3>
                  <p className="text-xs text-muted-foreground">Нет новых уведомлений</p>
                </div>
              </div>
            )}
          </div>

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                <User className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl">
              <DropdownMenuItem onClick={() => d.tabNavigation.setActiveTab("settings" as any)} className="rounded-lg gap-2">
                <User className="w-4 h-4" />
                Профиль
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("https://t.me/sintagma_support", "_blank")} className="rounded-lg gap-2">
                <HelpCircle className="w-4 h-4" />
                Помощь
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={d.handleLogout} className="rounded-lg gap-2 text-destructive">
                <LogOut className="w-4 h-4" />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Hero banner with cover image */}
      {coverUrl && (
        <div className="relative w-full h-36 lg:h-52 overflow-hidden">
          <img 
            src={coverUrl} 
            alt="Обложка организации" 
            className="w-full h-full"
            style={{
              objectFit: coverPosition === 'contain' ? 'contain' : 'cover',
              objectPosition: 
                coverPosition === 'top' ? 'center top' 
                : coverPosition === 'bottom' ? 'center bottom' 
                : 'center center',
              backgroundColor: 'hsl(var(--muted))'
            }}
          />
          {/* Gradient overlay with org info */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-6 text-white">
            <h2 className="text-xl lg:text-2xl font-bold drop-shadow-md">{customName || organizationName}</h2>
          </div>
        </div>
      )}

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
            <Button className="btn-gradient rounded-xl gap-2 text-xs" size="sm" onClick={() => navigate("/course-builder")}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Создать курс</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
