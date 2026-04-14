import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Company, CompanyStudent } from "./useCompaniesManager";

interface AvailableStudent {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  company_id: string | null;
  company_name: string | null;
}

export function useCompanyStudentsManager(organizationId: string) {
  // Students dialog
  const [showStudentsDialog, setShowStudentsDialog] = useState(false);
  const [selectedCompanyForStudents, setSelectedCompanyForStudents] = useState<Company | null>(null);
  const [companyStudents, setCompanyStudents] = useState<CompanyStudent[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  // Bulk assign students dialog
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [selectedCompanyForAssign, setSelectedCompanyForAssign] = useState<Company | null>(null);
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isLoadingAvailableStudents, setIsLoadingAvailableStudents] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignSearchQuery, setAssignSearchQuery] = useState("");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);

  // Bulk enroll to courses dialog
  const [showBulkEnrollDialog, setShowBulkEnrollDialog] = useState(false);
  const [selectedCompanyForEnroll, setSelectedCompanyForEnroll] = useState<Company | null>(null);
  const [availableCourses, setAvailableCourses] = useState<{ id: string; title: string; is_published: boolean }[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const fetchCompanyStudents = useCallback(async (companyId: string) => {
    setIsLoadingStudents(true);
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, created_at")
        .eq("company_id", companyId)
        .order("full_name");

      if (error) throw error;

      // Get enrollments for each student
      const studentsWithEnrollments = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: enrollments } = await supabase
            .from("enrollments")
            .select("progress, status, courses(title)")
            .eq("user_id", profile.user_id);

          return {
            ...profile,
            enrollments: (enrollments || []).map((e: Record<string, unknown>) => ({
              course_title: (e.courses as Record<string, string> | null)?.title || "Неизвестный курс",
              progress: (e.progress as number) || 0,
              status: (e.status as string) || "active",
            })),
          };
        })
      );

      setCompanyStudents(studentsWithEnrollments);
    } catch (error) {
      console.error("Error fetching company students:", error);
    } finally {
      setIsLoadingStudents(false);
    }
  }, []);

  const openStudentsDialog = async (company: Company) => {
    setSelectedCompanyForStudents(company);
    setShowStudentsDialog(true);
    setStudentSearchQuery("");
    await fetchCompanyStudents(company.id);
  };

  const fetchAvailableStudents = useCallback(async () => {
    setIsLoadingAvailableStudents(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, company_id, companies(name)")
        .eq("organization_id", organizationId)
        .order("full_name");

      if (error) throw error;

      setAvailableStudents(
        (data || []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          user_id: p.user_id as string,
          full_name: (p.full_name as string) || "Без имени",
          email: (p.email as string) || "",
          company_id: p.company_id as string | null,
          company_name: (p.companies as Record<string, string> | null)?.name || null,
        }))
      );
    } catch (error) {
      console.error("Error fetching available students:", error);
    } finally {
      setIsLoadingAvailableStudents(false);
    }
  }, [organizationId]);

  const openBulkAssignDialog = async (company: Company) => {
    setSelectedCompanyForAssign(company);
    setShowBulkAssignDialog(true);
    setSelectedStudentIds([]);
    setAssignSearchQuery("");
    await fetchAvailableStudents();
  };

  const assignStudentsToCompany = async () => {
    if (!selectedCompanyForAssign || selectedStudentIds.length === 0) {
      toast.error("Выберите учеников");
      return;
    }

    setIsAssigning(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ company_id: selectedCompanyForAssign.id })
        .in("id", selectedStudentIds);

      if (error) throw error;

      toast.success(`Привязано учеников: ${selectedStudentIds.length}`);
      setShowBulkAssignDialog(false);
      setSelectedStudentIds([]);
    } catch (error) {
      console.error("Error assigning students:", error);
      toast.error("Ошибка привязки учеников");
    } finally {
      setIsAssigning(false);
    }
  };

  const fetchAvailableCourses = useCallback(async () => {
    setIsLoadingCourses(true);
    try {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, is_published")
        .eq("organization_id", organizationId)
        .order("title");

      if (error) throw error;
      setAvailableCourses(data || []);
    } catch (error) {
      console.error("Error fetching courses:", error);
    } finally {
      setIsLoadingCourses(false);
    }
  }, [organizationId]);

  const openBulkEnrollDialog = async (company: Company) => {
    setSelectedCompanyForEnroll(company);
    setShowBulkEnrollDialog(true);
    setSelectedCourseIds([]);
    await fetchAvailableCourses();
  };

  const enrollCompanyToCourses = async () => {
    if (!selectedCompanyForEnroll || selectedCourseIds.length === 0) {
      toast.error("Выберите курсы");
      return;
    }

    setIsEnrolling(true);
    try {
      // Get all students from this company
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("company_id", selectedCompanyForEnroll.id);

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        toast.error("В организации нет учеников");
        return;
      }

      // Create enrollments for each student-course combination
      const enrollments = [];
      for (const profile of profiles) {
        for (const courseId of selectedCourseIds) {
          enrollments.push({
            user_id: profile.user_id,
            course_id: courseId,
            status: "active",
            progress: 0,
          });
        }
      }

      // Upsert to avoid duplicates
      const { error: enrollError } = await supabase
        .from("enrollments")
        .upsert(enrollments, { onConflict: "user_id,course_id" });

      if (enrollError) throw enrollError;

      toast.success(`Зачислено на ${selectedCourseIds.length} курс(ов)`);
      setShowBulkEnrollDialog(false);
      setSelectedCourseIds([]);
    } catch (error) {
      console.error("Error enrolling company:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsEnrolling(false);
    }
  };

  const filteredCompanyStudents = companyStudents.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  const filteredAvailableStudents = availableStudents.filter((s) => {
    const matchesSearch =
      s.full_name?.toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(assignSearchQuery.toLowerCase());
    const matchesFilter = !showOnlyUnassigned || !s.company_id;
    return matchesSearch && matchesFilter;
  });

  return {
    // Students dialog
    showStudentsDialog,
    setShowStudentsDialog,
    selectedCompanyForStudents,
    companyStudents,
    filteredCompanyStudents,
    isLoadingStudents,
    studentSearchQuery,
    setStudentSearchQuery,
    openStudentsDialog,
    refreshCompanyStudents: fetchCompanyStudents,
    
    // Bulk assign dialog
    showBulkAssignDialog,
    setShowBulkAssignDialog,
    selectedCompanyForAssign,
    availableStudents,
    filteredAvailableStudents,
    selectedStudentIds,
    setSelectedStudentIds,
    isLoadingAvailableStudents,
    isAssigning,
    assignSearchQuery,
    setAssignSearchQuery,
    showOnlyUnassigned,
    setShowOnlyUnassigned,
    openBulkAssignDialog,
    assignStudentsToCompany,
    
    // Bulk enroll dialog
    showBulkEnrollDialog,
    setShowBulkEnrollDialog,
    selectedCompanyForEnroll,
    availableCourses,
    selectedCourseIds,
    setSelectedCourseIds,
    isLoadingCourses,
    isEnrolling,
    openBulkEnrollDialog,
    enrollCompanyToCourses,
    toggleStudentSelection: (studentId: string) => {
      setSelectedStudentIds((prev) =>
        prev.includes(studentId)
          ? prev.filter((id) => id !== studentId)
          : [...prev, studentId]
      );
    },
    toggleSelectAll: () => {
      const allIds = filteredAvailableStudents.map((s) => s.id);
      if (selectedStudentIds.length === allIds.length) {
        setSelectedStudentIds([]);
      } else {
        setSelectedStudentIds(allIds);
      }
    },
    toggleCourseSelection: (courseId: string) => {
      setSelectedCourseIds((prev) =>
        prev.includes(courseId)
          ? prev.filter((id) => id !== courseId)
          : [...prev, courseId]
      );
    },
  };
}

export type { CompanyStudent } from "./useCompaniesManager";
export type { AvailableStudent };
