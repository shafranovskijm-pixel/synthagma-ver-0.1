import { useState, useEffect, useCallback } from "react";
import type { Student, StudentFRDOStatus, StudentStatusFilter, StudentDocsFilter } from "@/types";
import { 
  fetchStudents,
  fetchFRDOStatus,
  createStudent,
  enrollStudent,
  unenrollStudent,
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
  enrollToCoourse: (userId: string, courseId: string) => Promise<boolean>;
  unenrollFromCourse: (enrollmentId: string) => Promise<boolean>;
  bulkEnroll: (courseId: string) => Promise<{ success: number; failed: number }>;
  bulkUnenroll: () => Promise<{ success: number; failed: number }>;
  updateCompany: (userId: string, companyId: string | null) => Promise<boolean>;
  removeStudent: (userId: string) => Promise<boolean>;
  refresh: () => void;
  // Filtering
  statusFilter: StudentStatusFilter;
  setStatusFilter: (filter: StudentStatusFilter) => void;
  courseFilter: string;
  setCourseFilter: (courseId: string) => void;
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
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>("not_enrolled");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [docsFilter, setDocsFilter] = useState<StudentDocsFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Load students
  useEffect(() => {
    const load = async () => {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { students: studentsData, allProfiles: profilesData } = await fetchStudents(
          organizationId,
          courseIds
        );
        setStudents(studentsData);
        setAllProfiles(profilesData);

        // Fetch FRDO status
        const userIds = [...new Set(studentsData.map(s => s.user_id))];
        const status = await fetchFRDOStatus(organizationId, userIds);
        setFrdoStatus(status);
      } catch (error) {
        console.error("Error loading students:", error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [organizationId, courseIds.join(","), refreshKey]);

  // Filtered students
  const filteredStudents = students.filter(student => {
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
      if (statusFilter === "not_enrolled" && student.enrollment_id) return false;
      if (statusFilter === "active" && student.status !== "active") return false;
      if (statusFilter === "completed" && student.status !== "completed") return false;
    }

    // Course filter
    if (courseFilter !== "all" && student.course_id !== courseFilter) return false;

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

  const enrollToCoourse = useCallback(async (userId: string, courseId: string): Promise<boolean> => {
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
    const success = await unenrollStudent(enrollmentId);
    if (!success) {
      toast.error("Ошибка отчисления");
      return false;
    }
    toast.success("Ученик отчислен с курса");
    setRefreshKey(prev => prev + 1);
    return true;
  }, []);

  const bulkEnroll = useCallback(async (courseId: string): Promise<{ success: number; failed: number }> => {
    const userIds = Array.from(selectedStudentIds).map(id => {
      const student = students.find(s => s.id === id || s.user_id === id);
      return student?.user_id;
    }).filter(Boolean) as string[];

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
  }, [selectedStudentIds, students]);

  const bulkUnenroll = useCallback(async (): Promise<{ success: number; failed: number }> => {
    const enrollmentIds = Array.from(selectedStudentIds).map(id => {
      const student = students.find(s => s.id === id || s.user_id === id);
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
    enrollToCoourse,
    unenrollFromCourse,
    bulkEnroll,
    bulkUnenroll,
    updateCompany,
    removeStudent,
    refresh,
    statusFilter,
    setStatusFilter,
    courseFilter,
    setCourseFilter,
    docsFilter,
    setDocsFilter,
    searchQuery,
    setSearchQuery,
    filteredStudents
  };
}
