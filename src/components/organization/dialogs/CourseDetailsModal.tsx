import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useOrgFeatures } from "@/hooks/useOrgFeatures";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CourseDocumentsManager } from "@/components/organization/CourseDocumentsManager";
// EnrollmentHistory pulls in recharts (~200KB) — load it only when the history tab is opened
const EnrollmentHistory = lazy(() => import("@/components/organization/EnrollmentHistory").then(m => ({ default: m.EnrollmentHistory })));
import { CourseTestReport } from "@/components/organization/CourseTestReport";
import { CoursePageSettingsContent } from "@/components/course-editor/CoursePageSettingsContent";
import { CourseRemindersTab } from "@/components/organization/CourseRemindersTab";
import { CourseGroupsTab } from "@/components/organization/CourseGroupsTab";
import { CourseStudentsTab } from "./course-details/CourseStudentsTab";
import { CourseSettingsTab } from "./course-details/CourseSettingsTab";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Users, BookOpen, Eye, Edit, TrendingUp, CheckCircle2, FileText, History, CheckSquare,
  Trash2, Settings, RotateCcw, Globe, Bell, ExternalLink
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { FRDO_DOCUMENT_TYPES, type CourseFRDOSettings } from "@/constants/frdo";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useCourseDetailsLogic } from "@/hooks/useCourseDetailsLogic";

interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  lessonsCount?: number;
  studentsCount?: number;
  duration?: string;
  category_id?: string | null;
  skip_video_identification?: boolean;
  sequential_lessons?: boolean;
  allow_video_seek?: boolean;
  training_form?: string | null;
  retraining_period_months?: number | null;
  frdo_program_type?: string | null;
  frdo_document_type?: string | null;
  frdo_professional_area?: string | null;
  frdo_specialty_group?: string | null;
  frdo_qualification_name?: string | null;
  frdo_profession_name?: string | null;
  frdo_qualification_rank?: string | null;
  frdo_duration_hours?: number | null;
  frdo_financing_source?: string | null;
  frdo_education_form?: string | null;
}

interface Student {
  id: string;
  user_id: string;
  enrollment_id: string | null;
  name: string;
  email: string;
  progress: number;
  status: string | null;
}

interface CourseDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
  courseStudents: Student[];
  organizationId: string | null;
  activeTab: "students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups";
  onTabChange: (tab: "students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups") => void;
  onEnrollStudent: () => void;
  onCourseDeleted?: () => void;
  onCourseUpdated?: () => void;
  onRefreshStudents?: () => void;
}

export function CourseDetailsModal({
  open, onOpenChange, course, courseStudents, organizationId,
  activeTab, onTabChange, onEnrollStudent, onCourseDeleted, onCourseUpdated, onRefreshStudents
}: CourseDetailsModalProps) {
  const navigate = useNavigate();
  const { isEnabled } = useOrgFeatures(organizationId);
  const { plan: orgPlan } = useSubscriptionLimits(organizationId);
  const isFrdoEnabled = isEnabled('frdo');

  const logic = useCourseDetailsLogic(course, organizationId, onCourseUpdated, onRefreshStudents);

  if (!course) return null;

  const totalStudents = courseStudents.length;
  const activeStudents = courseStudents.filter(s => s.status !== 'completed').length;
  const completedStudents = courseStudents.filter(s => s.status === 'completed').length;
  const avgProgress = totalStudents > 0 
    ? Math.min(Math.round(courseStudents.reduce((sum, s) => sum + Math.min(s.progress, 100), 0) / totalStudents), 100) : 0;
  const completionRate = totalStudents > 0 ? Math.round(completedStudents / totalStudents * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="p-6 border-b border-border bg-gradient-to-br from-primary/10 to-accent/10">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-semibold mb-2">{course.title}</DialogTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className={`px-2 py-1 rounded-full text-xs ${course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'}`}>
                  {course.is_published ? 'Опубликован' : 'Черновик'}
                </span>
                <div className="flex items-center gap-1"><Users className="w-4 h-4" />{course.studentsCount} учеников</div>
                <div className="flex items-center gap-1"><BookOpen className="w-4 h-4" />{course.lessonsCount} уроков</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate(`/course-preview/${course.id}`)}>
                <Eye className="w-4 h-4" />Просмотр
              </Button>
              <Button className="rounded-xl gap-2 btn-gradient" onClick={() => navigate(`/course-builder/${course.id}`)}>
                <Edit className="w-4 h-4" />Редактировать
              </Button>
              <Button variant="outline" className="rounded-xl gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => logic.setShowDeleteConfirm(true)}>
                <Trash2 className="w-4 h-4" />Удалить
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><TrendingUp className="w-5 h-5 text-primary" /></div>
                <div><div className="text-2xl font-bold">{avgProgress}%</div><div className="text-xs text-muted-foreground">Средний прогресс</div></div>
              </div>
              <Progress value={avgProgress} className="mt-3 h-1.5" />
            </div>
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sigma-green/10"><Users className="w-5 h-5 text-sigma-green" /></div>
                <div><div className="text-2xl font-bold">{activeStudents}</div><div className="text-xs text-muted-foreground">Активных учеников</div></div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">из {totalStudents} зачисленных</div>
            </div>
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10"><CheckCircle2 className="w-5 h-5 text-accent" /></div>
                <div><div className="text-2xl font-bold">{completionRate}%</div><div className="text-xs text-muted-foreground">Завершаемость</div></div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">{completedStudents} из {totalStudents} завершили</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => onTabChange(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 border-b border-border">
            <TabsList className="bg-secondary/50 rounded-xl">
              <TabsTrigger value="students" className="rounded-lg gap-2"><Users className="w-4 h-4" />Ученики</TabsTrigger>
              <TabsTrigger value="materials" className="rounded-lg gap-2"><FileText className="w-4 h-4" />Материалы</TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg gap-2"><History className="w-4 h-4" />История</TabsTrigger>
              <TabsTrigger value="tests" className="rounded-lg gap-2"><CheckSquare className="w-4 h-4" />Тесты</TabsTrigger>
              <TabsTrigger value="landing" className="rounded-lg gap-2"><Globe className="w-4 h-4" />Страница курса</TabsTrigger>
              <TabsTrigger value="settings" className="rounded-lg gap-2"><Settings className="w-4 h-4" />Настройки</TabsTrigger>
              <TabsTrigger value="reminders" className="rounded-lg gap-2"><Bell className="w-4 h-4" />Напоминания</TabsTrigger>
              <TabsTrigger value="groups" className="rounded-lg gap-2"><Users className="w-4 h-4" />Группы</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="students" className="mt-0 h-full">
              <CourseStudentsTab
                courseStudents={courseStudents}
                enrollPopoverOpen={logic.enrollPopoverOpen}
                setEnrollPopoverOpen={logic.setEnrollPopoverOpen}
                enrollSearchQuery={logic.enrollSearchQuery}
                setEnrollSearchQuery={logic.setEnrollSearchQuery}
                isLoadingAvailable={logic.isLoadingAvailable}
                filteredAvailableStudents={logic.filteredAvailableStudents}
                availableStudents={logic.availableStudents}
                selectedToEnroll={logic.selectedToEnroll}
                toggleStudentToEnroll={logic.toggleStudentToEnroll}
                isEnrolling={logic.isEnrolling}
                onEnrollSelected={logic.handleEnrollSelected}
                onResetConfirm={logic.setResetConfirmStudent}
              />
            </TabsContent>

            <TabsContent value="materials" className="mt-0 h-full">
              <CourseDocumentsManager courseId={course.id} courseName={course.title} embedded={true} />
            </TabsContent>

            <TabsContent value="history" className="mt-0 h-full">
              <EnrollmentHistory courseId={course.id} organizationId={organizationId || ""} courseName={course.title} />
            </TabsContent>

            <TabsContent value="tests" className="mt-0">
              <CourseTestReport courseId={course.id} courseName={course.title} organizationId={organizationId || ""} />
            </TabsContent>

            <TabsContent value="landing" className="mt-0 h-full">
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-4 border border-primary/20 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => navigate(`/course/${course.id}/landing-editor`)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/20"><Globe className="w-5 h-5 text-primary" /></div>
                      <div>
                        <h4 className="font-semibold text-sm">Визуальный редактор</h4>
                        <p className="text-xs text-muted-foreground">Настройте продающую страницу курса с визуальным редактором</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-lg gap-2"><ExternalLink className="w-4 h-4" />Открыть редактор</Button>
                  </div>
                </div>
                <CoursePageSettingsContent courseId={course.id} courseTitle={course.title} courseDescription={course.description || undefined} />
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 h-full">
              <CourseSettingsTab
                skipVideoId={logic.skipVideoId}
                onToggleSkipVideoId={logic.handleToggleSkipVideoId}
                sequentialLessons={logic.sequentialLessons}
                onToggleSequentialLessons={logic.handleToggleSequentialLessons}
                allowVideoSeek={logic.allowVideoSeek}
                onToggleAllowVideoSeek={logic.handleToggleAllowVideoSeek}
                copyProtection={logic.copyProtection}
                onToggleCopyProtection={logic.handleToggleCopyProtection}
                videoWatermark={logic.videoWatermark}
                onToggleVideoWatermark={logic.handleToggleVideoWatermark}
                externalCardUrl={logic.externalCardUrl}
                onUpdateExternalCardUrl={logic.handleUpdateExternalCardUrl}
                isSavingSettings={logic.isSavingSettings}
                isFrdoEnabled={isFrdoEnabled}
                frdoSettings={logic.frdoSettings}
                onUpdateFrdoSettings={logic.handleUpdateFrdoSettings}
                trainingForm={logic.trainingForm}
                onUpdateTrainingForm={logic.handleUpdateTrainingForm}
              />
            </TabsContent>

            <TabsContent value="reminders" className="mt-0 h-full">
              <CourseRemindersTab
                courseId={course.id}
                organizationId={organizationId || ""}
                retrainingPeriodMonths={logic.retrainingPeriod}
                reminderAdvanceDays={logic.reminderAdvanceDays}
                onPeriodChange={logic.handlePeriodChange}
                onAdvanceDaysChange={logic.handleAdvanceDaysChange}
                notifyOnCompletion={logic.notifyOnCompletion}
                completionNotifyEmails={logic.completionNotifyEmails}
                onNotifyOnCompletionChange={logic.handleNotifyOnCompletionChange}
                onCompletionNotifyEmailsChange={logic.handleCompletionNotifyEmailsChange}
              />
            </TabsContent>

            <TabsContent value="groups" className="mt-0 h-full">
              <CourseGroupsTab courseId={course.id} organizationId={organizationId || ""} onRefreshStudents={onRefreshStudents} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>

      {/* Reset Progress Confirmation */}
      <AlertDialog open={!!logic.resetConfirmStudent} onOpenChange={(open) => !open && logic.setResetConfirmStudent(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить прогресс?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите сбросить прогресс ученика "{logic.resetConfirmStudent?.name}"?
              Все результаты тестов и отметки о прохождении уроков будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={logic.isResetting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => logic.resetConfirmStudent && logic.handleResetProgress(logic.resetConfirmStudent)}
              disabled={logic.isResetting}
            >
              {logic.isResetting ? <><SigmaSpinner size="sm" className="mr-2" />Сброс...</> : <><RotateCcw className="w-4 h-4 mr-2" />Сбросить</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={logic.showDeleteConfirm} onOpenChange={logic.setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить курс?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить курс "{course.title}"?
              Будут также удалены все уроки, материалы и записи о зачислении учеников. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={logic.isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => logic.handleDeleteCourse(onOpenChange, onCourseDeleted)}
              disabled={logic.isDeleting}
            >
              {logic.isDeleting ? <><SigmaSpinner size="sm" className="mr-2" />Удаление...</> : <><Trash2 className="w-4 h-4 mr-2" />Удалить</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
