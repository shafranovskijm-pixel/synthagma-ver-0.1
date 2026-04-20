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
import { Users, BookOpen, Eye, Edit, TrendingUp, CheckCircle2, FileText, History, CheckSquare, Plus, Trash2, Settings, RotateCcw, Search, UserPlus, ClipboardCheck, Bell, Globe, ExternalLink, Trophy } from "lucide-react";
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
  skip_video_identification?: boolean; sequential_lessons?: boolean; allow_video_seek?: boolean;
  training_form?: string | null; retraining_period_months?: number | null;
  frdo_program_type?: string | null; frdo_document_type?: string | null; frdo_professional_area?: string | null;
  frdo_specialty_group?: string | null; frdo_qualification_name?: string | null; frdo_profession_name?: string | null;
  frdo_qualification_rank?: string | null; frdo_duration_hours?: number | null; frdo_financing_source?: string | null;
  frdo_education_form?: string | null;
}

interface Student { id: string; user_id: string; enrollment_id: string | null; name: string; email: string; progress: number; status: string | null; }

interface CourseDetailsContentProps {
  course: Course; courseStudents: Student[]; organizationId: string | null;
  activeTab: "students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups" | "requests" | "achievements" | "editor" | "preview";
  onTabChange: (tab: CourseDetailsContentProps["activeTab"]) => void;
  onEnrollStudent: () => void; onCourseDeleted?: () => void; onCourseUpdated?: () => void; onRefreshStudents?: () => void;
}

export function CourseDetailsContent({ course, courseStudents, organizationId, activeTab, onTabChange, onEnrollStudent, onCourseDeleted, onCourseUpdated, onRefreshStudents }: CourseDetailsContentProps) {
  const { isEnabled } = useOrgFeatures(organizationId);
  const isFrdoEnabled = isEnabled('frdo');
  const h = useCourseDetails(course, courseStudents, organizationId, onCourseUpdated, onRefreshStudents, onCourseDeleted);

  const learningTabs = [
    { value: "editor" as const, label: "Конструктор", icon: Edit, color: "text-primary" },
    { value: "students" as const, label: "Ученики", icon: Users, color: "text-primary" },
    { value: "requests" as const, label: "Заявки", icon: ClipboardCheck, color: "text-orange-500" },
    { value: "materials" as const, label: "Материалы", icon: FileText, color: "text-amber-500" },
    { value: "history" as const, label: "История", icon: History, color: "text-violet-500" },
    { value: "tests" as const, label: "Тесты", icon: CheckSquare, color: "text-emerald-500" },
    { value: "groups" as const, label: "Группы", icon: Users, color: "text-blue-500" },
    { value: "achievements" as const, label: "Достижения", icon: Trophy, color: "text-amber-500" },
  ];
  const settingsTabs = [
    { value: "preview" as const, label: "Просмотр", icon: Eye, color: "text-sigma-cyan" },
    { value: "landing" as const, label: "Страница курса", icon: Globe, color: "text-rose-500" },
    { value: "settings" as const, label: "Настройки", icon: Settings, color: "text-muted-foreground" },
    { value: "reminders" as const, label: "Напоминания", icon: Bell, color: "text-orange-500" },
  ];

  return (
    <>
      {/* Course header (compact) */}
      <div className="border-b border-border bg-gradient-to-br from-primary/10 to-accent/10 rounded-t-2xl">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-semibold mb-2">{course.title}</h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className={`px-2 py-1 rounded-full text-xs ${course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'}`}>
                  {course.is_published ? 'Опубликован' : 'Черновик'}
                </span>
                <div className="flex items-center gap-1"><Users className="w-4 h-4" />{course.studentsCount} учеников</div>
                <div className="flex items-center gap-1"><BookOpen className="w-4 h-4" />{course.lessonsCount} уроков</div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => onTabChange("preview")}><Eye className="w-4 h-4" />Просмотр</Button>
              <Button className="rounded-xl gap-2 btn-gradient" onClick={() => onTabChange("editor")}><Edit className="w-4 h-4" />Редактировать</Button>
              <Button variant="outline" className="rounded-xl gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => h.setShowDeleteConfirm(true)}><Trash2 className="w-4 h-4" />Удалить</Button>
            </div>
          </div>
        </div>

        {/* Horizontal tab bar: Обучение | Настройки */}
        <div className="px-3 sm:px-6 pb-3">
          <div className="flex items-center gap-1 overflow-x-auto bg-background/40 backdrop-blur-sm rounded-xl p-1.5 border border-border/40">
            {learningTabs.map(item => (
              <button
                key={item.value}
                onClick={() => onTabChange(item.value)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0",
                  activeTab === item.value
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", activeTab === item.value ? "text-primary" : item.color)} />
                {item.label}
              </button>
            ))}
            <div className="w-px h-6 bg-border/60 mx-1.5 shrink-0" />
            {settingsTabs.map(item => (
              <button
                key={item.value}
                onClick={() => onTabChange(item.value)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0",
                  activeTab === item.value
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", activeTab === item.value ? "text-primary" : item.color)} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

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
