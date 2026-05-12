import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { Student } from "@/types/shared";
import { generateLogin, generateSimplePassword } from "@/utils/credentials";

export function useStudentActions(
  organizationId: string | null,
  organizationName: string,
  onRefresh: () => void
) {
  const [isSendingCredentials, setIsSendingCredentials] = useState(false);
  const [isSendingCredentialsEmail, setIsSendingCredentialsEmail] = useState(false);
  const [isSendingBulkCredentials, setIsSendingBulkCredentials] = useState(false);
  const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
  const [isCreatingBulkCredentials, setIsCreatingBulkCredentials] = useState(false);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [isSendingBulkDocReminders, setIsSendingBulkDocReminders] = useState(false);

  const copyCredentials = useCallback((login: string, password: string) => {
    const text = `Логин: ${login}\nПароль: ${password}`;
    navigator.clipboard.writeText(text);
    toast.success("Логин и пароль скопированы");
  }, []);

  const sendCredentialsClipboard = useCallback(async (student: Student) => {
    if (!student.login || !student.generated_password) {
      toast.error("У ученика нет логина для входа");
      return;
    }
    if (!student.email) {
      toast.error("У ученика не указан email");
      return;
    }
    setIsSendingCredentials(true);
    try {
      const text = `Здравствуйте!\n\nВаши данные для входа в систему обучения:\n\nЛогин: ${student.login}\nПароль: ${student.generated_password}\n\nСсылка для входа: ${getBaseUrl()}/login`;
      await navigator.clipboard.writeText(text);
      toast.success("Сообщение с данными скопировано в буфер обмена.");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Ошибка копирования");
    } finally {
      setIsSendingCredentials(false);
    }
  }, []);

  const sendCredentialsEmail = useCallback(async (student: Student) => {
    if (!student.login || !student.generated_password) {
      toast.error("У ученика нет логина для входа");
      return;
    }
    if (!student.email) {
      toast.error("У ученика не указан email");
      return;
    }
    setIsSendingCredentialsEmail(true);
    try {
      const { error } = await safeInvoke<any>("send-credentials", {
        body: {
          email: student.email,
          name: student.name,
          login: student.login,
          password: student.generated_password,
          loginUrl: `${getBaseUrl()}/login`,
          organizationName
        }
      });
      if (error) throw error;
      toast.success(`Данные для входа отправлены на ${student.email}`);
    } catch (error) {
      console.error("Error sending credentials:", error);
      toast.error("Ошибка отправки email");
    } finally {
      setIsSendingCredentialsEmail(false);
    }
  }, [organizationName]);

  const createCredentials = useCallback(async (student: Student) => {
    if (student.login && student.generated_password) {
      toast.info("У ученика уже есть логин и пароль");
      return null;
    }
    setIsCreatingCredentials(true);
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
      
      toast.success(`Создан логин: ${login}`);
      onRefresh();
      return { login, password };
    } catch (error) {
      console.error("Error creating credentials:", error);
      toast.error(error instanceof Error ? error.message : "Ошибка создания логина");
      return null;
    } finally {
      setIsCreatingCredentials(false);
    }
  }, [onRefresh]);

  const deleteStudentCompletely = useCallback(async (userId: string) => {
    setIsDeletingStudent(true);
    try {
      // SOFT DELETE — archive instead of physical removal to preserve history.
      const { error } = await supabase
        .from("profiles")
        .update({ archived_at: new Date().toISOString() } as any)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Ученик перенесён в архив");
      onRefresh();
    } catch (error) {
      console.error("Error archiving student:", error);
      toast.error("Ошибка переноса в архив");
    } finally {
      setIsDeletingStudent(false);
    }
  }, [onRefresh]);

  const bulkSendCredentials = useCallback(async (students: Student[]) => {
    const studentsToSend = students.filter(s => s.login && s.generated_password && s.email);
    if (studentsToSend.length === 0) {
      toast.error("У выбранных учеников нет данных для отправки");
      return;
    }
    setIsSendingBulkCredentials(true);
    let successCount = 0;
    let errorCount = 0;
    try {
      for (const student of studentsToSend) {
        try {
          const { error } = await safeInvoke<any>("send-credentials", {
            body: {
              email: student.email,
              name: student.name,
              login: student.login!,
              password: student.generated_password!,
              loginUrl: `${getBaseUrl()}/login`,
              organizationName
            }
          });
          if (error) {
            errorCount++;
          } else {
            successCount++;
          }
        } catch {
          errorCount++;
        }
      }
      if (successCount > 0) {
        toast.success(`Отправлено: ${successCount} из ${studentsToSend.length}`);
      }
      if (errorCount > 0) {
        toast.error(`Ошибки отправки: ${errorCount}`);
      }
    } finally {
      setIsSendingBulkCredentials(false);
    }
  }, [organizationName]);

  const bulkCreateCredentials = useCallback(async (students: Student[], sendEmails: boolean = false) => {
    const studentsToCreate = students.filter(s => !s.login || !s.generated_password);
    if (studentsToCreate.length === 0) {
      toast.info("У всех выбранных учеников уже есть логин и пароль");
      return { successCount: 0, errorCount: 0, emailsSent: 0 };
    }
    setIsCreatingBulkCredentials(true);
    let successCount = 0;
    let errorCount = 0;
    let emailsSent = 0;
    const createdCredentials: { student: Student; login: string; password: string }[] = [];
    
    try {
      for (const student of studentsToCreate) {
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
          
          createdCredentials.push({ student, login, password });
          successCount++;
        } catch {
          errorCount++;
        }
      }
      
      // Send emails if requested
      if (sendEmails && createdCredentials.length > 0) {
        const loginUrl = `${getBaseUrl()}/login`;
        
        for (const { student, login, password } of createdCredentials) {
          if (!student.email) continue;
          
          try {
            const { error } = await safeInvoke<any>("send-credentials", {
              body: {
                email: student.email,
                name: student.name,
                login,
                password,
                loginUrl,
                organizationName
              }
            });
            
            if (!error) {
              emailsSent++;
            }
          } catch (e) {
            console.error("Error sending email to", student.email, e);
          }
        }
      }
      
      if (successCount > 0) {
        let message = `Создано логинов: ${successCount}`;
        if (sendEmails && emailsSent > 0) {
          message += `. Отправлено писем: ${emailsSent}`;
        }
        toast.success(message);
        onRefresh();
      }
      if (errorCount > 0) {
        toast.error(`Ошибки: ${errorCount}`);
      }
      
      return { successCount, errorCount, emailsSent };
    } finally {
      setIsCreatingBulkCredentials(false);
    }
  }, [onRefresh, organizationName]);

  const bulkSendDocReminders = useCallback(async () => {
    if (!organizationId) return;
    setIsSendingBulkDocReminders(true);
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);

      if (!profiles || profiles.length === 0) {
        toast.info("Нет учеников в организации");
        return;
      }

      const { data: allDocs } = await supabase
        .from("student_identity_documents")
        .select("user_id, type")
        .eq("organization_id", organizationId);

      const docsByUser = new Map<string, string[]>();
      allDocs?.forEach(doc => {
        const existing = docsByUser.get(doc.user_id) || [];
        existing.push(doc.type);
        docsByUser.set(doc.user_id, existing);
      });

      const studentsWithMissingDocs: { email: string; name: string; missing: string[] }[] = [];
      
      for (const profile of profiles) {
        const userDocs = docsByUser.get(profile.user_id) || [];
        const missing: string[] = [];
        
        const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
        const hasSnils = userDocs.includes("snils");
        const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
        
        if (!hasPassport) missing.push("Паспорт или свидетельство о рождении");
        if (!hasSnils) missing.push("СНИЛС");
        if (!hasEducation) missing.push("Документ об образовании");
        
        if (missing.length > 0 && profile.email) {
          studentsWithMissingDocs.push({
            email: profile.email,
            name: profile.full_name || "Ученик",
            missing
          });
        }
      }

      if (studentsWithMissingDocs.length === 0) {
        toast.success("Все ученики загрузили документы!");
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const student of studentsWithMissingDocs) {
        try {
          const response = await safeInvoke<any>("send-documents-reminder", {
            body: {
              email: student.email,
              studentName: student.name,
              missingDocuments: student.missing,
              organizationName,
              loginUrl: getBaseUrl() + "/login",
            },
          });
          if (response.error) throw response.error;
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Отправлено напоминаний: ${successCount}`);
      }
      if (errorCount > 0) {
        toast.error(`Ошибки отправки: ${errorCount}`);
      }
    } catch (error) {
      console.error("Error in bulk doc reminders:", error);
      toast.error("Ошибка массовой отправки");
    } finally {
      setIsSendingBulkDocReminders(false);
    }
  }, [organizationId, organizationName]);

  return {
    isSendingCredentials,
    isSendingCredentialsEmail,
    isSendingBulkCredentials,
    isCreatingCredentials,
    isCreatingBulkCredentials,
    isDeletingStudent,
    isSendingBulkDocReminders,
    copyCredentials,
    sendCredentialsClipboard,
    sendCredentialsEmail,
    createCredentials,
    deleteStudentCompletely,
    bulkSendCredentials,
    bulkCreateCredentials,
    bulkSendDocReminders,
  };
}
