import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateEnrollmentOrder } from "@/utils/generateEnrollmentOrder";
import { Student, Course } from "@/types/shared";
import { deleteStudent, fetchStudentsByUserIds } from "@/api/students";
import { qk } from "@/lib/queryKeys";

/**
 * Phase 4A: selection is user_id-only.
 *
 * `selectedStudentIds` MUST contain profiles.user_id values ONLY — never
 * enrollment_id, never profile.id. Enrollment identifiers used by
 * bulkUnenroll are stored separately in `selectedEnrollmentIds`, populated
 * when the confirmation dialog opens from the currently loaded pages.
 *
 * Callers pass user_ids and enrollment_ids explicitly; the hook no longer
 * scans a full `students`/`allProfiles` snapshot to disambiguate selection.
 */
export function useEnrollmentActions(
  organizationId: string | null,
  organizationName: string,
  onRefresh: () => void,
) {
  const qc = useQueryClient();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isUnenrolling, setIsUnenrolling] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  /** Enrollment IDs staged for unenrollment. Set by the confirmation callback. */
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<string[]>([]);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [showUnenrollConfirm, setShowUnenrollConfirm] = useState(false);
  const [showBulkFRDOExport, setShowBulkFRDOExport] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [enrollCourseId, setEnrollCourseId] = useState<string>("");

  const invalidateStudents = useCallback(() => {
    if (!organizationId) return;
    qc.invalidateQueries({ queryKey: qk.org.studentsPageAll(organizationId) });
    qc.invalidateQueries({ queryKey: qk.org.studentsCounts(organizationId) });
    qc.invalidateQueries({ queryKey: qk.org.studentGroupCounts(organizationId) });
  }, [qc, organizationId]);

  const invalidateCourse = useCallback((courseId: string | null | undefined) => {
    if (!courseId) return;
    qc.invalidateQueries({ queryKey: ["course-students-page", courseId] });
    qc.invalidateQueries({ queryKey: ["course-students-stats", courseId] });
    qc.invalidateQueries({ queryKey: ["available-students-for-course", courseId] });
  }, [qc]);

  const toggleStudentSelection = useCallback((userId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((filteredList: Student[]) => {
    const ids = filteredList.map(s => s.user_id);
    setSelectedStudentIds(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  /** Selection is user_id-only — return it as an array (deduped by Set). */
  const getSelectedUserIds = useCallback((): string[] => {
    return Array.from(selectedStudentIds);
  }, [selectedStudentIds]);

  /**
   * Bulk enroll — takes an explicit list of user_ids so we no longer scan
   * the legacy full-org d.students / d.allProfiles arrays. Missing profiles
   * surface as an error instead of an anonymous "Неизвестный" order entry.
   */
  const bulkEnroll = useCallback(async (
    courseId: string,
    selectedUserIds: string[],
    courses: Course[],
  ) => {
    if (!courseId) {
      toast.error("Выберите курс");
      return false;
    }
    const userIds = Array.from(new Set(selectedUserIds)).filter(Boolean);
    if (userIds.length === 0) {
      toast.error("Выберите учеников");
      return false;
    }
    if (!organizationId) return false;

    setIsEnrolling(true);
    try {
      const { data: existingEnrollments, error: existErr } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", courseId)
        .in("user_id", userIds);
      if (existErr) throw existErr;

      const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));

      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        setShowEnrollDialog(false);
        return false;
      }

      const { error: insertError } = await supabase
        .from("enrollments")
        .insert(newUserIds.map(userId => ({
          user_id: userId,
          course_id: courseId,
          status: "active",
          progress: 0,
        })));
      if (insertError) throw insertError;

      // Point-fetch real full names for the enrollment order. If profiles
      // fail we abort the order (rather than emit a "Неизвестный" one).
      try {
        const { students: fetched } = await fetchStudentsByUserIds(
          organizationId,
          newUserIds,
          { includeEnrollments: false },
        );
        const nameByUser = new Map(fetched.map(s => [s.user_id, s.name]));
        const enrolledNames = newUserIds.map(uid => nameByUser.get(uid)).filter(Boolean) as string[];

        if (enrolledNames.length === newUserIds.length) {
          const course = courses.find(c => c.id === courseId);
          const { data: orgData } = await supabase
            .from("organizations")
            .select("name, director_name, director_position")
            .eq("id", organizationId)
            .single();

          const orderName = await generateEnrollmentOrder({
            organizationId,
            organizationName: orgData?.name || organizationName,
            directorName: orgData?.director_name,
            directorPosition: orgData?.director_position,
            studentNames: enrolledNames,
            courseName: course?.title || "Курс",
            orderType: "enrollment",
          });
          if (orderName) toast.success(`Приказ о зачислении создан: ${orderName}`);
        } else {
          console.warn("[bulkEnroll] name lookup incomplete — skipping enrollment order");
          toast.warning("Приказ о зачислении не создан: не удалось получить ФИО части учеников");
        }
      } catch (nameErr) {
        console.error("[bulkEnroll] name point-fetch failed:", nameErr);
        toast.warning("Приказ о зачислении не создан: не удалось получить ФИО");
      }

      toast.success(`Зачислено ${newUserIds.length} учеников`);
      setShowEnrollDialog(false);
      setSelectedStudentIds(new Set());
      setEnrollCourseId("");
      invalidateStudents();
      invalidateCourse(courseId);
      onRefresh();
      return true;
    } catch (error) {
      console.error("Error enrolling students:", error);
      toast.error("Ошибка зачисления");
      return false;
    } finally {
      setIsEnrolling(false);
    }
  }, [organizationId, organizationName, invalidateStudents, invalidateCourse, onRefresh]);

  /**
   * Bulk unenroll — takes explicit enrollment IDs. NEVER derives them from a
   * legacy full-org snapshot: callers pass the exact enrollment_ids from the
   * currently loaded student pages, so unrelated enrollments cannot be hit.
   */
  const bulkUnenroll = useCallback(async (enrollmentIds: string[]) => {
    const ids = Array.from(new Set(enrollmentIds)).filter(Boolean);
    if (ids.length === 0) {
      toast.error("Нет выбранных зачислений для отчисления");
      setShowUnenrollConfirm(false);
      return false;
    }
    if (!organizationId) return false;

    setIsUnenrolling(true);
    try {
      // Point-load the enrollment rows before deletion so we can build
      // the expulsion order with real course/student names and afterwards
      // invalidate the correct course caches.
      const { data: enrollmentRows, error: enrErr } = await supabase
        .from("enrollments")
        .select("id, user_id, course_id, courses(title)")
        .in("id", ids);
      if (enrErr) throw enrErr;

      const rows = (enrollmentRows ?? []) as Array<{
        id: string;
        user_id: string;
        course_id: string;
        courses: { title: string } | null;
      }>;
      const userIds = Array.from(new Set(rows.map(r => r.user_id)));

      let nameByUser = new Map<string, string>();
      if (userIds.length > 0) {
        try {
          const { students: fetched } = await fetchStudentsByUserIds(
            organizationId,
            userIds,
            { includeEnrollments: false },
          );
          nameByUser = new Map(fetched.map(s => [s.user_id, s.name]));
        } catch (nameErr) {
          console.warn("[bulkUnenroll] name point-fetch failed:", nameErr);
        }
      }

      const { error: delError } = await supabase
        .from("enrollments")
        .delete()
        .in("id", ids);
      if (delError) throw delError;

      // Group by course so we can emit one order per course.
      const byCourse = new Map<string, { courseName: string; names: string[]; courseId: string }>();
      for (const r of rows) {
        const name = nameByUser.get(r.user_id);
        if (!name) continue;
        const entry = byCourse.get(r.course_id) ?? {
          courseName: r.courses?.title || "Курс",
          names: [],
          courseId: r.course_id,
        };
        entry.names.push(name);
        byCourse.set(r.course_id, entry);
      }

      if (byCourse.size > 0) {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("name, director_name, director_position")
          .eq("id", organizationId)
          .single();
        for (const entry of byCourse.values()) {
          const orderName = await generateEnrollmentOrder({
            organizationId,
            organizationName: orgData?.name || organizationName,
            directorName: orgData?.director_name,
            directorPosition: orgData?.director_position,
            studentNames: entry.names,
            courseName: entry.courseName,
            orderType: "expulsion",
          });
          if (orderName) toast.success(`Приказ об отчислении создан: ${orderName}`);
        }
      }

      toast.success(`Отчислено ${ids.length} зачислений`);
      setShowUnenrollConfirm(false);
      setSelectedStudentIds(new Set());
      setSelectedEnrollmentIds([]);
      invalidateStudents();
      for (const courseId of new Set(rows.map(r => r.course_id))) {
        invalidateCourse(courseId);
      }
      onRefresh();
      return true;
    } catch (error) {
      console.error("Error unenrolling:", error);
      toast.error("Ошибка отчисления");
      return false;
    } finally {
      setIsUnenrolling(false);
    }
  }, [organizationId, organizationName, invalidateStudents, invalidateCourse, onRefresh]);

  const getSelectedEnrollmentsCount = useCallback(
    () => selectedEnrollmentIds.length,
    [selectedEnrollmentIds],
  );

  const deleteEnrollment = useCallback(async (
    enrollmentId: string | null,
    setStudents: React.Dispatch<React.SetStateAction<Student[]>>,
  ) => {
    if (!enrollmentId) {
      toast.error("Нельзя удалить — нет зачисления");
      return;
    }
    try {
      const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
      setStudents(prev => prev.filter(s => s.enrollment_id !== enrollmentId));
      invalidateStudents();
      toast.success("Ученик удалён из курса");
    } catch (error) {
      console.error("Error deleting enrollment:", error);
      toast.error("Ошибка удаления");
    }
  }, [invalidateStudents]);

  /**
   * Bulk delete — takes explicit user_ids from the selection. Never converts
   * enrollment_ids back into user_ids and never falls back to a legacy
   * full-org snapshot: what the caller passes is what gets archived.
   */
  const bulkDelete = useCallback(async (selectedUserIds: string[]) => {
    const userIds = Array.from(new Set(selectedUserIds)).filter(Boolean);
    if (userIds.length === 0) {
      toast.error("Выберите учеников для удаления");
      setShowBulkDeleteConfirm(false);
      return false;
    }

    setIsBulkDeleting(true);
    let success = 0;
    let failed = 0;
    try {
      for (const userId of userIds) {
        const ok = await deleteStudent(userId);
        if (ok) success++; else failed++;
      }
      if (success > 0) toast.success(`Удалено: ${success} учеников`);
      if (failed > 0) toast.error(`Ошибок: ${failed}`);

      setShowBulkDeleteConfirm(false);
      setSelectedStudentIds(new Set());
      invalidateStudents();
      onRefresh();
      return true;
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast.error("Ошибка удаления");
      return false;
    } finally {
      setIsBulkDeleting(false);
    }
  }, [invalidateStudents, onRefresh]);

  return {
    isEnrolling,
    isUnenrolling,
    isBulkDeleting,
    selectedStudentIds,
    setSelectedStudentIds,
    selectedEnrollmentIds,
    setSelectedEnrollmentIds,
    showEnrollDialog,
    setShowEnrollDialog,
    showUnenrollConfirm,
    setShowUnenrollConfirm,
    showBulkFRDOExport,
    setShowBulkFRDOExport,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    enrollCourseId,
    setEnrollCourseId,
    toggleStudentSelection,
    toggleSelectAll,
    getSelectedUserIds,
    bulkEnroll,
    bulkUnenroll,
    bulkDelete,
    getSelectedEnrollmentsCount,
    deleteEnrollment,
  };
}
