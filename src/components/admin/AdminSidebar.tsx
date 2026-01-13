import { 
  BarChart3, Building2, Users, ShoppingBag, Sparkles, 
  LogOut, Shield, Settings, FileText
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";

export type AdminTabType = 
  | "analytics" 
  | "organizations" 
  | "orders" 
  | "users" 
  | "features"
  | "blog"
  | "settings";

interface AdminSidebarProps {
  activeTab: AdminTabType;
  setActiveTab: (tab: AdminTabType) => void;
  userEmail?: string;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
}

export function AdminSidebar({
  activeTab,
  setActiveTab,
  userEmail,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  onLogout
}: AdminSidebarProps) {
  
  const handleTabClick = (tab: AdminTabType) => {
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  const tabButtonClass = (tab: AdminTabType) => {
    return `w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
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
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Администратор
            </div>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto scrollbar-hide">
        <div className="space-y-2">
          {/* Analytics */}
          <button onClick={() => handleTabClick("analytics")} className={tabButtonClass("analytics")}>
            <BarChart3 className="w-5 h-5" />
            Аналитика
          </button>
          
          {/* Organizations */}
          <button onClick={() => handleTabClick("organizations")} className={tabButtonClass("organizations")}>
            <Building2 className="w-5 h-5" />
            Организации
          </button>
          
          {/* Orders */}
          <button onClick={() => handleTabClick("orders")} className={tabButtonClass("orders")}>
            <ShoppingBag className="w-5 h-5" />
            Заявки на курсы
          </button>
          
          {/* Users */}
          <button onClick={() => handleTabClick("users")} className={tabButtonClass("users")}>
            <Users className="w-5 h-5" />
            Пользователи
          </button>
          
          {/* Features */}
          <button onClick={() => handleTabClick("features")} className={tabButtonClass("features")}>
            <Sparkles className="w-5 h-5" />
            Функции системы
          </button>
          
          {/* Blog */}
          <button onClick={() => handleTabClick("blog")} className={tabButtonClass("blog")}>
            <FileText className="w-5 h-5" />
            Блог
          </button>
          
          {/* Settings - always visible */}
          <button onClick={() => handleTabClick("settings")} className={tabButtonClass("settings")}>
            <Settings className="w-5 h-5" />
            Настройки
          </button>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border flex-shrink-0 bg-card space-y-3">
        {userEmail && (
          <div className="px-4 py-2 text-xs text-muted-foreground truncate">
            {userEmail}
          </div>
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
