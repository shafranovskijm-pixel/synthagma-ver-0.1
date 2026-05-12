import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { Student, Course } from "@/types/shared";
import { generateLogin, generateSimplePassword, generateStrongPassword, isValidEmail } from "@/utils/credentials";

interface UseStudentManagementProps {
  organizationId: string | null;
  courses: Course[];
  students: Student[];
  allProfiles: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  setAllProfiles: React.Dispatch<React.SetStateAction<Student[]>>;
  setStats: React.Dispatch<React.SetStateAction<{
    totalStudents: number;
    totalCourses: number;
    completedCount: number;
    averageProgress: number;
  }>>;
  onRefresh: () => void;
  checkStudentLimit?: () => { allowed: boolean; message: string };
}

export function useStudentManagement({
  organizationId,
  courses,
  students,
  allProfiles,
  setStudents,
  setAllProfiles,
  setStats,
  onRefresh,
  checkStudentLimit,
}: UseStudentManagementProps) {
  // Add student dialog state
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  // Enroll existing student
  const [selectedExistingStudentId, setSelectedExistingStudentId] = useState<string>("");
  const [isEnrollingExisting, setIsEnrollingExisting] = useState(false);

  // Create student
  const createStudent = useCallback(async (overrides?: { name?: string; email?: string; courseIds?: string[]; companyId?: string; login?: string; password?: string }) => {
    if (checkStudentLimit) {
      const result = checkStudentLimit();
      if (!result.allowed) {
        toast.error(result.message);
        return false;
      }
    }
    const effectiveName = overrides?.name ?? newStudentName;
    const effectiveEmail = overrides?.email ?? newStudentEmail;
    const effectiveCourseIds = overrides?.courseIds ?? (selectedCourseId ? [selectedCourseId] : []);
    const effectiveCompanyId = overrides?.companyId ?? selectedCompanyId;
    const customLogin = overrides?.login || undefined;
    const customPassword = overrides?.password || undefined;

    if (!organizationId || !effectiveName.trim()) {
      toast.error("Заполните ФИО");
      return false;
    }
    if (effectiveEmail.trim() && !isValidEmail(effectiveEmail)) {
      toast.error("Введите корректный email адрес");
      return false;
    }
    
    setIsCreatingStudent(true);
    try {
      const firstCourseId = effectiveCourseIds[0] || null;
      const password = customPassword || generateStrongPassword();
      const { data, error } = await safeInvoke<any>("register-student", {
        body: {
          token: null,
          email: effectiveEmail || null,
          password,
          full_name: effectiveName,
          organization_id: organizationId,
          course_id: firstCourseId,
          company_id: effectiveCompanyId || null,
          custom_login: customLogin || null,
          custom_password: customPassword || null,
        }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Enroll in remaining courses
      const remainingCourseIds = effectiveCourseIds.slice(1);
      if (remainingCourseIds.length > 0 && data.user_id) {
        for (const cId of remainingCourseIds) {
          const { error: enrollErr } = await supabase.from("enrollments").insert({
            user_id: data.user_id,
            course_id: cId,
            status: "active",
            progress: 0,
          });
          if (enrollErr) console.error("Enrollment error for course", cId, enrollErr);
        }
      }

      const displayPassword = data.password || password;
      const displayLogin = data.login || customLogin;

      if (data.is_existing) {
        toast.success(data.message || "Ученик зачислен на курс");
      } else {
        toast.success(`Ученик создан. Логин: ${displayLogin}, Пароль: ${displayPassword}`);
      }

      // Add or update student in the list
      const course = courses.find(c => c.id === firstCourseId);
      const newStudent: Student = {
        id: data.user_id,
        user_id: data.user_id,
        enrollment_id: null,
        name: effectiveName,
        email: effectiveEmail || "",
        login: data.login || customLogin || null,
        generated_password: displayPassword || null,
        course: course?.title || null,
        course_id: firstCourseId || null,
        progress: 0,
        lastActivity: new Date().toISOString(),
        status: firstCourseId ? "active" : null
      };

      const existsInList = students.some(s => s.user_id === data.user_id) || 
                          allProfiles.some(s => s.user_id === data.user_id);
      
      if (!data.is_existing) {
        setStudents(prev => [...prev, newStudent]);
        setAllProfiles(prev => [...prev, newStudent]);
        setStats(prev => ({
          ...prev,
          totalStudents: prev.totalStudents + 1
        }));
      } else if (data.enrollment_created && firstCourseId) {
        setStudents(prev => [...prev, newStudent]);
      } else if (!existsInList) {
        setAllProfiles(prev => [...prev, newStudent]);
        setStudents(prev => [...prev, newStudent]);
      }

      onRefresh();
      setShowAddStudentDialog(false);
      setNewStudentName("");
      setNewStudentEmail("");
      setSelectedCourseId("");
      setSelectedCompanyId("");
      return true;
    } catch (error: any) {
      console.error("Error creating student:", error);
      toast.error(error.message || "Ошибка создания ученика");
      return false;
    } finally {
      setIsCreatingStudent(false);
    }
  }, [organizationId, newStudentName, newStudentEmail, selectedCourseId, selectedCompanyId, courses, students, allProfiles, setStudents, setAllProfiles, setStats, onRefresh, checkStudentLimit]);

  // Enroll existing student
  const enrollExistingStudent = useCallback(async () => {
    if (!selectedExistingStudentId || !selectedCourseId) {
      toast.error("Выберите ученика и курс");
      return false;
    }
    
    setIsEnrollingExisting(true);
    try {
      // Check if already enrolled
      const { data: existingEnrollment } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", selectedExistingStudentId)
        .eq("course_id", selectedCourseId)
        .single();
      
      if (existingEnrollment) {
        toast.error("Ученик уже зачислен на этот курс");
        return false;
      }
      
      const { data: enrollment, error } = await supabase.from("enrollments").insert({
        user_id: selectedExistingStudentId,
        course_id: selectedCourseId,
        status: "active",
        progress: 0
      }).select().single();
      
      if (error) throw error;

      // Find student info
      const student = [...students, ...allProfiles].find(s => s.user_id === selectedExistingStudentId);
      const course = courses.find(c => c.id === selectedCourseId);
      
      if (student && course) {
        const newEnrollment: Student = {
          id: student.id,
          user_id: student.user_id,
          enrollment_id: enrollment.id,
          name: student.name,
          email: student.email,
          login: student.login,
          generated_password: student.generated_password,
          course: course.title,
          course_id: course.id,
          progress: 0,
          lastActivity: new Date().toISOString(),
          status: "active"
        };
        setStudents(prev => [...prev, newEnrollment]);
      }

      toast.success("Ученик зачислен на курс");
      setShowAddStudentDialog(false);
      setSelectedExistingStudentId("");
      setSelectedCourseId("");
      return true;
    } catch (error) {
      console.error("Error enrolling student:", error);
      toast.error("Ошибка зачисления");
      return false;
    } finally {
      setIsEnrollingExisting(false);
    }
  }, [selectedExistingStudentId, selectedCourseId, students, allProfiles, courses, setStudents]);

  // Create credentials for a student
  const createCredentials = useCallback(async (student: Student) => {
    if (student.login && student.generated_password) {
      toast.info("У ученика уже есть логин и пароль");
      return null;
    }
    
    try {
      const login = student.login || generateLogin(student.name);
      const password = generateSimplePassword();

      // Use edge function to update both auth.users and profiles
      const { data, error } = await safeInvoke<any>("update-student-credentials", {
        body: {
          user_id: student.user_id,
          new_login: login,
          new_password: password
        }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update lists
      setStudents(prev => prev.map(s => s.user_id === student.user_id ? {
        ...s,
        login,
        generated_password: password
      } : s));
      setAllProfiles(prev => prev.map(s => s.user_id === student.user_id ? {
        ...s,
        login,
        generated_password: password
      } : s));
      
      toast.success(`Логин и пароль созданы! Логин: ${login}, Пароль: ${password}`);
      return { login, password };
    } catch (error) {
      console.error("Error creating credentials:", error);
      toast.error(error instanceof Error ? error.message : "Ошибка создания логина и пароля");
      return null;
    }
  }, [setStudents, setAllProfiles]);

  // Bulk create credentials
  const bulkCreateCredentials = useCallback(async (studentsToCreate: Student[]) => {
    if (studentsToCreate.length === 0) {
      toast.error("Нет учеников для создания учетных данных");
      return { successCount: 0, errorCount: 0, credentials: [] };
    }
    
    // Verify students exist in database before processing
    const validUserIds = studentsToCreate.map(s => s.user_id);
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("user_id")
      .in("user_id", validUserIds);
    
    const existingUserIds = new Set((existingProfiles || []).map(p => p.user_id));
    const validStudents = studentsToCreate.filter(s => existingUserIds.has(s.user_id));
    const skippedCount = studentsToCreate.length - validStudents.length;
    
    if (skippedCount > 0) {
    }
    
    if (validStudents.length === 0) {
      toast.error("Не найдено учеников для создания учетных данных. Попробуйте обновить страницу.");
      return { successCount: 0, errorCount: studentsToCreate.length, credentials: [] };
    }
    
    let successCount = 0;
    let errorCount = 0;
    const createdCredentials: { userId: string; name: string; login: string; password: string }[] = [];

    for (const student of validStudents) {
      try {
        const login = student.login || generateLogin(student.name);
        const password = generateSimplePassword();

        // Use edge function to update both auth.users and profiles
        const { data, error } = await safeInvoke<any>("update-student-credentials", {
          body: {
            user_id: student.user_id,
            new_login: login,
            new_password: password
          }
        });
        
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        
        createdCredentials.push({ userId: student.user_id, name: student.name, login, password });
        successCount++;
      } catch (err) {
        errorCount++;
        console.error(`Error creating credentials for ${student.name}:`, err);
      }
    }

    // Update local state using user_id for more reliable matching
    setStudents(prev => prev.map(s => {
      const creds = createdCredentials.find(c => c.userId === s.user_id);
      return creds ? { ...s, login: creds.login, generated_password: creds.password } : s;
    }));
    setAllProfiles(prev => prev.map(s => {
      const creds = createdCredentials.find(c => c.userId === s.user_id);
      return creds ? { ...s, login: creds.login, generated_password: creds.password } : s;
    }));

    if (successCount > 0) {
      toast.success(`Создано логинов: ${successCount} из ${validStudents.length}`);
    }
    if (errorCount > 0) {
      toast.error(`Ошибки: ${errorCount}. Попробуйте обновить страницу.`);
    }
    if (skippedCount > 0) {
      toast.warning(`Пропущено ${skippedCount} удаленных учеников`);
    }

    return { successCount, errorCount, credentials: createdCredentials };
  }, [setStudents, setAllProfiles]);

  // Delete student completely
  const deleteStudent = useCallback(async (student: Student) => {
    if (!confirm(`Перенести ученика "${student.name}" в архив? Данные и история обучения сохранятся, ученик исчезнет из активного списка. Восстановить можно из вкладки «Архив».`)) {
      return false;
    }

    try {
      // SOFT DELETE — keep profile and enrollments, just archive
      const { error } = await supabase
        .from("profiles")
        .update({ archived_at: new Date().toISOString() } as any)
        .eq("user_id", student.user_id);
      if (error) throw error;

      // Update local state — remove from active lists (archived view loads separately)
      setStudents(prev => prev.filter(s => s.user_id !== student.user_id));
      setAllProfiles(prev => prev.filter(s => s.user_id !== student.user_id));
      setStats(prev => ({
        ...prev,
        totalStudents: Math.max(0, prev.totalStudents - 1)
      }));

      toast.success("Ученик перенесён в архив");
      return true;
    } catch (error) {
      console.error("Error archiving student:", error);
      toast.error("Ошибка переноса в архив");
      return false;
    }
  }, [setStudents, setAllProfiles, setStats]);

  return {
    // Add student dialog
    showAddStudentDialog,
    setShowAddStudentDialog,
    newStudentName,
    setNewStudentName,
    newStudentEmail,
    setNewStudentEmail,
    selectedCourseId,
    setSelectedCourseId,
    selectedCompanyId,
    setSelectedCompanyId,
    isCreatingStudent,
    createStudent,

    // Enroll existing
    selectedExistingStudentId,
    setSelectedExistingStudentId,
    isEnrollingExisting,
    enrollExistingStudent,

    // Credentials
    createCredentials,
    bulkCreateCredentials,

    // Delete
    deleteStudent,
  };
}
