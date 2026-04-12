import React, { useState, useEffect, useCallback } from "react";
import { useOrgFeatures } from "@/hooks/useOrgFeatures";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  FileSpreadsheet,
  Bell,
  Globe,
  ShieldCheck,
  Droplets,
  ExternalLink
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
  // FRDO settings
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
  open,
  onOpenChange,
  course,
  courseStudents,
  organizationId,
  activeTab,
  onTabChange,
  onEnrollStudent,
  onCourseDeleted,
  onCourseUpdated,
  onRefreshStudents
}: CourseDetailsModalProps) {
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
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  // New extended settings from landing_content
  const [copyProtection, setCopyProtection] = useState(false);
  const [videoWatermark, setVideoWatermark] = useState(false);
  const [externalCardUrl, setExternalCardUrl] = useState("");
  const [resetConfirmStudent, setResetConfirmStudent] = useState<Student | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  
  // Inline enrollment popover state
  const [enrollPopoverOpen, setEnrollPopoverOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [enrollSearchQuery, setEnrollSearchQuery] = useState("");
  const [selectedToEnroll, setSelectedToEnroll] = useState<Set<string>>(new Set());
  const [isEnrolling, setIsEnrolling] = useState(false);
  
  // FRDO settings state
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
      // Load FRDO settings from course
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
      // Load extended settings from landing_content
      const lc = (course as any).landing_content as any;
      setCopyProtection(lc?.copy_protection || false);
      setVideoWatermark(lc?.video_watermark || false);
      setExternalCardUrl(lc?.external_card_url || "");
    }
  }, [course]);

  // Load available students when popover opens
  const loadAvailableStudents = useCallback(async () => {
    if (!organizationId || !course) return;
    
    setIsLoadingAvailable(true);
    try {
      const enrolledUserIds = new Set(courseStudents.map(s => s.user_id));
      
      // Get all profiles in organization
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email")
        .eq("organization_id", organizationId);
      
      // Filter out admin/org roles
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
        .map(p => ({
          id: p.id,
          user_id: p.user_id,
          name: p.full_name || "Без имени",
          email: p.email || ""
        }));
      
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
      
      // Check for existing enrollments
      const { data: existingEnrollments } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", course.id)
        .in("user_id", userIds);
      
      const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));
      
      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        setSelectedToEnroll(new Set());
        return;
      }
      
      const enrollmentsToInsert = newUserIds.map(userId => ({
        user_id: userId,
        course_id: course.id,
        status: "active",
        progress: 0
      }));
      
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
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const filteredAvailableStudents = availableStudents.filter(s => 
    s.name.toLowerCase().includes(enrollSearchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(enrollSearchQuery.toLowerCase())
  );

  if (!course) return null;

  const handleToggleSkipVideoId = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from("courses")
        .update({ skip_video_identification: value })
        .eq("id", course.id);
      
      if (error) throw error;
      
      setSkipVideoId(value);
      toast.success(value ? "Видеоидентификация отключена для этого курса" : "Видеоидентификация включена для этого курса");
      onCourseUpdated?.();
    } catch (error) {
      console.error("Error updating course:", error);
      toast.error("Ошибка сохранения настроек");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleToggleSequentialLessons = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from("courses")
        .update({ sequential_lessons: value })
        .eq("id", course.id);
      
      if (error) throw error;
      
      setSequentialLessons(value);
      toast.success(value ? "Последовательность уроков включена" : "Последовательность уроков отключена");
      onCourseUpdated?.();
    } catch (error) {
      console.error("Error updating course:", error);
      toast.error("Ошибка сохранения настроек");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleToggleAllowVideoSeek = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from("courses")
        .update({ allow_video_seek: value })
        .eq("id", course.id);
      
      if (error) throw error;
      
      setAllowVideoSeek(value);
      toast.success(value ? "Перемотка видео разрешена" : "Перемотка видео запрещена");
      onCourseUpdated?.();
    } catch (error) {
      console.error("Error updating course:", error);
      toast.error("Ошибка сохранения настроек");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleUpdateLandingContentField = async (key: string, value: any) => {
    if (!course) return;
    setIsSavingSettings(true);
    try {
      // Fetch current landing_content
      const { data: current } = await supabase
        .from("courses")
        .select("landing_content")
        .eq("id", course.id)
        .single();
      
      const currentContent = (current?.landing_content as any) || {};
      const updatedContent = { ...currentContent, [key]: value };
      
      const { error } = await supabase
        .from("courses")
        .update({ landing_content: updatedContent } as any)
        .eq("id", course.id);
      
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) {
      console.error("Error updating landing content:", error);
      toast.error("Ошибка сохранения настроек");
    } finally {
      setIsSavingSettings(false);
    }
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

  const handleUpdateFrdoSettings = async (field: string, value: string | number | null) => {
    if (!course) return;
    
    // Update local state immediately
    setFrdoSettings(prev => {
      const newSettings = { ...prev, [field]: value };
      
      // Auto-set document type when program type changes
      if (field === "frdo_program_type" && value) {
        newSettings.frdo_document_type = FRDO_DOCUMENT_TYPES[value as string] || null;
      }
      
      return newSettings;
    });
    
    setIsSavingSettings(true);
    try {
      const updateData: Record<string, string | number | null> = { [field]: value };
      
      // Auto-set document type when program type changes
      if (field === "frdo_program_type" && value) {
        updateData.frdo_document_type = FRDO_DOCUMENT_TYPES[value] || null;
      }
      
      const { error } = await supabase
        .from("courses")
        .update(updateData)
        .eq("id", course.id);
      
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) {
      console.error("Error updating FRDO settings:", error);
      toast.error("Ошибка сохранения настроек FRDO");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleUpdateTrainingForm = async (value: string) => {
    if (!course) return;
    setTrainingForm(value);
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from("courses")
        .update({ training_form: value })
        .eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) {
      console.error("Error updating training form:", error);
      toast.error("Ошибка сохранения формы обучения");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleResetProgress = async (student: Student) => {
    if (!course || !student.enrollment_id) return;
    
    setIsResetting(true);
    try {
      // Get all lessons for this course
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id")
        .eq("course_id", course.id);
      
      const lessonIds = (lessons || []).map(l => l.id);
      
      if (lessonIds.length > 0) {
        // Delete lesson progress
        await supabase
          .from("lesson_progress")
          .delete()
          .eq("user_id", student.user_id)
          .in("lesson_id", lessonIds);
        
        // Delete test attempts
        await supabase
          .from("test_attempts")
          .delete()
          .eq("user_id", student.user_id)
          .in("lesson_id", lessonIds);
      }
      
      // Reset enrollment
      const { error } = await supabase
        .from("enrollments")
        .update({ progress: 0, status: "active", completed_at: null })
        .eq("id", student.enrollment_id);
      
      if (error) throw error;
      
      toast.success(`Прогресс ученика "${student.name}" сброшен`);
      setResetConfirmStudent(null);
      onRefreshStudents?.();
    } catch (error) {
      console.error("Error resetting progress:", error);
      toast.error("Ошибка сброса прогресса");
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteCourse = async () => {
    setIsDeleting(true);
    try {
      // Delete enrollments first
      await supabase.from("enrollments").delete().eq("course_id", course.id);
      
      // Delete lessons
      await supabase.from("lessons").delete().eq("course_id", course.id);
      
      // Delete course documents
      await supabase.from("course_documents").delete().eq("course_id", course.id);
      
      // Delete the course
      const { error } = await supabase.from("courses").delete().eq("id", course.id);
      if (error) throw error;
      
      toast.success("Курс удалён");
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onCourseDeleted?.();
    } catch (error) {
      console.error("Error deleting course:", error);
      toast.error("Ошибка удаления курса");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalStudents = courseStudents.length;
  const activeStudents = courseStudents.filter(s => s.status !== 'completed').length;
  const completedStudents = courseStudents.filter(s => s.status === 'completed').length;
  const avgProgress = totalStudents > 0 
    ? Math.min(Math.round(courseStudents.reduce((sum, s) => sum + Math.min(s.progress, 100), 0) / totalStudents), 100)
    : 0;
  const completionRate = totalStudents > 0 
    ? Math.round(completedStudents / totalStudents * 100) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <div className="p-6 border-b border-border bg-gradient-to-br from-primary/10 to-accent/10">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-semibold mb-2">{course.title}</DialogTitle>
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
              <Button 
                variant="outline" 
                className="rounded-xl gap-2" 
                onClick={() => navigate(`/course-preview/${course.id}`)}
              >
                <Eye className="w-4 h-4" />
                Просмотр
              </Button>
              <Button 
                className="rounded-xl gap-2 btn-gradient" 
                onClick={() => navigate(`/course-builder/${course.id}`)}
              >
                <Edit className="w-4 h-4" />
                Редактировать
              </Button>
              <Button 
                variant="outline" 
                className="rounded-xl gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground" 
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4" />
                Удалить
              </Button>
            </div>
          </div>
          
          {/* Course Statistics */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{avgProgress}%</div>
                  <div className="text-xs text-muted-foreground">Средний прогресс</div>
                </div>
              </div>
              <Progress value={avgProgress} className="mt-3 h-1.5" />
            </div>
            
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sigma-green/10">
                  <Users className="w-5 h-5 text-sigma-green" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{activeStudents}</div>
                  <div className="text-xs text-muted-foreground">Активных учеников</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                из {totalStudents} зачисленных
              </div>
            </div>
            
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{completionRate}%</div>
                  <div className="text-xs text-muted-foreground">Завершаемость</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {completedStudents} из {totalStudents} завершили
              </div>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={v => onTabChange(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 border-b border-border">
            <TabsList className="bg-secondary/50 rounded-xl">
              <TabsTrigger value="students" className="rounded-lg gap-2">
                <Users className="w-4 h-4" />
                Ученики
              </TabsTrigger>
              <TabsTrigger value="materials" className="rounded-lg gap-2">
                <FileText className="w-4 h-4" />
                Материалы
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg gap-2">
                <History className="w-4 h-4" />
                История
              </TabsTrigger>
              <TabsTrigger value="tests" className="rounded-lg gap-2">
                <CheckSquare className="w-4 h-4" />
                Тесты
              </TabsTrigger>
              <TabsTrigger value="landing" className="rounded-lg gap-2">
                <Globe className="w-4 h-4" />
                Страница курса
              </TabsTrigger>
              <TabsTrigger value="settings" className="rounded-lg gap-2">
                <Settings className="w-4 h-4" />
                Настройки
              </TabsTrigger>
              <TabsTrigger value="reminders" className="rounded-lg gap-2">
                <Bell className="w-4 h-4" />
                Напоминания
              </TabsTrigger>
              <TabsTrigger value="groups" className="rounded-lg gap-2">
                <Users className="w-4 h-4" />
                Группы
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="students" className="mt-0 h-full">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Ученики курса</h3>
                  <Popover open={enrollPopoverOpen} onOpenChange={setEnrollPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button className="btn-gradient rounded-xl gap-2">
                        <Plus className="w-4 h-4" />
                        Зачислить ученика
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end">
                      <div className="p-3 border-b border-border">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Поиск учеников..."
                            value={enrollSearchQuery}
                            onChange={(e) => setEnrollSearchQuery(e.target.value)}
                            className="pl-9 rounded-lg"
                          />
                        </div>
                      </div>
                      
                      <ScrollArea className="h-64">
                        {isLoadingAvailable ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : filteredAvailableStudents.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            {availableStudents.length === 0 
                              ? "Нет доступных учеников для зачисления"
                              : "Ученики не найдены"
                            }
                          </div>
                        ) : (
                          <div className="p-2 space-y-1">
                            {filteredAvailableStudents.map(student => (
                              <div 
                                key={student.user_id}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
                                onClick={() => toggleStudentToEnroll(student.user_id)}
                              >
                                <Checkbox 
                                  checked={selectedToEnroll.has(student.user_id)}
                                  onCheckedChange={() => toggleStudentToEnroll(student.user_id)}
                                />
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
                          <Button 
                            className="w-full btn-gradient rounded-lg gap-2"
                            onClick={handleEnrollSelected}
                            disabled={isEnrolling}
                          >
                            {isEnrolling ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Зачисление...
                              </>
                            ) : (
                              <>
                                <UserPlus className="w-4 h-4" />
                                Зачислить ({selectedToEnroll.size})
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                
                {courseStudents.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Нет зачисленных учеников</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {courseStudents.map(student => (
                      <div key={student.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
                        <div>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-sm text-muted-foreground">{student.email}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">{Math.min(student.progress, 100)}%</div>
                            <Progress value={Math.min(student.progress, 100)} className="w-24 h-2" />
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            student.status === 'completed' 
                              ? 'bg-sigma-green/10 text-sigma-green' 
                              : 'bg-primary/10 text-primary'
                          }`}>
                            {student.status === 'completed' ? 'Завершил' : 'Активный'}
                          </span>
                          {student.progress > 0 && student.enrollment_id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setResetConfirmStudent(student)}
                              title="Сбросить прогресс"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="materials" className="mt-0 h-full">
              <CourseDocumentsManager 
                courseId={course.id} 
                courseName={course.title} 
                embedded={true} 
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0 h-full">
              <EnrollmentHistory 
                courseId={course.id} 
                organizationId={organizationId || ""} 
                courseName={course.title} 
              />
            </TabsContent>

            <TabsContent value="tests" className="mt-0">
              <CourseTestReport 
                courseId={course.id} 
                courseName={course.title} 
                organizationId={organizationId || ""} 
              />
            </TabsContent>

            <TabsContent value="landing" className="mt-0 h-full">
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-4 border border-primary/20 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => navigate(`/course/${course.id}/landing-editor`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/20">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">Визуальный редактор</h4>
                        <p className="text-xs text-muted-foreground">Настройте продающую страницу курса с визуальным редактором</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-lg gap-2">
                      <ExternalLink className="w-4 h-4" />
                      Открыть редактор
                    </Button>
                  </div>
                </div>

                <CoursePageSettingsContent courseId={course.id} courseTitle={course.title} />
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 h-full">
              <div className="space-y-6">
                <div 
                  className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-4 border border-primary/20 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => navigate(`/course/${course.id}/landing-editor`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/20">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">Страница курса</h4>
                        <p className="text-xs text-muted-foreground">Настройте продающую страницу курса с визуальным редактором</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-lg gap-2">
                      <ExternalLink className="w-4 h-4" />
                      Открыть редактор
                    </Button>
                  </div>
                </div>

                <h3 className="font-semibold">Настройки курса</h3>
                
                <div className="bg-secondary/30 rounded-xl p-4 space-y-6">
                  {/* Skip video identification */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                        <Video className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <Label htmlFor="skip-video-id" className="text-sm font-medium">
                          Отключить видеоидентификацию
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Если включено, слушатели этого курса смогут начать обучение без прохождения видеоидентификации
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="skip-video-id"
                      checked={skipVideoId}
                      onCheckedChange={handleToggleSkipVideoId}
                      disabled={isSavingSettings}
                    />
                  </div>

                  {/* Sequential lessons */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/10 mt-0.5">
                        <Lock className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <Label htmlFor="sequential-lessons" className="text-sm font-medium">
                          Последовательное прохождение уроков
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Если включено, ученики смогут открывать следующий урок только после завершения предыдущего
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="sequential-lessons"
                      checked={sequentialLessons}
                      onCheckedChange={handleToggleSequentialLessons}
                      disabled={isSavingSettings}
                    />
                  </div>

                  {/* Allow video seek */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-destructive/10 mt-0.5">
                        <FastForward className="w-5 h-5 text-destructive" />
                      </div>
                      <div>
                        <Label htmlFor="allow-video-seek" className="text-sm font-medium">
                          Разрешить перемотку видео
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Если выключено, ученики не смогут перематывать видео вперёд (только назад)
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="allow-video-seek"
                      checked={allowVideoSeek}
                      onCheckedChange={handleToggleAllowVideoSeek}
                      disabled={isSavingSettings}
                    />
                  </div>

                  {/* Copy protection */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10 mt-0.5">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <Label htmlFor="copy-protection" className="text-sm font-medium">
                          Включить защиту от копирования текста
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Запрет выделения и копирования текста уроков для учеников
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="copy-protection"
                      checked={copyProtection}
                      onCheckedChange={handleToggleCopyProtection}
                      disabled={isSavingSettings}
                    />
                  </div>

                  {/* Video watermark */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 mt-0.5">
                        <Droplets className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <Label htmlFor="video-watermark" className="text-sm font-medium">
                          Включить водяные знаки на видео
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Полупрозрачный водяной знак с email ученика поверх видео
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="video-watermark"
                      checked={videoWatermark}
                      onCheckedChange={handleToggleVideoWatermark}
                      disabled={isSavingSettings}
                    />
                  </div>

                  {/* External card URL */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/10 mt-0.5">
                        <ExternalLink className="w-5 h-5 text-purple-500" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-sm font-medium">
                          Переход по внешней ссылке при клике на карточку
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Если указано, клик по карточке курса в каталоге откроет эту ссылку
                        </p>
                        <Input
                          value={externalCardUrl}
                          onChange={(e) => setExternalCardUrl(e.target.value)}
                          onBlur={(e) => handleUpdateExternalCardUrl(e.target.value)}
                          placeholder="https://example.com/course-page"
                          className="mt-2 rounded-lg"
                          disabled={isSavingSettings}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* FRDO Settings Section - only for plans with frdo access */}
              {isFrdoEnabled && <div className="space-y-4 mt-6">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Настройки ФИС ФРДО</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Эти настройки будут автоматически применяться при экспорте данных курса в ФИС ФРДО
                </p>
                
                <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
                  {/* Training Form */}
                  <div className="space-y-2">
                    <Label>Форма обучения</Label>
                    <Select
                      value={trainingForm}
                      onValueChange={handleUpdateTrainingForm}
                      disabled={isSavingSettings}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Выберите форму обучения" />
                      </SelectTrigger>
                      <SelectContent>
                        {FRDO_TRAINING_FORMS.map((form) => (
                          <SelectItem key={form} value={form}>
                            {form}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Program Type */}
                  <div className="space-y-2">
                    <Label>Тип программы</Label>
                    <Select
                      value={frdoSettings.frdo_program_type || ""}
                      onValueChange={(value) => handleUpdateFrdoSettings("frdo_program_type", value || null)}
                      disabled={isSavingSettings}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Выберите тип программы" />
                      </SelectTrigger>
                      <SelectContent>
                        {FRDO_PROGRAM_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Document Type (auto-set based on program type) */}
                  {frdoSettings.frdo_program_type && (
                    <div className="space-y-2">
                      <Label>Вид документа</Label>
                      <Input
                        value={frdoSettings.frdo_document_type || ""}
                        className="rounded-xl bg-muted"
                        disabled
                      />
                      <p className="text-xs text-muted-foreground">
                        Определяется автоматически на основе типа программы
                      </p>
                    </div>
                  )}

                  {/* Professional Area - for DPO programs */}
                  {(frdoSettings.frdo_program_type === "qualification_upgrade" || 
                    frdoSettings.frdo_program_type === "professional_retraining") && (
                    <>
                      <div className="space-y-2">
                        <Label>Область профессиональной деятельности</Label>
                        <Select
                          value={frdoSettings.frdo_professional_area || ""}
                          onValueChange={(value) => handleUpdateFrdoSettings("frdo_professional_area", value || null)}
                          disabled={isSavingSettings}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Выберите область деятельности" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {FRDO_PROFESSIONAL_AREAS.map((area) => (
                              <SelectItem key={area} value={area}>
                                {area}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Укрупненная группа специальностей</Label>
                        <Select
                          value={frdoSettings.frdo_specialty_group || ""}
                          onValueChange={(value) => handleUpdateFrdoSettings("frdo_specialty_group", value || null)}
                          disabled={isSavingSettings}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Выберите группу специальностей" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {FRDO_SPECIALTY_GROUPS.map((group) => (
                              <SelectItem key={group} value={group}>
                                {group}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Наименование квалификации/специальности</Label>
                        <Input
                          defaultValue={frdoSettings.frdo_qualification_name || ""}
                          onBlur={(e) => handleUpdateFrdoSettings("frdo_qualification_name", e.target.value || null)}
                          placeholder="Например: специалист по охране труда"
                          className="rounded-xl"
                          disabled={isSavingSettings}
                        />
                      </div>
                    </>
                  )}

                  {/* Professional Training (PO) specific fields */}
                  {frdoSettings.frdo_program_type === "professional_training" && (
                    <>
                      <div className="space-y-2">
                        <Label>Наименование профессии</Label>
                        <Input
                          defaultValue={frdoSettings.frdo_profession_name || ""}
                          onBlur={(e) => handleUpdateFrdoSettings("frdo_profession_name", e.target.value || null)}
                          placeholder="Например: машинист крана"
                          className="rounded-xl"
                          disabled={isSavingSettings}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Квалификационный разряд</Label>
                        <Input
                          defaultValue={frdoSettings.frdo_qualification_rank || ""}
                          onBlur={(e) => handleUpdateFrdoSettings("frdo_qualification_rank", e.target.value || null)}
                          placeholder="Например: 4 разряд"
                          className="rounded-xl"
                          disabled={isSavingSettings}
                        />
                      </div>
                    </>
                  )}

                  {!frdoSettings.frdo_program_type && (
                    <p className="text-sm text-muted-foreground italic">
                      Выберите тип программы для отображения дополнительных полей
                    </p>
                  )}

                  {/* Duration Hours */}
                  <div className="space-y-2">
                    <Label>Срок обучения, часов (для документа о квалификации)</Label>
                    <Input
                      type="number"
                      defaultValue={frdoSettings.frdo_duration_hours ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        handleUpdateFrdoSettings("frdo_duration_hours", val);
                      }}
                      placeholder="Например: 72"
                      className="rounded-xl"
                      disabled={isSavingSettings}
                    />
                  </div>

                  {/* Financing Source */}
                  <div className="space-y-2">
                    <Label>Источник финансирования обучения</Label>
                    <Select
                      value={frdoSettings.frdo_financing_source || ""}
                      onValueChange={(value) => handleUpdateFrdoSettings("frdo_financing_source", value || null)}
                      disabled={isSavingSettings}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Выберите источник финансирования" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Платное обучение">Платное обучение</SelectItem>
                        <SelectItem value="Бюджетное обучение">Бюджетное обучение</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Education Form */}
                  <div className="space-y-2">
                    <Label>Форма получения образования на момент прекращения образовательных отношений</Label>
                    <Select
                      value={frdoSettings.frdo_education_form || ""}
                      onValueChange={(value) => handleUpdateFrdoSettings("frdo_education_form", value || null)}
                      disabled={isSavingSettings}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Выберите форму получения образования" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="в образовательной организации">в образовательной организации</SelectItem>
                        <SelectItem value="вне образовательной организации">вне образовательной организации</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>}
            </TabsContent>

            <TabsContent value="reminders" className="mt-0 h-full">
              <div>
              <CourseRemindersTab
                courseId={course.id}
                organizationId={organizationId || ""}
                retrainingPeriodMonths={retrainingPeriod}
                reminderAdvanceDays={reminderAdvanceDays}
                onPeriodChange={async (months) => {
                  setRetrainingPeriod(months);
                  try {
                    const { error } = await supabase
                      .from("courses")
                      .update({ retraining_period_months: months } as any)
                      .eq("id", course.id);
                    if (error) throw error;
                    toast.success(months ? `Периодичность: ${months} мес.` : "Периодичность отключена");
                    onCourseUpdated?.();
                  } catch (error) {
                    console.error("Error updating retraining period:", error);
                    toast.error("Ошибка сохранения");
                  }
                }}
                onAdvanceDaysChange={async (days) => {
                  setReminderAdvanceDays(days);
                  try {
                    const { error } = await supabase
                      .from("courses")
                      .update({ reminder_advance_days: days } as any)
                      .eq("id", course.id);
                    if (error) throw error;
                    toast.success(`Напоминание за ${days} дней`);
                    onCourseUpdated?.();
                  } catch (error) {
                    console.error("Error updating advance days:", error);
                    toast.error("Ошибка сохранения");
                  }
                }}
                notifyOnCompletion={notifyOnCompletion}
                completionNotifyEmails={completionNotifyEmails}
                onNotifyOnCompletionChange={async (value) => {
                  setNotifyOnCompletion(value);
                  try {
                    const { error } = await supabase
                      .from("courses")
                      .update({ notify_on_completion: value } as any)
                      .eq("id", course.id);
                    if (error) throw error;
                    toast.success(value ? "Уведомления включены" : "Уведомления отключены");
                    onCourseUpdated?.();
                  } catch (error) {
                    console.error("Error updating notify_on_completion:", error);
                    toast.error("Ошибка сохранения");
                  }
                }}
                onCompletionNotifyEmailsChange={async (value) => {
                  setCompletionNotifyEmails(value || null);
                  try {
                    const { error } = await supabase
                      .from("courses")
                      .update({ completion_notify_emails: value || null } as any)
                      .eq("id", course.id);
                    if (error) throw error;
                    onCourseUpdated?.();
                  } catch (error) {
                    console.error("Error updating completion_notify_emails:", error);
                  }
                }}
              />
              </div>
            </TabsContent>

            <TabsContent value="groups" className="mt-0 h-full">
              <CourseGroupsTab
                courseId={course.id}
                organizationId={organizationId || ""}
                onRefreshStudents={onRefreshStudents}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
      
      {/* Reset Progress Confirmation Dialog */}
      <AlertDialog open={!!resetConfirmStudent} onOpenChange={(open) => !open && setResetConfirmStudent(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить прогресс?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите сбросить прогресс ученика "{resetConfirmStudent?.name}"?
              Все результаты тестов и отметки о прохождении уроков будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={isResetting}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => resetConfirmStudent && handleResetProgress(resetConfirmStudent)}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сброс...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Сбросить
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить курс?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить курс "{course.title}"? 
              Будут также удалены все уроки, материалы и записи о зачислении учеников.
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={isDeleting}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction 
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCourse}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
