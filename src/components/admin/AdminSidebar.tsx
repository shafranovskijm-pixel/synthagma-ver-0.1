import { useCallback } from "react";
import { 
  BarChart3, Building2, Users, ShoppingBag, Sparkles, 
  LogOut, Shield, Settings
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { useMenuCustomization, MenuItem } from "@/hooks/useMenuCustomization";
import { DraggableMenu, MenuSettingsButton, HiddenItemsRestore } from "@/components/ui/DraggableMenu";

export type AdminTabType = 
  | "analytics" 
  | "organizations" 
  | "orders" 
  | "users" 
  | "features"
  | "settings";

const defaultAdminMenuItems: MenuItem[] = [
  { id: "analytics", label: "Аналитика", icon: "BarChart3", visible: true, order: 0 },
  { id: "organizations", label: "Организации", icon: "Building2", visible: true, order: 1 },
  { id: "orders", label: "Заявки на курсы", icon: "ShoppingBag", visible: true, order: 2 },
  { id: "users", label: "Пользователи", icon: "Users", visible: true, order: 3 },
  { id: "features", label: "Функции системы", icon: "Sparkles", visible: true, order: 4 },
  { id: "settings", label: "Настройки", icon: "Settings", visible: true, order: 5 },
];

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
  const menuCustomization = useMenuCustomization("admin", defaultAdminMenuItems);

  const renderMenuIcon = useCallback((iconName: string) => {
    const iconClass = "w-5 h-5";
    switch (iconName) {
      case "BarChart3": return <BarChart3 className={iconClass} />;
      case "Building2": return <Building2 className={iconClass} />;
      case "ShoppingBag": return <ShoppingBag className={iconClass} />;
      case "Users": return <Users className={iconClass} />;
      case "Sparkles": return <Sparkles className={iconClass} />;
      case "Settings": return <Settings className={iconClass} />;
      default: return <BarChart3 className={iconClass} />;
    }
  }, []);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId as AdminTabType);
    setIsMobileSidebarOpen(false);
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
        <DraggableMenu
          items={menuCustomization.items}
          activeItemId={activeTab}
          isEditMode={menuCustomization.isEditMode}
          setIsEditMode={menuCustomization.setIsEditMode}
          onReorder={menuCustomization.reorderItems}
          onHideItem={menuCustomization.hideItem}
          onItemClick={handleTabClick}
          renderIcon={renderMenuIcon}
        />
        
        {menuCustomization.isEditMode && (
          <HiddenItemsRestore
            hiddenItems={menuCustomization.hiddenItems}
            onShowItem={menuCustomization.showItem}
            onShowAll={menuCustomization.showAllItems}
            renderIcon={renderMenuIcon}
          />
        )}
        
        <div className="mt-4 pt-4 border-t border-border">
          <MenuSettingsButton
            isEditMode={menuCustomization.isEditMode}
            onToggle={() => menuCustomization.setIsEditMode(!menuCustomization.isEditMode)}
          />
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
