import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Student, StudentDocument, TestAttempt, StudentDetails, Stats } from "@/types/shared";

interface UseStudentDetailsDialogProps {
  students: Student[];
  allProfiles: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  setAllProfiles: React.Dispatch<React.SetStateAction<Student[]>>;
  setStats: React.Dispatch<React.SetStateAction<Stats>>;
  studentActions: {
    sendCredentialsClipboard: (student: Student) => Promise<void>;
    sendCredentialsEmail: (student: Student) => Promise<void>;
    createCredentials: (student: Student) => Promise<{ login: string; password: string } | null>;
    deleteStudentCompletely: (userId: string) => Promise<void>;
    isCreatingCredentials: boolean;
    isSendingCredentials: boolean;
    isSendingCredentialsEmail: boolean;
    isDeletingStudent: boolean;
  };
}

export function useStudentDetailsDialog({
  students,
  allProfiles,
  setStudents,
  setAllProfiles,
  setStats,
  studentActions,
}: UseStudentDetailsDialogProps) {
  const [selectedStudent, setSelectedStudent] = useState<StudentDetails | null>(null);
  const [showStudentDialog, setShowStudentDialog] = useState(false);
  const [isLoadingStudentDetails, setIsLoadingStudentDetails] = useState(false);
  const [studentCompanyId, setStudentCompanyId] = useState<string>("");
  const [isSavingStudentCompany, setIsSavingStudentCompany] = useState(false);

  const handleAttachStudentToCompany = useCallback(async () => {
    if (!selectedStudent || !studentCompanyId) {
      toast.error("Выберите компанию");
      return;
    }
    setIsSavingStudentCompany(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ company_id: studentCompanyId })
        .eq("user_id", selectedStudent.student.user_id);
      if (error) throw error;
      toast.success("Ученик прикреплён к компании");
      setStudents(prev => prev.map(s => 
        s.user_id === selectedStudent.student.user_id 
          ? { ...s, company_id: studentCompanyId } as any 
          : s
      ));
    } catch (error) {
      console.error("Error attaching student to company:", error);
      toast.error("Ошибка прикрепления к компании");
    } finally {
      setIsSavingStudentCompany(false);
    }
  }, [selectedStudent, studentCompanyId, setStudents]);

  const handleSendCredentials = useCallback(async () => {
    if (!selectedStudent) return;
    await studentActions.sendCredentialsClipboard(selectedStudent.student);
  }, [selectedStudent, studentActions]);

  const handleSendCredentialsEmail = useCallback(async () => {
    if (!selectedStudent) return;
    await studentActions.sendCredentialsEmail(selectedStudent.student);
  }, [selectedStudent, studentActions]);

  const handleCreateStudentCredentials = useCallback(async () => {
    if (!selectedStudent) return;
    const result = await studentActions.createCredentials(selectedStudent.student);
    if (result) {
      setStudents(prev => prev.map(s => 
        s.user_id === selectedStudent.student.user_id 
          ? { ...s, login: result.login, generated_password: result.password } 
          : s
      ));
      setAllProfiles(prev => prev.map(s => 
        s.user_id === selectedStudent.student.user_id 
          ? { ...s, login: result.login, generated_password: result.password } 
          : s
      ));
    }
  }, [selectedStudent, studentActions, setStudents, setAllProfiles]);

  const handleDeleteStudentCompletely = useCallback(async () => {
    if (!selectedStudent) return;
    const student = selectedStudent.student;
    if (!confirm(`Вы уверены, что хотите полностью удалить ученика "${student.name}"? Это действие нельзя отменить.`)) {
      return;
    }
    await studentActions.deleteStudentCompletely(student.user_id);
    setStudents(prev => prev.filter(s => s.user_id !== student.user_id));
    setAllProfiles(prev => prev.filter(s => s.user_id !== student.user_id));
    setStats(prev => ({
      ...prev,
      totalStudents: Math.max(0, prev.totalStudents - 1)
    }));
    setShowStudentDialog(false);
    setSelectedStudent(null);
  }, [selectedStudent, studentActions, setStudents, setAllProfiles, setStats]);

  const handleCopyCredentials = useCallback((login: string, password: string) => {
    const text = `Логин: ${login}\nПароль: ${password}`;
    navigator.clipboard.writeText(text);
    toast.success("Логин и пароль скопированы");
  }, []);

  return {
    selectedStudent,
    setSelectedStudent,
    showStudentDialog,
    setShowStudentDialog,
    isLoadingStudentDetails,
    setIsLoadingStudentDetails,
    studentCompanyId,
    setStudentCompanyId,
    isSavingStudentCompany,
    handleAttachStudentToCompany,
    handleSendCredentials,
    handleSendCredentialsEmail,
    handleCreateStudentCredentials,
    handleDeleteStudentCompletely,
    handleCopyCredentials,
  };
}
