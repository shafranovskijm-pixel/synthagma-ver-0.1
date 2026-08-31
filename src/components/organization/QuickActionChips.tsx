import { useMemo } from "react";
import {
  BarChart3,
  Building2,
  FileSpreadsheet,
  FolderOpen,
  Link2,
  Mail,
  MessageCircle,
  Plus,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useRecentActions } from "@/hooks/useOrgSidebarPinned";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isMailingEnabled } from "@/lib/mailing/mailingAccess";
import {
  organizationMailingPath,
  organizationTabPath,
} from "@/lib/organization/workspaceNavigation";
import { showLimitToast } from "@/utils/limitToast";

interface ActionDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Нативный URL-переход (React Router Link). Приоритетнее run(). */
  href?: string;
  run?: () => void;
  allowed: boolean;
}

/**
 * Чипы быстрых действий под омнибоксом.
 * Показывает только действия, относящиеся к открытому разделу. История влияет
 * на их порядок, но не может вернуть в шапку действие из другого раздела.
 */
export function QuickActionChips() {
  const d = useOrgDashboard();
  const { can } = useStaffPermissions();
  const { recent, track } = useRecentActions();
  const activeTab = String(d.tabNavigation.activeTab);
  const limits = d.subscriptionLimits?.limits;
  const mailingEnabled = isMailingEnabled(
    d.subscriptionLimits?.plan,
    limits?.emailCampaignsEnabled,
  );
  const allActions: Record<string, ActionDef> = useMemo(() => ({
    "create-course": {
      id: "create-course",
      label: "Создать курс",
      icon: Plus,
      allowed: can("courses.write"),
      run: () => {
        const result = d.checkLimit("course");
        if (!result.allowed) {
          showLimitToast(result.message);
          return;
        }
        d.tabNavigation.setActiveTab("courses");
        setTimeout(() => window.dispatchEvent(new CustomEvent('org-create-course')), 100);
      },
    },
    "add-student": {
      id: "add-student",
      label: "Добавить ученика",
      icon: Users,
      allowed: can("students.write"),
      run: () => {
        const result = d.checkLimit("student");
        if (!result.allowed) {
          showLimitToast(result.message);
          return;
        }
        d.tabNavigation.setActiveTab("students");
        setTimeout(() => d.studentManagement?.setShowAddStudentDialog?.(true), 100);
      },
    },
    "import-students": {
      id: "import-students",
      label: "Импорт учеников",
      icon: FileSpreadsheet,
      allowed: can("students.write"),
      run: () => {
        d.tabNavigation.setActiveTab("students");
        setTimeout(() => d.setShowImportDialog?.(true), 100);
      },
    },
    "student-groups": {
      id: "student-groups",
      label: "Открыть группы",
      icon: FolderOpen,
      allowed: can("students.read"),
      href: organizationTabPath("students"),
    },
    "marketplace": {
      id: "marketplace",
      label: "Добавить готовый",
      icon: ShoppingBag,
      allowed: can("services.read"),
      href: organizationTabPath("services"),
    },
    "add-company": {
      id: "add-company",
      label: "Добавить компанию",
      icon: Building2,
      allowed: can("companies.write"),
      run: () => {
        d.tabNavigation.setActiveTab("organizations");
        setTimeout(() => window.dispatchEvent(new CustomEvent("org-add-company")), 100);
      },
    },
    "create-registration-link": {
      id: "create-registration-link",
      label: "Создать ссылку",
      icon: Link2,
      allowed: can("companies.write"),
      run: () => {
        d.tabNavigation.setActiveTab("links");
        setTimeout(() => d.registrationLinks.setShowCreateLinkDialog(true), 100);
      },
    },
    mailing: {
      id: "mailing",
      label: "Рассылки",
      icon: Mail,
      allowed: mailingEnabled && can("sales.read"),
      href: organizationMailingPath("overview"),
    },
    chats: {
      id: "chats",
      label: "Открыть чаты",
      icon: MessageCircle,
      allowed: can("chats.read"),
      href: organizationTabPath("chats"),
    },
    reports: {
      id: "reports",
      label: "Открыть отчёты",
      icon: BarChart3,
      allowed: can("courses.read") && limits?.reportsEnabled === true,
      href: organizationTabPath("stats"),
    },
  }), [can, d, limits?.reportsEnabled, mailingEnabled]);

  // Два-три действия на раздел: это сохраняет шапку компактной и предсказуемой.
  const chips = useMemo<ActionDef[]>(() => {
    const bySection: Record<string, string[]> = {
      courses: ["create-course", "marketplace"],
      "course-details": ["create-course", "marketplace"],
      students: ["add-student", "import-students", "student-groups"],
      "student-details": ["add-student", "student-groups"],
      "group-folder": ["add-student", "student-groups"],
      organizations: ["add-company", "create-registration-link"],
      links: ["create-registration-link", "add-company"],
      documents: ["student-groups", "reports"],
      "org-documents": ["student-groups", "reports"],
      journals: ["student-groups", "reports"],
      frdo: ["student-groups", "reports"],
      chats: ["mailing", "student-groups"],
      communications: ["mailing", "chats"],
      stats: ["student-groups", "mailing"],
      services: ["create-course", "marketplace"],
    };
    const contextualIds = bySection[activeTab] ?? [];
    const allowedIds = contextualIds.filter((id) => allActions[id]?.allowed);
    const recentOrder = new Map(recent.map((item, index) => [item.id, index]));

    return allowedIds
      .map((id, index) => ({ action: allActions[id], index }))
      .sort((left, right) => {
        const leftRecent = recentOrder.get(left.action.id);
        const rightRecent = recentOrder.get(right.action.id);
        if (leftRecent === undefined && rightRecent === undefined) return left.index - right.index;
        if (leftRecent === undefined) return 1;
        if (rightRecent === undefined) return -1;
        return leftRecent - rightRecent;
      })
      .map(({ action }) => action)
      .slice(0, 3);
  }, [activeTab, recent, allActions]);

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-4 pb-2 -mt-1 animate-fade-in [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:justify-center">
      <span className="hidden shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium mr-1 sm:inline">
        Быстрые действия:
      </span>
      {chips.map((action) => {
        const Icon = action.icon;
        const chipClass =
          "inline-flex shrink-0 items-center gap-1.5 px-3 py-1 rounded-full bg-muted/40 hover:bg-primary/10 hover:text-primary border border-border/60 hover:border-primary/30 text-xs font-medium text-muted-foreground transition-all hover:scale-105";
        const content = (
          <>
            <Icon className="w-3.5 h-3.5" />
            {action.label}
          </>
        );

        if (action.href) {
          return (
            <Link
              key={action.id}
              to={action.href}
              data-testid={`quick-chip-${action.id}`}
              onClick={() => track({ id: action.id, label: action.label })}
              className={chipClass}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={action.id}
            type="button"
            data-testid={`quick-chip-${action.id}`}
            onClick={() => {
              track({ id: action.id, label: action.label });
              action.run?.();
            }}
            className={chipClass}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
