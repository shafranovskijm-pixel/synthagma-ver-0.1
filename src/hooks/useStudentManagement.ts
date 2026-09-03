import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { generateStrongPassword, isValidEmail } from "@/utils/credentials";
import { getBaseUrl } from "@/utils/getBaseUrl";
import {
  EnrollmentAccessExpiredError,
  EnrollmentPersistenceError,
  ensureEnrollmentVerified,
  isEnrollmentAccessExpired,
  type EnrollmentAccessRow,
} from "@/api/enrollments";

interface UseStudentManagementProps {
  organizationId: string | null;
  onRefresh: () => void;
  checkStudentLimit?: () => { allowed: boolean; message: string };
}

class StudentGroupPersistenceError extends Error {
  constructor() {
    super("База не подтвердила добавление ученика в выбранную группу");
    this.name = "StudentGroupPersistenceError";
  }
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
    groupId?: string;
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
    const effectiveCourseIds = Array.from(
      new Set((overrides?.courseIds ?? []).filter(Boolean)),
    );
    const effectiveCompanyId = overrides?.companyId ?? "";
    const effectiveGroupId = overrides?.groupId ?? "";
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
    let registeredStudent: any = null;
    let generatedPassword = "";

    try {
      const firstCourseId = effectiveCourseIds[0] || null;
      const password = customPassword || generateStrongPassword();
      generatedPassword = password;
      const { data, error } = await safeInvoke<any>("register-student", {
        body: {
          token: null,
          email: effectiveEmail || null,
          password,
          full_name: effectiveName,
          organization_id: organizationId,
          course_id: firstCourseId,
          company_id: effectiveCompanyId || null,
          student_group_id: effectiveGroupId || null,
          custom_login: customLogin || null,
          custom_password: customPassword || null,
          enrollment_request_source: "organization_add_student",
        },
      });

      if (error) throw error;
      if (data?.partial_success) {
        const credentials = data.student_created && data.login && data.password
          ? ` Логин: ${data.login}, пароль: ${data.password}.`
          : "";
        onRefresh();
        setShowAddStudentDialog(false);
        toast.warning(
          `${data.message || data.error || "Операция завершилась частично; проверьте карточку ученика."}${credentials}`,
        );
        return false;
      }
      if (data?.error) throw new Error(data.error);
      registeredStudent = data;

      if (effectiveGroupId) {
        const registeredUserId = data?.user_id;
        if (!registeredUserId) {
          throw new StudentGroupPersistenceError();
        }
        const { data: confirmedProfile, error: profileConfirmationError } = await supabase
          .from("profiles")
          .select("user_id, organization_id, student_group_id")
          .eq("user_id", registeredUserId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (profileConfirmationError) throw profileConfirmationError;
        if (
          !confirmedProfile?.user_id
          || confirmedProfile.student_group_id !== effectiveGroupId
        ) {
          throw new StudentGroupPersistenceError();
        }
      }

      if (firstCourseId) {
        const registeredUserId = data?.user_id;
        if (!registeredUserId) {
          throw new Error("Сервер не вернул идентификатор ученика для проверки зачисления");
        }

        // Older deployed revisions do not return the enrollment flags. Prove
        // the exact row independently before announcing success.
        const { data: confirmedEnrollment, error: confirmationError } = await supabase
          .from("enrollments")
          .select("id, user_id, course_id, status, expires_at")
          .eq("user_id", registeredUserId)
          .eq("course_id", firstCourseId)
          .maybeSingle();
        if (confirmationError) throw confirmationError;
        if (
          !confirmedEnrollment?.id
          || confirmedEnrollment.user_id !== registeredUserId
          || confirmedEnrollment.course_id !== firstCourseId
        ) {
          const returnedUserIds = (
            data?.enrollment_created === true || data?.already_enrolled === true
          ) ? [registeredUserId] : [];
          throw new EnrollmentPersistenceError({
            expectedUserIds: [registeredUserId],
            returnedUserIds,
            persistedUserIds: [],
          });
        }

        if (isEnrollmentAccessExpired(confirmedEnrollment as EnrollmentAccessRow)) {
          throw new EnrollmentAccessExpiredError([firstCourseId]);
        }
      }

      // Enroll in remaining courses
      const remainingCourseIds = effectiveCourseIds.slice(1);
      if (remainingCourseIds.length > 0 && data.user_id) {
        const { data: existingRemaining, error: existingRemainingError } = await supabase
          .from("enrollments")
          .select("id, user_id, course_id, status, expires_at")
          .eq("user_id", data.user_id)
          .in("course_id", remainingCourseIds);

        if (existingRemainingError) throw existingRemainingError;

        const remainingRows = (existingRemaining ?? []) as EnrollmentAccessRow[];
        const expiredCourseIds = remainingRows
          .filter((row) => isEnrollmentAccessExpired(row))
          .map((row) => row.course_id);

        // Fail before inserting any missing remaining course, so the UI cannot
        // announce all-selected-courses success for a partially valid set.
        if (expiredCourseIds.length > 0) {
          throw new EnrollmentAccessExpiredError(expiredCourseIds);
        }

        const existingCourseIds = new Set(remainingRows.map((row) => row.course_id));
        for (const courseId of remainingCourseIds) {
          if (existingCourseIds.has(courseId)) continue;

          await ensureEnrollmentVerified({
            user_id: data.user_id,
            course_id: courseId,
            status: "active",
            progress: 0,
          });
        }
      }

      const displayPassword = data.password || password;
      const displayLogin = data.login || customLogin;
      const groupConfirmation = effectiveGroupId ? " Группа назначена." : "";

      if (data.is_existing) {
        toast.success(`${data.message || "Ученик добавлен"}${groupConfirmation}`);
      } else {
        toast.success(
          `Ученик создан${effectiveGroupId ? " и добавлен в группу" : ""}. Логин: ${displayLogin}, Пароль: ${displayPassword}`,
        );
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

      if (registeredStudent?.user_id) {
        const wasExisting = registeredStudent.is_existing === true;
        const displayLogin = registeredStudent.login || customLogin;
        const displayPassword = registeredStudent.password || generatedPassword;
        const credentials = !wasExisting && displayLogin && displayPassword
          ? ` Логин: ${displayLogin}, пароль: ${displayPassword}.`
          : "";
        const partialReason = error instanceof EnrollmentPersistenceError
          ? "база не подтвердила зачисление на все выбранные курсы"
          : error instanceof StudentGroupPersistenceError
            ? "база не подтвердила добавление в выбранную группу"
          : (error?.message || "не удалось завершить зачисление на все выбранные курсы");

        onRefresh();
        setShowAddStudentDialog(false);
        toast.warning(
          `${wasExisting ? "Ученик найден" : "Ученик создан"}, но операция завершилась частично: ${partialReason}.${credentials} Откройте карточку ученика и проверьте курсы перед повторным действием.`,
          { duration: 30000 },
        );
      } else if (error instanceof EnrollmentAccessExpiredError) {
        onRefresh();
        toast.error(error.message);
      } else if (error instanceof EnrollmentPersistenceError) {
        onRefresh();
        toast.error(
          "Ученик создан, но база не подтвердила зачисление на все выбранные курсы. Проверьте его карточку.",
        );
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
