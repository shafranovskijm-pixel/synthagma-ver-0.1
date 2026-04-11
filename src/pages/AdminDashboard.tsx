import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { AdminSidebar, type AdminTabType } from "@/components/admin/AdminSidebar";
import { OrganizationsManager } from "@/components/admin/OrganizationsManager";
import { UsersManager } from "@/components/admin/UsersManager";
import { AdminAnalytics } from "@/components/admin/AdminAnalytics";
import { AdminMarketplaceManager } from "@/components/admin/AdminMarketplaceManager";
import { SupportRequestsManager } from "@/components/admin/SupportRequestsManager";

import { AdminSettings } from "@/components/admin/AdminSettings";
import { BlogManager } from "@/components/admin/BlogManager";
import { TariffsManager } from "@/components/admin/TariffsManager";
import { DevToolsPanel } from "@/components/admin/DevToolsPanel";
import { SalesManager } from "@/components/admin/SalesManager";
import { AISettingsManager } from "@/components/admin/AISettingsManager";
import { BroadcastManager } from "@/components/admin/BroadcastManager";
import { AdminChatsManager } from "@/components/admin/AdminChatsManager";
import { ReferralsManager } from "@/components/admin/ReferralsManager";
import { PlatformUpdatesManager } from "@/components/admin/PlatformUpdatesManager";

const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<AdminTabType>("organizations");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "analytics": return "Аналитика";
      case "organizations": return "Организации";
      case "tariffs": return "Тарифы";
      case "marketplace": return "Маркетплейс";
      case "sales": return "Продажи";
      case "ai": return "ИИ-провайдеры";
      case "broadcast": return "Рассылка";
      case "chats": return "Чаты";
      case "referrals": return "Партнёры";
      case "users": return "Пользователи";
      case "content": return "Контент";
      case "support": return "Поддержка";
      case "devtools": return "Developer Tools";
      case "updates": return "Обновления";
      case "settings": return "Настройки";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userEmail={user?.email}
        isMobileSidebarOpen={isMobileSidebarOpen}
        setIsMobileSidebarOpen={setIsMobileSidebarOpen}
        onLogout={handleSignOut}
      />

      {/* Main Content */}
      <main className="lg:pl-64 min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-4 h-14">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-secondary"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-semibold">{getTabTitle()}</h1>
            <div className="w-9" /> {/* Spacer for centering */}
          </div>
        </header>

        {/* Content */}
        <div className="p-4 lg:p-8">
          {/* Desktop Header */}
          <div className="hidden lg:block mb-6">
            <h1 className="font-display text-2xl font-bold">{getTabTitle()}</h1>
            <p className="text-muted-foreground">Панель администратора</p>
          </div>

          {/* Tab Content */}
          {activeTab === "analytics" && <AdminAnalytics />}
          {activeTab === "organizations" && <OrganizationsManager />}
          {activeTab === "tariffs" && <TariffsManager />}
          {activeTab === "marketplace" && <AdminMarketplaceManager />}
          {activeTab === "sales" && <SalesManager />}
          {activeTab === "ai" && <AISettingsManager />}
          {activeTab === "users" && <UsersManager />}
          {activeTab === "content" && <BlogManager />}
          {activeTab === "support" && <SupportRequestsManager />}
          {activeTab === "broadcast" && <BroadcastManager />}
          {activeTab === "chats" && <AdminChatsManager />}
          {activeTab === "referrals" && <ReferralsManager />}
          {activeTab === "devtools" && <DevToolsPanel />}
          {activeTab === "updates" && <PlatformUpdatesManager />}
          {activeTab === "settings" && <AdminSettings />}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
