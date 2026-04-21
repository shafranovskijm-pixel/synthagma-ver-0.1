import { useState, useEffect, useCallback, useMemo } from "react";
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
  isValidEmail
} from "@/api/students";
import { toast } from "sonner";

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
}

export function useStudents(
  organizationId: string | null,
  courseIds: string[],
  studentDocsByUser: Map<string, string[]>
): UseStudentsReturn {
  const [students, setStudents] = useState<Student[]>([]);
  const [allProfiles, setAllProfiles] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [frdoStatus, setFrdoStatus] = useState<Map<string, StudentFRDOStatus>>(new Map());
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [docsFilter, setDocsFilter] = useState<StudentDocsFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [studentGroups, setStudentGroups] = useState<StudentGroup[]>([]);
  const [studentGroupMap, setStudentGroupMap] = useState<Map<string, string | null>>(new Map());
  const [groupsRefreshKey, setGroupsRefreshKey] = useState(0);

  // Memoize courseIds join to prevent infinite loops
  const courseIdsKey = useMemo(() => courseIds.join(","), [courseIds]);

  // Load students + groups in a single parallel batch.
  // groupMap now comes for free from fetchStudents (same profiles query),
  // so we no longer issue a duplicate /profiles request just to read student_group_id.
  useEffect(() => {
    const load = async () => {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const [studentsResult, groupsResult] = await Promise.all([
          fetchStudents(organizationId, courseIds),
          supabase
            .from("student_groups")
            .select("id, name, color, organization_id, created_at, start_date, end_date")
            .eq("organization_id", organizationId)
            .order("name"),
        ]);

        const { students: studentsData, allProfiles: profilesData, groupMap } = studentsResult;
        setStudents(studentsData);
        setAllProfiles(profilesData);
        setStudentGroups((groupsResult.data as StudentGroup[]) || []);
        setStudentGroupMap(groupMap);

        // UI is already usable — render now, then enrich with FRDO status in background.
        setIsLoading(false);

        const userIds = [...new Set(studentsData.map(s => s.user_id))];
        if (userIds.length > 0) {
          fetchFRDOStatus(organizationId, userIds)
            .then(setFrdoStatus)
            .catch(err => console.error("Error loading FRDO status:", err));
        }
      } catch (error) {
        console.error("Error loading students:", error);
        setIsLoading(false);
      }
    };

    load();
  }, [organizationId, courseIdsKey, refreshKey, groupsRefreshKey]);

  const refreshGroups = useCallback(() => {
    setGroupsRefreshKey(prev => prev + 1);
  }, []);

  // Filtered students
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          student.name.toLowerCase().includes(query) ||
          student.email.toLowerCase().includes(query) ||
          (student.login && student.login.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== "all") {
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
  }, [students, searchQuery, statusFilter, courseFilter, groupFilter, docsFilter, studentDocsByUser, studentGroupMap]);

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

    setRefreshKey(prev => prev + 1);
    return true;
  }, [organizationId]);

  const enrollToCourse = useCallback(async (userId: string, courseId: string): Promise<boolean> => {
    const result = await enrollStudent(userId, courseId);
    if (!result.success) {
      toast.error(result.error || "Ошибка зачисления");
      return false;
    }
    toast.success("Ученик зачислен на курс");
    setRefreshKey(prev => prev + 1);
    return true;
  }, []);

  const unenrollFromCourse = useCallback(async (enrollmentId: string): Promise<boolean> => {
    const success = await apiUnenrollStudent(enrollmentId);
    if (!success) {
      toast.error("Ошибка отчисления");
      return false;
    }
    toast.success("Ученик отчислен с курса");
    setRefreshKey(prev => prev + 1);
    return true;
  }, []);

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
    setRefreshKey(prev => prev + 1);
    return result;
  }, [getSelectedUserIds]);

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
    setRefreshKey(prev => prev + 1);
    return result;
  }, [selectedStudentIds, students]);

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
    setRefreshKey(prev => prev + 1);
    return { success, failed };
  }, [getSelectedUserIds]);

  const updateCompany = useCallback(async (userId: string, companyId: string | null): Promise<boolean> => {
    const success = await updateStudentCompany(userId, companyId);
    if (!success) {
      toast.error("Ошибка обновления компании");
      return false;
    }
    toast.success("Компания обновлена");
    setRefreshKey(prev => prev + 1);
    return true;
  }, []);

  const removeStudent = useCallback(async (userId: string): Promise<boolean> => {
    const success = await deleteStudent(userId);
    if (!success) {
      toast.error("Ошибка удаления ученика");
      return false;
    }
    toast.success("Ученик удалён");
    setRefreshKey(prev => prev + 1);
    return true;
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

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
    filteredStudents
  };
}
