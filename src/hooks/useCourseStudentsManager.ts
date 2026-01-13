import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Student, Course } from "@/types/shared";

export function useCourseStudentsManager(organizationId: string | null) {
  const [showCourseStudentsDialog, setShowCourseStudentsDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseStudents, setCourseStudents] = useState<Student[]>([]);
  const [availableStudentsForCourse, setAvailableStudentsForCourse] = useState<Student[]>([]);
  const [isLoadingCourseStudents, setIsLoadingCourseStudents] = useState(false);
  const [selectedStudentsToAdd, setSelectedStudentsToAdd] = useState<Set<string>>(new Set());
  const [isAddingStudentsToCourse, setIsAddingStudentsToCourse] = useState(false);
  const [courseStudentsSearchQuery, setCourseStudentsSearchQuery] = useState("");

  // Open course students dialog
  const openCourseStudents = useCallback(async (course: Course) => {
    setSelectedCourse(course);
    setShowCourseStudentsDialog(true);
    setIsLoadingCourseStudents(true);
    setSelectedStudentsToAdd(new Set());
    setCourseStudentsSearchQuery("");
    
    try {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id, user_id, progress, status")
        .eq("course_id", course.id);
      
      const enrolledStudentIds = new Set((enrollments || []).map(e => e.user_id));
      const enrolledList: Student[] = [];
      
      for (const enrollment of enrollments || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, login, generated_password")
          .eq("user_id", enrollment.user_id)
          .single();
        
        if (profile) {
          enrolledList.push({
            id: profile.id,
            user_id: profile.user_id,
            enrollment_id: enrollment.id,
            name: profile.full_name || "Без имени",
            email: profile.email || "",
            login: profile.login || null,
            generated_password: profile.generated_password || null,
            course: course.title,
            course_id: course.id,
            progress: enrollment.progress,
            lastActivity: null,
            status: enrollment.status
          });
        }
      }
      
      setCourseStudents(enrolledList);
      
      if (organizationId) {
        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, login, generated_password")
          .eq("organization_id", organizationId);
        
        const available = (allProfiles || [])
          .filter(p => !enrolledStudentIds.has(p.user_id))
          .map(p => ({
            id: p.id,
            user_id: p.user_id,
            enrollment_id: null,
            name: p.full_name || "Без имени",
            email: p.email || "",
            login: p.login || null,
            generated_password: p.generated_password || null,
            course: null,
            course_id: null,
            progress: 0,
            lastActivity: null,
            status: null
          }));
        
        setAvailableStudentsForCourse(available);
      }
    } catch (error) {
      console.error("Error loading course students:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoadingCourseStudents(false);
    }
  }, [organizationId]);

  // Add students to course
  const addStudentsToCourse = useCallback(async () => {
    if (!selectedCourse || selectedStudentsToAdd.size === 0) return;
    
    setIsAddingStudentsToCourse(true);
    try {
      const userIds = Array.from(selectedStudentsToAdd);

      // Check for existing enrollments
      const { data: existingEnrollments } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", selectedCourse.id)
        .in("user_id", userIds);
      
      const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));
      
      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        setSelectedStudentsToAdd(new Set());
        return;
      }
      
      const enrollmentsToInsert = newUserIds.map(userId => ({
        user_id: userId,
        course_id: selectedCourse.id,
        status: "active",
        progress: 0
      }));
      
      const { error } = await supabase.from("enrollments").insert(enrollmentsToInsert);
      if (error) throw error;
      
      toast.success(`Зачислено ${newUserIds.length} учеников`);
      setSelectedStudentsToAdd(new Set());
      openCourseStudents(selectedCourse);
    } catch (error) {
      console.error("Error adding students to course:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsAddingStudentsToCourse(false);
    }
  }, [selectedCourse, selectedStudentsToAdd, openCourseStudents]);

  // Remove student from course
  const removeStudentFromCourse = useCallback(async (enrollmentId: string) => {
    try {
      const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
      
      toast.success("Ученик удалён из курса");
      if (selectedCourse) {
        openCourseStudents(selectedCourse);
      }
    } catch (error) {
      console.error("Error removing enrollment:", error);
      toast.error("Ошибка удаления");
    }
  }, [selectedCourse, openCourseStudents]);

  // Toggle student selection
  const toggleStudentSelection = useCallback((userId: string) => {
    setSelectedStudentsToAdd(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  // Direct setter for course students (used by CourseDetailsModal)
  const setCourseStudentsDirectly = useCallback((students: Student[]) => {
    setCourseStudents(students);
  }, []);

  return {
    showCourseStudentsDialog,
    setShowCourseStudentsDialog,
    selectedCourse,
    courseStudents,
    availableStudentsForCourse,
    isLoadingCourseStudents,
    selectedStudentsToAdd,
    isAddingStudentsToCourse,
    courseStudentsSearchQuery,
    setCourseStudentsSearchQuery,
    openCourseStudents,
    addStudentsToCourse,
    removeStudentFromCourse,
    toggleStudentSelection,
    setCourseStudentsDirectly,
  };
}
