import { useMemo } from "react";
import { BookOpen, Building2, FileText, Home, MessageCircle, ShoppingBag, Users, Menu } from "lucide-react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { cn } from "@/lib/utils";
import type { TabType } from "./OrgSidebar";

interface NavItem {
  id: TabType | "__menu__";
  icon: typeof BookOpen;
  label: string;
}

export function OrgMobileBottomNav() {
  const d = useOrgDashboard();
  const { canSeeOrgTab, loading: permissionsLoading } = useStaffPermissions();
  const activeTab = d.tabNavigation.activeTab;
  const unread = d.unreadChatsCount ?? 0;
  const menuSettings = d.dashboardSettings.menuSettings;

  const items = useMemo<NavItem[]>(() => {
    const allowed = (id: TabType) => permissionsLoading || canSeeOrgTab(id);
    const candidates: Array<NavItem & { visible: boolean }> = [
      {
        id: "home",
        icon: Home,
        label: "Главная",
        visible: true,
      },
      {
        id: "courses",
        icon: BookOpen,
        label: "Курсы",
        visible: menuSettings.showCourses !== false && d.isEnabled("courses"),
      },
      {
        id: "students",
        icon: Users,
        label: "Ученики",
        visible: menuSettings.showStudents !== false && d.isEnabled("students"),
      },
      {
        id: "documents",
        icon: FileText,
        label: "Документы",
        visible: menuSettings.showDocuments === true && d.isEnabled("documents"),
      },
      {
        id: "organizations",
        icon: Building2,
        label: "Компании",
        visible: menuSettings.showCompanies === true && d.isEnabled("companies"),
      },
      { id: "chats", icon: MessageCircle, label: "Чаты", visible: true },
      {
        id: "services",
        icon: ShoppingBag,
        label: "Программы",
        visible: menuSettings.showServices !== false && d.isEnabled("services"),
      },
    ];

    const primary = candidates
      .filter((item) => item.visible && allowed(item.id as TabType))
      .slice(0, 4)
      .map(({ visible: _visible, ...item }) => item);

    return [...primary, { id: "__menu__", icon: Menu, label: "Меню" }];
  }, [canSeeOrgTab, d, menuSettings, permissionsLoading]);

  const activeIsInPrimary = items.some((item) => item.id !== "__menu__" && item.id === activeTab);

  const handleClick = (id: NavItem["id"]) => {
    if (id === "__menu__") {
      d.setIsMobileSidebarOpen(true);
      return;
    }
    d.tabNavigation.setActiveTab(id as TabType);
  };

  // The sidebar is the active mobile navigation surface. Hiding the bottom
  // bar prevents two competing menus from overlapping inside the same modal
  // layer and keeps the drawer visually solid and Windows-like.
  if (d.isMobileSidebarOpen) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Главное меню"
    >
      <ul className="grid h-14" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const isActive = item.id === "__menu__" ? !activeIsInPrimary : activeTab === item.id;
          return (
            <li key={item.id}>
              <button
                onClick={() => handleClick(item.id)}
                className={cn(
                  "w-full h-full flex flex-col items-center justify-center gap-0.5 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
              >
                <span className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.id === "chats" && unread > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
