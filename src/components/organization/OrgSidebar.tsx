import { useState, useCallback, useMemo } from "react";
import { 
  BookOpen, Users, BarChart3, Settings, LogOut, 
  Link, FileText, FileSpreadsheet, ShoppingBag, 
  Building2, ClipboardList, HardHat, HardDrive, CreditCard, Lock, MessageCircle
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { HelpButton } from "@/components/onboarding/HelpButton";
import { organizationHelpTips } from "@/constants/onboardingSteps";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
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
  | "services" 
  | "settings" 
  | "frdo";

// Map sidebar tabs to their feature category keys
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
  settings: "settings",
};

export function OrgSidebar() {
  const d = useOrgDashboard();
  const activeTab = d.tabNavigation.activeTab;
  const setActiveTab = d.tabNavigation.setActiveTab;
  const organizationName = d.organizationName;
  const customName = d.branding.brandingSettings.customName;
  const customSubtitle = d.branding.brandingSettings.customSubtitle;
  const logoUrl = d.branding.brandingSettings.logoUrl;
  const isFrdoEnabled = d.isFrdoEnabled;
  const menuSettings = d.dashboardSettings.menuSettings;
  const isEnabled = d.isEnabled;
  const isMobileSidebarOpen = d.isMobileSidebarOpen;
  const setIsMobileSidebarOpen = d.setIsMobileSidebarOpen;
  const onLogout = d.handleLogout;

  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);

  const handleTabClick = (tab: TabType) => {
    const category = tabCategoryMap[tab];
    if (category && !isEnabled(category as any)) {
      setUpgradeDialogOpen(true);
      return;
    }
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  const handleGoToSubscription = () => {
    setUpgradeDialogOpen(false);
    setActiveTab("subscription");
    setIsMobileSidebarOpen(false);
  };

  const tabButtonClass = (tab: TabType | TabType[], locked?: boolean) => {
    const isActive = Array.isArray(tab) 
      ? tab.includes(activeTab) 
      : activeTab === tab;
    return `w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
      locked 
        ? "text-muted-foreground/50 hover:bg-secondary/50" 
        : isActive 
          ? "bg-primary/10 text-primary" 
          : "text-muted-foreground hover:bg-secondary"
    }`;
  };

  const isLocked = (category: string) => !isEnabled(category as any);

  return (
    <>
      <aside
        role="navigation"
        aria-label="Основная навигация"
        className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border 
        flex flex-col transition-transform duration-300
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-lg" />
            ) : (
              <SigmaLogo size="lg" showText={false} />
            )}
            <div className="min-w-0">
              <span className="font-display font-bold text-lg block truncate">{customName || 'СИНТАГМА'}</span>
              <div className="text-xs text-muted-foreground truncate">{customSubtitle || organizationName}</div>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto scrollbar-hide">
          <div className="space-y-2">
            {menuSettings.showCourses !== false && (
              <button data-onboarding="courses" onClick={() => handleTabClick("courses")} className={tabButtonClass("courses", isLocked("courses"))} aria-label="Курсы" aria-current={activeTab === "courses" ? "page" : undefined}>
                <BookOpen className="w-5 h-5" aria-hidden="true" />
                Курсы
                {isLocked("courses") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}
            
            {menuSettings.showCompanies !== false && (
              <button onClick={() => handleTabClick("organizations")} className={tabButtonClass("organizations", isLocked("companies"))} aria-label="Компании" aria-current={activeTab === "organizations" ? "page" : undefined}>
                <Building2 className="w-5 h-5" aria-hidden="true" />
                Компании
                {isLocked("companies") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}
            
            {menuSettings.showStudents !== false && (
              <button data-onboarding="students" onClick={() => handleTabClick("students")} className={tabButtonClass("students", isLocked("students"))} aria-label="Ученики" aria-current={activeTab === "students" ? "page" : undefined}>
                <Users className="w-5 h-5" aria-hidden="true" />
                Ученики
                {isLocked("students") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}
            
            
            {menuSettings.showLibrary && (
              <button onClick={() => handleTabClick("library")} className={tabButtonClass("library", isLocked("library"))}>
                <HardDrive className="w-5 h-5" />
                Хранилище
                {isLocked("library") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}
            
            {menuSettings.showStats && (
              <button onClick={() => handleTabClick("stats")} className={tabButtonClass("stats")}>
                <BarChart3 className="w-5 h-5" />
                Статистика
              </button>
            )}
            
            {menuSettings.showLinks && (
              <button onClick={() => handleTabClick("links")} className={tabButtonClass("links", isLocked("links"))}>
                <Link className="w-5 h-5" />
                Ссылки регистрации
                {isLocked("links") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}
            
            {menuSettings.showDocuments && (
              <button data-onboarding="documents" onClick={() => handleTabClick("documents")} className={tabButtonClass("documents", isLocked("documents"))}>
                <FileText className="w-5 h-5" />
                Документы
                {isLocked("documents") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}
            
            {menuSettings.showJournals !== false && (
              <button onClick={() => handleTabClick("journals")} className={tabButtonClass("journals", isLocked("journals"))}>
                <ClipboardList className="w-5 h-5" />
                Журналы
                {isLocked("journals") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}
            
            <button onClick={() => handleTabClick("labor-safety")} className={tabButtonClass("labor-safety", isLocked("labor_safety"))}>
              <HardHat className="w-5 h-5" />
              Охрана труда
              {isLocked("labor_safety") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
            </button>

            
            {menuSettings.showFrdo !== false && (
              <button onClick={() => handleTabClick("frdo")} className={tabButtonClass("frdo", isLocked("frdo"))}>
                <FileSpreadsheet className="w-5 h-5" />
                ФИС ФРДО
                {isLocked("frdo") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}

            <button onClick={() => handleTabClick("subscription")} className={tabButtonClass("subscription")} aria-label="Тариф">
              <CreditCard className="w-5 h-5" aria-hidden="true" />
              Тариф
            </button>
            
            {(
              <button data-onboarding="settings" onClick={() => handleTabClick("settings")} className={tabButtonClass("settings", isLocked("settings"))}>
                <Settings className="w-5 h-5" />
                Настройки
                {isLocked("settings") && <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />}
              </button>
            )}

            <button onClick={() => handleTabClick("chats")} className={tabButtonClass("chats")} aria-label="Чаты" aria-current={activeTab === "chats" ? "page" : undefined}>
              <MessageCircle className="w-5 h-5" aria-hidden="true" />
              Чаты
              {d.unreadChatsCount > 0 && (
                <span className="ml-auto bg-destructive text-destructive-foreground text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                  {d.unreadChatsCount > 99 ? "99+" : d.unreadChatsCount}
                </span>
              )}
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border flex-shrink-0 bg-card space-y-1">
          {menuSettings.showServices && (
            <button 
              onClick={() => handleTabClick("services")} 
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition-colors ${
                activeTab === "services" ? "bg-primary/10 text-primary" : "text-muted-foreground/70 hover:bg-secondary/50 hover:text-muted-foreground"
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Магазин курсов
            </button>
          )}
          <HelpButton tips={organizationHelpTips[activeTab] || organizationHelpTips.default} />
          <button 
            onClick={onLogout} 
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Выйти из аккаунта"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            Выйти
          </button>
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
