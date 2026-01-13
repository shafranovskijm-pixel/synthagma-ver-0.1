import { useState, useMemo } from "react";
import { Student } from "@/types/shared";

interface UseStudentFiltersStateProps {
  students: Student[];
  searchQuery: string;
  studentDocsByUser: Map<string, string[]>;
}

export function useStudentFiltersState({ 
  students, 
  searchQuery,
  studentDocsByUser,
}: UseStudentFiltersStateProps) {
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "active" | "completed" | "not_enrolled">("not_enrolled");
  const [studentCourseFilter, setStudentCourseFilter] = useState<string>("all");
  const [studentDocsFilter, setStudentDocsFilter] = useState<"all" | "complete" | "no_passport" | "no_snils" | "no_education" | "incomplete">("all");

  const filteredStudents = useMemo(() => 
    students.filter(s => {
      const matchesSearch = 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.email.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (studentCourseFilter !== "all") {
        if (studentStatusFilter === "not_enrolled") {
          if (s.course_id === studentCourseFilter) return false;
        } else {
          if (s.course_id !== studentCourseFilter) return false;
        }
      }
      
      if (studentDocsFilter !== "all") {
        const userDocs = studentDocsByUser.get(s.user_id) || [];
        const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
        const hasSnils = userDocs.includes("snils");
        const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
        const isComplete = hasPassport && hasSnils && hasEducation;
        
        if (studentDocsFilter === "complete" && !isComplete) return false;
        if (studentDocsFilter === "incomplete" && isComplete) return false;
        if (studentDocsFilter === "no_passport" && hasPassport) return false;
        if (studentDocsFilter === "no_snils" && hasSnils) return false;
        if (studentDocsFilter === "no_education" && hasEducation) return false;
      }
      
      if (studentStatusFilter === "all") return true;
      if (studentStatusFilter === "active") return s.status === "active";
      if (studentStatusFilter === "completed") return s.status === "completed";
      if (studentStatusFilter === "not_enrolled") return !s.course_id;
      return true;
    }), 
    [students, searchQuery, studentCourseFilter, studentStatusFilter, studentDocsFilter, studentDocsByUser]
  );

  return {
    studentStatusFilter,
    setStudentStatusFilter,
    studentCourseFilter,
    setStudentCourseFilter,
    studentDocsFilter,
    setStudentDocsFilter,
    filteredStudents,
  };
}
