import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserRolesBatched } from "@/utils/fetchUserRolesBatched";
import { toast } from "sonner";
import { Student, Course } from "@/types/shared";
import { loadCourseStudents, CourseProfilesUnavailableError } from "@/api/courseStudents";
import { classifyDataError, isTransientNetworkError } from "@/utils/isTransientNetworkError";

type LoadErrorKind = "permission" | "network" | "unknown" | "profiles_unavailable";

export function useCourseStudentsManager(organizationId: string | null) {
  const [showCourseStudentsDialog, setShowCourseStudentsDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseStudents, setCourseStudents] = useState<Student[]>([]);
  const [availableStudentsForCourse, setAvailableStudentsForCourse] = useState<Student[]>([]);
  const [isLoadingCourseStudents, setIsLoadingCourseStudents] = useState(false);
  const [selectedStudentsToAdd, setSelectedStudentsToAdd] = useState<Set<string>>(new Set());
  const [isAddingStudentsToCourse, setIsAddingStudentsToCourse] = useState(false);
  const [courseStudentsSearchQuery, setCourseStudentsSearchQuery] = useState("");
  const [loadError, setLoadError] = useState<{ kind: LoadErrorKind; message: string } | null>(null);

  const errorMessageFor = (kind: LoadErrorKind): string => {
    switch (kind) {
      case "permission":
        return "Недостаточно прав для просмотра учеников этого курса.";
      case "network":
        return "Не удалось загрузить учеников — проблема с сетью или прокси. Повторите попытку.";
      case "profiles_unavailable":
        return "Зачисления найдены, но профили учеников недоступны. Проверьте права доступа к профилям.";
      default:
        return "Не удалось загрузить учеников курса. Повторите попытку.";
    }
  };

  const openCourseStudents = useCallback(async (course: Course) => {
    setSelectedCourse(course);
    setShowCourseStudentsDialog(true);
    setIsLoadingCourseStudents(true);
    setSelectedStudentsToAdd(new Set());
    setCourseStudentsSearchQuery("");
    setLoadError(null);

    try {
      // 1) Enrolled students — via shared loader (no N+1, honest errors).
      const enrolled = await loadCourseStudents({
        courseId: course.id,
        courseTitle: course.title,
      });
      setCourseStudents(enrolled as unknown as Student[]);

      // 2) Available profiles (not yet enrolled).
      if (organizationId) {
        const enrolledUserIds = new Set(enrolled.map(e => e.user_id));

        const { data: allProfiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, login, generated_password")
          .eq("organization_id", organizationId);

        if (profilesError) throw profilesError;

        const profileUserIds = Array.from(new Set((allProfiles || []).map(p => p.user_id)));
        let orgAdminUserIds = new Set<string>();
        if (profileUserIds.length > 0) {
          try {
            const rolesData = await fetchUserRolesBatched(profileUserIds, ["organization", "admin"]);
            orgAdminUserIds = new Set(rolesData.map(r => r.user_id));
          } catch (err) {
            console.warn("[useCourseStudentsManager] role filter for available failed:", err);
          }
        }

        const available = (allProfiles || [])
          .filter(p => !enrolledUserIds.has(p.user_id))
          .filter(p => !orgAdminUserIds.has(p.user_id))
          .map(p => ({
            id: p.id,
            user_id: p.user_id,
            enrollment_id: null,
            name: p.full_name || "Без имени",
            email: p.email || "",
            login: p.login || null,
            generated_password: p.generated_password || null,
            course: null,
            course_id: null,
            progress: 0,
            lastActivity: null,
            status: null,
          }));

        setAvailableStudentsForCourse(available as Student[]);
      }
    } catch (error) {
      console.error("Error loading course students:", error);
      let kind: LoadErrorKind;
      if (error instanceof CourseProfilesUnavailableError) {
        kind = "profiles_unavailable";
        setCourseStudents([]);
      } else {
        const c = classifyDataError(error);
        kind = c === "permission" || c === "unauthorized"
          ? "permission"
          : c === "network"
          ? "network"
          : "unknown";
      }
      const message = errorMessageFor(kind);
      setLoadError({ kind, message });
      toast.error(message);
    } finally {
      setIsLoadingCourseStudents(false);
    }
  }, [organizationId]);

  const retryLoadCourseStudents = useCallback(() => {
    if (selectedCourse) void openCourseStudents(selectedCourse);
  }, [selectedCourse, openCourseStudents]);

  const addStudentsToCourse = useCallback(async () => {
    if (!selectedCourse || selectedStudentsToAdd.size === 0) return;

    setIsAddingStudentsToCourse(true);
    try {
      const userIds = Array.from(selectedStudentsToAdd);

      const { data: existingEnrollments, error: existingError } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", selectedCourse.id)
        .in("user_id", userIds);
      if (existingError) throw existingError;

      const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));

      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        setSelectedStudentsToAdd(new Set());
        return;
      }

      const enrollmentsToInsert = newUserIds.map(userId => ({
        user_id: userId,
        course_id: selectedCourse.id,
        status: "active",
        progress: 0,
      }));

      // Retry ONLY on transient network errors. 401/403/RLS/42501 must fail fast.
      let lastError: unknown = null;
      let inserted = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        const { error } = await supabase.from("enrollments").insert(enrollmentsToInsert);
        if (!error) { inserted = true; break; }
        lastError = error;
        console.warn(`[enrollments] insert attempt ${attempt + 1} failed:`, error);
        if (!isTransientNetworkError(error)) break;
      }
      if (!inserted) throw lastError;

      toast.success(`Зачислено ${newUserIds.length} учеников`);
      setSelectedStudentsToAdd(new Set());
      openCourseStudents(selectedCourse);
    } catch (error: any) {
      console.error("Error adding students to course:", error);
      const kind = classifyDataError(error);
      const description =
        kind === "permission" || kind === "unauthorized"
          ? "Недостаточно прав для зачисления"
          : error?.message || error?.error_description || "Попробуйте ещё раз через минуту";
      toast.error("Ошибка зачисления", { description });
    } finally {
      setIsAddingStudentsToCourse(false);
    }
  }, [selectedCourse, selectedStudentsToAdd, openCourseStudents]);

  const removeStudentFromCourse = useCallback(async (enrollmentId: string) => {
    try {
      const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;

      toast.success("Ученик удалён из курса");
      if (selectedCourse) {
        openCourseStudents(selectedCourse);
      }
    } catch (error) {
      console.error("Error removing enrollment:", error);
      toast.error("Ошибка удаления");
    }
  }, [selectedCourse, openCourseStudents]);

  const toggleStudentSelection = useCallback((userId: string) => {
    setSelectedStudentsToAdd(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) newSet.delete(userId);
      else newSet.add(userId);
      return newSet;
    });
  }, []);

  const setCourseStudentsDirectly = useCallback((students: Student[]) => {
    setCourseStudents(students);
  }, []);

  return {
    showCourseStudentsDialog,
    setShowCourseStudentsDialog,
    selectedCourse,
    courseStudents,
    availableStudentsForCourse,
    isLoadingCourseStudents,
    selectedStudentsToAdd,
    isAddingStudentsToCourse,
    courseStudentsSearchQuery,
    setCourseStudentsSearchQuery,
    openCourseStudents,
    addStudentsToCourse,
    removeStudentFromCourse,
    toggleStudentSelection,
    setCourseStudentsDirectly,
    loadError,
    retryLoadCourseStudents,
  };
}
