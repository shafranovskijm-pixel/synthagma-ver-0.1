import { useState } from "react";
import { 
  BarChart3, Building2, Users, 
  LogOut, Shield, Settings, FileText, Terminal, Store, HeadphonesIcon, Briefcase, Bot, Megaphone, MessageSquare, Gift, Sparkles, Wrench, ChevronDown
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { HelpButton } from "@/components/onboarding/HelpButton";
import { useAdminUnreadChats } from "@/hooks/useAdminUnreadChats";
import { cn } from "@/lib/utils";

export type AdminTabType = 
  | "analytics" 
  | "organizations" 
  | "users"
  | "content"
  | "marketplace"
  | "sales"
  | "ai"
  | "broadcast"
  | "chats"
  | "referrals"
  | "support"
  | "devtools"
  | "updates"
  | "settings";

const PLATFORM_TABS: AdminTabType[] = ["content", "ai", "devtools"];

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
  
  const unreadChats = useAdminUnreadChats();
  const [platformOpen, setPlatformOpen] = useState(() => PLATFORM_TABS.includes(activeTab));

  const handleTabClick = (tab: AdminTabType) => {
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  const tabButtonClass = (tab: AdminTabType) => {
    return `w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
      activeTab === tab ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
    }`;
  };

  const subTabButtonClass = (tab: AdminTabType) => {
    return `w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
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
          <button onClick={() => handleTabClick("organizations")} className={tabButtonClass("organizations")}>
            <Building2 className="w-5 h-5" />
            Организации
          </button>
          
          
          <button onClick={() => handleTabClick("users")} className={tabButtonClass("users")}>
            <Users className="w-5 h-5" />
            Пользователи
          </button>

          <button onClick={() => handleTabClick("marketplace")} className={tabButtonClass("marketplace")}>
            <Store className="w-5 h-5" />
            Маркетплейс
          </button>

          <button onClick={() => handleTabClick("sales")} className={tabButtonClass("sales")}>
            <Briefcase className="w-5 h-5" />
            Продажи
          </button>

          <button onClick={() => handleTabClick("analytics")} className={tabButtonClass("analytics")}>
            <BarChart3 className="w-5 h-5" />
            Аналитика
          </button>

          <button onClick={() => handleTabClick("support")} className={tabButtonClass("support")}>
            <HeadphonesIcon className="w-5 h-5" />
            Поддержка
          </button>

          <button onClick={() => handleTabClick("broadcast")} className={tabButtonClass("broadcast")}>
            <Megaphone className="w-5 h-5" />
            Рассылка
          </button>

          <button onClick={() => handleTabClick("referrals")} className={tabButtonClass("referrals")}>
            <Gift className="w-5 h-5" />
            Партнёры
          </button>

          <button onClick={() => handleTabClick("chats")} className={tabButtonClass("chats")}>
            <MessageSquare className="w-5 h-5" />
            Чаты
            {unreadChats > 0 && (
              <span className="ml-auto bg-destructive text-destructive-foreground text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                {unreadChats > 99 ? "99+" : unreadChats}
              </span>
            )}
          </button>

          {/* Platform group: Контент, ИИ-провайдеры, Dev Tools */}
          <div>
            <button
              onClick={() => setPlatformOpen(prev => !prev)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors",
                PLATFORM_TABS.includes(activeTab)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <Wrench className="w-5 h-5" />
              Платформа
              <ChevronDown className={cn("w-4 h-4 ml-auto transition-transform", platformOpen && "rotate-180")} />
            </button>
            {platformOpen && (
              <div className="mt-1 space-y-1">
                <button onClick={() => handleTabClick("content")} className={subTabButtonClass("content")}>
                  <FileText className="w-4 h-4" />
                  Контент
                </button>
                <button onClick={() => handleTabClick("ai")} className={subTabButtonClass("ai")}>
                  <Bot className="w-4 h-4" />
                  ИИ-провайдеры
                </button>
                <button onClick={() => handleTabClick("devtools")} className={subTabButtonClass("devtools")}>
                  <Terminal className="w-4 h-4" />
                  Dev Tools
                </button>
              </div>
            )}
          </div>

          <button onClick={() => handleTabClick("updates")} className={tabButtonClass("updates")}>
            <Sparkles className="w-5 h-5" />
            Обновления
          </button>
          
          <button onClick={() => handleTabClick("settings")} className={tabButtonClass("settings")}>
            <Settings className="w-5 h-5" />
            Настройки
          </button>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border flex-shrink-0 bg-card space-y-3">
        <HelpButton tips={[]} variant="sidebar" />
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
