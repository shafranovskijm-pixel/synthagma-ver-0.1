import { Button } from "@/components/ui/button";
import { Plus, FileSpreadsheet, Menu, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

export function OrgDashboardHeader() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  
  const activeTab = d.tabNavigation.activeTab;
  const organizationName = d.organizationName;
  const customName = d.branding.brandingSettings.customName;
  const balance = d.balance;

  const handleStudentAction = (action: () => void) => {
    const result = d.checkLimit('student');
    if (!result.allowed) {
      toast.error(result.message);
      return;
    }
    action();
  };

  return (
    <header className="bg-card border-b border-border px-4 lg:px-8 py-4 lg:py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => d.setIsMobileSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-secondary">
            <Menu className="w-6 h-6" />
          </button>
          <div>
            {activeTab !== "organizations" && activeTab !== "frdo" && activeTab !== "labor-safety" && (
              <h1 className="font-display text-xl lg:text-2xl font-bold">
                {activeTab === "courses" && "Управление курсами"}
                {activeTab === "students" && "Все ученики"}
                {activeTab === "library" && "Библиотека материалов"}
                {activeTab === "stats" && "Статистика обучения"}
                {activeTab === "links" && "Ссылки для регистрации"}
                {activeTab === "documents" && "Документооборот"}
                {activeTab === "journals" && "Журналы учёта"}
                {activeTab === "services" && "Магазин курсов"}
                {activeTab === "settings" && "Настройки"}
              </h1>
            )}
            {activeTab === "labor-safety" && (
              <h1 className="font-display text-xl lg:text-2xl font-bold">Охрана труда</h1>
            )}
            {activeTab !== "organizations" && activeTab !== "frdo" && activeTab !== "labor-safety" && (
              <p className="text-muted-foreground text-sm lg:text-base">{customName || organizationName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
          {/* Balance indicator */}
          {balance !== undefined && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-xl border border-primary/20">
              <Wallet className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">{balance.toLocaleString()} ₽</span>
            </div>
          )}
          {activeTab === "links" && (
            <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" onClick={() => d.registrationLinks.setShowCreateLinkDialog(true)}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Создать ссылку</span>
              <span className="sm:hidden">Создать</span>
            </Button>
          )}
          {activeTab === "students" && (
            <>
              <Button variant="outline" className="rounded-xl gap-2 text-xs lg:text-sm" onClick={() => handleStudentAction(() => d.setShowImportDialog(true))}>
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Импорт учеников</span>
                <span className="sm:hidden">Импорт</span>
              </Button>
              <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" onClick={() => handleStudentAction(() => d.studentManagement.setShowAddStudentDialog(true))}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Добавить ученика</span>
                <span className="sm:hidden">Добавить</span>
              </Button>
            </>
          )}
          {activeTab === "courses" && (
            <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" onClick={() => navigate("/course-builder")}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Создать курс</span>
              <span className="sm:hidden">Создать</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
