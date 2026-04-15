import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FRDO_DOCUMENT_TYPES, type CourseFRDOSettings } from "@/constants/frdo";

interface Course {
  id: string;
  title: string;
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
  [key: string]: any;
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

export function useCourseDetailsLogic(
  course: Course | null,
  organizationId: string | null,
  onCourseUpdated?: () => void,
  onRefreshStudents?: () => void,
) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [skipVideoId, setSkipVideoId] = useState(false);
  const [sequentialLessons, setSequentialLessons] = useState(false);
  const [allowVideoSeek, setAllowVideoSeek] = useState(true);
  const [trainingForm, setTrainingForm] = useState("Очная");
  const [retrainingPeriod, setRetrainingPeriod] = useState<number | null>(null);
  const [reminderAdvanceDays, setReminderAdvanceDays] = useState(30);
  const [notifyOnCompletion, setNotifyOnCompletion] = useState(false);
  const [completionNotifyEmails, setCompletionNotifyEmails] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [copyProtection, setCopyProtection] = useState(false);
  const [videoWatermark, setVideoWatermark] = useState(false);
  const [externalCardUrl, setExternalCardUrl] = useState("");
  const [resetConfirmStudent, setResetConfirmStudent] = useState<Student | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Enrollment
  const [enrollPopoverOpen, setEnrollPopoverOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [enrollSearchQuery, setEnrollSearchQuery] = useState("");
  const [selectedToEnroll, setSelectedToEnroll] = useState<Set<string>>(new Set());
  const [isEnrolling, setIsEnrolling] = useState(false);

  // FRDO
  const [frdoSettings, setFrdoSettings] = useState<CourseFRDOSettings>({
    frdo_program_type: null, frdo_document_type: null, frdo_professional_area: null,
    frdo_specialty_group: null, frdo_qualification_name: null, frdo_profession_name: null,
    frdo_qualification_rank: null, frdo_duration_hours: null, frdo_financing_source: null,
    frdo_education_form: null,
  });

  useEffect(() => {
    if (course) {
      setSkipVideoId(course.skip_video_identification || false);
      setSequentialLessons(course.sequential_lessons || false);
      setAllowVideoSeek(course.allow_video_seek !== false);
      setTrainingForm(course.training_form || "Очная");
      setRetrainingPeriod(course.retraining_period_months ?? null);
      setReminderAdvanceDays(course.reminder_advance_days ?? 30);
      setNotifyOnCompletion(course.notify_on_completion ?? false);
      setCompletionNotifyEmails(course.completion_notify_emails ?? null);
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
      const lc = course.landing_content as any;
      setCopyProtection(lc?.copy_protection || false);
      setVideoWatermark(lc?.video_watermark || false);
      setExternalCardUrl(lc?.external_card_url || "");
    }
  }, [course]);

  // Load available students
  const loadAvailableStudents = useCallback(async (courseStudents: { user_id: string }[] = []) => {
    if (!organizationId || !course) return;
    setIsLoadingAvailable(true);
    try {
      const enrolledUserIds = new Set(courseStudents.map(s => s.user_id));
      const { data: allProfiles } = await supabase
        .from("profiles").select("id, user_id, full_name, email").eq("organization_id", organizationId);
      const profileUserIds = (allProfiles || []).map(p => p.user_id);
      let excludedUserIds = new Set<string>();
      if (profileUserIds.length > 0) {
        const { data: rolesData } = await supabase
          .from("user_roles").select("user_id, role").in("user_id", profileUserIds).in("role", ["organization", "admin"]);
        excludedUserIds = new Set((rolesData || []).map(r => r.user_id));
      }
      setAvailableStudents((allProfiles || [])
        .filter(p => !enrolledUserIds.has(p.user_id) && !excludedUserIds.has(p.user_id))
        .map(p => ({ id: p.id, user_id: p.user_id, name: p.full_name || "Без имени", email: p.email || "" })));
    } catch { toast.error("Ошибка загрузки списка учеников"); }
    finally { setIsLoadingAvailable(false); }
  }, [organizationId, course]);

  useEffect(() => {
    if (enrollPopoverOpen) {
      loadAvailableStudents();
      setSelectedToEnroll(new Set());
      setEnrollSearchQuery("");
    }
  }, [enrollPopoverOpen, loadAvailableStudents]);

  const filteredAvailableStudents = availableStudents.filter(s =>
    s.name.toLowerCase().includes(enrollSearchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(enrollSearchQuery.toLowerCase())
  );

  const toggleStudentToEnroll = (userId: string) => {
    setSelectedToEnroll(prev => {
      const n = new Set(prev);
      n.has(userId) ? n.delete(userId) : n.add(userId);
      return n;
    });
  };

  const handleEnrollSelected = async () => {
    if (!course || selectedToEnroll.size === 0) return;
    setIsEnrolling(true);
    try {
      const userIds = Array.from(selectedToEnroll);
      const { data: existing } = await supabase.from("enrollments").select("user_id").eq("course_id", course.id).in("user_id", userIds);
      const existingIds = new Set((existing || []).map(e => e.user_id));
      const newIds = userIds.filter(id => !existingIds.has(id));
      if (newIds.length === 0) { toast.info("Все выбранные ученики уже зачислены"); setSelectedToEnroll(new Set()); return; }
      const { error } = await supabase.from("enrollments").insert(newIds.map(uid => ({ user_id: uid, course_id: course.id, status: "active", progress: 0 })));
      if (error) throw error;
      toast.success(`Зачислено ${newIds.length} ${newIds.length === 1 ? 'ученик' : newIds.length < 5 ? 'ученика' : 'учеников'}`);
      setSelectedToEnroll(new Set());
      setEnrollPopoverOpen(false);
      onRefreshStudents?.();
    } catch { toast.error("Ошибка зачисления"); }
    finally { setIsEnrolling(false); }
  };

  // Settings toggles
  const saveCourseField = async (field: string, value: any) => {
    if (!course) return;
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ [field]: value }).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch { toast.error("Ошибка сохранения настроек"); }
    finally { setIsSavingSettings(false); }
  };

  const handleToggleSkipVideoId = async (v: boolean) => { setSkipVideoId(v); await saveCourseField("skip_video_identification", v); toast.success(v ? "Видеоидентификация отключена" : "Видеоидентификация включена"); };
  const handleToggleSequentialLessons = async (v: boolean) => { setSequentialLessons(v); await saveCourseField("sequential_lessons", v); toast.success(v ? "Последовательность уроков включена" : "Последовательность уроков отключена"); };
  const handleToggleAllowVideoSeek = async (v: boolean) => { setAllowVideoSeek(v); await saveCourseField("allow_video_seek", v); toast.success(v ? "Перемотка видео разрешена" : "Перемотка видео запрещена"); };

  const handleUpdateLandingContentField = async (key: string, value: any) => {
    if (!course) return;
    setIsSavingSettings(true);
    try {
      const { data: current } = await supabase.from("courses").select("landing_content").eq("id", course.id).single();
      const updatedContent = { ...((current?.landing_content as any) || {}), [key]: value };
      const { error } = await supabase.from("courses").update({ landing_content: updatedContent } as any).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch { toast.error("Ошибка сохранения настроек"); }
    finally { setIsSavingSettings(false); }
  };

  const handleToggleCopyProtection = async (v: boolean) => { setCopyProtection(v); await handleUpdateLandingContentField("copy_protection", v); toast.success(v ? "Защита от копирования включена" : "Защита от копирования отключена"); };
  const handleToggleVideoWatermark = async (v: boolean) => { setVideoWatermark(v); await handleUpdateLandingContentField("video_watermark", v); toast.success(v ? "Водяные знаки включены" : "Водяные знаки отключены"); };
  const handleUpdateExternalCardUrl = async (v: string) => { setExternalCardUrl(v); await handleUpdateLandingContentField("external_card_url", v || null); };

  const handleUpdateFrdoSettings = async (field: string, value: string | number | null) => {
    if (!course) return;
    setFrdoSettings(prev => {
      const n = { ...prev, [field]: value };
      if (field === "frdo_program_type" && value) n.frdo_document_type = FRDO_DOCUMENT_TYPES[value as string] || null;
      return n;
    });
    setIsSavingSettings(true);
    try {
      const updateData: Record<string, any> = { [field]: value };
      if (field === "frdo_program_type" && value) updateData.frdo_document_type = FRDO_DOCUMENT_TYPES[value] || null;
      const { error } = await supabase.from("courses").update(updateData).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch { toast.error("Ошибка сохранения настроек FRDO"); }
    finally { setIsSavingSettings(false); }
  };

  const handleUpdateTrainingForm = async (v: string) => { setTrainingForm(v); await saveCourseField("training_form", v); };

  // Reset progress
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
    } catch { toast.error("Ошибка сброса прогресса"); }
    finally { setIsResetting(false); }
  };

  // Delete course
  const handleDeleteCourse = async (onOpenChange: (v: boolean) => void, onCourseDeleted?: () => void) => {
    if (!course) return;
    setIsDeleting(true);
    try {
      await supabase.from("enrollments").delete().eq("course_id", course.id);
      await supabase.from("lessons").delete().eq("course_id", course.id);
      await supabase.from("course_documents").delete().eq("course_id", course.id);
      const { error } = await supabase.from("courses").delete().eq("id", course.id);
      if (error) throw error;
      toast.success("Курс удалён");
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onCourseDeleted?.();
    } catch { toast.error("Ошибка удаления курса"); }
    finally { setIsDeleting(false); }
  };

  // Reminders handlers
  const handlePeriodChange = async (months: number | null) => {
    if (!course) return;
    setRetrainingPeriod(months);
    try {
      const { error } = await supabase.from("courses").update({ retraining_period_months: months } as any).eq("id", course.id);
      if (error) throw error;
      toast.success(months ? `Периодичность: ${months} мес.` : "Периодичность отключена");
      onCourseUpdated?.();
    } catch { toast.error("Ошибка сохранения"); }
  };

  const handleAdvanceDaysChange = async (days: number) => {
    if (!course) return;
    setReminderAdvanceDays(days);
    try {
      const { error } = await supabase.from("courses").update({ reminder_advance_days: days } as any).eq("id", course.id);
      if (error) throw error;
      toast.success(`Напоминание за ${days} дней`);
      onCourseUpdated?.();
    } catch { toast.error("Ошибка сохранения"); }
  };

  const handleNotifyOnCompletionChange = async (value: boolean) => {
    if (!course) return;
    setNotifyOnCompletion(value);
    try {
      const { error } = await supabase.from("courses").update({ notify_on_completion: value } as any).eq("id", course.id);
      if (error) throw error;
      toast.success(value ? "Уведомления включены" : "Уведомления отключены");
      onCourseUpdated?.();
    } catch { toast.error("Ошибка сохранения"); }
  };

  const handleCompletionNotifyEmailsChange = async (value: string) => {
    if (!course) return;
    setCompletionNotifyEmails(value || null);
    try {
      const { error } = await supabase.from("courses").update({ completion_notify_emails: value || null } as any).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch { /* silent */ }
  };

  return {
    showDeleteConfirm, setShowDeleteConfirm, isDeleting,
    skipVideoId, sequentialLessons, allowVideoSeek, trainingForm,
    retrainingPeriod, reminderAdvanceDays, notifyOnCompletion, completionNotifyEmails,
    isSavingSettings, copyProtection, videoWatermark, externalCardUrl,
    resetConfirmStudent, setResetConfirmStudent, isResetting,
    enrollPopoverOpen, setEnrollPopoverOpen, availableStudents,
    isLoadingAvailable, enrollSearchQuery, setEnrollSearchQuery,
    selectedToEnroll, isEnrolling, filteredAvailableStudents,
    frdoSettings,
    toggleStudentToEnroll, handleEnrollSelected,
    handleToggleSkipVideoId, handleToggleSequentialLessons, handleToggleAllowVideoSeek,
    handleToggleCopyProtection, handleToggleVideoWatermark, handleUpdateExternalCardUrl,
    handleUpdateFrdoSettings, handleUpdateTrainingForm,
    handleResetProgress, handleDeleteCourse,
    handlePeriodChange, handleAdvanceDaysChange,
    handleNotifyOnCompletionChange, handleCompletionNotifyEmailsChange,
  };
}
