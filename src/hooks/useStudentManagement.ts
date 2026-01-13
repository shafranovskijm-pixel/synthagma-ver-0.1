import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
}: UseStudentManagementProps) {
  // Add student dialog state
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [noLoginStudent, setNoLoginStudent] = useState(false);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  // Enroll existing student
  const [selectedExistingStudentId, setSelectedExistingStudentId] = useState<string>("");
  const [isEnrollingExisting, setIsEnrollingExisting] = useState(false);

  // Create student
  const createStudent = useCallback(async () => {
    if (!organizationId || !newStudentName.trim() || !newStudentEmail.trim()) {
      toast.error("Заполните ФИО и Email");
      return false;
    }
    if (!isValidEmail(newStudentEmail)) {
      toast.error("Введите корректный email адрес");
      return false;
    }
    
    setIsCreatingStudent(true);
    try {
      const password = noLoginStudent ? null : generateStrongPassword();
      const { data, error } = await supabase.functions.invoke("register-student", {
        body: {
          token: null,
          email: newStudentEmail || null,
          password,
          full_name: newStudentName,
          organization_id: organizationId,
          course_id: selectedCourseId || null,
          company_id: selectedCompanyId || null,
          no_login: noLoginStudent
        }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Show appropriate message based on response
      if (data.is_no_login) {
        toast.success(data.message || "Ученик добавлен");
      } else if (data.is_existing) {
        toast.success(data.message || "Ученик зачислен на курс");
      } else {
        toast.success(`Ученик создан. Пароль: ${password} (сохраните его!)`);
      }

      // Add or update student in the list
      const course = courses.find(c => c.id === selectedCourseId);
      const newStudent: Student = {
        id: data.user_id,
        user_id: data.user_id,
        enrollment_id: null,
        name: newStudentName,
        email: newStudentEmail || "",
        login: data.login || null,
        generated_password: data.password || null,
        course: course?.title || null,
        course_id: selectedCourseId || null,
        progress: 0,
        lastActivity: new Date().toISOString(),
        status: selectedCourseId ? "active" : null
      };

      // Check if student is already in the list
      const existsInList = students.some(s => s.user_id === data.user_id) || 
                          allProfiles.some(s => s.user_id === data.user_id);
      
      if (data.is_no_login || !data.is_existing) {
        // New student (with or without login) - add to lists
        setStudents(prev => [...prev, newStudent]);
        setAllProfiles(prev => [...prev, newStudent]);
        setStats(prev => ({
          ...prev,
          totalStudents: prev.totalStudents + 1
        }));
      } else if (data.enrollment_created && selectedCourseId) {
        // Existing student enrolled in new course - add enrollment entry
        setStudents(prev => [...prev, newStudent]);
      } else if (!existsInList) {
        // Existing student not in list - add them so they're visible
        setAllProfiles(prev => [...prev, newStudent]);
        setStudents(prev => [...prev, newStudent]);
      }

      onRefresh();
      setShowAddStudentDialog(false);
      setNewStudentName("");
      setNewStudentEmail("");
      setSelectedCourseId("");
      setSelectedCompanyId("");
      setNoLoginStudent(false);
      return true;
    } catch (error: any) {
      console.error("Error creating student:", error);
      toast.error(error.message || "Ошибка создания ученика");
      return false;
    } finally {
      setIsCreatingStudent(false);
    }
  }, [organizationId, newStudentName, newStudentEmail, noLoginStudent, selectedCourseId, selectedCompanyId, courses, students, allProfiles, setStudents, setAllProfiles, setStats, onRefresh]);

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
      const login = generateLogin(student.name);
      const password = generateSimplePassword();

      const { error } = await supabase.from("profiles").update({
        login,
        generated_password: password
      }).eq("user_id", student.user_id);
      
      if (error) throw error;

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
      toast.error("Ошибка создания логина и пароля");
      return null;
    }
  }, [setStudents, setAllProfiles]);

  // Bulk create credentials
  const bulkCreateCredentials = useCallback(async (studentsToCreate: Student[]) => {
    if (studentsToCreate.length === 0) {
      toast.error("Нет учеников для создания учетных данных");
      return { successCount: 0, errorCount: 0, credentials: [] };
    }
    
    let successCount = 0;
    let errorCount = 0;
    const createdCredentials: { name: string; login: string; password: string }[] = [];

    for (const student of studentsToCreate) {
      try {
        const login = generateLogin(student.name);
        const password = generateSimplePassword();

        const { error } = await supabase.from("profiles").update({
          login,
          generated_password: password
        }).eq("user_id", student.user_id);
        
        if (error) throw error;
        
        createdCredentials.push({ name: student.name, login, password });
        successCount++;
      } catch (err) {
        errorCount++;
        console.error(`Error creating credentials for ${student.name}:`, err);
      }
    }

    // Update local state
    setStudents(prev => prev.map(s => {
      const creds = createdCredentials.find(c => c.name === s.name && !s.login);
      return creds ? { ...s, login: creds.login, generated_password: creds.password } : s;
    }));
    setAllProfiles(prev => prev.map(s => {
      const creds = createdCredentials.find(c => c.name === s.name && !s.login);
      return creds ? { ...s, login: creds.login, generated_password: creds.password } : s;
    }));

    if (successCount > 0) {
      toast.success(`Создано логинов: ${successCount} из ${studentsToCreate.length}`);
    }
    if (errorCount > 0) {
      toast.error(`Ошибки: ${errorCount}`);
    }

    return { successCount, errorCount, credentials: createdCredentials };
  }, [setStudents, setAllProfiles]);

  // Delete student completely
  const deleteStudent = useCallback(async (student: Student) => {
    if (!confirm(`Вы уверены, что хотите полностью удалить ученика "${student.name}"? Это действие нельзя отменить.`)) {
      return false;
    }
    
    try {
      // Delete all enrollments
      await supabase.from("enrollments").delete().eq("user_id", student.user_id);

      // Delete profile
      const { error } = await supabase.from("profiles").delete().eq("user_id", student.user_id);
      if (error) throw error;

      // Update local state
      setStudents(prev => prev.filter(s => s.user_id !== student.user_id));
      setAllProfiles(prev => prev.filter(s => s.user_id !== student.user_id));
      setStats(prev => ({
        ...prev,
        totalStudents: Math.max(0, prev.totalStudents - 1)
      }));
      
      toast.success("Ученик удалён");
      return true;
    } catch (error) {
      console.error("Error deleting student:", error);
      toast.error("Ошибка удаления ученика");
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
    noLoginStudent,
    setNoLoginStudent,
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
