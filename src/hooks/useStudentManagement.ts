import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { generateStrongPassword, isValidEmail } from "@/utils/credentials";
import { getBaseUrl } from "@/utils/getBaseUrl";
import {
  EnrollmentPersistenceError,
  insertEnrollmentsVerified,
} from "@/api/enrollments";

interface UseStudentManagementProps {
  organizationId: string | null;
  onRefresh: () => void;
  checkStudentLimit?: () => { allowed: boolean; message: string };
}

/**
 * Phase 4B.1.c.1 — minimal student management hook.
 *
 * Responsibilities:
 *  - own the Add Student dialog open state;
 *  - create a student via the `register-student` edge function;
 *  - enroll the freshly created student in the picked courses;
 *  - send credentials by email when possible;
 *  - trigger `onRefresh` so React Query re-fetches paginated pages.
 *
 * Legacy responsibilities (local list mutations, `enrollExistingStudent`,
 * one-off credential creation, bulk credential creation, soft-delete of
 * students) have moved to `useStudents` / `useStudentActions` /
 * `useEnrollmentActions` and are removed here.
 */
export function useStudentManagement({
  organizationId,
  onRefresh,
  checkStudentLimit,
}: UseStudentManagementProps) {
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  const createStudent = useCallback(async (overrides?: {
    name?: string;
    email?: string;
    courseIds?: string[];
    companyId?: string;
    login?: string;
    password?: string;
  }) => {
    if (checkStudentLimit) {
      const result = checkStudentLimit();
      if (!result.allowed) {
        toast.error(result.message);
        return false;
      }
    }

    const effectiveName = (overrides?.name ?? "").trim();
    const effectiveEmail = (overrides?.email ?? "").trim();
    const effectiveCourseIds = overrides?.courseIds ?? [];
    const effectiveCompanyId = overrides?.companyId ?? "";
    const customLogin = overrides?.login || undefined;
    const customPassword = overrides?.password || undefined;

    if (!organizationId || !effectiveName) {
      toast.error("Заполните ФИО");
      return false;
    }
    if (effectiveEmail && !isValidEmail(effectiveEmail)) {
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
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (
        firstCourseId
        && data?.enrollment_created !== true
        && data?.already_enrolled !== true
      ) {
        throw new Error("База не подтвердила зачисление на выбранный курс");
      }

      // Enroll in remaining courses
      const remainingCourseIds = effectiveCourseIds.slice(1);
      if (remainingCourseIds.length > 0 && data.user_id) {
        const { data: existingRemaining, error: existingRemainingError } = await supabase
          .from("enrollments")
          .select("course_id")
          .eq("user_id", data.user_id)
          .in("course_id", remainingCourseIds);
        if (existingRemainingError) throw existingRemainingError;

        const existingCourseIds = new Set(
          (existingRemaining ?? []).map((row) => row.course_id),
        );
        for (const cId of remainingCourseIds.filter((id) => !existingCourseIds.has(id))) {
          await insertEnrollmentsVerified([{
            user_id: data.user_id,
            course_id: cId,
            status: "active",
            progress: 0,
          }]);
        }
      }

      const displayPassword = data.password || password;
      const displayLogin = data.login || customLogin;

      if (data.is_existing) {
        toast.success(data.message || "Ученик зачислен на курс");
      } else {
        toast.success(`Ученик создан. Логин: ${displayLogin}, Пароль: ${displayPassword}`);
      }

      // Auto-send credentials by email when a new account was created.
      if (!data.is_existing && effectiveEmail && displayLogin && displayPassword) {
        try {
          const { error: mailError } = await safeInvoke<any>("send-credentials", {
            body: {
              email: effectiveEmail,
              name: effectiveName,
              login: displayLogin,
              password: displayPassword,
              loginUrl: `${getBaseUrl()}/login`,
            },
          });
          if (mailError) {
            console.error("Auto send-credentials failed:", mailError);
            toast.warning(`Ученик создан, но письмо не отправлено: ${mailError.message || "неизвестная ошибка"}`);
          } else {
            toast.success(`Данные для входа отправлены на ${effectiveEmail}`);
          }
        } catch (mailErr: any) {
          console.error("Auto send-credentials exception:", mailErr);
          toast.warning(`Ученик создан, но письмо не отправлено: ${mailErr?.message || "ошибка"}`);
        }
      }

      onRefresh();
      setShowAddStudentDialog(false);
      return true;
    } catch (error: any) {
      console.error("Error creating student:", error);
      if (error instanceof EnrollmentPersistenceError) {
        onRefresh();
        toast.error("Ученик создан, но база не подтвердила зачисление на все выбранные курсы. Проверьте его карточку.");
      } else {
        toast.error(error.message || "Ошибка создания ученика");
      }
      return false;
    } finally {
      setIsCreatingStudent(false);
    }
  }, [organizationId, onRefresh, checkStudentLimit]);

  return {
    showAddStudentDialog,
    setShowAddStudentDialog,
    isCreatingStudent,
    createStudent,
  };
}
