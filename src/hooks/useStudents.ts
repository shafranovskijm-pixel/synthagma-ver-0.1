import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Student, StudentFRDOStatus, StudentStatusFilter, StudentDocsFilter } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { isTransientNetworkError, classifyDataError, type UserFacingErrorKind } from "@/utils/isTransientNetworkError";
import {
  fetchOrganizationStudentsPage,
  fetchOrganizationStudentsCounts,
  fetchOrganizationStudentGroupCounts,
  fetchStudentPasswordsForUsers,
  type OrgStudentGroupCount,
  createStudent,
  enrollStudent,
  unenrollStudent as apiUnenrollStudent,
  bulkEnrollStudents,
  bulkUnenrollStudents,
  updateStudentCompany,
  deleteStudent,
  setStudentArchived,
  isValidEmail,
} from "@/api/students";
import { toast } from "sonner";
import { qk } from "@/lib/queryKeys";

interface StudentGroup {
  id: string;
  name: string;
  color: string;
  organization_id: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
}

const PAGE_SIZE = 10;

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

interface UseStudentsOptions {
  enabled?: boolean;
}

export interface UseStudentsReturn {
  students: Student[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  errorKind: UserFacingErrorKind | null;
  nextPageErrorKind: UserFacingErrorKind | null;
  frdoStatus: Map<string, StudentFRDOStatus>;
  selectedStudentIds: Set<string>;
  setSelectedStudentIds: (ids: Set<string>) => void;
  createNewStudent: (params: {
    name: string;
    email: string;
    courseId?: string;
    companyId?: string;
    noLogin?: boolean;
  }) => Promise<boolean>;
  enrollToCourse: (userId: string, courseId: string) => Promise<boolean>;
  unenrollFromCourse: (enrollmentId: string) => Promise<boolean>;
  bulkEnroll: (courseId: string) => Promise<{ success: number; failed: number }>;
  bulkUnenroll: () => Promise<{ success: number; failed: number }>;
  bulkDelete: () => Promise<{ success: number; failed: number }>;
  updateCompany: (userId: string, companyId: string | null) => Promise<boolean>;
  removeStudent: (userId: string) => Promise<boolean>;
  toggleSelection: (uniqueId: string) => void;
  toggleSelectAll: (filteredList: Student[]) => void;
  getSelectedUserIds: () => string[];
  refresh: () => void;
  // Filters
  statusFilter: StudentStatusFilter;
  setStatusFilter: (filter: StudentStatusFilter) => void;
  courseFilter: string;
  setCourseFilter: (courseId: string) => void;
  groupFilter: string;
  setGroupFilter: (groupId: string) => void;
  studentGroups: StudentGroup[];
  refreshGroups: () => void;
  studentGroupMap: Map<string, string | null>;
  groupCounts: Map<string, OrgStudentGroupCount>; // key: group_id (or "__none" for null)
  docsFilter: StudentDocsFilter;
  setDocsFilter: (filter: StudentDocsFilter) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  // Pagination
  loadMore: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadedCount: number;
  totalFiltered: number;
  retry: () => void;
  retryNextPage: () => void;
  // Archive
  viewMode: "active" | "archive";
  setViewMode: (mode: "active" | "archive") => void;
  activeStudentsCount: number;
  archivedCount: number;
  archiveByMonth: Array<{ key: string; label: string; students: Student[] }>;
  archiveStudent: (userId: string) => Promise<boolean>;
  unarchiveStudent: (userId: string) => Promise<boolean>;
  // On-demand credentials
  fetchStudentCredentialsOnDemand: (userId: string) => Promise<string | null>;
}

export function useStudents(
  organizationId: string | null,
  options: UseStudentsOptions = {},
): UseStudentsReturn {
  const { enabled = true } = options;
  const qc = useQueryClient();
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Filters
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [docsFilter, setDocsFilter] = useState<StudentDocsFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewModeState] = useState<"active" | "archive">(() => {
    if (typeof window === "undefined") return "active";
    return (localStorage.getItem("org.students.viewMode") as "active" | "archive") || "active";
  });
  const setViewMode = useCallback((mode: "active" | "archive") => {
    setViewModeState(mode);
    if (typeof window !== "undefined") localStorage.setItem("org.students.viewMode", mode);
  }, []);

  const debouncedSearch = useDebouncedValue(searchQuery, 350);
  const trimmedSearch = debouncedSearch.trim();

  const filtersKey = useMemo(
    () => ({
      search: trimmedSearch,
      course: courseFilter,
      group: groupFilter,
      status: statusFilter,
      docs: docsFilter,
      archive: viewMode,
    }),
    [trimmedSearch, courseFilter, groupFilter, statusFilter, docsFilter, viewMode],
  );

  // ---- Paginated student list (10 per page, active OR archive) ----
  // `enabled` gates ONLY the page list. Counts/group counts keep running so
  // sidebar/tab numbers stay correct even when the tab is on "Groups".
  const pageQuery = useInfiniteQuery({
    queryKey: qk.org.studentsPage(organizationId ?? "none", filtersKey),
    initialPageParam: 0,
    enabled: !!organizationId && enabled,
    queryFn: ({ pageParam }) =>
      fetchOrganizationStudentsPage({
        organizationId: organizationId!,
        limit: PAGE_SIZE,
        offset: pageParam as number,
        search: trimmedSearch || null,
        courseId: courseFilter,
        groupFilter,
        status: statusFilter,
        docsFilter,
        archiveMode: viewMode,
      }),
    getNextPageParam: last => last.nextOffset,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: paginationRetry,
  });

  const students = useMemo<Student[]>(() => {
    const seen = new Set<string>();
    const out: Student[] = [];
    for (const p of pageQuery.data?.pages ?? []) {
      for (const s of p.rows) {
        if (seen.has(s.user_id)) continue;
        seen.add(s.user_id);
        out.push(s);
      }
    }
    return out;
  }, [pageQuery.data]);

  // Reset selection whenever filters/view change (new debounced key).
  useEffect(() => {
    setSelectedStudentIds(new Set());
  }, [filtersKey]);

  const totalFiltered = pageQuery.data?.pages?.[0]?.totalFiltered ?? 0;

  const errorKind: UserFacingErrorKind | null =
    pageQuery.isLoadingError && students.length === 0 ? classifyDataError(pageQuery.error) : null;
  const nextPageErrorKind: UserFacingErrorKind | null =
    pageQuery.isFetchNextPageError ? classifyDataError(pageQuery.error) : null;

  // ---- Org-wide counts (active / archived) — independent of filters and
  // independent of `enabled` (Groups panel still needs these badges). ----
  const countsQuery = useQuery({
    queryKey: qk.org.studentsCounts(organizationId ?? "none"),
    queryFn: () => fetchOrganizationStudentsCounts(organizationId!),
    enabled: !!organizationId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: paginationRetry,
  });

  // ---- Group counts (also independent of `enabled`) ----
  const groupCountsQuery = useQuery({
    queryKey: qk.org.studentGroupCounts(organizationId ?? "none"),
    queryFn: () => fetchOrganizationStudentGroupCounts(organizationId!),
    enabled: !!organizationId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: paginationRetry,
  });


  const groupCounts = useMemo(() => {
    const map = new Map<string, OrgStudentGroupCount>();
    for (const g of groupCountsQuery.data ?? []) {
      map.set(g.group_id ?? "__none", g);
    }
    return map;
  }, [groupCountsQuery.data]);

  // ---- Student groups directory ----
  const groupsQuery = useQuery({
    queryKey: qk.org.studentGroups(organizationId ?? "none"),
    queryFn: async () => {
      if (!organizationId) return [] as StudentGroup[];
      const { data } = await supabase
        .from("student_groups")
        .select("id, name, color, organization_id, created_at, start_date, end_date")
        .eq("organization_id", organizationId)
        .order("name");
      return (data as StudentGroup[]) || [];
    },
    enabled: !!organizationId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const studentGroups = groupsQuery.data ?? [];

  // Build studentGroupMap from loaded rows (for row-level Select value binding).
  const studentGroupMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const s of students) map.set(s.user_id, s.student_group_id ?? null);
    return map;
  }, [students]);

  // FRDO status map built from server flags on the loaded rows.
  const frdoStatus = useMemo(() => {
    const map = new Map<string, StudentFRDOStatus>();
    for (const s of students) {
      map.set(s.user_id, {
        hasData: !!s.frdo_has_data,
        isComplete: !!s.frdo_complete,
        // Row component only checks isComplete/hasData for the icon — the
        // detailed missing-fields list is populated in the drawer with a
        // targeted fetchFRDOStatus call for that single user.
        missingFields: s.frdo_has_data && !s.frdo_complete ? ["данные ФРДО"] : [],
      });
    }
    return map;
  }, [students]);

  const isLoading = !!organizationId && enabled && pageQuery.isLoading;
  const isError = !!organizationId && pageQuery.isLoadingError && students.length === 0;

  // ---- Archive grouped by month by profile.archived_at ONLY ----
  // Completing all courses does NOT archive the student — archive contains
  // only explicitly archived / soft-deleted profiles.
  const archiveByMonth = useMemo(() => {
    if (viewMode !== "archive") return [] as Array<{ key: string; label: string; students: Student[] }>;
    const groups = new Map<string, Student[]>();
    const labels: Record<string, string> = {};
    const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
    const seenPerKey = new Map<string, Set<string>>();
    for (const s of students) {
      const dateStr = s.archived_at ?? null;
      let key = "no-date";
      let label = "Без даты архивации";
      if (dateStr) {
        const d = new Date(dateStr);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      }
      let dedup = seenPerKey.get(key);
      if (!dedup) { dedup = new Set(); seenPerKey.set(key, dedup); }
      if (dedup.has(s.user_id)) continue;
      dedup.add(s.user_id);
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
      labels[key] = label;
    }
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([key, list]) => ({ key, label: labels[key] || "Без даты архивации", students: list }));
  }, [students, viewMode]);


  // ---- Mutations & helpers ----
  const invalidateStudents = useCallback(() => {
    if (!organizationId) return;
    qc.invalidateQueries({ queryKey: qk.org.studentsPageAll(organizationId) });
    qc.invalidateQueries({ queryKey: qk.org.studentsCounts(organizationId) });
    qc.invalidateQueries({ queryKey: qk.org.studentGroupCounts(organizationId) });
  }, [qc, organizationId]);

  const refreshGroups = useCallback(() => {
    if (!organizationId) return;
    qc.invalidateQueries({ queryKey: qk.org.studentGroups(organizationId) });
    qc.invalidateQueries({ queryKey: qk.org.studentGroupCounts(organizationId) });
  }, [qc, organizationId]);

  const toggleSelection = useCallback((uniqueId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(uniqueId)) next.delete(uniqueId);
      else next.add(uniqueId);
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

  const getSelectedUserIds = useCallback((): string[] => Array.from(selectedStudentIds), [selectedStudentIds]);

  const createNewStudent = useCallback(async (params: {
    name: string; email: string; courseId?: string; companyId?: string; noLogin?: boolean;
  }): Promise<boolean> => {
    if (!organizationId) return false;
    if (!params.name.trim() || !params.email.trim()) { toast.error("Заполните ФИО и Email"); return false; }
    if (!isValidEmail(params.email)) { toast.error("Введите корректный email адрес"); return false; }

    const result = await createStudent({ organizationId, ...params });
    if (!result.success) { toast.error(result.error || "Ошибка создания ученика"); return false; }

    if (result.data?.is_no_login) toast.success(result.data.message || "Ученик добавлен");
    else if (result.data?.is_existing) toast.success(result.data.message || "Ученик зачислен на курс");
    else toast.success(`Ученик создан. Пароль: ${result.data?.password} (сохраните его!)`);
    invalidateStudents();
    return true;
  }, [organizationId, invalidateStudents]);

  const enrollToCourse = useCallback(async (userId: string, courseId: string): Promise<boolean> => {
    const result = await enrollStudent(userId, courseId);
    if (!result.success) { toast.error(result.error || "Ошибка зачисления"); return false; }
    toast.success("Ученик зачислен на курс");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  const unenrollFromCourse = useCallback(async (enrollmentId: string): Promise<boolean> => {
    const success = await apiUnenrollStudent(enrollmentId);
    if (!success) { toast.error("Ошибка отчисления"); return false; }
    toast.success("Ученик отчислен с курса");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  const bulkEnroll = useCallback(async (courseId: string) => {
    const userIds = getSelectedUserIds();
    const result = await bulkEnrollStudents(userIds, courseId);
    if (result.success > 0) toast.success(`Зачислено: ${result.success} учеников`);
    if (result.failed > 0) toast.error(`Ошибок: ${result.failed}`);
    setSelectedStudentIds(new Set());
    invalidateStudents();
    return result;
  }, [getSelectedUserIds, invalidateStudents]);

  const bulkUnenroll = useCallback(async () => {
    const enrollmentIds = Array.from(selectedStudentIds).map(id => {
      const student = students.find(s => s.user_id === id);
      return student?.enrollment_id;
    }).filter(Boolean) as string[];
    const result = await bulkUnenrollStudents(enrollmentIds);
    if (result.success > 0) toast.success(`Отчислено: ${result.success} учеников`);
    if (result.failed > 0) toast.error(`Ошибок: ${result.failed}`);
    setSelectedStudentIds(new Set());
    invalidateStudents();
    return result;
  }, [selectedStudentIds, students, invalidateStudents]);

  const bulkDelete = useCallback(async () => {
    const userIds = getSelectedUserIds();
    let success = 0, failed = 0;
    for (const userId of userIds) {
      const ok = await deleteStudent(userId);
      if (ok) success++; else failed++;
    }
    if (success > 0) toast.success(`Удалено: ${success} учеников`);
    if (failed > 0) toast.error(`Ошибок: ${failed}`);
    setSelectedStudentIds(new Set());
    invalidateStudents();
    return { success, failed };
  }, [getSelectedUserIds, invalidateStudents]);

  const updateCompany = useCallback(async (userId: string, companyId: string | null) => {
    const ok = await updateStudentCompany(userId, companyId);
    if (!ok) { toast.error("Ошибка обновления компании"); return false; }
    toast.success("Компания обновлена");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  const dropFromSelection = useCallback((userId: string) => {
    setSelectedStudentIds(prev => {
      if (!prev.has(userId)) return prev;
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  const removeStudent = useCallback(async (userId: string) => {
    const ok = await deleteStudent(userId);
    if (!ok) { toast.error("Ошибка удаления ученика"); return false; }
    toast.success("Ученик удалён");
    dropFromSelection(userId);
    invalidateStudents();
    return true;
  }, [invalidateStudents, dropFromSelection]);

  const refresh = useCallback(() => { invalidateStudents(); }, [invalidateStudents]);

  const archiveStudent = useCallback(async (userId: string) => {
    const ok = await setStudentArchived(userId, true);
    if (!ok) { toast.error("Не удалось перенести в архив"); return false; }
    toast.success("Ученик перенесён в архив");
    dropFromSelection(userId);
    invalidateStudents();
    return true;
  }, [invalidateStudents, dropFromSelection]);

  const unarchiveStudent = useCallback(async (userId: string) => {
    const ok = await setStudentArchived(userId, false);
    if (!ok) { toast.error("Не удалось вернуть из архива"); return false; }
    toast.success("Ученик возвращён из архива");
    dropFromSelection(userId);
    invalidateStudents();
    return true;
  }, [invalidateStudents, dropFromSelection]);


  // ---- Pagination controls ----
  const loadMore = useCallback(() => {
    if (pageQuery.hasNextPage && !pageQuery.isFetchingNextPage) void pageQuery.fetchNextPage();
  }, [pageQuery]);
  const retry = useCallback(() => { void pageQuery.refetch(); }, [pageQuery]);
  const retryNextPage = useCallback(() => {
    if (!pageQuery.isFetchingNextPage) void pageQuery.fetchNextPage();
  }, [pageQuery]);

  // ---- On-demand credentials for a single user ----
  const fetchStudentCredentialsOnDemand = useCallback(async (userId: string): Promise<string | null> => {
    if (!organizationId) return null;
    try {
      const cached = qc.getQueryData<string | null>(qk.org.studentCredentials(organizationId, userId));
      if (cached !== undefined) return cached ?? null;
      const map = await fetchStudentPasswordsForUsers(organizationId, [userId]);
      const pw = map.get(userId) ?? null;
      qc.setQueryData(qk.org.studentCredentials(organizationId, userId), pw);
      return pw;
    } catch (err) {
      const kind = classifyDataError(err);
      if (kind === "permission") toast.error("Нет прав на просмотр пароля");
      else if (kind === "network") toast.error("Сетевая ошибка. Повторите.");
      else toast.error("Не удалось получить пароль");
      return null;
    }
  }, [organizationId, qc]);

  const activeStudentsCount = countsQuery.data?.active_count ?? 0;
  const archivedCount = countsQuery.data?.archived_count ?? 0;

  return {
    students,
    isLoading,
    isError,
    error: pageQuery.error,
    errorKind,
    nextPageErrorKind,
    frdoStatus,
    selectedStudentIds,
    setSelectedStudentIds,
    createNewStudent,
    enrollToCourse,
    unenrollFromCourse,
    bulkEnroll,
    bulkUnenroll,
    bulkDelete,
    updateCompany,
    removeStudent,
    toggleSelection,
    toggleSelectAll,
    getSelectedUserIds,
    refresh,
    statusFilter,
    setStatusFilter,
    courseFilter,
    setCourseFilter,
    groupFilter,
    setGroupFilter,
    studentGroups,
    refreshGroups,
    studentGroupMap,
    groupCounts,
    docsFilter,
    setDocsFilter,
    searchQuery,
    setSearchQuery,
    loadMore,
    hasNextPage: !!pageQuery.hasNextPage,
    isFetchingNextPage: pageQuery.isFetchingNextPage,
    loadedCount: students.length,
    totalFiltered,
    retry,
    retryNextPage,
    viewMode,
    setViewMode,
    activeStudentsCount,
    archivedCount,
    archiveByMonth,
    archiveStudent,
    unarchiveStudent,
    fetchStudentCredentialsOnDemand,
  };
}
