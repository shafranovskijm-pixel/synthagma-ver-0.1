import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Student, StudentFRDOStatus, StudentStatusFilter, StudentDocsFilter } from "@/types";
import { supabase } from "@/integrations/supabase/client";

interface StudentGroup {
  id: string;
  name: string;
  color: string;
  organization_id: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
}
import { 
  fetchStudents,
  fetchFRDOStatus,
  createStudent,
  enrollStudent,
  unenrollStudent as apiUnenrollStudent,
  bulkEnrollStudents,
  bulkUnenrollStudents,
  updateStudentCompany,
  deleteStudent,
  setStudentArchived,
  isValidEmail
} from "@/api/students";
import { toast } from "sonner";
import { qk } from "@/lib/queryKeys";

interface UseStudentsReturn {
  students: Student[];
  allProfiles: Student[];
  isLoading: boolean;
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
  // Filtering
  statusFilter: StudentStatusFilter;
  setStatusFilter: (filter: StudentStatusFilter) => void;
  courseFilter: string;
  setCourseFilter: (courseId: string) => void;
  groupFilter: string;
  setGroupFilter: (groupId: string) => void;
  studentGroups: StudentGroup[];
  refreshGroups: () => void;
  studentGroupMap: Map<string, string | null>;
  docsFilter: StudentDocsFilter;
  setDocsFilter: (filter: StudentDocsFilter) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredStudents: Student[];
  // Archive
  viewMode: "active" | "archive";
  setViewMode: (mode: "active" | "archive") => void;
  archivedStudents: Student[];
  activeStudentsCount: number;
  archiveByMonth: Array<{ key: string; label: string; students: Student[] }>;
  archiveStudent: (userId: string) => Promise<boolean>;
  unarchiveStudent: (userId: string) => Promise<boolean>;
}

export function useStudents(
  organizationId: string | null,
  courseIds: string[],
  studentDocsByUser: Map<string, string[]>
): UseStudentsReturn {
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

  // Memoize courseIds join to prevent infinite loops
  const courseIdsKey = useMemo(() => courseIds.join(","), [courseIds]);

  // Students + per-row group map (single source of truth — fetchStudents already returns groupMap)
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: qk.org.studentsList(organizationId ?? "none", courseIdsKey),
    queryFn: async () => {
      if (!organizationId) {
        return { students: [] as Student[], allProfiles: [] as Student[], groupMap: new Map<string, string | null>() };
      }
      return fetchStudents(organizationId, courseIds);
    },
    enabled: !!organizationId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const { data: groupsData } = useQuery({
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

  const students = studentsData?.students ?? [];
  const allProfiles = studentsData?.allProfiles ?? [];
  const studentGroupMap = studentsData?.groupMap ?? new Map<string, string | null>();
  const studentGroups = groupsData ?? [];
  const isLoading = !!organizationId && studentsLoading;

  // FRDO status — secondary, lightly cached
  const studentUserIdsKey = useMemo(
    () => students.map(s => s.user_id).sort().join(","),
    [students]
  );

  const { data: frdoStatus = new Map<string, StudentFRDOStatus>() } = useQuery({
    queryKey: qk.org.studentsFrdo(organizationId ?? "none", studentUserIdsKey),
    queryFn: async () => {
      if (!organizationId) return new Map<string, StudentFRDOStatus>();
      const userIds = [...new Set(students.map(s => s.user_id))];
      if (userIds.length === 0) return new Map<string, StudentFRDOStatus>();
      return fetchFRDOStatus(organizationId, userIds);
    },
    enabled: !!organizationId && students.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const invalidateStudents = useCallback(() => {
    if (!organizationId) return;
    qc.invalidateQueries({ queryKey: qk.org.studentsListAll(organizationId) });
  }, [qc, organizationId]);

  const refreshGroups = useCallback(() => {
    if (!organizationId) return;
    qc.invalidateQueries({ queryKey: qk.org.studentGroups(organizationId) });
  }, [qc, organizationId]);

  // Helper: archived only if explicitly archived via profiles.archived_at.
  // Completing all courses must NOT hide a student from the active list,
  // otherwise the organization perceives finished students as "disappeared".
  const isArchived = useCallback((s: Student): boolean => {
    return !!s.archived_at;
  }, []);

  const lastCompletedAt = useCallback((s: Student): string | null => {
    const enrollments = s.enrollments || [];
    const dates = enrollments
      .map(e => e.completed_at)
      .filter((d): d is string => !!d);
    if (dates.length === 0) return s.archived_at ?? null;
    dates.sort();
    return dates[dates.length - 1];
  }, []);

  const archivedStudents = useMemo(
    () => students.filter(isArchived),
    [students, isArchived]
  );
  const activeStudentsCount = students.length - archivedStudents.length;

  // Filtered students (respects viewMode + filters)
  const filteredStudents = useMemo(() => {
    const pool = viewMode === "archive" ? archivedStudents : students.filter(s => !isArchived(s));
    return pool.filter(student => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          student.name.toLowerCase().includes(query) ||
          student.email.toLowerCase().includes(query) ||
          (student.login && student.login.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Status filter (only meaningful in active view)
      if (viewMode === "active" && statusFilter !== "all") {
        const enrollments = student.enrollments || [];
        if (statusFilter === "not_enrolled" && enrollments.length > 0) return false;
        if (statusFilter === "active" && !enrollments.some(e => e.status === "active")) return false;
        if (statusFilter === "completed" && !enrollments.some(e => e.status === "completed")) return false;
      }

      // Course filter
      if (courseFilter !== "all") {
        const enrollments = student.enrollments || [];
        if (!enrollments.some(e => e.course_id === courseFilter)) return false;
      }

      // Group filter
      if (groupFilter !== "all") {
        const studentGroupId = studentGroupMap.get(student.user_id);
        if (groupFilter === "no_group") {
          if (studentGroupId) return false;
        } else {
          if (studentGroupId !== groupFilter) return false;
        }
      }

      // Documents filter
      if (docsFilter !== "all") {
        const userDocs = studentDocsByUser.get(student.user_id) || [];
        const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
        const hasSnils = userDocs.includes("snils");
        const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
        
        if (docsFilter === "complete" && !(hasPassport && hasSnils && hasEducation)) return false;
        if (docsFilter === "incomplete" && (hasPassport && hasSnils && hasEducation)) return false;
        if (docsFilter === "no_passport" && hasPassport) return false;
        if (docsFilter === "no_snils" && hasSnils) return false;
        if (docsFilter === "no_education" && hasEducation) return false;
      }

      return true;
    });
  }, [students, archivedStudents, viewMode, isArchived, searchQuery, statusFilter, courseFilter, groupFilter, docsFilter, studentDocsByUser, studentGroupMap]);

  // Group archive view by month (newest first)
  const archiveByMonth = useMemo(() => {
    if (viewMode !== "archive") return [] as Array<{ key: string; label: string; students: Student[] }>;
    const groups = new Map<string, Student[]>();
    const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
    for (const s of filteredStudents) {
      const dateStr = lastCompletedAt(s);
      let key = "no-date";
      let label = "Без даты завершения";
      if (dateStr) {
        const d = new Date(dateStr);
        const y = d.getFullYear();
        const m = d.getMonth();
        key = `${y}-${String(m + 1).padStart(2, "0")}`;
        label = `${MONTHS[m]} ${y}`;
      }
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([key, list]) => {
        const sample = list[0];
        const d = lastCompletedAt(sample);
        const label = d
          ? `${MONTHS[new Date(d).getMonth()]} ${new Date(d).getFullYear()}`
          : "Без даты завершения";
        return { key, label, students: list };
      });
  }, [filteredStudents, viewMode, lastCompletedAt]);

  // Selection helpers - use user_id for unique selection (one row per student)
  const toggleSelection = useCallback((uniqueId: string) => {
    setSelectedStudentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uniqueId)) {
        newSet.delete(uniqueId);
      } else {
        newSet.add(uniqueId);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAll = useCallback((filteredList: Student[]) => {
    const filteredIds = filteredList.map(s => s.user_id); // Use user_id for unique selection
    setSelectedStudentIds(prev => {
      const allSelected = filteredIds.every(id => prev.has(id)) && filteredIds.length > 0;
      if (allSelected) {
        const newSet = new Set(prev);
        filteredIds.forEach(id => newSet.delete(id));
        return newSet;
      } else {
        const newSet = new Set(prev);
        filteredIds.forEach(id => newSet.add(id));
        return newSet;
      }
    });
  }, []);

  const getSelectedUserIds = useCallback((): string[] => {
    // selectedStudentIds now contains user_ids directly
    return Array.from(selectedStudentIds);
  }, [selectedStudentIds]);

  const createNewStudent = useCallback(async (params: {
    name: string;
    email: string;
    courseId?: string;
    companyId?: string;
    noLogin?: boolean;
  }): Promise<boolean> => {
    if (!organizationId) return false;

    if (!params.name.trim() || !params.email.trim()) {
      toast.error("Заполните ФИО и Email");
      return false;
    }

    if (!isValidEmail(params.email)) {
      toast.error("Введите корректный email адрес");
      return false;
    }

    const result = await createStudent({
      organizationId,
      ...params
    });

    if (!result.success) {
      toast.error(result.error || "Ошибка создания ученика");
      return false;
    }

    if (result.data?.is_no_login) {
      toast.success(result.data.message || "Ученик добавлен");
    } else if (result.data?.is_existing) {
      toast.success(result.data.message || "Ученик зачислен на курс");
    } else {
      toast.success(`Ученик создан. Пароль: ${result.data?.password} (сохраните его!)`);
    }

    invalidateStudents();
    return true;
  }, [organizationId, invalidateStudents]);

  const enrollToCourse = useCallback(async (userId: string, courseId: string): Promise<boolean> => {
    const result = await enrollStudent(userId, courseId);
    if (!result.success) {
      toast.error(result.error || "Ошибка зачисления");
      return false;
    }
    toast.success("Ученик зачислен на курс");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  const unenrollFromCourse = useCallback(async (enrollmentId: string): Promise<boolean> => {
    const success = await apiUnenrollStudent(enrollmentId);
    if (!success) {
      toast.error("Ошибка отчисления");
      return false;
    }
    toast.success("Ученик отчислен с курса");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  const bulkEnroll = useCallback(async (courseId: string): Promise<{ success: number; failed: number }> => {
    const userIds = getSelectedUserIds();
    const result = await bulkEnrollStudents(userIds, courseId);
    
    if (result.success > 0) {
      toast.success(`Зачислено: ${result.success} учеников`);
    }
    if (result.failed > 0) {
      toast.error(`Ошибок: ${result.failed}`);
    }
    
    setSelectedStudentIds(new Set());
    invalidateStudents();
    return result;
  }, [getSelectedUserIds, invalidateStudents]);

  const bulkUnenroll = useCallback(async (): Promise<{ success: number; failed: number }> => {
    const enrollmentIds = Array.from(selectedStudentIds).map(id => {
      const student = students.find(s => s.enrollment_id === id);
      return student?.enrollment_id;
    }).filter(Boolean) as string[];

    const result = await bulkUnenrollStudents(enrollmentIds);
    
    if (result.success > 0) {
      toast.success(`Отчислено: ${result.success} учеников`);
    }
    if (result.failed > 0) {
      toast.error(`Ошибок: ${result.failed}`);
    }
    
    setSelectedStudentIds(new Set());
    invalidateStudents();
    return result;
  }, [selectedStudentIds, students, invalidateStudents]);

  const bulkDelete = useCallback(async (): Promise<{ success: number; failed: number }> => {
    const userIds = getSelectedUserIds();
    let success = 0;
    let failed = 0;

    for (const userId of userIds) {
      const result = await deleteStudent(userId);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }
    
    if (success > 0) {
      toast.success(`Удалено: ${success} учеников`);
    }
    if (failed > 0) {
      toast.error(`Ошибок: ${failed}`);
    }
    
    setSelectedStudentIds(new Set());
    invalidateStudents();
    return { success, failed };
  }, [getSelectedUserIds, invalidateStudents]);

  const updateCompany = useCallback(async (userId: string, companyId: string | null): Promise<boolean> => {
    const success = await updateStudentCompany(userId, companyId);
    if (!success) {
      toast.error("Ошибка обновления компании");
      return false;
    }
    toast.success("Компания обновлена");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  const removeStudent = useCallback(async (userId: string): Promise<boolean> => {
    const success = await deleteStudent(userId);
    if (!success) {
      toast.error("Ошибка удаления ученика");
      return false;
    }
    toast.success("Ученик удалён");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  const refresh = useCallback(() => {
    invalidateStudents();
  }, [invalidateStudents]);

  const archiveStudent = useCallback(async (userId: string): Promise<boolean> => {
    const ok = await setStudentArchived(userId, true);
    if (!ok) {
      toast.error("Не удалось перенести в архив");
      return false;
    }
    toast.success("Ученик перенесён в архив");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  const unarchiveStudent = useCallback(async (userId: string): Promise<boolean> => {
    const ok = await setStudentArchived(userId, false);
    if (!ok) {
      toast.error("Не удалось вернуть из архива");
      return false;
    }
    toast.success("Ученик возвращён из архива");
    invalidateStudents();
    return true;
  }, [invalidateStudents]);

  return {
    students,
    allProfiles,
    isLoading,
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
    docsFilter,
    setDocsFilter,
    searchQuery,
    setSearchQuery,
    filteredStudents,
    viewMode,
    setViewMode,
    archivedStudents,
    activeStudentsCount,
    archiveByMonth,
    archiveStudent,
    unarchiveStudent,
  };
}
