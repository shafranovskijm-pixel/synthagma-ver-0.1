import { useState, useEffect, useCallback } from "react";
import { Menu, Bell, LogOut, User, ChevronDown, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AdminSidebar, type AdminTabType } from "@/components/admin/AdminSidebar";
import { OrganizationsManager } from "@/components/admin/OrganizationsManager";
import { UsersManager } from "@/components/admin/UsersManager";
import { AdminAnalytics } from "@/components/admin/AdminAnalytics";
import { AdminMarketplaceManager } from "@/components/admin/AdminMarketplaceManager";
import { SupportRequestsManager } from "@/components/admin/SupportRequestsManager";

import { AdminSettings } from "@/components/admin/AdminSettings";
import { BlogManager } from "@/components/admin/BlogManager";

import { DevToolsPanel } from "@/components/admin/DevToolsPanel";
import { SalesManager } from "@/components/admin/SalesManager";
import { AISettingsManager } from "@/components/admin/AISettingsManager";
import { BroadcastManager } from "@/components/admin/BroadcastManager";
import { AdminChatsManager } from "@/components/admin/AdminChatsManager";
import { ReferralsManager } from "@/components/admin/ReferralsManager";
import { PlatformUpdatesManager } from "@/components/admin/PlatformUpdatesManager";
import { AdminBillingOverview } from "@/components/admin/AdminBillingOverview";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<AdminTabType>("organizations");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications(data || []);
    setUnreadCount((data || []).filter((n: any) => !n.is_read).length);
  }, []);

  useEffect(() => {
    fetchNotifications();
    const channel = supabase
      .channel("admin-notifications-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchNotifications]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("admin_notifications").update({ is_read: true }).in("id", unreadIds);
    fetchNotifications();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "analytics": return "Аналитика";
      case "organizations": return "Организации";
      case "marketplace": return "Маркетплейс";
      case "sales": return "Продажи";
      case "billing": return "Биллинг";
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
            <div className="w-9" />
          </div>
        </header>

        {/* Desktop Header with profile */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border items-center justify-between px-8 h-16">
          <div>
            <h1 className="font-display text-xl font-bold">{getTabTitle()}</h1>
            <p className="text-xs text-muted-foreground">Панель администратора</p>
          </div>
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="p-2 rounded-lg hover:bg-secondary relative"
                  title="Уведомления"
                >
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px]">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold">Уведомления</p>
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
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
                        className={`px-4 py-3 border-b border-border last:border-0 ${!n.is_read ? "bg-primary/5" : ""}`}
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
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-secondary transition-colors outline-none">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                    {(user?.email || "A")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium max-w-[160px] truncate">{user?.email}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setActiveTab("settings")} className="gap-2">
                  <User className="w-4 h-4" />
                  Настройки
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-destructive">
                  <LogOut className="w-4 h-4" />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 lg:p-8">

          {/* Tab Content */}
          {activeTab === "analytics" && <AdminAnalytics />}
          {activeTab === "organizations" && <OrganizationsManager />}
          
          {activeTab === "marketplace" && <AdminMarketplaceManager />}
          {activeTab === "sales" && <SalesManager />}
          {activeTab === "billing" && <AdminBillingOverview />}
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
