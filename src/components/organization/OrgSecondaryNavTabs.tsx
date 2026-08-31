import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { User, FileText, Sparkles, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { HelpCenterDialog } from "@/components/shared/HelpCenterDialog";
import type { TabType } from "@/components/organization/OrgSidebar";

interface NavItem {
  icon: React.ElementType;
  label: string;
  tab: TabType | "__help_dialog__";
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: User, label: "Профиль", tab: "profile" as TabType, path: "/organization/profile" },
  { icon: FileText, label: "Документы", tab: "org-documents" as TabType, path: "/organization/documents" },
  { icon: Sparkles, label: "Что нового?", tab: "whats-new" as TabType, path: "/organization/whats-new" },
  { icon: HelpCircle, label: "Помощь", tab: "__help_dialog__", path: "__help_dialog__" },
];

interface OrgSecondaryNavTabsProps {
  embedded?: boolean;
}

/**
 * Дублирующее горизонтальное меню разделов «Профиль / Настройки / Документы / Что нового / Помощь».
 * Появляется под баннером на страницах этих разделов и повторяет содержимое выпадающего меню в шапке.
 */
export function OrgSecondaryNavTabs({ embedded }: OrgSecondaryNavTabsProps) {
  const d = useOrgDashboard();
  const navigate = useNavigate();
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);

  const activeTab = d.tabNavigation.activeTab;

  const isActive = (item: NavItem) => {
    if (item.path === "__help_dialog__") return false;
    if (embedded) return activeTab === item.tab;
    return location.pathname === item.path;
  };

  const handleClick = (item: NavItem) => {
    if (item.path === "__help_dialog__") {
      setHelpOpen(true);
      return;
    }
    if (embedded) {
      d.tabNavigation.setActiveTab(item.tab as TabType);
    } else {
      navigate(item.path);
    }
  };

  return (
    <>
      <div className="mb-4 lg:mb-6">
        <div className="overflow-x-auto">
          <nav
            role="tablist"
            aria-label="Разделы профиля и настроек"
            className="inline-flex items-center gap-1 p-1 bg-card rounded-2xl border border-border/60 shadow-sm min-w-max"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <button
                  key={item.path}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleClick(item)}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm whitespace-nowrap transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-md font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
                  )}
                  style={active ? { boxShadow: "0 4px 14px hsl(var(--primary) / 0.35)" } : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
      <HelpCenterDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
