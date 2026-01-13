import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Student } from "@/types/shared";

interface StudentCardData {
  id: string;
  user_id: string;
  name: string;
  email: string;
  login?: string | null;
  company_name?: string | null;
}

interface StudentEnrollment {
  id: string;
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  started_at: string;
  completed_at?: string | null;
  time_spent: number;
}

export function useStudentDetailCard() {
  const [showStudentDetailCard, setShowStudentDetailCard] = useState(false);
  const [studentDetailCardData, setStudentDetailCardData] = useState<StudentCardData | null>(null);
  const [studentDetailCardEnrollments, setStudentDetailCardEnrollments] = useState<StudentEnrollment[]>([]);

  const viewStudent = useCallback(async (student: Student) => {
    // Get all enrollments for this student
    const { data: enrollmentsData } = await supabase
      .from("enrollments")
      .select("id, course_id, progress, status, started_at, completed_at, time_spent, courses(title)")
      .eq("user_id", student.user_id);
    
    const enrollments = (enrollmentsData || []).map((e: any) => ({
      id: e.id,
      course_id: e.course_id,
      course_title: e.courses?.title || "Неизвестный курс",
      progress: e.progress || 0,
      status: e.status || "active",
      started_at: e.started_at,
      completed_at: e.completed_at,
      time_spent: e.time_spent || 0,
    }));

    setStudentDetailCardData({
      id: student.id,
      user_id: student.user_id,
      name: student.name,
      email: student.email,
      login: student.login,
      company_name: null,
    });
    setStudentDetailCardEnrollments(enrollments);
    setShowStudentDetailCard(true);
  }, []);

  const closeStudentDetailCard = useCallback(() => {
    setShowStudentDetailCard(false);
    setStudentDetailCardData(null);
    setStudentDetailCardEnrollments([]);
  }, []);

  return {
    showStudentDetailCard,
    setShowStudentDetailCard,
    studentDetailCardData,
    studentDetailCardEnrollments,
    viewStudent,
    closeStudentDetailCard,
  };
}
