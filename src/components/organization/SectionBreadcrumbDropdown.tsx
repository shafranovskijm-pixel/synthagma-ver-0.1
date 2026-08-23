import { ChevronDown } from "lucide-react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import type { TabType } from "@/components/organization/OrgSidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SectionId = "learning" | "clients" | "tools" | "settings";

const SECTION_ITEMS: Record<SectionId, { tab: TabType; label: string }[]> = {
  learning: [
    { tab: "courses", label: "Курсы" },
    { tab: "homework-review", label: "Домашние работы" },
    { tab: "labor-safety", label: "Охрана труда" },
  ],
  clients: [
    { tab: "students", label: "Ученики" },
    { tab: "organizations", label: "Клиенты-компании" },
    { tab: "sales", label: "Продажи" },
    { tab: "chats", label: "Чаты" },
  ],
  tools: [
    { tab: "stats", label: "Статистика" },
    { tab: "links", label: "Ссылки регистрации" },
    { tab: "library", label: "Хранилище" },
    { tab: "journals", label: "Журналы" },
    { tab: "documents", label: "Документы учеников" },
    { tab: "frdo", label: "ФИС ФРДО" },
  ],
  settings: [
    { tab: "profile", label: "Профиль" },
    { tab: "subscription", label: "Тариф и оплата" },
    { tab: "org-documents", label: "Документы школы" },
    { tab: "whats-new", label: "Что нового" },
  ],
};

interface SectionBreadcrumbDropdownProps {
  section: SectionId | null;
  label: string;
  activeTab: string;
}

export function SectionBreadcrumbDropdown({ section, label, activeTab }: SectionBreadcrumbDropdownProps) {
  const d = useOrgDashboard();
  const { canSeeOrgTab, loading: permissionsLoading } = useStaffPermissions();

  if (!section) {
    return <span className="text-muted-foreground/80">{label}</span>;
  }

  const menu = d.dashboardSettings?.menuSettings;
  const featureEnabled = (featureId: string) =>
    d.isEnabled(featureId as Parameters<typeof d.isEnabled>[0]);
  const canOpen = (tab: TabType) => {
    if (!permissionsLoading && !canSeeOrgTab(tab)) return false;

    switch (tab) {
      case "courses":
        return menu?.showCourses !== false && featureEnabled("courses");
      case "students":
        return menu?.showStudents !== false && featureEnabled("students");
      case "organizations":
        return menu?.showCompanies !== false && featureEnabled("companies");
      case "library":
        return menu?.showLibrary !== false && featureEnabled("library");
      case "stats":
        return menu?.showStats === true;
      case "links":
        return menu?.showLinks === true && featureEnabled("links");
      case "labor-safety":
        return menu?.showLaborSafety !== false && featureEnabled("labor_safety");
      case "services":
        return menu?.showServices !== false && featureEnabled("services");
      case "documents":
      case "org-documents":
        return menu?.showDocuments === true && featureEnabled("documents");
      case "journals":
        return menu?.showJournals !== false && featureEnabled("journals");
      case "frdo":
        return menu?.showFrdo !== false && featureEnabled("frdo");
      case "sales":
        return menu?.showSales === true && d.subscriptionLimits?.limits.salesCrmEnabled === true;
      case "subscription":
        return menu?.showSubscription !== false;
      default:
        return true;
    }
  };
  const items = (SECTION_ITEMS[section] || []).filter((item) => canOpen(item.tab));

  if (items.length === 0) {
    return <span className="text-muted-foreground/80">{label}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-0.5 text-muted-foreground/80 hover:text-primary transition-colors">
          <span>{label}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-xl">
        {items.map((it) => (
          <DropdownMenuItem
            key={it.tab}
            onClick={() => d.tabNavigation.setActiveTab(it.tab)}
            className={
              "rounded-lg gap-2 py-2 focus:bg-primary/10 focus:text-primary " +
              (activeTab === it.tab ? "bg-primary/10 text-primary font-medium" : "")
            }
          >
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
