import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateEnrollmentOrder } from "@/utils/generateEnrollmentOrder";

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

export function useEnrollmentActions(
  organizationId: string | null,
  organizationName: string,
  onRefresh: () => void
) {
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isUnenrolling, setIsUnenrolling] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  const toggleStudentSelection = useCallback((uniqueId: string) => {
    const newSet = new Set(selectedStudentIds);
    if (newSet.has(uniqueId)) {
      newSet.delete(uniqueId);
    } else {
      newSet.add(uniqueId);
    }
    setSelectedStudentIds(newSet);
  }, [selectedStudentIds]);

  const toggleSelectAll = useCallback((filteredList: Student[]) => {
    const filteredIds = filteredList.map(s => s.enrollment_id || s.user_id);
    const allSelected = filteredIds.every(id => selectedStudentIds.has(id)) && filteredIds.length > 0;

    if (allSelected) {
      const newSet = new Set(selectedStudentIds);
      filteredIds.forEach(id => newSet.delete(id));
      setSelectedStudentIds(newSet);
    } else {
      const newSet = new Set(selectedStudentIds);
      filteredIds.forEach(id => newSet.add(id));
      setSelectedStudentIds(newSet);
    }
  }, [selectedStudentIds]);

  const getSelectedUserIds = useCallback((students: Student[]): string[] => {
    const userIds = new Set<string>();
    for (const student of students) {
      const uniqueId = student.enrollment_id || student.user_id;
      if (selectedStudentIds.has(uniqueId)) {
        userIds.add(student.user_id);
      }
    }
    return Array.from(userIds);
  }, [selectedStudentIds]);

  const bulkEnroll = useCallback(async (
    courseId: string,
    students: Student[],
    allProfiles: Student[],
    courses: Course[]
  ) => {
    if (!courseId) {
      toast.error("Выберите курс");
      return false;
    }

    const userIds = getSelectedUserIds(students);
    if (userIds.length === 0) {
      toast.error("Выберите учеников");
      return false;
    }

    setIsEnrolling(true);
    try {
      const { data: existingEnrollments } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", courseId)
        .in("user_id", userIds);

      const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));

      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        return false;
      }

      const enrollmentsToInsert = newUserIds.map(userId => ({
        user_id: userId,
        course_id: courseId,
        status: "active",
        progress: 0
      }));

      const { error } = await supabase.from("enrollments").insert(enrollmentsToInsert);
      if (error) throw error;

      // Generate enrollment order
      if (organizationId) {
        const enrolledStudentNames = newUserIds.map(userId => {
          const student = [...students, ...allProfiles].find(s => s.user_id === userId);
          return student?.name || "Неизвестный";
        });
        const course = courses.find(c => c.id === courseId);

        const { data: orgData } = await supabase
          .from("organizations")
          .select("name, director_name, director_position")
          .eq("id", organizationId)
          .single();

        await generateEnrollmentOrder({
          organizationId,
          organizationName: orgData?.name || organizationName,
          directorName: orgData?.director_name,
          directorPosition: orgData?.director_position,
          studentNames: enrolledStudentNames,
          courseName: course?.title || "Курс",
          orderType: "enrollment",
        });
      }

      toast.success(`Зачислено ${newUserIds.length} учеников`);
      setSelectedStudentIds(new Set());
      onRefresh();
      return true;
    } catch (error) {
      console.error("Error enrolling students:", error);
      toast.error("Ошибка зачисления");
      return false;
    } finally {
      setIsEnrolling(false);
    }
  }, [organizationId, organizationName, getSelectedUserIds, onRefresh]);

  const bulkUnenroll = useCallback(async (students: Student[]) => {
    const enrollmentIds = Array.from(selectedStudentIds).filter(id => {
      const student = students.find(s => s.enrollment_id === id);
      return student !== undefined;
    });

    if (enrollmentIds.length === 0) {
      toast.error("Нет выбранных зачислений для отчисления");
      return false;
    }

    setIsUnenrolling(true);
    try {
      const studentsToUnenroll = enrollmentIds.map(enrollmentId => {
        const student = students.find(s => s.enrollment_id === enrollmentId);
        return {
          name: student?.name || "Неизвестный",
          courseName: student?.course || "Курс",
          courseId: student?.course_id
        };
      });

      const { error } = await supabase.from("enrollments").delete().in("id", enrollmentIds);
      if (error) throw error;

      // Generate expulsion orders
      if (organizationId) {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("name, director_name, director_position")
          .eq("id", organizationId)
          .single();

        const studentsByCourse = studentsToUnenroll.reduce((acc, student) => {
          const key = student.courseId || "unknown";
          if (!acc[key]) {
            acc[key] = { courseName: student.courseName, names: [] };
          }
          acc[key].names.push(student.name);
          return acc;
        }, {} as Record<string, { courseName: string; names: string[] }>);

        for (const courseData of Object.values(studentsByCourse)) {
          await generateEnrollmentOrder({
            organizationId,
            organizationName: orgData?.name || organizationName,
            directorName: orgData?.director_name,
            directorPosition: orgData?.director_position,
            studentNames: courseData.names,
            courseName: courseData.courseName,
            orderType: "expulsion",
          });
        }
      }

      toast.success(`Отчислено ${enrollmentIds.length} записей`);
      setSelectedStudentIds(new Set());
      onRefresh();
      return true;
    } catch (error) {
      console.error("Error unenrolling:", error);
      toast.error("Ошибка отчисления");
      return false;
    } finally {
      setIsUnenrolling(false);
    }
  }, [organizationId, organizationName, selectedStudentIds, onRefresh]);

  const getSelectedEnrollmentsCount = useCallback((students: Student[]) => {
    return Array.from(selectedStudentIds).filter(id => {
      const student = students.find(s => s.enrollment_id === id);
      return student !== undefined;
    }).length;
  }, [selectedStudentIds]);

  return {
    isEnrolling,
    isUnenrolling,
    selectedStudentIds,
    setSelectedStudentIds,
    toggleStudentSelection,
    toggleSelectAll,
    getSelectedUserIds,
    bulkEnroll,
    bulkUnenroll,
    getSelectedEnrollmentsCount,
  };
}
