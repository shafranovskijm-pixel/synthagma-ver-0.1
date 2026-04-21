import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FRDO_DOCUMENT_TYPES, type CourseFRDOSettings } from "@/constants/frdo";

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

export function useCourseDetails(
  course: Course,
  courseStudents: Student[],
  organizationId: string | null,
  onCourseUpdated?: () => void,
  onRefreshStudents?: () => void,
  onCourseDeleted?: () => void
) {
  const navigate = useNavigate();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Course settings state
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
  const [copyProtection, setCopyProtection] = useState(false);
  const [videoWatermark, setVideoWatermark] = useState(false);
  const [externalCardUrl, setExternalCardUrl] = useState("");
  const [resetConfirmStudent, setResetConfirmStudent] = useState<Student | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Enroll popover
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
      // Fetch profiles and the org/admin role list in parallel — the role query
      // doesn't depend on the profile rows, only on organization_id.
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles")
          .select("id, user_id, full_name, email")
          .eq("organization_id", organizationId),
        supabase.from("user_roles")
          .select("user_id, role")
          .eq("organization_id", organizationId)
          .in("role", ["organization", "admin"]),
      ]);
      const allProfiles = profilesRes.data || [];
      const excludedUserIds = new Set((rolesRes.data || []).map(r => r.user_id));
      const available = allProfiles
        .filter(p => !enrolledUserIds.has(p.user_id) && !excludedUserIds.has(p.user_id))
        .map(p => ({ id: p.id, user_id: p.user_id, name: p.full_name || "Без имени", email: p.email || "" }));
      setAvailableStudents(available);
    } catch (error) { console.error("Error loading available students:", error); toast.error("Ошибка загрузки списка учеников"); }
    finally { setIsLoadingAvailable(false); }
  }, [organizationId, course, courseStudents]);

  useEffect(() => {
    if (enrollPopoverOpen) { loadAvailableStudents(); setSelectedToEnroll(new Set()); setEnrollSearchQuery(""); }
  }, [enrollPopoverOpen, loadAvailableStudents]);

  const handleEnrollSelected = async () => {
    if (!course || selectedToEnroll.size === 0) return;
    setIsEnrolling(true);
    try {
      const userIds = Array.from(selectedToEnroll);
      const { data: existing } = await supabase.from("enrollments").select("user_id").eq("course_id", course.id).in("user_id", userIds);
      const existingIds = new Set((existing || []).map(e => e.user_id));
      const newIds = userIds.filter(id => !existingIds.has(id));
      if (newIds.length === 0) { toast.info("Все выбранные ученики уже зачислены"); setSelectedToEnroll(new Set()); return; }
      const rows = newIds.map(userId => ({ user_id: userId, course_id: course.id, status: "active", progress: 0, ...(defaultAccessDays ? { access_days: defaultAccessDays } : {}) }));
      const { error } = await supabase.from("enrollments").insert(rows);
      if (error) throw error;
      toast.success(`Зачислено ${newIds.length} ${newIds.length === 1 ? 'ученик' : newIds.length < 5 ? 'ученика' : 'учеников'}`);
      setSelectedToEnroll(new Set()); setEnrollPopoverOpen(false); onRefreshStudents?.();
    } catch (error) { console.error("Error enrolling:", error); toast.error("Ошибка зачисления"); }
    finally { setIsEnrolling(false); }
  };

  const toggleStudentToEnroll = (userId: string) => {
    setSelectedToEnroll(prev => { const s = new Set(prev); s.has(userId) ? s.delete(userId) : s.add(userId); return s; });
  };

  const filteredAvailableStudents = availableStudents.filter(s =>
    s.name.toLowerCase().includes(enrollSearchQuery.toLowerCase()) || s.email.toLowerCase().includes(enrollSearchQuery.toLowerCase())
  );

  // Settings handlers
  const updateCourseSetting = async (field: string, value: any, successMsg?: string) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ [field]: value } as any).eq("id", course.id);
      if (error) throw error;
      if (successMsg) toast.success(successMsg);
      onCourseUpdated?.();
    } catch (error) { console.error(`Error updating ${field}:`, error); toast.error("Ошибка сохранения настроек"); }
    finally { setIsSavingSettings(false); }
  };

  const handleToggleSkipVideoId = async (v: boolean) => { setSkipVideoId(v); await updateCourseSetting("skip_video_identification", v, v ? "Видеоидентификация отключена" : "Видеоидентификация включена"); };
  const handleToggleSequentialLessons = async (v: boolean) => { setSequentialLessons(v); await updateCourseSetting("sequential_lessons", v, v ? "Последовательность уроков включена" : "Последовательность уроков отключена"); };
  const handleToggleAllowVideoSeek = async (v: boolean) => { setAllowVideoSeek(v); await updateCourseSetting("allow_video_seek", v, v ? "Перемотка видео разрешена" : "Перемотка видео запрещена"); };

  const handleUpdateLandingContentField = async (key: string, value: any) => {
    if (!course) return;
    setIsSavingSettings(true);
    try {
      const { data: current } = await supabase.from("courses").select("landing_content").eq("id", course.id).single();
      const updated = { ...((current?.landing_content as any) || {}), [key]: value };
      const { error } = await supabase.from("courses").update({ landing_content: updated } as any).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating landing content:", error); toast.error("Ошибка сохранения"); }
    finally { setIsSavingSettings(false); }
  };

  const handleToggleCopyProtection = async (v: boolean) => { setCopyProtection(v); await handleUpdateLandingContentField("copy_protection", v); toast.success(v ? "Защита от копирования включена" : "Защита от копирования отключена"); };
  const handleToggleVideoWatermark = async (v: boolean) => { setVideoWatermark(v); await handleUpdateLandingContentField("video_watermark", v); toast.success(v ? "Водяные знаки включены" : "Водяные знаки отключены"); };
  const handleUpdateExternalCardUrl = async (v: string) => { setExternalCardUrl(v); await handleUpdateLandingContentField("external_card_url", v || null); };
  const handleUpdateDefaultAccessDays = async (v: string) => {
    const days = v ? parseInt(v) : null;
    if (v && isNaN(days!)) return;
    setDefaultAccessDays(days);
    await updateCourseSetting("default_access_days", days, days ? `Срок доступа: ${days} дней` : "Безлимитный доступ");
  };
  const handleToggleRequireEnrollmentApproval = async (v: boolean) => { setRequireEnrollmentApproval(v); await updateCourseSetting("require_enrollment_approval", v, v ? "Запись по заявке включена" : "Запись по заявке отключена"); };
  const handleUpdateTrainingForm = async (v: string) => { setTrainingForm(v); await updateCourseSetting("training_form", v); };

  const handleUpdateFrdoSettings = async (field: string, value: string | number | null) => {
    if (!course) return;
    setFrdoSettings(prev => {
      const s = { ...prev, [field]: value };
      if (field === "frdo_program_type" && value) s.frdo_document_type = FRDO_DOCUMENT_TYPES[value as string] || null;
      return s;
    });
    setIsSavingSettings(true);
    try {
      const updateData: Record<string, string | number | null> = { [field]: value };
      if (field === "frdo_program_type" && value) updateData.frdo_document_type = FRDO_DOCUMENT_TYPES[value] || null;
      const { error } = await supabase.from("courses").update(updateData).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating FRDO:", error); toast.error("Ошибка сохранения FRDO"); }
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
      setResetConfirmStudent(null); onRefreshStudents?.();
    } catch (error) { console.error("Error resetting:", error); toast.error("Ошибка сброса прогресса"); }
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
      toast.success("Курс удалён"); setShowDeleteConfirm(false); onCourseDeleted?.(); navigate("/organization");
    } catch (error) { console.error("Error deleting:", error); toast.error("Ошибка удаления курса"); }
    finally { setIsDeleting(false); }
  };

  // Stats
  const totalStudents = courseStudents.length;
  const activeStudents = courseStudents.filter(s => s.status !== 'completed').length;
  const completedStudents = courseStudents.filter(s => s.status === 'completed').length;
  const avgProgress = totalStudents > 0 ? Math.min(Math.round(courseStudents.reduce((sum, s) => sum + Math.min(s.progress, 100), 0) / totalStudents), 100) : 0;
  const completionRate = totalStudents > 0 ? Math.round(completedStudents / totalStudents * 100) : 0;

  return {
    navigate, showDeleteConfirm, setShowDeleteConfirm, isDeleting, isSavingSettings,
    skipVideoId, sequentialLessons, allowVideoSeek, trainingForm, retrainingPeriod, setRetrainingPeriod,
    reminderAdvanceDays, setReminderAdvanceDays, notifyOnCompletion, setNotifyOnCompletion,
    completionNotifyEmails, setCompletionNotifyEmails, defaultAccessDays, setDefaultAccessDays,
    requireEnrollmentApproval, copyProtection, videoWatermark, externalCardUrl, setExternalCardUrl,
    resetConfirmStudent, setResetConfirmStudent, isResetting,
    enrollPopoverOpen, setEnrollPopoverOpen, availableStudents, isLoadingAvailable,
    enrollSearchQuery, setEnrollSearchQuery, selectedToEnroll, isEnrolling, frdoSettings,
    filteredAvailableStudents, toggleStudentToEnroll, handleEnrollSelected,
    handleToggleSkipVideoId, handleToggleSequentialLessons, handleToggleAllowVideoSeek,
    handleToggleCopyProtection, handleToggleVideoWatermark, handleUpdateExternalCardUrl,
    handleUpdateDefaultAccessDays, handleToggleRequireEnrollmentApproval, handleUpdateTrainingForm,
    handleUpdateFrdoSettings, handleResetProgress, handleDeleteCourse,
    totalStudents, activeStudents, completedStudents, avgProgress, completionRate,
    // Reminders-specific handlers (inline in the component)
    updateCourseSetting,
  };
}
