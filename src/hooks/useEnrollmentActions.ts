import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateEnrollmentOrder } from "@/utils/generateEnrollmentOrder";
import { Student, Course } from "@/types/shared";
import { deleteStudent, fetchStudentsByUserIds } from "@/api/students";
import { qk } from "@/lib/queryKeys";
import { invalidateOrganizationEnrollmentData } from "@/lib/invalidateOrganizationQueries";
import {
  EnrollmentPersistenceError,
  insertEnrollmentsVerified,
} from "@/api/enrollments";

/**
 * Phase 4A.2 — hard cap on bulk mutations that hit `.in(...)` directly.
 * Enrollment and unenrollment go through single-statement INSERT/DELETE
 * with `.in()` filters, so we cap the selection to keep the request small
 * and avoid partial-success scenarios that chunked mutations would create.
 * Point-fetch helpers (profiles, passwords, FRDO) already batch internally
 * and are NOT bound by this limit.
 */
const MAX_BULK_MUTATION_SIZE = 100;



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
  onEnrollmentChanged: () => void,
  onPopulationChanged: () => void,
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

  // Phase 4B.1.c.2.b — `onRefresh` (refreshStudentPopulation) already
  // invalidates studentsPage/counts/summary/overview at the org level.
  // We only add the narrower enrollment helper here for the one flow that
  // does NOT call onRefresh (deleteEnrollment) — everything else relies on
  // the callback.
  const invalidateEnrollment = useCallback(() => {
    invalidateOrganizationEnrollmentData(qc, organizationId);
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
    if (userIds.length > MAX_BULK_MUTATION_SIZE) {
      toast.error("За одну операцию можно обработать не более 100 учеников. Разделите выбор на несколько операций");
      return false;
    }
    if (!organizationId) return false;

    setIsEnrolling(true);
    try {
      // ---------- Phase 4A.1 preflight (no mutation yet) -----------------
      // 1. Point-fetch every selected profile (throws on any missing user_id).
      let fetched: Awaited<ReturnType<typeof fetchStudentsByUserIds>>;
      try {
        fetched = await fetchStudentsByUserIds(
          organizationId,
          userIds,
          { includeEnrollments: false },
        );
      } catch (err) {
        console.error("[bulkEnroll] preflight profiles failed:", err);
        toast.error("Не удалось загрузить профили выбранных учеников. Зачисление отменено.");
        return false;
      }
      const nameByUser = new Map(fetched.students.map(s => [s.user_id, s.name]));
      const missingNames = userIds.filter(uid => {
        const n = nameByUser.get(uid);
        return !n || !n.trim() || n === "Без имени";
      });
      if (missingNames.length > 0) {
        toast.error(`Нет ФИО у ${missingNames.length} из ${userIds.length} учеников. Зачисление отменено.`);
        return false;
      }

      // 2. Existing enrollments — abort on error, don't silently proceed.
      let existingUserIds: Set<string>;
      try {
        const { data: existingEnrollments, error: existErr } = await supabase
          .from("enrollments")
          .select("user_id")
          .eq("course_id", courseId)
          .in("user_id", userIds);
        if (existErr) throw existErr;
        existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      } catch (err) {
        console.error("[bulkEnroll] preflight existing enrollments failed:", err);
        toast.error("Не удалось проверить существующие зачисления. Зачисление отменено.");
        return false;
      }

      const newUserIds = userIds.filter(id => !existingUserIds.has(id));
      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        setShowEnrollDialog(false);
        return false;
      }

      // ---------- Mutation ------------------------------------------------
      await insertEnrollmentsVerified(
        newUserIds.map(userId => ({
          user_id: userId,
          course_id: courseId,
          status: "active",
          progress: 0,
        })),
      );

      // ---------- Enrollment order (post-mutation, separate error) --------
      try {
        const enrolledNames = newUserIds
          .map(uid => nameByUser.get(uid))
          .filter((v): v is string => !!v);
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
      } catch (orderErr) {
        console.error("[bulkEnroll] enrollment order failed:", orderErr);
        toast.warning("Ученики зачислены, но приказ создать не удалось");
      }

      toast.success(`Зачислено ${newUserIds.length} учеников`);
      setShowEnrollDialog(false);
      setSelectedStudentIds(new Set());
      setEnrollCourseId("");
      // onEnrollmentChanged (refreshEnrollmentData) covers studentsPage + summary + overview.
      invalidateCourse(courseId);
      onEnrollmentChanged();
      return true;
    } catch (error) {
      console.error("Error enrolling students:", error);
      if (error instanceof EnrollmentPersistenceError) {
        invalidateCourse(courseId);
        onEnrollmentChanged();
        toast.error("База не подтвердила зачисление. Список обновлён — повторите операцию.");
      } else {
        toast.error("Ошибка зачисления");
      }
      return false;
    } finally {
      setIsEnrolling(false);
    }
  }, [organizationId, organizationName, invalidateCourse, onEnrollmentChanged]);

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
    if (ids.length > MAX_BULK_MUTATION_SIZE) {
      toast.error("За одну операцию можно обработать не более 100 учеников. Разделите выбор на несколько операций");
      return false;
    }
    if (!organizationId) return false;

    setIsUnenrolling(true);
    try {
      // ---------- Phase 4A.1 preflight (no mutation yet) -----------------
      // 1. Load all enrollment rows. Abort if any id is missing.
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
      if (rows.length !== ids.length) {
        toast.error(
          `Найдено только ${rows.length} из ${ids.length} зачислений. Отчисление отменено.`,
        );
        return false;
      }

      // 2. Point-fetch profiles for real names. Any missing => abort.
      const userIds = Array.from(new Set(rows.map(r => r.user_id)));
      let nameByUser = new Map<string, string>();
      try {
        const { students: fetched } = await fetchStudentsByUserIds(
          organizationId,
          userIds,
          { includeEnrollments: false },
        );
        nameByUser = new Map(fetched.map(s => [s.user_id, s.name]));
      } catch (nameErr) {
        console.error("[bulkUnenroll] preflight profiles failed:", nameErr);
        toast.error("Не удалось загрузить профили учеников. Отчисление отменено.");
        return false;
      }
      const missingNames = userIds.filter(uid => {
        const n = nameByUser.get(uid);
        return !n || !n.trim() || n === "Без имени";
      });
      if (missingNames.length > 0) {
        toast.error(`Нет ФИО у ${missingNames.length} учеников. Отчисление отменено.`);
        return false;
      }

      // ---------- Mutation ------------------------------------------------
      const { error: delError } = await supabase
        .from("enrollments")
        .delete()
        .in("id", ids);
      if (delError) throw delError;

      // ---------- Expulsion orders (post-mutation, separate error) --------
      try {
        const byCourse = new Map<string, { courseName: string; names: string[]; courseId: string }>();
        for (const r of rows) {
          const name = nameByUser.get(r.user_id)!;
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
      } catch (orderErr) {
        console.error("[bulkUnenroll] expulsion order failed:", orderErr);
        toast.warning("Ученики отчислены, но приказ создать не удалось");
      }

      toast.success(`Отчислено ${ids.length} зачислений`);
      setShowUnenrollConfirm(false);
      setSelectedStudentIds(new Set());
      setSelectedEnrollmentIds([]);
      // onEnrollmentChanged (refreshEnrollmentData) covers studentsPage + summary + overview.
      for (const courseId of new Set(rows.map(r => r.course_id))) {
        invalidateCourse(courseId);
      }
      onEnrollmentChanged();
      return true;
    } catch (error) {
      console.error("Error unenrolling:", error);
      toast.error("Ошибка отчисления");
      return false;
    } finally {
      setIsUnenrolling(false);
    }
  }, [organizationId, organizationName, invalidateCourse, onEnrollmentChanged]);

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
      invalidateEnrollment();
      toast.success("Ученик удалён из курса");
    } catch (error) {
      console.error("Error deleting enrollment:", error);
      toast.error("Ошибка удаления");
    }
  }, [invalidateEnrollment]);

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
      if (success > 0) toast.success(`Перенесено в архив: ${success} ${success === 1 ? "ученик" : "учеников"}`);
      if (failed > 0) toast.error(`Не удалось перенести: ${failed}`);

      setShowBulkDeleteConfirm(false);
      setSelectedStudentIds(new Set());
      // onPopulationChanged covers studentsPage + counts + groupCounts + summary + overview.
      onPopulationChanged();
      return true;
    } catch (error) {
      console.error("Error bulk archiving:", error);
      toast.error("Ошибка переноса в архив");
      return false;
    } finally {
      setIsBulkDeleting(false);
    }
  }, [onPopulationChanged]);

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
