import React, { lazy, Suspense } from "react";
import { useOrgFeatures } from "@/hooks/useOrgFeatures";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CourseDocumentsManager } from "@/components/organization/CourseDocumentsManager";
import { EnrollmentHistory } from "@/components/organization/EnrollmentHistory";
import { CourseTestReport } from "@/components/organization/CourseTestReport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, BookOpen, Eye, Edit, TrendingUp, CheckCircle2, FileText, History, CheckSquare, Plus, Trash2, Settings, RotateCcw, Search, UserPlus, ClipboardCheck, Bell, Globe, ExternalLink, Trophy, ArrowLeft } from "lucide-react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { CourseRemindersTab } from "@/components/organization/CourseRemindersTab";
import { CourseGroupsTab } from "@/components/organization/CourseGroupsTab";
import { CoursePageSettingsContent } from "@/components/course-editor/CoursePageSettingsContent";
import { CourseSettingsTabbed } from "@/components/organization/CourseSettingsTabbed";
import { EnrollmentRequestsTab } from "@/components/organization/EnrollmentRequestsTab";
import { CourseAchievementsTab } from "@/components/organization/CourseAchievementsTab";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useCourseDetails } from "@/hooks/useCourseDetails";
const CourseBuilder = lazy(() => import("@/pages/CourseBuilder"));
const CoursePreviewView = lazy(() => import("@/components/course-preview/CoursePreviewView").then(m => ({ default: m.CoursePreviewView })));

interface Course {
  id: string; title: string; description: string | null; is_published: boolean; created_at: string;
  lessonsCount?: number; studentsCount?: number; duration?: string; category_id?: string | null;
  cover_image_url?: string | null;
  skip_video_identification?: boolean; sequential_lessons?: boolean; allow_video_seek?: boolean;
  training_form?: string | null; retraining_period_months?: number | null;
  frdo_program_type?: string | null; frdo_document_type?: string | null; frdo_professional_area?: string | null;
  frdo_specialty_group?: string | null; frdo_qualification_name?: string | null; frdo_profession_name?: string | null;
  frdo_qualification_rank?: string | null; frdo_duration_hours?: number | null; frdo_financing_source?: string | null;
  frdo_education_form?: string | null;
}

interface Student { id: string; user_id: string; enrollment_id: string | null; name: string; email: string; progress: number; status: string | null; }

type CourseTabKey = "students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups" | "requests" | "achievements" | "editor" | "preview";

type GroupKey = "editor" | "students" | "page" | "settings";

const TAB_GROUPS: { key: GroupKey; label: string; icon: any; subTabs: CourseTabKey[] }[] = [
  { key: "editor",   label: "Конструктор",     icon: Edit,     subTabs: [] },
  { key: "students", label: "Ученики",         icon: Users,    subTabs: ["students", "requests", "groups", "history", "achievements", "reminders"] },
  { key: "page",     label: "Страница курса",  icon: Globe,    subTabs: ["landing", "preview", "materials"] },
  { key: "settings", label: "Настройки",       icon: Settings, subTabs: ["settings", "tests"] },
];

const SUB_TAB_META: Record<CourseTabKey, { label: string; icon: any }> = {
  editor:       { label: "Конструктор",   icon: Edit },
  students:     { label: "Ученики",       icon: Users },
  requests:     { label: "Заявки",        icon: ClipboardCheck },
  groups:       { label: "Группы",        icon: Users },
  history:      { label: "История",       icon: History },
  achievements: { label: "Достижения",    icon: Trophy },
  reminders:    { label: "Напоминания",   icon: Bell },
  landing:      { label: "Страница курса",icon: Globe },
  preview:      { label: "Просмотр",      icon: Eye },
  materials:    { label: "Материалы",     icon: FileText },
  settings:     { label: "Настройки",     icon: Settings },
  tests:        { label: "Тесты",         icon: CheckSquare },
};

function getGroupForTab(tab: CourseTabKey): GroupKey {
  for (const g of TAB_GROUPS) {
    if (g.key === "editor" && tab === "editor") return "editor";
    if (g.subTabs.includes(tab)) return g.key;
  }
  return "editor";
}

interface CourseDetailsContentProps {
  course: Course; courseStudents: Student[]; organizationId: string | null;
  activeTab: CourseTabKey;
  onTabChange: (tab: CourseTabKey) => void;
  onEnrollStudent: () => void; onCourseDeleted?: () => void; onCourseUpdated?: () => void; onRefreshStudents?: () => void;
  onBack?: () => void;
}

export function CourseDetailsContent({ course, courseStudents, organizationId, activeTab, onTabChange, onEnrollStudent, onCourseDeleted, onCourseUpdated, onRefreshStudents, onBack }: CourseDetailsContentProps) {
  const { isEnabled } = useOrgFeatures(organizationId);
  const isFrdoEnabled = isEnabled('frdo');
  const h = useCourseDetails(course, courseStudents, organizationId, onCourseUpdated, onRefreshStudents, onCourseDeleted);

  const activeGroup = getGroupForTab(activeTab);

  const handleGroupClick = (group: GroupKey) => {
    if (group === "editor") {
      onTabChange("editor");
      return;
    }
    const g = TAB_GROUPS.find(x => x.key === group);
    if (!g || g.subTabs.length === 0) return;
    // If we're already in this group, do nothing; else jump to its first sub-tab
    if (activeGroup !== group) onTabChange(g.subTabs[0]);
  };

  const currentGroupDef = TAB_GROUPS.find(g => g.key === activeGroup);
  const showSubTabs = !!currentGroupDef && currentGroupDef.subTabs.length > 0;

  return (
    <>
      {/* Hero banner with course cover */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 mb-4">
        <div
          className="relative h-44 md:h-56 w-full"
          style={
            course.cover_image_url
              ? { backgroundImage: `url(${course.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
          }
        >
          {!course.cover_image_url && (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/20 to-primary/40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />

          {onBack && (
            <button
              onClick={onBack}
              className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 backdrop-blur-md text-white text-sm font-medium hover:bg-white/25 transition-colors border border-white/20"
            >
              <ArrowLeft className="w-4 h-4" />
              Все курсы
            </button>
          )}

          <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-white text-2xl md:text-3xl font-semibold drop-shadow-md mb-2 truncate">{course.title}</h2>
                <div className="flex items-center gap-3 text-sm text-white/90 flex-wrap">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium backdrop-blur-md border",
                    course.is_published ? "bg-sigma-green/30 text-white border-white/30" : "bg-white/15 text-white/90 border-white/20"
                  )}>
                    {course.is_published ? 'Опубликован' : 'Черновик'}
                  </span>
                  <div className="flex items-center gap-1"><Users className="w-4 h-4" />{course.studentsCount} учеников</div>
                  <div className="flex items-center gap-1"><BookOpen className="w-4 h-4" />{course.lessonsCount} уроков</div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" className="rounded-xl gap-2 bg-white/90 hover:bg-white border-white/40" onClick={() => onTabChange("preview")}><Eye className="w-4 h-4" />Просмотр</Button>
                <Button className="rounded-xl gap-2 btn-gradient" onClick={() => onTabChange("editor")}><Edit className="w-4 h-4" />Редактировать</Button>
                <Button variant="outline" className="rounded-xl gap-2 bg-white/90 hover:bg-destructive hover:text-destructive-foreground border-white/40 text-destructive" onClick={() => h.setShowDeleteConfirm(true)}><Trash2 className="w-4 h-4" />Удалить</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top-level tabs (4 groups) */}
      <div className="mb-3 flex items-center justify-center">
        <div className="inline-flex items-center gap-1 bg-muted/60 backdrop-blur-sm rounded-xl p-1.5 border border-border/40 flex-wrap">
          {TAB_GROUPS.map(g => {
            const Icon = g.icon;
            const isActive = activeGroup === g.key;
            return (
              <button
                key={g.key}
                onClick={() => handleGroupClick(g.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                  isActive
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tabs (only for groups that have sub-sections) */}
      {showSubTabs && (
        <div className="mb-4 flex items-center justify-center">
          <div className="inline-flex items-center gap-1 overflow-x-auto bg-background/60 rounded-lg p-1 border border-border/40">
            {currentGroupDef!.subTabs.map(st => {
              const meta = SUB_TAB_META[st];
              const Icon = meta.icon;
              const isActive = activeTab === st;
              return (
                <button
                  key={st}
                  onClick={() => onTabChange(st)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content panel (full width — left nav of lessons lives inside CourseBuilder embedded mode) */}
      <div className={cn("flex-1 min-w-0", activeTab === "editor" ? "" : "p-6")}>
        {activeTab === "students" && <StudentsSection h={h} courseStudents={courseStudents} />}
        {activeTab === "requests" && <EnrollmentRequestsTab courseId={course.id} defaultAccessDays={h.defaultAccessDays} onRefreshStudents={onRefreshStudents} />}
        {activeTab === "materials" && <CourseDocumentsManager courseId={course.id} courseName={course.title} embedded={true} />}
        {activeTab === "history" && <EnrollmentHistory courseId={course.id} organizationId={organizationId || ""} courseName={course.title} />}
        {activeTab === "tests" && <CourseTestReport courseId={course.id} courseName={course.title} organizationId={organizationId || ""} />}
        {activeTab === "landing" && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-4 border border-primary/20 cursor-pointer hover:shadow-md transition-all" onClick={() => h.navigate(`/course/${course.id}/landing-editor`)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-primary/20"><Globe className="w-5 h-5 text-primary" /></div><div><h4 className="font-semibold text-sm">Визуальный редактор</h4><p className="text-xs text-muted-foreground">Настройте продающую страницу курса</p></div></div>
                <Button variant="outline" size="sm" className="rounded-lg gap-2"><ExternalLink className="w-4 h-4" />Открыть редактор</Button>
              </div>
            </div>
            <CoursePageSettingsContent courseId={course.id} courseTitle={course.title} courseDescription={course.description || undefined} />
          </div>
        )}
        {activeTab === "settings" && (
          <CourseSettingsTabbed course={course} isFrdoEnabled={isFrdoEnabled} isSavingSettings={h.isSavingSettings}
            skipVideoId={h.skipVideoId} onToggleSkipVideoId={h.handleToggleSkipVideoId}
            sequentialLessons={h.sequentialLessons} onToggleSequentialLessons={h.handleToggleSequentialLessons}
            allowVideoSeek={h.allowVideoSeek} onToggleAllowVideoSeek={h.handleToggleAllowVideoSeek}
            copyProtection={h.copyProtection} onToggleCopyProtection={h.handleToggleCopyProtection}
            videoWatermark={h.videoWatermark} onToggleVideoWatermark={h.handleToggleVideoWatermark}
            externalCardUrl={h.externalCardUrl} setExternalCardUrl={h.setExternalCardUrl}
            onUpdateExternalCardUrl={h.handleUpdateExternalCardUrl}
            defaultAccessDays={h.defaultAccessDays} setDefaultAccessDays={h.setDefaultAccessDays}
            onUpdateDefaultAccessDays={h.handleUpdateDefaultAccessDays}
            requireEnrollmentApproval={h.requireEnrollmentApproval} onToggleRequireEnrollmentApproval={h.handleToggleRequireEnrollmentApproval}
            trainingForm={h.trainingForm} onUpdateTrainingForm={h.handleUpdateTrainingForm}
            frdoSettings={h.frdoSettings} onUpdateFrdoSettings={h.handleUpdateFrdoSettings}
          />
        )}
        {activeTab === "reminders" && (
          <CourseRemindersTab courseId={course.id} organizationId={organizationId || ""}
            retrainingPeriodMonths={h.retrainingPeriod}
            reminderAdvanceDays={h.reminderAdvanceDays}
            onPeriodChange={async (months) => { h.setRetrainingPeriod(months); await h.updateCourseSetting("retraining_period_months", months, months ? `Периодичность: ${months} мес.` : "Периодичность отключена"); }}
            onAdvanceDaysChange={async (days) => { h.setReminderAdvanceDays(days); await h.updateCourseSetting("reminder_advance_days", days, `Напоминание за ${days} дней`); }}
            notifyOnCompletion={h.notifyOnCompletion}
            completionNotifyEmails={h.completionNotifyEmails}
            onNotifyOnCompletionChange={async (v) => { h.setNotifyOnCompletion(v); await h.updateCourseSetting("notify_on_completion", v, v ? "Уведомления включены" : "Уведомления отключены"); }}
            onCompletionNotifyEmailsChange={async (v) => { h.setCompletionNotifyEmails(v || null); try { const { error } = await supabase.from("courses").update({ completion_notify_emails: v || null } as any).eq("id", course.id); if (error) throw error; onCourseUpdated?.(); } catch (e) { console.error(e); } }}
          />
        )}
        {activeTab === "groups" && <CourseGroupsTab courseId={course.id} organizationId={organizationId || ""} onRefreshStudents={onRefreshStudents} />}
        {activeTab === "achievements" && organizationId && <CourseAchievementsTab courseId={course.id} organizationId={organizationId} />}
        {activeTab === "editor" && <Suspense fallback={<div className="flex items-center justify-center py-16"><SigmaSpinner size="lg" /></div>}><CourseBuilder embedded embeddedCourseId={course.id} onExitEditor={() => onTabChange("students")} /></Suspense>}
        {activeTab === "preview" && <Suspense fallback={<div className="flex items-center justify-center py-16"><SigmaSpinner size="lg" /></div>}><CoursePreviewView courseId={course.id} embedded onNavigateToEditor={() => onTabChange("editor")} /></Suspense>}
      </div>

      {/* Reset Progress */}
      <AlertDialog open={!!h.resetConfirmStudent} onOpenChange={(open) => !open && h.setResetConfirmStudent(null)}>
        <AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Сбросить прогресс?</AlertDialogTitle><AlertDialogDescription>Все результаты тестов ученика "{h.resetConfirmStudent?.name}" будут удалены.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel className="rounded-xl" disabled={h.isResetting}>Отмена</AlertDialogCancel><AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => h.resetConfirmStudent && h.handleResetProgress(h.resetConfirmStudent)} disabled={h.isResetting}>{h.isResetting ? <><SigmaSpinner size="sm" className="mr-2" />Сброс...</> : <><RotateCcw className="w-4 h-4 mr-2" />Сбросить</>}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* Delete Course */}
      <AlertDialog open={h.showDeleteConfirm} onOpenChange={h.setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Удалить курс?</AlertDialogTitle><AlertDialogDescription>Курс "{course.title}" и все связанные данные будут удалены безвозвратно.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel className="rounded-xl" disabled={h.isDeleting}>Отмена</AlertDialogCancel><AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={h.handleDeleteCourse} disabled={h.isDeleting}>{h.isDeleting ? <><SigmaSpinner size="sm" className="mr-2" />Удаление...</> : <><Trash2 className="w-4 h-4 mr-2" />Удалить</>}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StudentsSection({ h, courseStudents }: { h: ReturnType<typeof useCourseDetails>; courseStudents: any[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Ученики курса</h3>
        <Popover open={h.enrollPopoverOpen} onOpenChange={h.setEnrollPopoverOpen}>
          <PopoverTrigger asChild><Button className="btn-gradient rounded-xl gap-2"><Plus className="w-4 h-4" />Зачислить ученика</Button></PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="p-3 border-b border-border"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Поиск учеников..." value={h.enrollSearchQuery} onChange={(e) => h.setEnrollSearchQuery(e.target.value)} className="pl-9 rounded-lg" /></div></div>
            <ScrollArea className="h-64">
              {h.isLoadingAvailable ? <div className="flex items-center justify-center py-8"><SigmaSpinner /></div> : h.filteredAvailableStudents.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">Нет доступных учеников</div> : (
                <div className="p-2 space-y-1">{h.filteredAvailableStudents.map(s => (
                  <div key={s.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors" onClick={() => h.toggleStudentToEnroll(s.user_id)}>
                    <Checkbox checked={h.selectedToEnroll.has(s.user_id)} onCheckedChange={() => h.toggleStudentToEnroll(s.user_id)} />
                    <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{s.name}</div><div className="text-xs text-muted-foreground truncate">{s.email}</div></div>
                  </div>
                ))}</div>
              )}
            </ScrollArea>
            {h.selectedToEnroll.size > 0 && <div className="p-3 border-t border-border"><Button className="w-full btn-gradient rounded-lg gap-2" onClick={h.handleEnrollSelected} disabled={h.isEnrolling}>{h.isEnrolling ? <><SigmaSpinner size="sm" />Зачисление...</> : <><UserPlus className="w-4 h-4" />Зачислить ({h.selectedToEnroll.size})</>}</Button></div>}
          </PopoverContent>
        </Popover>
      </div>
      {courseStudents.length === 0 ? <div className="text-center py-12 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Нет зачисленных учеников</p></div> : (
        <div className="space-y-2">{courseStudents.map(s => (
          <div key={s.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
            <div><div className="font-medium">{s.name}</div><div className="text-sm text-muted-foreground">{s.email}</div></div>
            <div className="flex items-center gap-4">
              <div className="text-right"><div className="text-sm font-medium">{Math.min(s.progress, 100)}%</div><Progress value={Math.min(s.progress, 100)} className="w-24 h-2" /></div>
              <span className={`px-2 py-1 rounded-full text-xs ${s.status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : 'bg-primary/10 text-primary'}`}>{s.status === 'completed' ? 'Завершил' : 'Активный'}</span>
              {s.progress > 0 && s.enrollment_id && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => h.setResetConfirmStudent(s)} title="Сбросить прогресс"><RotateCcw className="w-4 h-4" /></Button>}
            </div>
          </div>
        ))}</div>
      )}
    </div>
  );
}
