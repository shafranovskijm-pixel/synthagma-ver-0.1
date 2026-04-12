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
import { OrgNotifications } from "@/components/organization/OrgNotifications";
import { useState } from "react";

export function OrgDashboardHeader() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  
  const activeTab = d.tabNavigation.activeTab;
  const organizationName = d.organizationName;
  const customName = d.branding.brandingSettings.customName;
  const logoUrl = d.branding.brandingSettings.logoUrl;

  const [showNotifications, setShowNotifications] = useState(false);

  const handleStudentAction = (action: () => void) => {
    const result = d.checkLimit('student');
    if (!result.allowed) {
      showLimitToast(result.message);
      return;
    }
    action();
  };

  // Page title based on active tab
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
    <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-4 lg:px-8 h-16">
        {/* Left: Mobile menu + Page title */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => d.setIsMobileSidebarOpen(true)} 
            className="lg:hidden p-2 rounded-lg hover:bg-secondary"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="hidden lg:flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg" />
            ) : (
              <SigmaLogo size="sm" showText={false} />
            )}
            <span className="font-display font-bold text-base">{customName || organizationName || "СИНТАГМА"}</span>
          </div>

          <div className="hidden lg:block h-6 w-px bg-border mx-1" />
          
          <h1 className="font-display text-lg font-semibold text-foreground/80">
            {getPageTitle()}
          </h1>
        </div>

        {/* Right: Actions + Tariff + Notifications + Profile */}
        <div className="flex items-center gap-2 lg:gap-3">
          {/* Tab-specific action buttons */}
          {activeTab === "links" && (
            <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" size="sm" onClick={() => d.registrationLinks.setShowCreateLinkDialog(true)}>
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
            <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" size="sm" onClick={() => navigate("/course-builder")}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Создать курс</span>
            </Button>
          )}

          {/* Partner program */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="hidden lg:flex rounded-xl gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/partner")}
          >
            <Handshake className="w-4 h-4" />
            Партнёрам
          </Button>

          {/* Tariff badge */}
          <button
            onClick={() => d.tabNavigation.setActiveTab("subscription" as any)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-xl border border-primary/20 hover:bg-primary/15 transition-colors"
          >
            <CreditCard className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">
              {d.subscriptionLimits?.plan === 'free' ? 'Бесплатный' : d.subscriptionLimits?.plan === 'start' ? 'Старт' : d.subscriptionLimits?.plan === 'standard' ? 'Стандарт' : 'Тариф'}
            </span>
          </button>

          {/* Notifications */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl h-9 w-9"
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
              <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
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
    </header>
  );
}
