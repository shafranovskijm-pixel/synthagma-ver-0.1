import { useCallback, useMemo } from "react";
import { 
  BookOpen, Users, BarChart3, Settings, LogOut, 
  Link, Library, FileText, FileSpreadsheet, ShoppingBag, 
  Building2, ClipboardList
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { useMenuCustomization, MenuItem } from "@/hooks/useMenuCustomization";
import { DraggableMenu, MenuSettingsButton, HiddenItemsRestore } from "@/components/ui/DraggableMenu";
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
  | "frdo";

const defaultOrgMenuItems: MenuItem[] = [
  { id: "courses", label: "Курсы", icon: "BookOpen", visible: true, order: 0 },
  { id: "organizations", label: "Компании", icon: "Building2", visible: true, order: 1 },
  { id: "students", label: "Ученики", icon: "Users", visible: true, order: 2 },
  { id: "library", label: "Библиотека", icon: "Library", visible: true, order: 3 },
  { id: "stats", label: "Статистика", icon: "BarChart3", visible: true, order: 4 },
  { id: "links", label: "Ссылки регистрации", icon: "Link", visible: true, order: 5 },
  { id: "documents", label: "Документы", icon: "FileText", visible: true, order: 6 },
  { id: "journals", label: "Журналы", icon: "ClipboardList", visible: true, order: 7 },
  { id: "frdo", label: "ФИС ФРДО", icon: "FileSpreadsheet", visible: true, order: 8 },
  { id: "services", label: "Магазин курсов", icon: "ShoppingBag", visible: true, order: 9 },
  { id: "settings", label: "Настройки", icon: "Settings", visible: true, order: 10 },
];

interface OrgSidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  organizationName: string;
  isFrdoEnabled: boolean;
  menuSettings: MenuSettings;
  isEnabled: (feature: string) => boolean;
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
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  onLogout
}: OrgSidebarProps) {
  const menuCustomization = useMenuCustomization("organization", defaultOrgMenuItems);

  const renderMenuIcon = useCallback((iconName: string) => {
    const iconClass = "w-5 h-5";
    switch (iconName) {
      case "BookOpen": return <BookOpen className={iconClass} />;
      case "Building2": return <Building2 className={iconClass} />;
      case "Users": return <Users className={iconClass} />;
      case "Library": return <Library className={iconClass} />;
      case "BarChart3": return <BarChart3 className={iconClass} />;
      case "Link": return <Link className={iconClass} />;
      case "FileText": return <FileText className={iconClass} />;
      case "ClipboardList": return <ClipboardList className={iconClass} />;
      case "FileSpreadsheet": return <FileSpreadsheet className={iconClass} />;
      case "ShoppingBag": return <ShoppingBag className={iconClass} />;
      case "Settings": return <Settings className={iconClass} />;
      default: return <BookOpen className={iconClass} />;
    }
  }, []);

  // Filter items based on feature flags
  const filteredItems = useMemo(() => {
    return menuCustomization.items.filter(item => {
      switch (item.id) {
        case "courses": return isEnabled("courses");
        case "organizations": return isEnabled("companies");
        case "students": return isEnabled("students");
        case "library": return menuSettings.showLibrary && isEnabled("library");
        case "stats": return menuSettings.showStats;
        case "links": return menuSettings.showLinks && isEnabled("links");
        case "documents": return menuSettings.showDocuments && isEnabled("documents");
        case "journals": return isEnabled("journals");
        case "frdo": return isFrdoEnabled && isEnabled("frdo");
        case "services": return menuSettings.showServices && isEnabled("services");
        case "settings": return isEnabled("settings");
        default: return true;
      }
    });
  }, [menuCustomization.items, isEnabled, menuSettings, isFrdoEnabled]);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId as TabType);
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
            <div className="text-xs text-muted-foreground truncate max-w-[140px]">{organizationName}</div>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto scrollbar-hide">
        <DraggableMenu
          items={filteredItems}
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
            hiddenItems={menuCustomization.hiddenItems.filter(item => {
              switch (item.id) {
                case "courses": return isEnabled("courses");
                case "organizations": return isEnabled("companies");
                case "students": return isEnabled("students");
                case "library": return menuSettings.showLibrary && isEnabled("library");
                case "stats": return menuSettings.showStats;
                case "links": return menuSettings.showLinks && isEnabled("links");
                case "documents": return menuSettings.showDocuments && isEnabled("documents");
                case "journals": return isEnabled("journals");
                case "frdo": return isFrdoEnabled && isEnabled("frdo");
                case "services": return menuSettings.showServices && isEnabled("services");
                case "settings": return isEnabled("settings");
                default: return true;
              }
            })}
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
      <div className="p-4 border-t border-border flex-shrink-0 bg-card space-y-1">
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
