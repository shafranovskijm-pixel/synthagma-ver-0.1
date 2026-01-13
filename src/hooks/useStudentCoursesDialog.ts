import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

interface Student {
  id: string;
  user_id: string;
  enrollment_id: string | null;
  name: string;
  email: string;
  login: string | null;
  generated_password: string | null;
  course: string | null;
  course_id: string | null;
  progress: number;
  lastActivity: string | null;
  status: string | null;
}

export function useStudentCoursesDialog(courses: Course[], onRefresh: () => void) {
  const [showStudentCoursesDialog, setShowStudentCoursesDialog] = useState(false);
  const [selectedStudentForCourses, setSelectedStudentForCourses] = useState<Student | null>(null);
  const [studentEnrollments, setStudentEnrollments] = useState<{
    course: Course;
    enrollment_id: string;
    progress: number;
    status: string;
  }[]>([]);
  const [availableCoursesForStudent, setAvailableCoursesForStudent] = useState<Course[]>([]);
  const [selectedCoursesToAdd, setSelectedCoursesToAdd] = useState<Set<string>>(new Set());
  const [isLoadingStudentCourses, setIsLoadingStudentCourses] = useState(false);
  const [isAddingCoursesToStudent, setIsAddingCoursesToStudent] = useState(false);
  const [studentCoursesSearchQuery, setStudentCoursesSearchQuery] = useState("");

  const openDialog = useCallback(async (student: Student) => {
    setSelectedStudentForCourses(student);
    setShowStudentCoursesDialog(true);
    setIsLoadingStudentCourses(true);
    setSelectedCoursesToAdd(new Set());
    setStudentCoursesSearchQuery("");

    try {
      const { data: enrollmentsData, error } = await supabase
        .from("enrollments")
        .select("id, course_id, progress, status")
        .eq("user_id", student.user_id);

      if (error) throw error;

      const enrolledCourseIds = new Set((enrollmentsData || []).map(e => e.course_id));

      const enrolledList: {
        course: Course;
        enrollment_id: string;
        progress: number;
        status: string;
      }[] = [];

      for (const enrollment of enrollmentsData || []) {
        const course = courses.find(c => c.id === enrollment.course_id);
        if (course) {
          enrolledList.push({
            course,
            enrollment_id: enrollment.id,
            progress: enrollment.progress || 0,
            status: enrollment.status || "active"
          });
        }
      }

      setStudentEnrollments(enrolledList);
      setAvailableCoursesForStudent(courses.filter(c => c.is_published && !enrolledCourseIds.has(c.id)));
    } catch (error) {
      console.error("Error loading student courses:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoadingStudentCourses(false);
    }
  }, [courses]);

  const addCourses = useCallback(async () => {
    if (!selectedStudentForCourses || selectedCoursesToAdd.size === 0) return;

    setIsAddingCoursesToStudent(true);
    try {
      const enrollmentsToInsert = Array.from(selectedCoursesToAdd).map(courseId => ({
        user_id: selectedStudentForCourses.user_id,
        course_id: courseId,
        status: "active",
        progress: 0
      }));

      const { error } = await supabase.from("enrollments").insert(enrollmentsToInsert);
      if (error) throw error;

      toast.success(`Зачислено на ${selectedCoursesToAdd.size} курсов`);
      setSelectedCoursesToAdd(new Set());
      openDialog(selectedStudentForCourses);
      onRefresh();
    } catch (error) {
      console.error("Error adding courses:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsAddingCoursesToStudent(false);
    }
  }, [selectedStudentForCourses, selectedCoursesToAdd, openDialog, onRefresh]);

  const removeEnrollment = useCallback(async (enrollmentId: string) => {
    if (!selectedStudentForCourses) return;

    try {
      const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;

      toast.success("Отчислен с курса");
      openDialog(selectedStudentForCourses);
      onRefresh();
    } catch (error) {
      console.error("Error removing enrollment:", error);
      toast.error("Ошибка отчисления");
    }
  }, [selectedStudentForCourses, openDialog, onRefresh]);

  const toggleCourseSelection = useCallback((courseId: string) => {
    const newSelected = new Set(selectedCoursesToAdd);
    if (newSelected.has(courseId)) {
      newSelected.delete(courseId);
    } else {
      newSelected.add(courseId);
    }
    setSelectedCoursesToAdd(newSelected);
  }, [selectedCoursesToAdd]);

  return {
    showStudentCoursesDialog,
    setShowStudentCoursesDialog,
    selectedStudentForCourses,
    studentEnrollments,
    availableCoursesForStudent,
    selectedCoursesToAdd,
    isLoadingStudentCourses,
    isAddingCoursesToStudent,
    studentCoursesSearchQuery,
    setStudentCoursesSearchQuery,
    openDialog,
    addCourses,
    removeEnrollment,
    toggleCourseSelection,
  };
}
