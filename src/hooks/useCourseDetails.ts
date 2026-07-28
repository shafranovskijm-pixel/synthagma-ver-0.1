import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FRDO_DOCUMENT_TYPES, type CourseFRDOSettings } from "@/constants/frdo";
import {
  fetchCourseStudentsPage,
  fetchCourseStudentsStats,
  fetchAvailableStudentsForCoursePage,
  type CourseStudentPageRow,
  type AvailableStudentRow,
} from "@/api/courseStudents";
import { isTransientNetworkError, classifyDataError, type UserFacingErrorKind } from "@/utils/isTransientNetworkError";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

const paginationRetry = (failureCount: number, error: unknown) =>
  failureCount < 2 && isTransientNetworkError(error);

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

const PAGE_SIZE = 10;
const AVAILABLE_PAGE_SIZE = 20;

/**
 * Second signature-arg (`_legacyStudents`) is kept for backwards compatibility
 * with older call sites (e.g. useCourseDetailsLogic) — it is ignored. Student
 * data is now fetched server-side by this hook via React Query pagination.
 */
export function useCourseDetails(
  course: Course,
  _legacyStudents: unknown = null,
  organizationId: string | null,
  onCourseUpdated?: () => void,
  onRefreshStudents?: () => void,
  onCourseDeleted?: () => void
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  const [collectDocuments, setCollectDocuments] = useState(true);
  const [requirePassport, setRequirePassport] = useState(true);
  const [requireSnils, setRequireSnils] = useState(true);
  const [requireEducationDocument, setRequireEducationDocument] = useState(true);
  const [requireBirthCertificate, setRequireBirthCertificate] = useState(false);
  const [resetConfirmStudent, setResetConfirmStudent] = useState<CourseStudentPageRow | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Server-side filters
  const [studentsSearchQuery, setStudentsSearchQuery] = useState("");
  const [studentsStatusFilter, setStudentsStatusFilter] = useState<"all" | "active" | "completed">("all");

  // Enroll popover
  const [enrollPopoverOpen, setEnrollPopoverOpen] = useState(false);
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
      const dc = lc?.document_collection || {};
      setCollectDocuments(dc.enabled !== false);
      setRequirePassport(dc.enabled !== false && dc.passport !== false);
      setRequireSnils(dc.enabled !== false && dc.snils !== false);
      setRequireEducationDocument(dc.enabled !== false && dc.education_document !== false);
      setRequireBirthCertificate(dc.enabled !== false && dc.birth_certificate === true);
    }
  }, [course]);

  // ---- Debounced search inputs (350ms). The RAW value drives the input,
  // the debounced value drives the React Query key + RPC params.
  const debouncedStudentsSearch = useDebouncedValue(studentsSearchQuery, 350);
  const debouncedEnrollSearch = useDebouncedValue(enrollSearchQuery, 350);

  // ---- Server-side paginated students of the course ----
  const studentsQueryKey = useMemo(
    () => ["course-students-page", course?.id, debouncedStudentsSearch.trim() || null, studentsStatusFilter] as const,
    [course?.id, debouncedStudentsSearch, studentsStatusFilter]
  );

  const studentsQuery = useInfiniteQuery({
    queryKey: studentsQueryKey,
    initialPageParam: 0,
    enabled: !!course?.id,
    queryFn: ({ pageParam }) =>
      fetchCourseStudentsPage({
        courseId: course.id,
        limit: PAGE_SIZE,
        offset: pageParam as number,
        search: debouncedStudentsSearch,
        status: studentsStatusFilter,
      }),
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 30_000,
    retry: paginationRetry,
  });

  // Dedup by enrollment_id (fallback user_id) — invalidations / late pages
  // must not surface the same enrollment twice.
  const courseStudents = useMemo<CourseStudentPageRow[]>(() => {
    const seen = new Set<string>();
    const out: CourseStudentPageRow[] = [];
    for (const p of studentsQuery.data?.pages ?? []) {
      for (const r of p.rows) {
        const key = r.enrollment_id || r.user_id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
      }
    }
    return out;
  }, [studentsQuery.data]);
  const totalFilteredStudents = studentsQuery.data?.pages?.[0]?.totalFiltered ?? 0;

  // Distinguish first-page load failure from next-page failure using
  // React Query's dedicated `isFetchNextPageError` flag — a background
  // refetch error while data exists must NOT be surfaced as a "next page"
  // error, and a failed second page must NOT hide the first page.
  const studentsErrorKind: UserFacingErrorKind | null =
    studentsQuery.isLoadingError && courseStudents.length === 0
      ? classifyDataError(studentsQuery.error)
      : null;
  const nextStudentsPageErrorKind: UserFacingErrorKind | null =
    studentsQuery.isFetchNextPageError
      ? classifyDataError(studentsQuery.error)
      : null;

  const retryStudents = useCallback(() => { void studentsQuery.refetch(); }, [studentsQuery]);
  const retryNextStudentsPage = useCallback(() => {
    if (!studentsQuery.isFetchingNextPage) void studentsQuery.fetchNextPage();
  }, [studentsQuery]);

  // ---- Course-wide stats ----
  const statsQuery = useQuery({
    queryKey: ["course-students-stats", course?.id],
    enabled: !!course?.id,
    queryFn: () => fetchCourseStudentsStats(course.id),
    staleTime: 30_000,
    retry: paginationRetry,
  });
  const totalStudents = statsQuery.data?.totalStudents ?? 0;
  const activeStudents = statsQuery.data?.activeStudents ?? 0;
  const completedStudents = statsQuery.data?.completedStudents ?? 0;
  const avgProgress = Math.round(statsQuery.data?.averageProgress ?? 0);
  const completionRate = totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0;
  const statsErrorKind: UserFacingErrorKind | null =
    statsQuery.isError ? classifyDataError(statsQuery.error) : null;
  const retryStats = useCallback(() => { void statsQuery.refetch(); }, [statsQuery]);

  const invalidateStudents = useCallback(() => {
    if (!course?.id) return;
    queryClient.invalidateQueries({ queryKey: ["course-students-page", course.id] });
    queryClient.invalidateQueries({ queryKey: ["course-students-stats", course.id] });
    queryClient.invalidateQueries({ queryKey: ["available-students-for-course", course.id] });
    onRefreshStudents?.();
  }, [course?.id, queryClient, onRefreshStudents]);

  const loadMoreStudents = useCallback(() => {
    if (studentsQuery.hasNextPage && !studentsQuery.isFetchingNextPage) {
      void studentsQuery.fetchNextPage();
    }
  }, [studentsQuery]);

  // ---- Server-side paginated "available students" for the enroll popover ----
  const availableQueryKey = useMemo(
    () => ["available-students-for-course", course?.id, debouncedEnrollSearch.trim() || null] as const,
    [course?.id, debouncedEnrollSearch]
  );

  const availableQuery = useInfiniteQuery({
    queryKey: availableQueryKey,
    initialPageParam: 0,
    enabled: !!course?.id && enrollPopoverOpen,
    queryFn: ({ pageParam }) =>
      fetchAvailableStudentsForCoursePage({
        courseId: course.id,
        limit: AVAILABLE_PAGE_SIZE,
        offset: pageParam as number,
        search: debouncedEnrollSearch,
      }),
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 15_000,
    retry: paginationRetry,
  });

  const availableStudents = useMemo<AvailableStudentRow[]>(() => {
    const seen = new Set<string>();
    const out: AvailableStudentRow[] = [];
    for (const p of availableQuery.data?.pages ?? []) {
      for (const r of p.rows) {
        if (seen.has(r.user_id)) continue;
        seen.add(r.user_id);
        out.push(r);
      }
    }
    return out;
  }, [availableQuery.data]);
  const availableTotalFiltered = availableQuery.data?.pages?.[0]?.totalFiltered ?? 0;
  const isLoadingAvailable = availableQuery.isLoading || availableQuery.isFetchingNextPage;

  const availableErrorKind: UserFacingErrorKind | null =
    availableQuery.isLoadingError && availableStudents.length === 0
      ? classifyDataError(availableQuery.error)
      : null;
  const nextAvailablePageErrorKind: UserFacingErrorKind | null =
    availableQuery.isFetchNextPageError
      ? classifyDataError(availableQuery.error)
      : null;
  const retryAvailable = useCallback(() => { void availableQuery.refetch(); }, [availableQuery]);
  const retryNextAvailablePage = useCallback(() => {
    if (!availableQuery.isFetchingNextPage) void availableQuery.fetchNextPage();
  }, [availableQuery]);

  useEffect(() => {
    if (enrollPopoverOpen) {
      setSelectedToEnroll(new Set());
      setEnrollSearchQuery("");
    }
  }, [enrollPopoverOpen]);

  const loadMoreAvailable = useCallback(() => {
    if (availableQuery.hasNextPage && !availableQuery.isFetchingNextPage) {
      void availableQuery.fetchNextPage();
    }
  }, [availableQuery]);

  const handleEnrollSelected = async () => {
    if (!course || selectedToEnroll.size === 0) return;
    setIsEnrolling(true);
    try {
      const userIds = Array.from(selectedToEnroll);
      const { data: existing, error: existingError } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", course.id)
        .in("user_id", userIds);
      if (existingError) throw existingError;
      const existingIds = new Set((existing || []).map((e) => e.user_id));
      const newIds = userIds.filter((id) => !existingIds.has(id));
      if (newIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены");
        setSelectedToEnroll(new Set());
        return;
      }
      const rows = newIds.map((userId) => ({
        user_id: userId,
        course_id: course.id,
        status: "active",
        progress: 0,
        ...(defaultAccessDays ? { access_days: defaultAccessDays } : {}),
      }));
      const { error } = await supabase.from("enrollments").insert(rows);
      if (error) throw error;
      toast.success(
        `Зачислено ${newIds.length} ${
          newIds.length === 1 ? "ученик" : newIds.length < 5 ? "ученика" : "учеников"
        }`
      );
      setSelectedToEnroll(new Set());
      setEnrollPopoverOpen(false);
      invalidateStudents();
    } catch (error) {
      console.error("Error enrolling:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsEnrolling(false);
    }
  };

  const toggleStudentToEnroll = (userId: string) => {
    setSelectedToEnroll((prev) => {
      const s = new Set(prev);
      s.has(userId) ? s.delete(userId) : s.add(userId);
      return s;
    });
  };

  // Kept for backwards-compat with existing UI — server already filters, so
  // this is now an identity pass-through.
  const filteredAvailableStudents = availableStudents;

  // Settings handlers
  const updateCourseSetting = async (field: string, value: any, successMsg?: string) => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase.from("courses").update({ [field]: value } as any).eq("id", course.id);
      if (error) throw error;
      if (successMsg) toast.success(successMsg);
      onCourseUpdated?.();
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      toast.error("Ошибка сохранения настроек");
    } finally {
      setIsSavingSettings(false);
    }
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

  const updateDocumentCollectionField = async (key: string, value: boolean) => {
    if (!course) return;
    setIsSavingSettings(true);
    try {
      const { data: current } = await supabase.from("courses").select("landing_content").eq("id", course.id).single();
      const lc = (current?.landing_content as any) || {};
      const currentDc = lc.document_collection || {};
      const dc = key === "enabled" && value === false
        ? { ...currentDc, enabled: false, passport: false, snils: false, education_document: false, birth_certificate: false }
        : { ...currentDc, [key]: value };
      const updated = { ...lc, document_collection: dc };
      const { error } = await supabase.from("courses").update({ landing_content: updated } as any).eq("id", course.id);
      if (error) throw error;
      onCourseUpdated?.();
    } catch (error) { console.error("Error updating document_collection:", error); toast.error("Ошибка сохранения"); }
    finally { setIsSavingSettings(false); }
  };
  const handleToggleCollectDocuments = async (v: boolean) => {
    setCollectDocuments(v);
    if (!v) {
      setRequirePassport(false); setRequireSnils(false);
      setRequireEducationDocument(false); setRequireBirthCertificate(false);
    }
    await updateDocumentCollectionField("enabled", v);
    toast.success(v ? "Сбор документов включён" : "Сбор документов отключён");
  };
  const handleToggleRequirePassport = async (v: boolean) => { setRequirePassport(v); await updateDocumentCollectionField("passport", v); };
  const handleToggleRequireSnils = async (v: boolean) => { setRequireSnils(v); await updateDocumentCollectionField("snils", v); };
  const handleToggleRequireEducationDocument = async (v: boolean) => { setRequireEducationDocument(v); await updateDocumentCollectionField("education_document", v); };
  const handleToggleRequireBirthCertificate = async (v: boolean) => { setRequireBirthCertificate(v); await updateDocumentCollectionField("birth_certificate", v); };

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
    setFrdoSettings((prev) => {
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

  const handleResetProgress = async (student: CourseStudentPageRow) => {
    if (!course || !student.enrollment_id) return;
    setIsResetting(true);
    try {
      const { data: lessons } = await supabase.from("lessons").select("id").eq("course_id", course.id);
      const lessonIds = (lessons || []).map((l) => l.id);
      if (lessonIds.length > 0) {
        await supabase.from("lesson_progress").delete().eq("user_id", student.user_id).in("lesson_id", lessonIds);
        await supabase.from("test_attempts").delete().eq("user_id", student.user_id).in("lesson_id", lessonIds);
      }
      const { error } = await supabase.from("enrollments").update({ progress: 0, status: "active", completed_at: null }).eq("id", student.enrollment_id);
      if (error) throw error;
      toast.success(`Прогресс ученика "${student.name}" сброшен`);
      setResetConfirmStudent(null);
      invalidateStudents();
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

  return {
    navigate, showDeleteConfirm, setShowDeleteConfirm, isDeleting, isSavingSettings,
    skipVideoId, sequentialLessons, allowVideoSeek, trainingForm, retrainingPeriod, setRetrainingPeriod,
    reminderAdvanceDays, setReminderAdvanceDays, notifyOnCompletion, setNotifyOnCompletion,
    completionNotifyEmails, setCompletionNotifyEmails, defaultAccessDays, setDefaultAccessDays,
    requireEnrollmentApproval, copyProtection, videoWatermark, externalCardUrl, setExternalCardUrl,
    collectDocuments, requirePassport, requireSnils, requireEducationDocument, requireBirthCertificate,
    handleToggleCollectDocuments, handleToggleRequirePassport, handleToggleRequireSnils,
    handleToggleRequireEducationDocument, handleToggleRequireBirthCertificate,
    resetConfirmStudent, setResetConfirmStudent, isResetting,
    enrollPopoverOpen, setEnrollPopoverOpen, availableStudents, isLoadingAvailable,
    enrollSearchQuery, setEnrollSearchQuery, selectedToEnroll, isEnrolling, frdoSettings,
    filteredAvailableStudents, toggleStudentToEnroll, handleEnrollSelected,
    availableTotalFiltered, loadMoreAvailable, hasMoreAvailable: !!availableQuery.hasNextPage,
    handleToggleSkipVideoId, handleToggleSequentialLessons, handleToggleAllowVideoSeek,
    handleToggleCopyProtection, handleToggleVideoWatermark, handleUpdateExternalCardUrl,
    handleUpdateDefaultAccessDays, handleToggleRequireEnrollmentApproval, handleUpdateTrainingForm,
    handleUpdateFrdoSettings, handleResetProgress, handleDeleteCourse,
    totalStudents, activeStudents, completedStudents, avgProgress, completionRate,
    // Reminders-specific handlers (inline in the component)
    updateCourseSetting,
    // Server-paginated course students
    courseStudents,
    totalFilteredStudents,
    studentsSearchQuery, setStudentsSearchQuery,
    studentsStatusFilter, setStudentsStatusFilter,
    isLoadingStudents: studentsQuery.isLoading,
    isFetchingMoreStudents: studentsQuery.isFetchingNextPage,
    hasMoreStudents: !!studentsQuery.hasNextPage,
    loadMoreStudents,
    refreshStudents: invalidateStudents,
    // Error branches
    studentsErrorKind,
    nextStudentsPageErrorKind,
    retryStudents,
    retryNextStudentsPage,
    availableErrorKind,
    nextAvailablePageErrorKind,
    retryAvailable,
    retryNextAvailablePage,
    statsErrorKind,
    retryStats,
  };
}
