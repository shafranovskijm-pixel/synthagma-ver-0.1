import { 
  GraduationCap, BookOpen, Users, BarChart3, Settings, LogOut, 
  Link, Library, FileText, FileSpreadsheet, ShoppingBag, 
  ChevronRight, ChevronDown, Building2, ClipboardList, 
  AlertCircle, Award, FileCheck
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import type { MenuSettings } from "@/types";

export type TabType = 
  | "courses" 
  | "organizations" 
  | "students" 
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
  | "services" 
  | "settings" 
  | "frdo" 
  | "diagnostics";

interface OrgSidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  organizationName: string;
  isFrdoEnabled: boolean;
  menuSettings: MenuSettings;
  isEnabled: (feature: string) => boolean;
  isDocumentsMenuOpen: boolean;
  setIsDocumentsMenuOpen: (open: boolean) => void;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
}

export function OrgSidebar({
  activeTab,
  setActiveTab,
  organizationName,
  isFrdoEnabled,
  menuSettings,
  isEnabled,
  isDocumentsMenuOpen,
  setIsDocumentsMenuOpen,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  onLogout
}: OrgSidebarProps) {
  
  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  const tabButtonClass = (tab: TabType | TabType[]) => {
    const isActive = Array.isArray(tab) 
      ? tab.includes(activeTab) 
      : activeTab === tab;
    return `w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
    }`;
  };

  const subTabButtonClass = (tab: TabType) => {
    return `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors ${
      activeTab === tab ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
    }`;
  };

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border 
      flex flex-col transform transition-transform duration-300
      lg:translate-x-0 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Logo */}
      <div className="p-6 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <SigmaLogo size="lg" showText={false} />
          <div>
            <span className="font-display font-bold text-lg">СИНТАГМА</span>
            <div className="text-xs text-muted-foreground truncate max-w-[140px]">{organizationName}</div>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto scrollbar-hide">
        <div className="space-y-2">
          {/* Courses */}
          {isEnabled("courses") && (
            <button onClick={() => handleTabClick("courses")} className={tabButtonClass("courses")}>
              <BookOpen className="w-5 h-5" />
              Курсы
            </button>
          )}
          
          {/* Companies */}
          {isEnabled("companies") && (
            <button onClick={() => handleTabClick("organizations")} className={tabButtonClass("organizations")}>
              <Building2 className="w-5 h-5" />
              Компании
            </button>
          )}
          
          {/* Students */}
          {isEnabled("students") && (
            <button onClick={() => handleTabClick("students")} className={tabButtonClass("students")}>
              <Users className="w-5 h-5" />
              Ученики
            </button>
          )}
          
          {/* Library */}
          {menuSettings.showLibrary && isEnabled("library") && (
            <button onClick={() => handleTabClick("library")} className={tabButtonClass("library")}>
              <Library className="w-5 h-5" />
              Библиотека
            </button>
          )}
          
          {/* Stats */}
          {menuSettings.showStats && (
            <button onClick={() => handleTabClick("stats")} className={tabButtonClass("stats")}>
              <BarChart3 className="w-5 h-5" />
              Статистика
            </button>
          )}
          
          {/* Links */}
          {menuSettings.showLinks && isEnabled("links") && (
            <button onClick={() => handleTabClick("links")} className={tabButtonClass("links")}>
              <Link className="w-5 h-5" />
              Ссылки регистрации
            </button>
          )}
          
          {/* Documents with submenu */}
          {menuSettings.showDocuments && isEnabled("documents") && (
            <Collapsible open={isDocumentsMenuOpen} onOpenChange={setIsDocumentsMenuOpen}>
              <CollapsibleTrigger asChild>
                <button 
                  onClick={() => handleTabClick("documents")}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-colors ${
                    activeTab.startsWith("documents") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5" />
                    Документы
                  </div>
                  {isDocumentsMenuOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 space-y-1 mt-1">
                {isEnabled("docs_orders") && (
                  <button onClick={() => handleTabClick("documents-orders")} className={subTabButtonClass("documents-orders")}>
                    <Users className="w-4 h-4" />
                    Приказы зач./отч.
                  </button>
                )}
                <button onClick={() => handleTabClick("documents-protocols")} className={subTabButtonClass("documents-protocols")}>
                  <ClipboardList className="w-4 h-4" />
                  Протоколы АК
                </button>
                <button onClick={() => handleTabClick("documents-certificates")} className={subTabButtonClass("documents-certificates")}>
                  <Award className="w-4 h-4" />
                  Удостоверения
                </button>
                <button onClick={() => handleTabClick("documents-diplomas")} className={subTabButtonClass("documents-diplomas")}>
                  <GraduationCap className="w-4 h-4" />
                  Дипломы
                </button>
                <button onClick={() => handleTabClick("documents-testimonials")} className={subTabButtonClass("documents-testimonials")}>
                  <FileCheck className="w-4 h-4" />
                  Свидетельства
                </button>
              </CollapsibleContent>
            </Collapsible>
          )}
          
          {/* Journals */}
          {isEnabled("journals") && (
            <button onClick={() => handleTabClick("journals")} className={tabButtonClass("journals")}>
              <ClipboardList className="w-5 h-5" />
              Журналы
            </button>
          )}
          
          {/* FRDO */}
          {isFrdoEnabled && isEnabled("frdo") && (
            <button onClick={() => handleTabClick("frdo")} className={tabButtonClass("frdo")}>
              <FileSpreadsheet className="w-5 h-5" />
              ФИС ФРДО
            </button>
          )}
          
          {/* Diagnostics */}
          {isEnabled("settings") && (
            <button onClick={() => handleTabClick("diagnostics")} className={tabButtonClass("diagnostics")}>
              <AlertCircle className="w-5 h-5" />
              Диагностика
            </button>
          )}
          
          {/* Settings */}
          {isEnabled("settings") && (
            <button onClick={() => handleTabClick("settings")} className={tabButtonClass("settings")}>
              <Settings className="w-5 h-5" />
              Настройки
            </button>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border flex-shrink-0 bg-card space-y-1">
        {menuSettings.showServices && isEnabled("services") && (
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
        <button 
          onClick={onLogout} 
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Выйти
        </button>
      </div>
    </aside>
  );
}
