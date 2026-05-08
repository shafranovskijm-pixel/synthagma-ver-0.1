// Тонкая обёртка над useCourseDetails — сохраняет API, ожидаемое CourseDetailsModal.
// Объединяет два дублирующих хука (useCourseDetails + useCourseDetailsLogic) в один источник истины.
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCourseDetails } from "./useCourseDetails";

interface Course {
  id: string;
  title: string;
  description?: string | null;
  is_published?: boolean;
  created_at?: string;
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

/**
 * @deprecated Используйте useCourseDetails напрямую. Эта обёртка нужна
 * для обратной совместимости с CourseDetailsModal (Modal-вариант карточки курса).
 */
export function useCourseDetailsLogic(
  course: Course | null,
  organizationId: string | null,
  onCourseUpdated?: () => void,
  onRefreshStudents?: () => void,
) {
  // В Modal-варианте список студентов передаётся отдельно (props),
  // но loadAvailableStudents в Modal-логике никогда не получал эти данные —
  // оставляем поведение, передавая [] (как и было в старом useCourseDetailsLogic).
  const base = useCourseDetails(
    (course || { id: "", title: "" }) as any,
    [],
    organizationId,
    onCourseUpdated,
    onRefreshStudents,
  );

  // Reminders-handlers — специфичны для Modal, переиспользуют общий updateCourseSetting.
  const handlePeriodChange = useCallback(async (months: number | null) => {
    if (!course) return;
    base.setRetrainingPeriod(months);
    await base.updateCourseSetting(
      "retraining_period_months",
      months,
      months ? `Периодичность: ${months} мес.` : "Периодичность отключена"
    );
  }, [course, base]);

  const handleAdvanceDaysChange = useCallback(async (days: number) => {
    if (!course) return;
    base.setReminderAdvanceDays(days);
    await base.updateCourseSetting(
      "reminder_advance_days",
      days,
      `Напоминание за ${days} дней`
    );
  }, [course, base]);

  const handleNotifyOnCompletionChange = useCallback(async (value: boolean) => {
    if (!course) return;
    base.setNotifyOnCompletion(value);
    await base.updateCourseSetting(
      "notify_on_completion",
      value,
      value ? "Уведомления включены" : "Уведомления отключены"
    );
  }, [course, base]);

  const handleCompletionNotifyEmailsChange = useCallback(async (value: string) => {
    if (!course) return;
    base.setCompletionNotifyEmails(value || null);
    try {
      const { error } = await supabase
        .from("courses")
        .update({ completion_notify_emails: value || null } as any)
        .eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch {
      toast.error("Ошибка сохранения");
    }
  }, [course, base, onCourseUpdated]);

  // Modal-вариант handleDeleteCourse принимает (onOpenChange, onCourseDeleted).
  const handleDeleteCourse = useCallback(async (
    onOpenChange: (v: boolean) => void,
    onCourseDeleted?: () => void,
  ) => {
    if (!course) return;
    try {
      // Подчищаем ссылки, которые не каскадятся в БД (training_plans, source_course_id self-ref)
      await supabase.from("training_plans").delete().eq("course_id", course.id);
      await supabase.from("courses").update({ source_course_id: null } as any).eq("source_course_id", course.id);
      await supabase.from("enrollments").delete().eq("course_id", course.id);
      await supabase.from("lessons").delete().eq("course_id", course.id);
      await supabase.from("course_documents").delete().eq("course_id", course.id);
      const { error } = await supabase.from("courses").delete().eq("id", course.id);
      if (error) throw error;
      toast.success("Курс удалён");
      base.setShowDeleteConfirm(false);
      onOpenChange(false);
      onCourseDeleted?.();
    } catch (err: any) {
      console.error("[deleteCourse] error:", err);
      toast.error("Ошибка удаления курса", { description: err?.message || err?.details || undefined });
    }
  }, [course, base]);

  return {
    ...base,
    handlePeriodChange,
    handleAdvanceDaysChange,
    handleNotifyOnCompletionChange,
    handleCompletionNotifyEmailsChange,
    handleDeleteCourse,
  };
}
