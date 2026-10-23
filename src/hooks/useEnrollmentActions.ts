import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { captureCustomJournalScope, customJournalScopeCurrent } from "@/lib/customJournals/client";
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
 * Enrollment uses one verified INSERT. Withdrawal preparation is read-only;
 * the retained lifecycle transition is handled by the controlled group workflow.
 * Bulk population mutations use
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
  const currentOrganization = useRef(organizationId); currentOrganization.current = organizationId;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [withdrawalPreparation, setWithdrawalPreparation] = useState<{ actorId: string; accessRevision: number; organizationId: string; rows: { enrollment_id: string; user_id: string; course_id: string; student_name: string; course_title: string; status: string | null; progress: number | null }[] } | null>(null);
  useEffect(() => { setWithdrawalPreparation(null); }, [organizationId]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isUnenrolling, setIsUnenrolling] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  /** Enrollment IDs staged for unenrollment. Set by the confirmation callback. */
  const [selectedEnrollmentIds, setSelectedEnrollmentIdsState] = useState<string[]>([]);
  const setSelectedEnrollmentIds = useCallback((next: React.SetStateAction<string[]>) => { setWithdrawalPreparation(null); setSelectedEnrollmentIdsState(next); }, []);
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
    options?: { canContinue?: () => boolean },
  ) => {
    if (options?.canContinue && !options.canContinue()) return false;
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
      if (options?.canContinue && !options.canContinue()) return false;
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
          .select("user_id, status")
          .eq("course_id", courseId)
          .in("user_id", userIds);
        if (existErr) throw existErr;
        existingUserIds = new Set((existingEnrollments || []).filter(e => e.status !== "cancelled").map(e => e.user_id));
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
      // A student-card batch can be cancelled while either preflight is in
      // flight (navigation, organization change, or revoked permissions).
      if (options?.canContinue && !options.canContinue()) return false;
      await insertEnrollmentsVerified(
        newUserIds.map(userId => ({
          user_id: userId,
          course_id: courseId,
          status: "active",
          progress: 0,
        })),
      );

      if (options?.canContinue && !options.canContinue()) return false;
      toast.info("Приказ автоматически не оформлен. Подготовьте документ в рабочем процессе группы и зарегистрируйте точный файл.");

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
    if (!organizationId || !ids.length || ids.length > MAX_BULK_MUTATION_SIZE) { toast.error('Выберите от 1 до 100 зачислений для подготовки.'); return false; }
    let scope: ReturnType<typeof captureCustomJournalScope>;
    try { scope = captureCustomJournalScope(organizationId, () => mounted.current && currentOrganization.current === organizationId); } catch { toast.error('Текущий доступ не подтверждён.'); return false; }
    const current = () => customJournalScopeCurrent(scope);
    setIsUnenrolling(true); setWithdrawalPreparation(null);
    try {
      const { data, error } = await supabase.from('enrollments').select('id, user_id, course_id, status, progress, courses(title, organization_id)').in('id', ids);
      if (!current()) return false; if (error) throw error;
      const rows = (data ?? []) as { id: string; user_id: string; course_id: string; status: string | null; progress: number | null; courses: { title: string; organization_id: string } | null }[];
      if (rows.length !== ids.length || new Set(rows.map(row => row.id)).size !== ids.length || rows.some(row => !ids.includes(row.id) || row.courses?.organization_id !== organizationId)) throw new Error('Набор зачислений изменился или относится к другой организации.');
      const { students } = await fetchStudentsByUserIds(organizationId, [...new Set(rows.map(row => row.user_id))], { includeEnrollments: false });
      if (!current()) return false;
      const names = new Map(students.map(student => [student.user_id, student.name]));
      if (rows.some(row => !names.get(row.user_id)?.trim() || names.get(row.user_id) === 'Без имени')) throw new Error('Не удалось подтвердить сведения выбранных учеников.');
      // Preparation is a factual, unnumbered selection. Never delete enrollments before a durable lifecycle event.
      setWithdrawalPreparation({ actorId: scope.actorId, accessRevision: scope.accessRevision, organizationId, rows: rows.map(row => ({ enrollment_id: row.id, user_id: row.user_id, course_id: row.course_id, student_name: names.get(row.user_id)!, course_title: row.courses!.title, status: row.status, progress: row.progress })) });
      toast.info('Выбор для подготовки отчисления проверен. Зачисления и результаты сохранены; приказ и событие отчисления не создавались.');
      return true;
    } catch (error) { if (current()) toast.error(error instanceof Error ? error.message : 'Не удалось проверить выбранные зачисления. Данные не изменены.'); return false; }
    finally { if (current()) setIsUnenrolling(false); }
  }, [organizationId]);

  const getSelectedEnrollmentsCount = useCallback(
    () => selectedEnrollmentIds.length,
    [selectedEnrollmentIds],
  );

  const deleteEnrollment = useCallback(async (enrollmentId: string | null, _setStudents: React.Dispatch<React.SetStateAction<Student[]>>) => {
    if (!enrollmentId) { toast.error('Не выбрано точное зачисление.'); return; }
    setSelectedEnrollmentIds([enrollmentId]);
    setShowUnenrollConfirm(true);
  }, [setSelectedEnrollmentIds]);

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
    withdrawalPreparation: withdrawalPreparation && withdrawalPreparation.organizationId === organizationId && customJournalScopeCurrent(withdrawalPreparation) ? withdrawalPreparation : null,
    bulkDelete,
    getSelectedEnrollmentsCount,
    deleteEnrollment,
  };
}
