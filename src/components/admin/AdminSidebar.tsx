import { 
  BarChart3, Building2, Users, Crown, 
  LogOut, Shield, Settings, FileText, Terminal, Store, HeadphonesIcon, Briefcase, Bot, Megaphone, MessageSquare, Gift, Sparkles
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { HelpButton } from "@/components/onboarding/HelpButton";
import { useAdminUnreadChats } from "@/hooks/useAdminUnreadChats";

export type AdminTabType = 
  | "analytics" 
  | "organizations" 
  | "tariffs"
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
          {/* Organizations */}
          <button onClick={() => handleTabClick("organizations")} className={tabButtonClass("organizations")}>
            <Building2 className="w-5 h-5" />
            Организации
          </button>
          
          {/* Tariffs */}
          <button onClick={() => handleTabClick("tariffs")} className={tabButtonClass("tariffs")}>
            <Crown className="w-5 h-5" />
            Тарифы
          </button>
          
          {/* Users */}
          <button onClick={() => handleTabClick("users")} className={tabButtonClass("users")}>
            <Users className="w-5 h-5" />
            Пользователи
          </button>
          
          {/* Content (Blog + Subscribers + Testimonials) */}
          <button onClick={() => handleTabClick("content")} className={tabButtonClass("content")}>
            <FileText className="w-5 h-5" />
            Контент
          </button>

          {/* Marketplace */}
          <button onClick={() => handleTabClick("marketplace")} className={tabButtonClass("marketplace")}>
            <Store className="w-5 h-5" />
            Маркетплейс
          </button>

          {/* Sales */}
          <button onClick={() => handleTabClick("sales")} className={tabButtonClass("sales")}>
            <Briefcase className="w-5 h-5" />
            Продажи
          </button>

          {/* AI */}
          <button onClick={() => handleTabClick("ai")} className={tabButtonClass("ai")}>
            <Bot className="w-5 h-5" />
            ИИ-провайдеры
          </button>

          {/* Analytics */}
          <button onClick={() => handleTabClick("analytics")} className={tabButtonClass("analytics")}>
            <BarChart3 className="w-5 h-5" />
            Аналитика
          </button>

          {/* Support */}
          <button onClick={() => handleTabClick("support")} className={tabButtonClass("support")}>
            <HeadphonesIcon className="w-5 h-5" />
            Поддержка
          </button>

          {/* Broadcast */}
          <button onClick={() => handleTabClick("broadcast")} className={tabButtonClass("broadcast")}>
            <Megaphone className="w-5 h-5" />
            Рассылка
          </button>

          {/* Referrals */}
          <button onClick={() => handleTabClick("referrals")} className={tabButtonClass("referrals")}>
            <Gift className="w-5 h-5" />
            Партнёры
          </button>

          {/* Chats */}
          <button onClick={() => handleTabClick("chats")} className={tabButtonClass("chats")}>
            <MessageSquare className="w-5 h-5" />
            Чаты
            {unreadChats > 0 && (
              <span className="ml-auto bg-destructive text-destructive-foreground text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                {unreadChats > 99 ? "99+" : unreadChats}
              </span>
            )}
          </button>

          {/* Dev Tools */}
          <button onClick={() => handleTabClick("devtools")} className={tabButtonClass("devtools")}>
            <Terminal className="w-5 h-5" />
            Dev Tools
          </button>

          {/* Platform Updates */}
          <button onClick={() => handleTabClick("updates")} className={tabButtonClass("updates")}>
            <Sparkles className="w-5 h-5" />
            Обновления
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
