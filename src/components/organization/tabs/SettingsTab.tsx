import { FileText, ChevronRight, ClipboardList, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

export function SettingsTab() {
  const d = useOrgDashboard();

  return (
    <div className="max-w-2xl space-y-4 lg:space-y-6">
      {/* Documents Section */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <FileText className="w-4 h-4 lg:w-5 lg:h-5" />
            Документооборот
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <p className="text-xs lg:text-sm text-muted-foreground mb-4">
            Управление документами, приказами, протоколами и сертификатами
          </p>
          <Button
            className="btn-gradient rounded-xl gap-2 text-sm"
            onClick={() => d.tabNavigation.setActiveTab("documents" as any)}
          >
            <FileText className="w-4 h-4" />
            Перейти к документам
          </Button>
        </div>
      </details>

      {/* Journals Section */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <ClipboardList className="w-4 h-4 lg:w-5 lg:h-5" />
            Журналы учёта
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <p className="text-xs lg:text-sm text-muted-foreground mb-4">
            Управление журналами учёта слушателей
          </p>
          <Button
            className="btn-gradient rounded-xl gap-2 text-sm"
            onClick={() => d.tabNavigation.setActiveTab("journals" as any)}
          >
            <ClipboardList className="w-4 h-4" />
            Перейти к журналам
          </Button>
        </div>
      </details>

      {/* FRDO Section */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 lg:w-5 lg:h-5" />
            ФИС ФРДО
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <p className="text-xs lg:text-sm text-muted-foreground mb-4">
            Федеральный реестр документов об образовании
          </p>
          <Button
            className="btn-gradient rounded-xl gap-2 text-sm"
            onClick={() => d.tabNavigation.setActiveTab("frdo" as any)}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Перейти к ФИС ФРДО
          </Button>
        </div>
      </details>
    </div>
  );
}
