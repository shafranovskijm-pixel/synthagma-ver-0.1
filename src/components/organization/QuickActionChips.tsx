import { useMemo } from "react";
import { Plus, FileSpreadsheet, ShoppingBag, FileText, Send, Upload, Users, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useRecentActions, type RecentAction } from "@/hooks/useOrgSidebarPinned";

interface ActionDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

/**
 * Чипы быстрых действий под омнибоксом.
 * Показывает 4 самых частых/последних действия пользователя.
 * Если истории нет — показывает дефолтный набор по контексту.
 */
export function QuickActionChips() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  const { recent, track } = useRecentActions();

  const allActions: Record<string, ActionDef> = useMemo(() => ({
    "create-course": {
      id: "create-course",
      label: "Создать курс",
      icon: Plus,
      run: () => navigate("/course-builder"),
    },
    "add-student": {
      id: "add-student",
      label: "Добавить ученика",
      icon: Users,
      run: () => {
        d.tabNavigation.setActiveTab("students" as any);
        setTimeout(() => d.studentManagement?.setShowAddStudentDialog?.(true), 100);
      },
    },
    "import-students": {
      id: "import-students",
      label: "Импорт учеников",
      icon: FileSpreadsheet,
      run: () => {
        d.tabNavigation.setActiveTab("students" as any);
        setTimeout(() => d.setShowImportDialog?.(true), 100);
      },
    },
    "marketplace": {
      id: "marketplace",
      label: "Магазин курсов",
      icon: ShoppingBag,
      run: () => d.tabNavigation.setActiveTab("services" as any),
    },
    "send-proposal": {
      id: "send-proposal",
      label: "Отправить КП",
      icon: Send,
      run: () => d.tabNavigation.setActiveTab("sales" as any),
    },
    "upload-frdo": {
      id: "upload-frdo",
      label: "Загрузить ФРДО",
      icon: Upload,
      run: () => d.tabNavigation.setActiveTab("frdo" as any),
    },
    "documents": {
      id: "documents",
      label: "Документы",
      icon: FileText,
      run: () => d.tabNavigation.setActiveTab("documents" as any),
    },
    "ai-tutors": {
      id: "ai-tutors",
      label: "ИИ-уроки",
      icon: Sparkles,
      run: () => d.tabNavigation.setActiveTab("ai-tutors" as any),
    },
  }), [navigate, d]);

  // Сначала недавние, потом дополняем дефолтами до 4-х
  const chips = useMemo<ActionDef[]>(() => {
    const defaults = ["create-course", "add-student", "marketplace", "send-proposal"];
    const recentIds = recent.map((r) => r.id).filter((id) => allActions[id]);
    const merged = [...recentIds, ...defaults.filter((d) => !recentIds.includes(d))].slice(0, 4);
    return merged.map((id) => allActions[id]).filter(Boolean);
  }, [recent, allActions]);

  if (chips.length === 0) return null;

  return (
    <div className="hidden lg:flex items-center justify-center gap-2 px-4 pb-2 -mt-1 animate-fade-in">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium mr-1">
        Быстрые действия:
      </span>
      {chips.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => {
              track({ id: action.id, label: action.label });
              action.run();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/40 hover:bg-primary/10 hover:text-primary border border-border/60 hover:border-primary/30 text-xs font-medium text-muted-foreground transition-all hover:scale-105"
          >
            <Icon className="w-3.5 h-3.5" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
