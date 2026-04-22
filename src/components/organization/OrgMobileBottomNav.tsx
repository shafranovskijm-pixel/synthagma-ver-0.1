import { BookOpen, Users, MessageCircle, Briefcase, Menu } from "lucide-react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { cn } from "@/lib/utils";
import type { TabType } from "./OrgSidebar";

interface NavItem {
  id: TabType | "__menu__";
  icon: typeof BookOpen;
  label: string;
}

const ITEMS: NavItem[] = [
  { id: "courses", icon: BookOpen, label: "Курсы" },
  { id: "students", icon: Users, label: "Ученики" },
  { id: "chats", icon: MessageCircle, label: "Чаты" },
  { id: "sales", icon: Briefcase, label: "Продажи" },
  { id: "__menu__", icon: Menu, label: "Меню" },
];

export function OrgMobileBottomNav() {
  const d = useOrgDashboard();
  const activeTab = d.tabNavigation.activeTab;
  const unread = d.unreadChatsCount ?? 0;

  const handleClick = (id: NavItem["id"]) => {
    if (id === "__menu__") {
      d.setIsMobileSidebarOpen(true);
      return;
    }
    d.tabNavigation.setActiveTab(id as TabType);
  };

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Главное меню"
    >
      <ul className="grid grid-cols-5 h-14">
        {ITEMS.map((item) => {
          const isActive = item.id !== "__menu__" && activeTab === item.id;
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
