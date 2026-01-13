import { useState, useMemo, useCallback } from "react";
import { Student } from "@/types/shared";

export type StudentStatusFilter = "all" | "active" | "completed" | "not_enrolled";
export type StudentDocsFilter = "all" | "complete" | "no_passport" | "no_snils" | "no_education" | "incomplete";

interface UseStudentFiltersProps {
  students: Student[];
  allProfiles: Student[];
  studentDocsByUser: Map<string, string[]>;
}

export function useStudentFilters({
  students,
  allProfiles,
  studentDocsByUser,
}: UseStudentFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [docsFilter, setDocsFilter] = useState<StudentDocsFilter>("all");

  // Get unique students without enrollments
  const studentsWithoutEnrollments = useMemo(() => {
    const enrolledUserIds = new Set(students.map(s => s.user_id));
    return allProfiles.filter(p => !enrolledUserIds.has(p.user_id));
  }, [students, allProfiles]);

  // Check if student has required documents
  const checkDocuments = useCallback((userId: string) => {
    const docs = studentDocsByUser.get(userId) || [];
    const hasPassport = docs.some(t => t === "passport" || t === "birth_certificate");
    const hasSnils = docs.includes("snils");
    const hasEducation = docs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
    return { hasPassport, hasSnils, hasEducation, isComplete: hasPassport && hasSnils && hasEducation };
  }, [studentDocsByUser]);

  // Filter students based on all criteria
  const filteredStudents = useMemo(() => {
    let result: Student[] = [];

    // Apply status filter first
    if (statusFilter === "not_enrolled") {
      result = studentsWithoutEnrollments;
    } else if (statusFilter === "all") {
      result = students;
    } else if (statusFilter === "active") {
      result = students.filter(s => s.status === "active");
    } else if (statusFilter === "completed") {
      result = students.filter(s => s.status === "completed");
    }

    // Apply course filter
    if (courseFilter !== "all") {
      result = result.filter(s => s.course_id === courseFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        (s.login && s.login.toLowerCase().includes(query))
      );
    }

    // Apply documents filter
    if (docsFilter !== "all") {
      result = result.filter(s => {
        const docs = checkDocuments(s.user_id);
        switch (docsFilter) {
          case "complete": return docs.isComplete;
          case "no_passport": return !docs.hasPassport;
          case "no_snils": return !docs.hasSnils;
          case "no_education": return !docs.hasEducation;
          case "incomplete": return !docs.isComplete;
          default: return true;
        }
      });
    }

    return result;
  }, [students, studentsWithoutEnrollments, statusFilter, courseFilter, searchQuery, docsFilter, checkDocuments]);

  // Get counts for quick stats
  const filterCounts = useMemo(() => ({
    all: students.length,
    active: students.filter(s => s.status === "active").length,
    completed: students.filter(s => s.status === "completed").length,
    notEnrolled: studentsWithoutEnrollments.length,
  }), [students, studentsWithoutEnrollments]);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setCourseFilter("all");
    setDocsFilter("all");
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    courseFilter,
    setCourseFilter,
    docsFilter,
    setDocsFilter,
    filteredStudents,
    filterCounts,
    studentsWithoutEnrollments,
    checkDocuments,
    resetFilters,
  };
}
