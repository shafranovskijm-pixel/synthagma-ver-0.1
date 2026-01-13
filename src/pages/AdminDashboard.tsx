import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { AdminSidebar, type AdminTabType } from "@/components/admin/AdminSidebar";
import { OrganizationsManager } from "@/components/admin/OrganizationsManager";
import { UsersManager } from "@/components/admin/UsersManager";
import { AdminAnalytics } from "@/components/admin/AdminAnalytics";
import { ServiceOrdersManager } from "@/components/admin/ServiceOrdersManager";
import { SystemFeaturesManager } from "@/components/admin/SystemFeaturesManager";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { BlogManager } from "@/components/admin/BlogManager";

const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<AdminTabType>("analytics");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "analytics": return "Аналитика";
      case "organizations": return "Организации";
      case "orders": return "Заявки на курсы";
      case "users": return "Пользователи";
      case "features": return "Функции системы";
      case "blog": return "Блог";
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
          {activeTab === "orders" && <ServiceOrdersManager />}
          {activeTab === "users" && <UsersManager />}
          {activeTab === "features" && <SystemFeaturesManager />}
          {activeTab === "blog" && <BlogManager />}
          {activeTab === "settings" && <AdminSettings />}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
