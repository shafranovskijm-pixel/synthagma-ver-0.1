import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { RETRAINING_PERIOD_OPTIONS } from "@/constants/reminderTemplates";
import type { ReminderTemplate } from "@/constants/reminderTemplates";

export interface CourseReminder {
  id: string;
  course_id: string;
  enrollment_id: string;
  user_id: string;
  organization_id: string;
  company_id: string | null;
  completed_at: string;
  reminder_date: string;
  reminder_text: string | null;
  notify_organization: boolean;
  notify_company: boolean;
  notify_student: boolean;
  is_sent: boolean;
  is_dismissed: boolean;
  created_at: string;
  student_name?: string;
  student_email?: string;
  company_name?: string;
}

export const ADVANCE_DAYS_OPTIONS = [
  { value: 7, label: "За 7 дней" },
  { value: 14, label: "За 14 дней" },
  { value: 30, label: "За 30 дней" },
  { value: 60, label: "За 60 дней" },
  { value: 90, label: "За 90 дней" },
];

interface UseCourseRemindersProps {
  courseId: string;
  retrainingPeriodMonths: number | null;
  onPeriodChange: (months: number | null) => void;
}

export function useCourseReminders({ courseId, retrainingPeriodMonths, onPeriodChange }: UseCourseRemindersProps) {
  const [reminders, setReminders] = useState<CourseReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingReminder, setEditingReminder] = useState<CourseReminder | null>(null);
  const [customPeriod, setCustomPeriod] = useState(false);
  const [customMonths, setCustomMonths] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<ReminderTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);
  const [editedText, setEditedText] = useState("");

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("course_reminders")
        .select("*")
        .eq("course_id", courseId)
        .order("reminder_date", { ascending: true });

      if (error) throw error;

      const enriched: CourseReminder[] = [];
      for (const r of data || []) {
        const item: CourseReminder = { ...r, student_name: undefined, student_email: undefined, company_name: undefined };
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", r.user_id)
          .maybeSingle();
        
        if (profile) {
          item.student_name = profile.full_name || "Без имени";
          item.student_email = profile.email || "";
        }

        if (r.company_id) {
          const { data: company } = await supabase
            .from("companies")
            .select("name")
            .eq("id", r.company_id)
            .maybeSingle();
          item.company_name = company?.name || null;
        }

        enriched.push(item);
      }

      setReminders(enriched);
    } catch (error) {
      console.error("Error fetching reminders:", error);
      toast.error("Ошибка загрузки напоминаний");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const handlePeriodSelect = (value: string) => {
    if (value === "custom") {
      setCustomPeriod(true);
      return;
    }
    const months = parseInt(value);
    setCustomPeriod(false);
    onPeriodChange(months === 0 ? null : months);
  };

  const handleCustomPeriodSave = () => {
    const months = parseInt(customMonths);
    if (months > 0) {
      onPeriodChange(months);
      setCustomPeriod(false);
    }
  };

  const handleDismiss = async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from("course_reminders")
        .update({ is_dismissed: true } as any)
        .eq("id", reminderId);
      if (error) throw error;
      toast.success("Напоминание отклонено");
      fetchReminders();
    } catch (error) {
      console.error("Error dismissing reminder:", error);
      toast.error("Ошибка");
    }
  };

  const handleMarkSent = async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from("course_reminders")
        .update({ is_sent: true } as any)
        .eq("id", reminderId);
      if (error) throw error;
      toast.success("Отмечено как отправленное");
      fetchReminders();
    } catch (error) {
      console.error("Error marking sent:", error);
      toast.error("Ошибка");
    }
  };

  const handleSaveReminderEdit = async () => {
    if (!editingReminder) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("course_reminders")
        .update({
          reminder_date: editingReminder.reminder_date,
          reminder_text: editingReminder.reminder_text,
          notify_organization: editingReminder.notify_organization,
          notify_company: editingReminder.notify_company,
          notify_student: editingReminder.notify_student } as any)
        .eq("id", editingReminder.id);
      if (error) throw error;
      toast.success("Напоминание обновлено");
      setEditingReminder(null);
      fetchReminders();
    } catch (error) {
      console.error("Error updating reminder:", error);
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  const currentPeriodValue = retrainingPeriodMonths 
    ? (RETRAINING_PERIOD_OPTIONS.find(o => o.value === retrainingPeriodMonths) 
        ? String(retrainingPeriodMonths)
        : "custom")
    : "0";

  const activeReminders = reminders.filter(r => !r.is_dismissed && !r.is_sent);
  const pastReminders = reminders.filter(r => r.is_dismissed || r.is_sent);

  return {
    reminders,
    loading,
    editingReminder,
    setEditingReminder,
    customPeriod,
    customMonths,
    setCustomMonths,
    isSaving,
    previewTemplate,
    setPreviewTemplate,
    editingTemplate,
    setEditingTemplate,
    editedText,
    setEditedText,
    handlePeriodSelect,
    handleCustomPeriodSave,
    handleDismiss,
    handleMarkSent,
    handleSaveReminderEdit,
    currentPeriodValue,
    activeReminders,
    pastReminders,
  };
}
