import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Course } from "@/types/course";
import type { Student } from "@/types/student";

export function useCourseActions(organizationId: string | null, onRefresh: () => void) {
  const [isLoadingCourseStudents, setIsLoadingCourseStudents] = useState(false);
  const [courseStudents, setCourseStudents] = useState<Student[]>([]);
  const [availableStudentsForCourse, setAvailableStudentsForCourse] = useState<Student[]>([]);
  const [selectedStudentsToAdd, setSelectedStudentsToAdd] = useState<Set<string>>(new Set());
  const [isAddingStudentsToCourse, setIsAddingStudentsToCourse] = useState(false);
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);

  const loadCourseStudents = useCallback(async (course: Course, allStudents: Student[]) => {
    setIsLoadingCourseStudents(true);
    try {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id, user_id, progress, status")
        .eq("course_id", course.id);

      const enrolledList: Student[] = [];
      const enrolledUserIds = new Set<string>();

      for (const enrollment of enrollments || []) {
        enrolledUserIds.add(enrollment.user_id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, login, generated_password")
          .eq("user_id", enrollment.user_id)
          .single();

        if (profile) {
          enrolledList.push({
            id: profile.id,
            user_id: profile.user_id,
            enrollment_id: enrollment.id,
            name: profile.full_name || "Без имени",
            email: profile.email || "",
            login: profile.login || null,
            generated_password: profile.generated_password || null,
            course: course.title,
            course_id: course.id,
            progress: enrollment.progress,
            lastActivity: null,
            status: enrollment.status
          });
        }
      }

      setCourseStudents(enrolledList);

      // Get available students (not enrolled in this course)
      const availableList = allStudents.filter(s => !enrolledUserIds.has(s.user_id));
      setAvailableStudentsForCourse(availableList);
    } catch (error) {
      console.error("Error loading course students:", error);
      toast.error("Ошибка загрузки учеников курса");
    } finally {
      setIsLoadingCourseStudents(false);
    }
  }, []);

  const addStudentsToCourse = useCallback(async (courseId: string) => {
    if (selectedStudentsToAdd.size === 0) {
      toast.error("Выберите учеников");
      return;
    }

    setIsAddingStudentsToCourse(true);
    try {
      const enrollmentsToInsert = Array.from(selectedStudentsToAdd).map(userId => ({
        user_id: userId,
        course_id: courseId,
        status: "active",
        progress: 0
      }));

      const { error } = await supabase.from("enrollments").insert(enrollmentsToInsert);
      if (error) throw error;

      toast.success(`Зачислено ${selectedStudentsToAdd.size} учеников`);
      setSelectedStudentsToAdd(new Set());
      onRefresh();
    } catch (error) {
      console.error("Error adding students to course:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsAddingStudentsToCourse(false);
    }
  }, [selectedStudentsToAdd, onRefresh]);

  const removeFromCourse = useCallback(async (enrollmentId: string) => {
    try {
      const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
      toast.success("Ученик удалён из курса");
      onRefresh();
    } catch (error) {
      console.error("Error removing enrollment:", error);
      toast.error("Ошибка удаления");
    }
  }, [onRefresh]);

  const toggleStudentSelection = useCallback((userId: string) => {
    const newSet = new Set(selectedStudentsToAdd);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedStudentsToAdd(newSet);
  }, [selectedStudentsToAdd]);

  const sendCourseInvitation = useCallback(async (
    email: string,
    courseName: string,
    courseId: string,
    organizationName: string
  ) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error("Введите корректный email адрес");
      return false;
    }

    setIsSendingInvitation(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-course-invitation", {
        body: {
          email: email.trim(),
          courseName,
          courseId,
          organizationName
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Приглашение отправлено на ${email}`);
      return true;
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      if (error.message?.includes("RESEND_API_KEY")) {
        toast.error("Для отправки email необходимо настроить RESEND_API_KEY");
      } else {
        toast.error(error.message || "Ошибка отправки приглашения");
      }
      return false;
    } finally {
      setIsSendingInvitation(false);
    }
  }, []);

  return {
    isLoadingCourseStudents,
    courseStudents,
    availableStudentsForCourse,
    selectedStudentsToAdd,
    isAddingStudentsToCourse,
    isSendingInvitation,
    loadCourseStudents,
    addStudentsToCourse,
    removeFromCourse,
    toggleStudentSelection,
    setSelectedStudentsToAdd,
    setCourseStudents,
    setAvailableStudentsForCourse,
    sendCourseInvitation,
  };
}
