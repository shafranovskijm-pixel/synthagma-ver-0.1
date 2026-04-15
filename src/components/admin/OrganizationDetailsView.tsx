import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ArrowLeft, Users, BookOpen, Settings, Crown, History, MessageSquare, Bell, ShieldOff, AlertTriangle, ExternalLink, Calendar, Image } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useOrgDetailsView, type Organization } from "@/hooks/useOrgDetailsView";
import { OrgStudentsPanel } from "./org-details/OrgStudentsPanel";
import { OrgCoursesPanel } from "./org-details/OrgCoursesPanel";
import { OrgSettingsPanel } from "./org-details/OrgSettingsPanel";
import { OrgStatsPanel } from "./org-details/OrgStatsPanel";
import { OrgTariffsPanel } from "./org-details/OrgTariffsPanel";
import { OrgCommentsTab } from "./OrgCommentsTab";
import { OrgRemindersTab } from "./OrgRemindersTab";
import { OrgAuditLogsTab } from "./OrgAuditLogsTab";
import { SkillspaceImportDialog } from "./SkillspaceImportDialog";
import { SkillspaceBatchImportDialog } from "./SkillspaceBatchImportDialog";
import { StudentBulkImportDialog } from "./StudentBulkImportDialog";
import { supabase } from "@/integrations/supabase/client";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  start: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  standard: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  professional: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  maximum: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };

interface OrganizationDetailsViewProps {
  organization: Organization;
  onBack: () => void;
}

export function OrganizationDetailsView({ organization, onBack }: OrganizationDetailsViewProps) {
  const navigate = useNavigate();
  const vm = useOrgDetailsView(organization);

  if (vm.loading) {
    return <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  const navItems = [
    { key: "students", icon: Users, label: "Ученики", group: "main" },
    { key: "courses", icon: BookOpen, label: "Курсы", group: "main" },
    { key: "tariffs", icon: Crown, label: "Тарифы", group: "main" },
    { key: "history", icon: History, label: "История", group: "history" },
    { key: "comments", icon: MessageSquare, label: "Заметки", group: "history" },
    { key: "reminders", icon: Bell, label: "Напоминания", group: "history" },
    { key: "settings", icon: Settings, label: "Настройки", group: "system" },
  ];

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="mt-1"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 shrink-0">
            <BookOpen className="w-7 h-7 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-display font-bold truncate">{organization.name}</h2>
              <Badge className={`text-xs font-medium border ${PLAN_BADGE_COLORS[vm.planKey] || PLAN_BADGE_COLORS.free}`}>{vm.planInfo.name}</Badge>
              {vm.shouldBlockAI && <Badge variant="destructive" className="flex items-center gap-1"><ShieldOff className="w-3 h-3" />ИИ заблокирован</Badge>}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
              <span>{organization.email}</span>
              <span className="text-border">•</span>
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(organization.created_at), "d MMM yyyy", { locale: ru })}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => {
          localStorage.setItem("adminViewAsOrg", JSON.stringify({ id: organization.id, name: organization.name }));
          navigate("/organization");
        }}><ExternalLink className="w-4 h-4" />Войти в организацию</Button>
      </div>

      {/* Limit Alerts */}
      {(vm.isStorageExceeded || vm.isAiGenExceeded) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Лимит превышен!</AlertTitle>
          <AlertDescription>
            {vm.isStorageExceeded && "Лимит хранилища превышен. "}
            {vm.isAiGenExceeded && "Лимит ИИ-генераций превышен. ИИ-помощник автоматически заблокирован. "}
            Увеличьте лимиты в настройках организации.
          </AlertDescription>
        </Alert>
      )}
      {!vm.isStorageExceeded && !vm.isAiGenExceeded && (vm.isStorageWarning || vm.isAiGenWarning) && (
        <Alert className="border-yellow-500 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-600">Приближение к лимиту</AlertTitle>
          <AlertDescription className="text-yellow-600">
            {vm.isStorageWarning && `Хранилище: ${vm.storageLimitPercent.toFixed(0)}% использовано. `}
            {vm.isAiGenWarning && `ИИ-генерации: ${vm.aiGenerationsPercent.toFixed(0)}% использовано. `}
          </AlertDescription>
        </Alert>
      )}

      {/* Branding Preview */}
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-0 overflow-hidden rounded-lg">
          {vm.orgBranding.coverUrl ? (
            <div className="relative h-40 w-full">
              <img src={vm.orgBranding.coverUrl} alt="Обложка организации" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-4 flex items-center gap-3">
                {vm.orgBranding.logoUrl && <img src={vm.orgBranding.logoUrl} alt="Логотип" className="w-10 h-10 rounded-lg border border-white/30 bg-white/90 object-contain" />}
                <div>
                  <p className="text-white font-semibold text-lg drop-shadow">{organization.name}</p>
                  <p className="text-white/80 text-sm drop-shadow">{organization.email}</p>
                </div>
              </div>
              {vm.orgBranding.primaryColor && (
                <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/30 rounded-full px-3 py-1">
                  <div className="w-4 h-4 rounded-full border border-white/40" style={{ backgroundColor: vm.orgBranding.primaryColor }} />
                  <span className="text-white text-xs">{vm.orgBranding.primaryColor}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-32 w-full bg-gradient-to-r from-primary/10 to-primary/5 flex items-center justify-center gap-3">
              <Image className="w-8 h-8 text-muted-foreground/40" />
              <span className="text-muted-foreground text-sm">Организация не установила обложку</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Mobile nav */}
        <div className="lg:hidden">
          <ScrollArea className="w-full">
            <div className="flex gap-1 p-1">
              {navItems.map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.key} onClick={() => vm.setActiveTab(item.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${vm.activeTab === item.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                    <Icon className="w-4 h-4" />{item.label}
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Desktop nav */}
        <nav className="hidden lg:flex lg:w-56 shrink-0 flex-col gap-0.5 pr-4 border-r border-border/50">
          {["main", "history", "system"].map((group, gi) => (
            <div key={group}>
              {gi > 0 && <div className="my-2 border-t border-border/30" />}
              <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group === "main" ? "Основное" : group === "history" ? "История" : "Система"}
              </div>
              {navItems.filter(i => i.group === group).map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.key} onClick={() => vm.setActiveTab(item.key)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 w-full text-left ${vm.activeTab === item.key ? "bg-primary/15 text-primary border-r-2 border-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground hover:translate-x-0.5"}`}>
                    <Icon className="w-4 h-4 shrink-0" />{item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {vm.activeTab === "overview" && <OrgStatsPanel students={vm.students} courses={vm.courses} usage={vm.usage} usageHistory={vm.usageHistory} storageLimitPercent={vm.storageLimitPercent} aiGenerationsLimit={vm.aiGenerationsLimit} aiGenerationsPercent={vm.aiGenerationsPercent} formatBytes={vm.formatBytes} storageLimit={vm.settings.storage_limit_bytes} />}
          {vm.activeTab === "students" && <OrgStudentsPanel students={vm.students} filteredStudents={vm.filteredStudents} searchQuery={vm.searchQuery} setSearchQuery={vm.setSearchQuery} pendingEnrollmentsCount={vm.pendingEnrollmentsCount} organizationName={organization.name} onShowBulkImport={() => vm.setShowStudentBulkImport(true)} />}
          {vm.activeTab === "courses" && <OrgCoursesPanel courses={vm.courses} organizationId={organization.id} dndSensors={vm.dndSensors} handleCourseDragEnd={vm.handleCourseDragEnd} migratingCourseId={vm.migratingCourseId} setMigratingCourseId={vm.setMigratingCourseId} migrationResult={vm.migrationResult} setMigrationResult={vm.setMigrationResult} onShowSkillspaceImport={() => vm.setShowSkillspaceImport(true)} onShowSkillspaceBatchImport={() => vm.setShowSkillspaceBatchImport(true)} onSkillspaceUpdate={vm.setSkillspaceUpdateCourse} fetchCourses={vm.fetchCourses} />}
          {vm.activeTab === "tariffs" && <OrgTariffsPanel organizationId={organization.id} subscriptionPlan={organization.subscription_plan || 'free'} planInfo={vm.planInfo} tariffCustomLabel={vm.tariffCustomLabel} setTariffCustomLabel={vm.setTariffCustomLabel} tariffPaidUntil={vm.tariffPaidUntil} setTariffPaidUntil={vm.setTariffPaidUntil} isSavingTariff={vm.isSavingTariff} saveTariffSettings={vm.saveTariffSettings} customLimits={vm.customLimits} setCustomLimits={vm.setCustomLimits} customCategories={vm.customCategories} setCustomCategories={vm.setCustomCategories} customPrice={vm.customPrice} setCustomPrice={vm.setCustomPrice} customDiscount={vm.customDiscount} setCustomDiscount={vm.setCustomDiscount} />}
          {vm.activeTab === "history" && <OrgAuditLogsTab organizationId={organization.id} />}
          {vm.activeTab === "comments" && <OrgCommentsTab organizationId={organization.id} />}
          {vm.activeTab === "reminders" && <OrgRemindersTab organizationId={organization.id} />}
          {vm.activeTab === "settings" && <OrgSettingsPanel organizationId={organization.id} organizationEmail={organization.email} settings={vm.settings} setSettings={vm.setSettings} isSaving={vm.isSaving} saveSettings={vm.saveSettings} credentials={vm.credentials} setCredentials={vm.setCredentials} showPassword={vm.showPassword} setShowPassword={vm.setShowPassword} generatingCredentials={vm.generatingCredentials} setGeneratingCredentials={vm.setGeneratingCredentials} resettingPassword={vm.resettingPassword} setResettingPassword={vm.setResettingPassword} />}
        </div>
      </div>
    </div>

    <SkillspaceImportDialog open={vm.showSkillspaceImport} onOpenChange={vm.setShowSkillspaceImport} organizationId={organization.id} onSuccess={() => {
      supabase.from("courses").select("id, title, is_published, catalog_order, lessons(id), enrollments(id)").eq("organization_id", organization.id).then(({ data }) => {
        if (data) vm.setCourses(data.map((c: any) => ({ id: c.id, title: c.title, is_published: c.is_published, lessons_count: c.lessons?.length || 0, students_count: c.enrollments?.length || 0, catalog_order: c.catalog_order || 0 })));
      });
    }} />
    {vm.skillspaceUpdateCourse && (
      <SkillspaceImportDialog open={!!vm.skillspaceUpdateCourse} onOpenChange={(open) => { if (!open) vm.setSkillspaceUpdateCourse(null); }} organizationId={organization.id} existingCourseId={vm.skillspaceUpdateCourse.id} existingCourseTitle={vm.skillspaceUpdateCourse.title} onSuccess={() => vm.fetchCourses()} />
    )}
    <SkillspaceBatchImportDialog open={vm.showSkillspaceBatchImport} onOpenChange={vm.setShowSkillspaceBatchImport} organizationId={organization.id} onSuccess={() => vm.fetchCourses()} />
    <StudentBulkImportDialog open={vm.showStudentBulkImport} onOpenChange={vm.setShowStudentBulkImport} organizationId={organization.id} onImportComplete={() => { vm.fetchStudents(); vm.fetchPendingEnrollmentsCount(); }} />
    </>
  );
}
