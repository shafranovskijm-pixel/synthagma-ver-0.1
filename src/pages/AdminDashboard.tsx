import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { AdminSidebar, type AdminTabType } from "@/components/admin/AdminSidebar";
import { AdminDashboardHeader } from "@/components/admin/AdminDashboardHeader";
import { AdminDashboardFooter } from "@/components/admin/AdminDashboardFooter";
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
import { AdminFinanceOverview } from "@/components/admin/AdminFinanceOverview";
import { AdminStaffTab } from "@/components/admin/AdminStaffTab";
import { AdminStorageOverview } from "@/components/admin/AdminStorageOverview";
import { useAdminBranding } from "@/hooks/useAdminBranding";
import { supabase } from "@/integrations/supabase/client";
import { getStoredThemeId, getThemeById, type AdminTheme } from "@/constants/admin-themes";
import { ThemeAnimations, getStoredAnimationLevel, type AnimationLevel } from "@/components/ui/ThemeAnimations";
import { AtmosphericBleed } from "@/components/ui/AtmosphericBleed";


const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTabType>("organizations");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openOrgId, setOpenOrgId] = useState<string | null>(null);
  const [pendingExpandContractId, setPendingExpandContractId] = useState<string | null>(null);
  const adminBranding = useAdminBranding();

  // Visual theme
  const [activeTheme, setActiveTheme] = useState<AdminTheme | null>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id) || null : null;
  });
  const [animLevel, setAnimLevel] = useState<AnimationLevel>(getStoredAnimationLevel);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      setActiveTheme(id ? getThemeById(id) || null : null);
    };
    const animHandler = (e: Event) => setAnimLevel((e as CustomEvent).detail);
    window.addEventListener("visual-theme-change", handler);
    window.addEventListener("visual-animation-change", animHandler);
    return () => {
      window.removeEventListener("visual-theme-change", handler);
      window.removeEventListener("visual-animation-change", animHandler);
    };
  }, []);

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

  const handleNotificationClick = async (n: any) => {
    if (!n.is_read) {
      await supabase.from("admin_notifications").update({ is_read: true }).eq("id", n.id);
      fetchNotifications();
    }
    if (n.type === "invoice" && n.related_entity_id) {
      setOpenOrgId(n.related_entity_id);
      setActiveTab("organizations");
    } else if (n.type === "signature") {
      // Открываем нужный договор инлайн внутри вкладки "Биллинг"
      if (n.related_entity_id) {
        setActiveTab("billing");
        // Сбрасываем, чтобы повторный клик по тому же уведомлению снова сработал
        setPendingExpandContractId(null);
        setTimeout(() => setPendingExpandContractId(n.related_entity_id), 50);
        return;
      }
      setActiveTab("billing");
    }
  };

  return (
    <div
      className={`min-h-screen bg-background flex flex-col relative ${activeTheme?.bgClass || ''}`}
      style={activeTheme?.id === 'turquoise' ? {
        background: 'linear-gradient(to bottom, #d4f5ef 0%, #8fd8ca 12%, #4db8a8 25%, #2a8a80 40%, #1a5a58 55%, #0f3a3e 70%, #0c2a30 85%, #050e12 100%)',
      } : undefined}
    >
      {/* Theme animations */}
      {activeTheme && <ThemeAnimations animation={activeTheme.animation} level={animLevel} />}
      {activeTheme && (
        <AtmosphericBleed
          bannerUrl={activeTheme.bannerUrl}
          blur={activeTheme.atmosphereBlur}
          opacity={activeTheme.atmosphereOpacity}
          sharp={activeTheme.atmosphereSharp}
        />
      )}
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
      <main className="lg:pl-[88px] flex-1 flex flex-col min-h-screen">
        {/* Header with hero banner */}
        <AdminDashboardHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          userEmail={user?.email}
          onLogout={handleSignOut}
          onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAllRead={markAllRead}
          onNotificationClick={handleNotificationClick}
          branding={adminBranding.branding}
          onCoverUpload={adminBranding.handleCoverUpload}
        />

        {/* Content */}
        <div className="p-4 lg:p-8 flex-1">
          {activeTab === "analytics" && <AdminAnalytics />}
          {activeTab === "organizations" && <OrganizationsManager openOrgId={openOrgId} onOpenOrgHandled={() => setOpenOrgId(null)} />}
          {activeTab === "marketplace" && <AdminMarketplaceManager />}
          {activeTab === "sales" && <SalesManager />}
          {activeTab === "billing" && <AdminBillingOverview pendingExpandContractId={pendingExpandContractId} />}
          {activeTab === "finance" && <AdminFinanceOverview />}
          {activeTab === "ai" && <AISettingsManager />}
          {activeTab === "users" && <UsersManager />}
          {activeTab === "content" && <BlogManager />}
          {activeTab === "support" && <SupportRequestsManager />}
          {activeTab === "broadcast" && <BroadcastManager />}
          {activeTab === "chats" && <AdminChatsManager />}
          {activeTab === "referrals" && <ReferralsManager />}
          
          {activeTab === "devtools" && <DevToolsPanel />}
          {activeTab === "updates" && <PlatformUpdatesManager />}
          {activeTab === "storage" && <AdminStorageOverview />}
          {activeTab === "settings" && <AdminSettings />}
        </div>

        {/* Footer */}
        <AdminDashboardFooter />
      </main>

    </div>
  );
};

export default AdminDashboard;
