import React, { useState, useEffect, useCallback } from "react";
import { useOrgFeatures } from "@/hooks/useOrgFeatures";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CourseDocumentsManager } from "@/components/organization/CourseDocumentsManager";
import { EnrollmentHistory } from "@/components/organization/EnrollmentHistory";
import { CourseTestReport } from "@/components/organization/CourseTestReport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Users, 
  BookOpen, 
  Eye, 
  Edit, 
  TrendingUp, 
  CheckCircle2, 
  FileText, 
  History, 
  CheckSquare,
  Plus,
  Trash2,
  Loader2,
  Settings,
  Video,
  RotateCcw,
  Lock,
  FastForward,
  Search,
  UserPlus,
  ClipboardCheck,
  FileSpreadsheet,
  Bell,
  Globe,
  ShieldCheck,
  Droplets,
  ExternalLink,
  Clock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import {
  FRDO_PROGRAM_TYPES,
  FRDO_DOCUMENT_TYPES,
  FRDO_PROFESSIONAL_AREAS,
  FRDO_SPECIALTY_GROUPS,
  FRDO_TRAINING_FORMS,
  type CourseFRDOSettings,
} from "@/constants/frdo";
import { CourseRemindersTab } from "@/components/organization/CourseRemindersTab";
import { CourseGroupsTab } from "@/components/organization/CourseGroupsTab";
import { CoursePageSettingsContent } from "@/components/course-editor/CoursePageSettingsContent";
import { CourseSettingsTabbed } from "@/components/organization/CourseSettingsTabbed";
import { EnrollmentRequestsTab } from "@/components/organization/EnrollmentRequestsTab";

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

interface AvailableStudent {
  id: string;
  user_id: string;
  name: string;
  email: string;
}

interface CourseDetailsContentProps {
  course: Course;
  courseStudents: Student[];
  organizationId: string | null;
  activeTab: "students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups" | "requests";
  onTabChange: (tab: "students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups" | "requests") => void;
  onEnrollStudent: () => void;
  onCourseDeleted?: () => void;
  onCourseUpdated?: () => void;
  onRefreshStudents?: () => void;
}

export function CourseDetailsContent({
  course,
  courseStudents,
  organizationId,
  activeTab,
  onTabChange,
  onEnrollStudent,
  onCourseDeleted,
  onCourseUpdated,
  onRefreshStudents
}: CourseDetailsContentProps) {
  const navigate = useNavigate();
  const { isEnabled } = useOrgFeatures(organizationId);
  const { plan: orgPlan } = useSubscriptionLimits(organizationId);
  const isFreePlan = orgPlan === 'free';
  const isFrdoEnabled = isEnabled('frdo');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [skipVideoId, setSkipVideoId] = useState(course?.skip_video_identification || false);
  const [sequentialLessons, setSequentialLessons] = useState(course?.sequential_lessons || false);
  const [allowVideoSeek, setAllowVideoSeek] = useState(course?.allow_video_seek !== false);
  const [trainingForm, setTrainingForm] = useState(course?.training_form || "Очная");
  const [retrainingPeriod, setRetrainingPeriod] = useState<number | null>(course?.retraining_period_months ?? null);
  const [reminderAdvanceDays, setReminderAdvanceDays] = useState<number>((course as any)?.reminder_advance_days ?? 30);
  const [notifyOnCompletion, setNotifyOnCompletion] = useState<boolean>((course as any)?.notify_on_completion ?? false);
  const [completionNotifyEmails, setCompletionNotifyEmails] = useState<string | null>((course as any)?.completion_notify_emails ?? null);
  const [defaultAccessDays, setDefaultAccessDays] = useState<number | null>((course as any)?.default_access_days ?? null);
  const [requireEnrollmentApproval, setRequireEnrollmentApproval] = useState<boolean>((course as any)?.require_enrollment_approval ?? false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  const [copyProtection, setCopyProtection] = useState(false);
  const [videoWatermark, setVideoWatermark] = useState(false);
  const [externalCardUrl, setExternalCardUrl] = useState("");
  const [resetConfirmStudent, setResetConfirmStudent] = useState<Student | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  
  const [enrollPopoverOpen, setEnrollPopoverOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [enrollSearchQuery, setEnrollSearchQuery] = useState("");
  const [selectedToEnroll, setSelectedToEnroll] = useState<Set<string>>(new Set());
  const [isEnrolling, setIsEnrolling] = useState(false);
  
  const [frdoSettings, setFrdoSettings] = useState<CourseFRDOSettings>({
    frdo_program_type: null,
    frdo_document_type: null,
    frdo_professional_area: null,
    frdo_specialty_group: null,
    frdo_qualification_name: null,
    frdo_profession_name: null,
    frdo_qualification_rank: null,
    frdo_duration_hours: null,
    frdo_financing_source: null,
    frdo_education_form: null,
  });

  useEffect(() => {
    if (course) {
      setSkipVideoId(course.skip_video_identification || false);
      setSequentialLessons(course.sequential_lessons || false);
      setAllowVideoSeek(course.allow_video_seek !== false);
      setTrainingForm(course.training_form || "Очная");
      setRetrainingPeriod(course.retraining_period_months ?? null);
      setReminderAdvanceDays((course as any).reminder_advance_days ?? 30);
      setNotifyOnCompletion((course as any).notify_on_completion ?? false);
      setCompletionNotifyEmails((course as any).completion_notify_emails ?? null);
      setDefaultAccessDays((course as any).default_access_days ?? null);
      setRequireEnrollmentApproval((course as any).require_enrollment_approval ?? false);
      setFrdoSettings({
        frdo_program_type: course.frdo_program_type || null,
        frdo_document_type: course.frdo_document_type || null,
        frdo_professional_area: course.frdo_professional_area || null,
        frdo_specialty_group: course.frdo_specialty_group || null,
        frdo_qualification_name: course.frdo_qualification_name || null,
        frdo_profession_name: course.frdo_profession_name || null,
        frdo_qualification_rank: course.frdo_qualification_rank || null,
        frdo_duration_hours: course.frdo_duration_hours ?? null,
        frdo_financing_source: course.frdo_financing_source || null,
        frdo_education_form: course.frdo_education_form || null,
      });
      const lc = (course as any).landing_content as any;
      setCopyProtection(lc?.copy_protection || false);
      setVideoWatermark(lc?.video_watermark || false);
      setExternalCardUrl(lc?.external_card_url || "");
    }
  }, [course]);

  const loadAvailableStudents = useCallback(async () => {
    if (!organizationId || !course) return;
    setIsLoadingAvailable(true);
    try {
      const enrolledUserIds = new Set(courseStudents.map(s => s.user_id));
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email")
        .eq("organization_id", organizationId);
      
      const profileUserIds = (allProfiles || []).map(p => p.user_id);
      let excludedUserIds = new Set<string>();
      if (profileUserIds.length > 0) {
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", profileUserIds)
          .in("role", ["organization", "admin"]);
        excludedUserIds = new Set((rolesData || []).map(r => r.user_id));
      }
      
      const available = (allProfiles || [])
        .filter(p => !enrolledUserIds.has(p.user_id) && !excludedUserIds.has(p.user_id))
        .map(p => ({ id: p.id, user_id: p.user_id, name: p.full_name || "Без имени", email: p.email || "" }));
      setAvailableStudents(available);
    } catch (error) {
      console.error("Error loading available students:", error);
      toast.error("Ошибка загрузки списка учеников");
    } finally {
      setIsLoadingAvailable(false);
    }
  }, [organizationId, course, courseStudents]);

  useEffect(() => {
    if (enrollPopoverOpen) {
      loadAvailableStudents();
      setSelectedToEnroll(new Set());
      setEnrollSearchQuery("");
    }
  }, [enrollPopoverOpen, loadAvailableStudents]);

  const handleEnrollSelected = async () => {
    if (!course || selectedToEnroll.size === 0) return;
    setIsEnrolling(true);
    try {
      const userIds = Array.from(selectedToEnroll);
      const { data: existingEnrollments } = await supabase
        .from("enrollments").select("user_id").eq("course_id", course.id).in("user_id", userIds);
      const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));
      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        setSelectedToEnroll(new Set());
        return;
      }
      const enrollmentsToInsert = newUserIds.map(userId => ({ user_id: userId, course_id: course.id, status: "active", progress: 0, ...(defaultAccessDays ? { access_days: defaultAccessDays } : {}) }));
      const { error } = await supabase.from("enrollments").insert(enrollmentsToInsert);
      if (error) throw error;
      toast.success(`Зачислено ${newUserIds.length} ${newUserIds.length === 1 ? 'ученик' : newUserIds.length < 5 ? 'ученика' : 'учеников'}`);
      setSelectedToEnroll(new Set());
      setEnrollPopoverOpen(false);
      onRefreshStudents?.();
    } catch (error) {
      console.error("Error enrolling students:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsEnrolling(false);
    }
  };

  const toggleStudentToEnroll = (userId: string) => {
    setSelectedToEnroll(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) newSet.delete(userId); else newSet.add(userId);
      return newSet;
    });
  };

  const filteredAvailableStudents = availableStudents.filter(s => 
    s.name.toLowerCase().includes(enrollSearchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(enrollSearchQuery.toLowerCase())
  );

  const handleToggleSkipVideoId = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ skip_video_identification: value }).eq("id", course.id);
      if (error) throw error;
      setSkipVideoId(value);
      toast.success(value ? "Видеоидентификация отключена для этого курса" : "Видеоидентификация включена для этого курса");
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating course:", error); toast.error("Ошибка сохранения настроек"); }
    finally { setIsSavingSettings(false); }
  };

  const handleToggleSequentialLessons = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ sequential_lessons: value }).eq("id", course.id);
      if (error) throw error;
      setSequentialLessons(value);
      toast.success(value ? "Последовательность уроков включена" : "Последовательность уроков отключена");
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating course:", error); toast.error("Ошибка сохранения настроек"); }
    finally { setIsSavingSettings(false); }
  };

  const handleToggleAllowVideoSeek = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ allow_video_seek: value }).eq("id", course.id);
      if (error) throw error;
      setAllowVideoSeek(value);
      toast.success(value ? "Перемотка видео разрешена" : "Перемотка видео запрещена");
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating course:", error); toast.error("Ошибка сохранения настроек"); }
    finally { setIsSavingSettings(false); }
  };

  const handleUpdateLandingContentField = async (key: string, value: any) => {
    if (!course) return;
    setIsSavingSettings(true);
    try {
      const { data: current } = await supabase.from("courses").select("landing_content").eq("id", course.id).single();
      const currentContent = (current?.landing_content as any) || {};
      const updatedContent = { ...currentContent, [key]: value };
      const { error } = await supabase.from("courses").update({ landing_content: updatedContent } as any).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating landing content:", error); toast.error("Ошибка сохранения настроек"); }
    finally { setIsSavingSettings(false); }
  };

  const handleToggleCopyProtection = async (value: boolean) => {
    setCopyProtection(value);
    await handleUpdateLandingContentField("copy_protection", value);
    toast.success(value ? "Защита от копирования включена" : "Защита от копирования отключена");
  };

  const handleToggleVideoWatermark = async (value: boolean) => {
    setVideoWatermark(value);
    await handleUpdateLandingContentField("video_watermark", value);
    toast.success(value ? "Водяные знаки на видео включены" : "Водяные знаки на видео отключены");
  };

  const handleUpdateExternalCardUrl = async (value: string) => {
    setExternalCardUrl(value);
    await handleUpdateLandingContentField("external_card_url", value || null);
  };

  const handleUpdateDefaultAccessDays = async (value: string) => {
    const days = value ? parseInt(value) : null;
    if (value && isNaN(days!)) return;
    setDefaultAccessDays(days);
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ default_access_days: days } as any).eq("id", course.id);
      if (error) throw error;
      toast.success(days ? `Срок доступа: ${days} дней` : "Безлимитный доступ");
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating default_access_days:", error); toast.error("Ошибка сохранения"); }
    finally { setIsSavingSettings(false); }
  };

  const handleToggleRequireEnrollmentApproval = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ require_enrollment_approval: value } as any).eq("id", course.id);
      if (error) throw error;
      setRequireEnrollmentApproval(value);
      toast.success(value ? "Запись по заявке включена" : "Запись по заявке отключена");
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating require_enrollment_approval:", error); toast.error("Ошибка сохранения"); }
    finally { setIsSavingSettings(false); }
  };

  const handleUpdateFrdoSettings = async (field: string, value: string | number | null) => {
    if (!course) return;
    setFrdoSettings(prev => {
      const newSettings = { ...prev, [field]: value };
      if (field === "frdo_program_type" && value) {
        newSettings.frdo_document_type = FRDO_DOCUMENT_TYPES[value as string] || null;
      }
      return newSettings;
    });
    setIsSavingSettings(true);
    try {
      const updateData: Record<string, string | number | null> = { [field]: value };
      if (field === "frdo_program_type" && value) {
        updateData.frdo_document_type = FRDO_DOCUMENT_TYPES[value] || null;
      }
      const { error } = await supabase.from("courses").update(updateData).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating FRDO settings:", error); toast.error("Ошибка сохранения настроек FRDO"); }
    finally { setIsSavingSettings(false); }
  };

  const handleUpdateTrainingForm = async (value: string) => {
    if (!course) return;
    setTrainingForm(value);
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ training_form: value }).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating training form:", error); toast.error("Ошибка сохранения формы обучения"); }
    finally { setIsSavingSettings(false); }
  };

  const handleResetProgress = async (student: Student) => {
    if (!course || !student.enrollment_id) return;
    setIsResetting(true);
    try {
      const { data: lessons } = await supabase.from("lessons").select("id").eq("course_id", course.id);
      const lessonIds = (lessons || []).map(l => l.id);
      if (lessonIds.length > 0) {
        await supabase.from("lesson_progress").delete().eq("user_id", student.user_id).in("lesson_id", lessonIds);
        await supabase.from("test_attempts").delete().eq("user_id", student.user_id).in("lesson_id", lessonIds);
      }
      const { error } = await supabase.from("enrollments").update({ progress: 0, status: "active", completed_at: null }).eq("id", student.enrollment_id);
      if (error) throw error;
      toast.success(`Прогресс ученика "${student.name}" сброшен`);
      setResetConfirmStudent(null);
      onRefreshStudents?.();
    } catch (error) { console.error("Error resetting progress:", error); toast.error("Ошибка сброса прогресса"); }
    finally { setIsResetting(false); }
  };

  const handleDeleteCourse = async () => {
    setIsDeleting(true);
    try {
      await supabase.from("enrollments").delete().eq("course_id", course.id);
      await supabase.from("lessons").delete().eq("course_id", course.id);
      await supabase.from("course_documents").delete().eq("course_id", course.id);
      const { error } = await supabase.from("courses").delete().eq("id", course.id);
      if (error) throw error;
      toast.success("Курс удалён");
      setShowDeleteConfirm(false);
      onCourseDeleted?.();
      navigate("/organization");
    } catch (error) { console.error("Error deleting course:", error); toast.error("Ошибка удаления курса"); }
    finally { setIsDeleting(false); }
  };

  const totalStudents = courseStudents.length;
  const activeStudents = courseStudents.filter(s => s.status !== 'completed').length;
  const completedStudents = courseStudents.filter(s => s.status === 'completed').length;
  const avgProgress = totalStudents > 0 
    ? Math.min(Math.round(courseStudents.reduce((sum, s) => sum + Math.min(s.progress, 100), 0) / totalStudents), 100)
    : 0;
  const completionRate = totalStudents > 0 ? Math.round(completedStudents / totalStudents * 100) : 0;

  return (
    <>
      {/* Course header with stats */}
      <div className="border-b border-border bg-gradient-to-br from-primary/10 to-accent/10 rounded-t-2xl">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-semibold mb-2">{course.title}</h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  course.is_published 
                    ? 'bg-sigma-green/10 text-sigma-green' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {course.is_published ? 'Опубликован' : 'Черновик'}
                </span>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {course.studentsCount} учеников
                </div>
                <div className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {course.lessonsCount} уроков
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate(`/course-preview/${course.id}`)}>
                <Eye className="w-4 h-4" />
                Просмотр
              </Button>
              <Button className="rounded-xl gap-2 btn-gradient" onClick={() => navigate(`/course-builder/${course.id}`)}>
                <Edit className="w-4 h-4" />
                Редактировать
              </Button>
              <Button variant="outline" className="rounded-xl gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="w-4 h-4" />
                Удалить
              </Button>
            </div>
          </div>
          
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
      </div>

      <div className="flex flex-col lg:flex-row flex-1">
        {/* Sidebar navigation */}
        <nav className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-gradient-to-b from-card to-muted/20">
          <div className="p-4 space-y-1 overflow-x-auto lg:overflow-x-visible flex lg:flex-col gap-1">
            <div className="hidden lg:block">
              <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-3 mb-2">Обучение</p>
            </div>
            {([
              { value: "students" as const, label: "Ученики", icon: Users, color: "text-primary" },
              { value: "requests" as const, label: "Заявки", icon: ClipboardCheck, color: "text-orange-500" },
              { value: "materials" as const, label: "Материалы", icon: FileText, color: "text-amber-500" },
              { value: "history" as const, label: "История", icon: History, color: "text-violet-500" },
              { value: "tests" as const, label: "Тесты", icon: CheckSquare, color: "text-emerald-500" },
              { value: "groups" as const, label: "Группы", icon: Users, color: "text-blue-500" },
            ]).map(item => (
              <button
                key={item.value}
                onClick={() => onTabChange(item.value)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap",
                  "hover:bg-primary/10 hover:text-primary hover:translate-x-0.5",
                  activeTab === item.value
                    ? "bg-primary/15 text-primary lg:border-r-2 lg:border-primary"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", activeTab === item.value ? "text-primary" : item.color)} />
                {item.label}
              </button>
            ))}

            <div className="hidden lg:block mt-4">
              <div className="border-t border-border/50 mb-3" />
              <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-3 mb-2">Настройки</p>
            </div>
            <div className="lg:hidden w-px bg-border/50 mx-1 shrink-0" />

            {([
              { value: "landing" as const, label: "Страница курса", icon: Globe, color: "text-rose-500" },
              { value: "settings" as const, label: "Настройки", icon: Settings, color: "text-muted-foreground" },
              { value: "reminders" as const, label: "Напоминания", icon: Bell, color: "text-orange-500" },
            ]).map(item => (
              <button
                key={item.value}
                onClick={() => onTabChange(item.value)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap",
                  "hover:bg-primary/10 hover:text-primary hover:translate-x-0.5",
                  activeTab === item.value
                    ? "bg-primary/15 text-primary lg:border-r-2 lg:border-primary"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", activeTab === item.value ? "text-primary" : item.color)} />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content panel */}
        <div className="flex-1 p-6 min-w-0">
          {activeTab === "students" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Ученики курса</h3>
                <Popover open={enrollPopoverOpen} onOpenChange={setEnrollPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button className="btn-gradient rounded-xl gap-2"><Plus className="w-4 h-4" />Зачислить ученика</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <div className="p-3 border-b border-border">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Поиск учеников..." value={enrollSearchQuery} onChange={(e) => setEnrollSearchQuery(e.target.value)} className="pl-9 rounded-lg" />
                      </div>
                    </div>
                    <ScrollArea className="h-64">
                      {isLoadingAvailable ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                      ) : filteredAvailableStudents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          {availableStudents.length === 0 ? "Нет доступных учеников для зачисления" : "Ученики не найдены"}
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {filteredAvailableStudents.map(student => (
                            <div key={student.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors" onClick={() => toggleStudentToEnroll(student.user_id)}>
                              <Checkbox checked={selectedToEnroll.has(student.user_id)} onCheckedChange={() => toggleStudentToEnroll(student.user_id)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{student.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{student.email}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    {selectedToEnroll.size > 0 && (
                      <div className="p-3 border-t border-border">
                        <Button className="w-full btn-gradient rounded-lg gap-2" onClick={handleEnrollSelected} disabled={isEnrolling}>
                          {isEnrolling ? (<><Loader2 className="w-4 h-4 animate-spin" />Зачисление...</>) : (<><UserPlus className="w-4 h-4" />Зачислить ({selectedToEnroll.size})</>)}
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              {courseStudents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Нет зачисленных учеников</p></div>
              ) : (
                <div className="space-y-2">
                  {courseStudents.map(student => (
                    <div key={student.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
                      <div><div className="font-medium">{student.name}</div><div className="text-sm text-muted-foreground">{student.email}</div></div>
                      <div className="flex items-center gap-4">
                        <div className="text-right"><div className="text-sm font-medium">{Math.min(student.progress, 100)}%</div><Progress value={Math.min(student.progress, 100)} className="w-24 h-2" /></div>
                        <span className={`px-2 py-1 rounded-full text-xs ${student.status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : 'bg-primary/10 text-primary'}`}>
                          {student.status === 'completed' ? 'Завершил' : 'Активный'}
                        </span>
                        {student.progress > 0 && student.enrollment_id && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setResetConfirmStudent(student)} title="Сбросить прогресс">
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "materials" && (
            <CourseDocumentsManager courseId={course.id} courseName={course.title} embedded={true} />
          )}

          {activeTab === "history" && (
            <EnrollmentHistory courseId={course.id} organizationId={organizationId || ""} courseName={course.title} />
          )}

          {activeTab === "tests" && (
            <CourseTestReport courseId={course.id} courseName={course.title} organizationId={organizationId || ""} />
          )}

          {activeTab === "landing" && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-4 border border-primary/20 cursor-pointer hover:shadow-md transition-all" onClick={() => navigate(`/course/${course.id}/landing-editor`)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20"><Globe className="w-5 h-5 text-primary" /></div>
                    <div><h4 className="font-semibold text-sm">Визуальный редактор</h4><p className="text-xs text-muted-foreground">Настройте продающую страницу курса с визуальным редактором</p></div>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-lg gap-2"><ExternalLink className="w-4 h-4" />Открыть редактор</Button>
                </div>
              </div>
              <CoursePageSettingsContent courseId={course.id} courseTitle={course.title} courseDescription={course.description || undefined} />
            </div>
          )}

          {activeTab === "settings" && (
            <CourseSettingsTabbed
              course={course}
              isFrdoEnabled={isFrdoEnabled}
              isSavingSettings={isSavingSettings}
              skipVideoId={skipVideoId}
              onToggleSkipVideoId={handleToggleSkipVideoId}
              sequentialLessons={sequentialLessons}
              onToggleSequentialLessons={handleToggleSequentialLessons}
              allowVideoSeek={allowVideoSeek}
              onToggleAllowVideoSeek={handleToggleAllowVideoSeek}
              copyProtection={copyProtection}
              onToggleCopyProtection={handleToggleCopyProtection}
              videoWatermark={videoWatermark}
              onToggleVideoWatermark={handleToggleVideoWatermark}
              externalCardUrl={externalCardUrl}
              setExternalCardUrl={setExternalCardUrl}
              onUpdateExternalCardUrl={handleUpdateExternalCardUrl}
              defaultAccessDays={defaultAccessDays}
              setDefaultAccessDays={setDefaultAccessDays}
              onUpdateDefaultAccessDays={handleUpdateDefaultAccessDays}
              requireEnrollmentApproval={requireEnrollmentApproval}
              onToggleRequireEnrollmentApproval={handleToggleRequireEnrollmentApproval}
              trainingForm={trainingForm}
              onUpdateTrainingForm={handleUpdateTrainingForm}
              frdoSettings={frdoSettings}
              onUpdateFrdoSettings={handleUpdateFrdoSettings}
            />
          )}


          {activeTab === "reminders" && (
            <CourseRemindersTab
              courseId={course.id}
              organizationId={organizationId || ""}
              retrainingPeriodMonths={retrainingPeriod}
              reminderAdvanceDays={reminderAdvanceDays}
              onPeriodChange={async (months) => {
                setRetrainingPeriod(months);
                try {
                  const { error } = await supabase.from("courses").update({ retraining_period_months: months } as any).eq("id", course.id);
                  if (error) throw error;
                  toast.success(months ? `Периодичность: ${months} мес.` : "Периодичность отключена");
                  onCourseUpdated?.();
                } catch (error) { console.error("Error updating retraining period:", error); toast.error("Ошибка сохранения"); }
              }}
              onAdvanceDaysChange={async (days) => {
                setReminderAdvanceDays(days);
                try {
                  const { error } = await supabase.from("courses").update({ reminder_advance_days: days } as any).eq("id", course.id);
                  if (error) throw error;
                  toast.success(`Напоминание за ${days} дней`);
                  onCourseUpdated?.();
                } catch (error) { console.error("Error updating advance days:", error); toast.error("Ошибка сохранения"); }
              }}
              notifyOnCompletion={notifyOnCompletion}
              completionNotifyEmails={completionNotifyEmails}
              onNotifyOnCompletionChange={async (value) => {
                setNotifyOnCompletion(value);
                try {
                  const { error } = await supabase.from("courses").update({ notify_on_completion: value } as any).eq("id", course.id);
                  if (error) throw error;
                  toast.success(value ? "Уведомления включены" : "Уведомления отключены");
                  onCourseUpdated?.();
                } catch (error) { console.error("Error updating notify_on_completion:", error); toast.error("Ошибка сохранения"); }
              }}
              onCompletionNotifyEmailsChange={async (value) => {
                setCompletionNotifyEmails(value || null);
                try {
                  const { error } = await supabase.from("courses").update({ completion_notify_emails: value || null } as any).eq("id", course.id);
                  if (error) throw error;
                  onCourseUpdated?.();
                } catch (error) { console.error("Error updating completion_notify_emails:", error); }
              }}
            />
          )}

          {activeTab === "groups" && (
            <CourseGroupsTab courseId={course.id} organizationId={organizationId || ""} onRefreshStudents={onRefreshStudents} />
          )}
        </div>
      </div>

      {/* Reset Progress Confirmation Dialog */}
      <AlertDialog open={!!resetConfirmStudent} onOpenChange={(open) => !open && setResetConfirmStudent(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить прогресс?</AlertDialogTitle>
            <AlertDialogDescription>Вы уверены, что хотите сбросить прогресс ученика "{resetConfirmStudent?.name}"? Все результаты тестов и отметки о прохождении уроков будут удалены.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={isResetting}>Отмена</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => resetConfirmStudent && handleResetProgress(resetConfirmStudent)} disabled={isResetting}>
              {isResetting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Сброс...</>) : (<><RotateCcw className="w-4 h-4 mr-2" />Сбросить</>)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить курс?</AlertDialogTitle>
            <AlertDialogDescription>Вы уверены, что хотите удалить курс "{course.title}"? Будут также удалены все уроки, материалы и записи о зачислении учеников. Это действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteCourse} disabled={isDeleting}>
              {isDeleting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Удаление...</>) : (<><Trash2 className="w-4 h-4 mr-2" />Удалить</>)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
