// supabase/functions/register-student/index.ts
// Server-canonical student registration.
// - Removes local plan matrix.
// - Uses public.get_organization_student_capacity for read-only preflight
//   and public.create_student_profile_with_capacity for the atomic slot
//   claim under an advisory lock (see phase 5A.2 migration).
// - Multi-role aware caller authorization (no .single() on user_roles).
// - Compensates a freshly-created auth-user only before a profile is claimed.
// - Reports profile-without-enrollment as an explicit partial success.
// - Idempotent for existing students whose course access is still valid.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isEnrollmentAccessExpired } from "../_shared/enrollment-access.ts";
import { preflightRegistrationStudentGroup } from "../_shared/registration-student-group.ts";

const REGISTER_STUDENT_REVISION = "enrollment-persistence-v5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "X-Sintagma-Register-Student-Revision",
};

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-Sintagma-Register-Student-Revision": REGISTER_STUDENT_REVISION,
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return j({ error: "Некорректный запрос: не удалось прочитать данные формы" }, 400);
    }

    const {
      email: rawEmail,
      password,
      full_name,
      organization_id,
      course_id,
      company_id,
      custom_login,
      custom_password,
      student_group_id,
      registration_token,
      region,
      enrollment_request_source,
    } = payload || {};

    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    // ── Public branch: registration by link token (no session required) ──
    let publicRegistration = false;
    let effectiveOrgIdFromToken: string | null = null;
    let effectiveCompanyIdFromToken: string | null = null;
    let effectiveCourseIdFromToken: string | null = null;
    let effectiveGroupIdFromToken: string | null = null;
    // Roles resolved for the authenticated caller (multi-role aware).
    let callerRoles: string[] = [];
    let callerUserId: string | null = null;
    let callerProfile: { organization_id: string | null } | null = null;

    if (registration_token) {
      const { data: link, error: linkError } = await supabaseAdmin
        .from("registration_links")
        .select("id, organization_id, company_id, course_id, student_group_id, used_count, expires_at")
        .eq("token", registration_token)
        .maybeSingle();

      if (linkError || !link) {
        console.error("[register-student] link lookup failed", linkError);
        return j({ error: "Ссылка регистрации не найдена или срок её действия истёк." }, 404);
      }
      if ((link as any).expires_at && new Date((link as any).expires_at) < new Date()) {
        return j({ error: "Срок действия ссылки регистрации истёк." }, 400);
      }

      publicRegistration = true;
      effectiveOrgIdFromToken = link.organization_id;
      effectiveCompanyIdFromToken = (link as any).company_id || null;
      effectiveCourseIdFromToken = (link as any).course_id || null;
      effectiveGroupIdFromToken = (link as any).student_group_id || null;
    } else {
      // ── Authenticated branch ──
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return j({ error: "Authentication required" }, 401);
      }
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return j({
          error:
            "Ссылка регистрации недействительна или сессия устарела. Войдите заново или используйте новую ссылку.",
        }, 401);
      }
      callerUserId = user.id;

      // Multi-role aware: user may hold multiple roles.
      const { data: rd } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      callerRoles = (rd || []).map((r: any) => r.role);

      const allowed = callerRoles.some((r) => ["admin", "organization", "company", "sales_manager"].includes(r));
      if (!allowed) {
        return j({
          error: "Недостаточно прав. Требуется роль организации, компании или администратора.",
        }, 403);
      }

      const { data: cp } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      callerProfile = cp;

      if (!cp && !callerRoles.includes("admin")) {
        return j({
          error: "Ваша сессия устарела. Пожалуйста, выйдите и войдите снова.",
          code: "PROFILE_NOT_FOUND",
        }, 401);
      }
    }

    // ── Field-level validation ──
    const missing: string[] = [];
    if (!full_name || typeof full_name !== "string" || !full_name.trim()) missing.push("ФИО");
    if (!publicRegistration && !callerRoles.includes("company") && !organization_id) missing.push("Организация");
    if (missing.length > 0) {
      return j({ error: `Не заполнены обязательные поля: ${missing.join(", ")}` }, 400);
    }

    // Determine effective org/company based on caller role / registration token
    let effectiveOrgId: string | null = publicRegistration ? effectiveOrgIdFromToken : (organization_id ?? null);
    let effectiveCompanyId: string | null = publicRegistration ? effectiveCompanyIdFromToken : (company_id ?? null);

    if (!publicRegistration) {
      if (callerRoles.includes("company") && !callerRoles.includes("admin")) {
        // Company user: derive org from companies.user_id = auth.uid()
        const { data: companyData } = await supabaseAdmin
          .from("companies")
          .select("id, organization_id, user_id")
          .eq("user_id", callerUserId!)
          .maybeSingle();
        if (!companyData) {
          return j({ error: "Компания не найдена для текущего пользователя" }, 403);
        }
        // If client also sent an org, enforce that it matches.
        if (effectiveOrgId && effectiveOrgId !== companyData.organization_id) {
          return j({ error: "Вы можете добавлять сотрудников только в свою организацию" }, 403);
        }
        effectiveOrgId = companyData.organization_id;
        effectiveCompanyId = companyData.id;
      } else if (
        !callerRoles.includes("admin") &&
        callerProfile?.organization_id !== effectiveOrgId
      ) {
        return j({ error: "Вы можете создавать учеников только в своей организации" }, 403);
      }

      // Staff without students.write is refused via server capacity RPC ACL
      // when we call get_organization_student_capacity below, but we also
      // do an explicit permission check for owner/staff to give a clearer
      // 403 before we touch auth.users.
      if (
        !callerRoles.includes("admin") &&
        !callerRoles.includes("company") &&
        effectiveOrgId
      ) {
        // Owner is fine; only tighten for staff.
        const { data: staffRow } = await supabaseAdmin
          .from("org_staff")
          .select("user_id, expires_at")
          .eq("user_id", callerUserId!)
          .eq("organization_id", effectiveOrgId)
          .maybeSingle();
        if (staffRow) {
          if (staffRow.expires_at && new Date(staffRow.expires_at) < new Date()) {
            return j({ error: "Срок ваших прав в организации истёк." }, 403);
          }
          const { data: canWrite } = await supabaseAdmin.rpc("has_org_staff_permission", {
            _user_id: callerUserId!,
            _organization_id: effectiveOrgId,
            _permission: "students.write",
          });
          if (!canWrite) {
            return j({ error: "Недостаточно прав для добавления учеников." }, 403);
          }
        }
      }
    }

    const effectiveCourseId = publicRegistration ? effectiveCourseIdFromToken : (course_id ?? null);
    const effectiveStudentGroupId = publicRegistration ? effectiveGroupIdFromToken : (student_group_id ?? null);

    if (!effectiveOrgId) {
      return j({ error: "Не удалось определить организацию для ученика" }, 400);
    }

    const groupRejection = await preflightRegistrationStudentGroup(
      async (table, id) => {
        const { data, error } = await supabaseAdmin.from(table)
          .select(table === "student_groups" ? "id, organization_id, course_id" : "id, organization_id")
          .eq("id", id).maybeSingle();
        return { data: data as unknown, error };
      },
      effectiveOrgId, effectiveStudentGroupId,
    );
    if (groupRejection) {
      return j({ error: groupRejection.error, code: groupRejection.code }, groupRejection.status);
    }

    if (effectiveCourseId) {
      const { data: effectiveCourse, error: coursePreflightError } = await supabaseAdmin
        .from("courses")
        .select("id, organization_id")
        .eq("id", effectiveCourseId)
        .maybeSingle();

      if (coursePreflightError) {
        console.error("[register-student] course preflight failed:", coursePreflightError);
        return j({
          error: "Не удалось проверить курс для зачисления.",
          code: "COURSE_PREFLIGHT_FAILED",
        }, 500);
      }
      if (!effectiveCourse) {
        return j({
          error: "Курс для зачисления не найден.",
          code: "COURSE_NOT_FOUND",
        }, 404);
      }
      if (effectiveCourse.organization_id !== effectiveOrgId) {
        return j({
          error: "Курс не принадлежит выбранной организации.",
          code: "COURSE_ORGANIZATION_MISMATCH",
        }, 403);
      }
    }

    console.log(`[register-student] ${publicRegistration ? "public" : "auth"} → org ${effectiveOrgId}`);

    // Email format
    if (email) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        return j({ error: `Неверный формат email «${email}». Используйте только латинские буквы.` }, 400);
      }
    }

    // ── Existing-user idempotency (before creating a new auth-user) ──
    // Resolve this before capacity: enrolling an existing student consumes no
    // new-student slot. Ambiguous or failed lookups must never create a duplicate.
    let existingUserId: string | null = null;
    let existingName: string | null = null;
    let existingLogin: string | null = null;
    let existingArchived = false;
    let existingBlocked = false;

    if (email) {
      const { data: existingProfiles, error: existingLookupError } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, login, organization_id, archived_at, blocked_at")
        .eq("email", email)
        .limit(2);

      if (existingLookupError) {
        console.error("[register-student] existing profile lookup failed:", existingLookupError);
        return j({
          error: "Не удалось безопасно проверить существующего ученика.",
          code: "PROFILE_LOOKUP_FAILED",
        }, 500);
      }
      if ((existingProfiles || []).length > 1) {
        return j({
          error: "Найдено несколько профилей с таким email. Обратитесь к администратору СИНТАГМЫ.",
          code: "EMAIL_PROFILE_AMBIGUOUS",
        }, 409);
      }

      const existing = existingProfiles?.[0] || null;
      if (existing) {
        if (existing.organization_id !== effectiveOrgId) {
          return j({
            error: "Пользователь с таким email уже привязан к другой организации.",
            code: "PROFILE_IN_OTHER_ORG",
          }, 409);
        }

        const { data: isStudentProfile, error: studentProfileError } = await supabaseAdmin.rpc(
          "is_student_profile",
          { _target_user_id: existing.user_id, _org_id: effectiveOrgId },
        );
        if (studentProfileError) {
          console.error("[register-student] student profile check failed:", studentProfileError);
          return j({
            error: "Не удалось проверить тип существующего профиля.",
            code: "PROFILE_TYPE_CHECK_FAILED",
          }, 500);
        }
        if (isStudentProfile !== true) {
          return j({
            error: "Пользователь с таким email является сотрудником или администратором и не может быть зачислен как ученик.",
            code: "PROFILE_NOT_STUDENT",
          }, 409);
        }

        const { data: existingAuth, error: existingAuthError } =
          await supabaseAdmin.auth.admin.getUserById(existing.user_id);
        if (existingAuthError || !existingAuth?.user) {
          console.error("[register-student] existing profile has no auth user:", existingAuthError);
          return j({
            error: "Профиль ученика найден, но его учётная запись повреждена. Обратитесь к администратору СИНТАГМЫ.",
            code: "PROFILE_AUTH_MISSING",
          }, 409);
        }

        existingUserId = existing.user_id;
        existingName = existing.full_name || full_name;
        existingLogin = existing.login;
        existingArchived = !!existing.archived_at;
        existingBlocked = !!existing.blocked_at;
      }
    }

    if (existingArchived) {
      return j({
        error: "Ученик находится в архиве. Восстановите его из архива, чтобы продолжить.",
        code: "STUDENT_ARCHIVED",
      }, 409);
    }
    if (existingBlocked) {
      return j({
        error: "Учётная запись ученика заблокирована. Сначала разблокируйте её.",
        code: "STUDENT_BLOCKED",
      }, 409);
    }

    // Informational preflight only for a genuinely new student. The database
    // RPC below remains the atomic source of truth under concurrency.
    if (!existingUserId) {
      const { data: capacityRow, error: capacityError } = await supabaseAdmin.rpc(
        "get_organization_student_capacity",
        { p_organization_id: effectiveOrgId, p_requested_count: 1 },
      );
      if (capacityError) {
        console.error("[register-student] capacity lookup error:", capacityError);
        return j({ error: "Не удалось проверить вместимость организации." }, 500);
      }
      const capacity = Array.isArray(capacityRow) ? capacityRow[0] : capacityRow;
      if (capacity && !capacity.is_unlimited && !capacity.can_add) {
        return j({
          error: `Достигнут лимит учеников: ${capacity.current_students} из ${capacity.max_students}`,
          code: "STUDENT_LIMIT_EXCEEDED",
          current_students: capacity.current_students,
          max_students: capacity.max_students,
          is_unlimited: false,
          limit_source: capacity.limit_source,
        }, 409);
      }
    }

    let userId: string = existingUserId ?? "";
    let isExisting = !!existingUserId;
    const createdAuthUserThisAttempt = !existingUserId;
    let generatedLogin = existingLogin ?? "";
    let generatedPassword = "";

    const generateLogin = async (): Promise<string> => {
      for (let i = 0; i < 6; i++) {
        const login = `student_${Math.floor(10000 + Math.random() * 90000)}`;
        const { data } = await supabaseAdmin
          .from("profiles").select("id").eq("login", login).maybeSingle();
        if (!data) return login;
      }
      return `student_${Date.now()}`;
    };
    const generatePassword = (): string => {
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let pwd = "";
      for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
      return pwd;
    };

    if (!isExisting) {
      // Login
      if (custom_login) {
        if (!/^[a-zA-Z0-9._-]+$/.test(custom_login)) {
          return j({ error: "Логин может содержать только латинские буквы, цифры и знаки . _ -" }, 400);
        }
        const { data: taken } = await supabaseAdmin
          .from("profiles").select("id").eq("login", custom_login).maybeSingle();
        if (taken) return j({ error: `Логин "${custom_login}" уже занят. Выберите другой.` }, 400);
        generatedLogin = custom_login;
      } else {
        generatedLogin = await generateLogin();
      }
      generatedPassword = custom_password || password || generatePassword();
      if (generatedPassword.length < 6) {
        return j({ error: "Пароль должен быть не короче 6 символов" }, 400);
      }

      const authEmail = `${generatedLogin}@student.local`;
      try {
        // Do not race the SDK with a local timeout: createUser may commit after
        // the timeout and leave an account the caller was told did not exist.
        const result: any = await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password: generatedPassword,
          email_confirm: true,
          user_metadata: { full_name },
        });
        if (result.error) {
          const msg = String(result.error.message || "");
          let friendly = "Не удалось создать учётную запись: " + msg;
          if (/already been registered|already exists|duplicate/i.test(msg)) {
            friendly = "Ученик с таким логином/email уже существует";
          } else if (/password/i.test(msg)) {
            friendly = "Пароль не соответствует требованиям: " + msg;
          } else if (/email/i.test(msg) && /invalid|not valid/i.test(msg)) {
            friendly = "Некорректный внутренний email для логина. Попробуйте другой логин";
          }
          return j({ error: friendly }, 400);
        }
        if (!result.data?.user?.id) {
          return j({
            error: "Сервис авторизации не подтвердил создание учётной записи.",
            code: "AUTH_USER_NOT_CONFIRMED",
          }, 500);
        }
        userId = result.data.user.id;
      } catch (e) {
        const msg = (e as Error).message;
        return j({ error: "Ошибка создания пользователя: " + msg }, 500);
      }
    }

    // Compensation is allowed only before a profile was successfully claimed.
    // auth.users has no reliable cascade to these application rows, so a bare
    // deleteUser would leave a ghost profile/role behind.
    const compensateUnclaimedAuthUser = async () => {
      if (!createdAuthUserThisAttempt || !userId) {
        return { cleaned: true, profileOrganizationId: null as string | null, error: null as string | null };
      }

      const { data: freshProfile, error: freshProfileError } = await supabaseAdmin
        .from("profiles")
        .select("user_id, organization_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (freshProfileError) {
        console.error("[register-student] rollback profile read failed:", freshProfileError);
        return { cleaned: false, profileOrganizationId: null, error: freshProfileError.message };
      }
      if (freshProfile?.organization_id) {
        return { cleaned: false, profileOrganizationId: freshProfile.organization_id, error: null };
      }

      const { error: profileDeleteError } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("user_id", userId)
        .is("organization_id", null);
      if (profileDeleteError) {
        console.error("[register-student] rollback profile delete failed:", profileDeleteError);
        return { cleaned: false, profileOrganizationId: null, error: profileDeleteError.message };
      }

      const { error: roleDeleteError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "student");
      if (roleDeleteError) {
        console.error("[register-student] rollback role delete failed:", roleDeleteError);
        return { cleaned: false, profileOrganizationId: null, error: roleDeleteError.message };
      }

      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.error("[register-student] rollback auth delete failed:", authDeleteError);
        return { cleaned: false, profileOrganizationId: null, error: authDeleteError.message };
      }
      return { cleaned: true, profileOrganizationId: null, error: null };
    };

    const recoveryRequiredResponse = (code: string, message: string) => j({
      success: false,
      partial_success: true,
      profile_persisted: null,
      enrollment_confirmed: false,
      recovery_required: true,
      created_auth_user: createdAuthUserThisAttempt,
      user_id: userId || undefined,
      login: generatedLogin || undefined,
      password: publicRegistration ? undefined : (generatedPassword || undefined),
      code,
      error: message,
      message,
    });

    // ── Atomic capacity claim + profile / role write ──
    const { data: claimRes, error: claimError } = await supabaseAdmin.rpc(
      "create_student_profile_with_capacity",
      {
        p_organization_id: effectiveOrgId,
        p_user_id: userId,
        p_full_name: full_name,
        p_email: email || null,
        p_login: generatedLogin || null,
        p_generated_password: generatedPassword || null,
        p_company_id: effectiveCompanyId || null,
        p_student_group_id: effectiveStudentGroupId || null,
        p_region: region ? String(region).trim() : null,
      },
    );

    let claim: any = claimRes;
    if (claimError || !claim) {
      console.error("[register-student] claim error:", claimError);
      if (createdAuthUserThisAttempt) {
        // The transport result is ambiguous: the database transaction may
        // still be finishing. A positive same-tenant read-back proves commit;
        // an empty/error read-back does NOT prove rollback, so never delete.
        const { data: claimedProfile, error: claimedProfileReadError } = await supabaseAdmin
          .from("profiles")
          .select("user_id, organization_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!claimedProfileReadError && claimedProfile?.organization_id === effectiveOrgId) {
          // The response was lost after commit; a same-tenant read-back proves
          // the profile claim and it is safer to continue to enrollment.
          claim = { success: true, is_existing: false };
        } else {
          console.error("[register-student] claim result remains ambiguous:", claimedProfileReadError);
          return recoveryRequiredResponse(
            "CLAIM_RESULT_UNKNOWN",
            "Учётная запись могла быть создана, но завершение регистрации не подтверждено. Не создавайте дубль и обратитесь к администратору СИНТАГМЫ.",
          );
        }
      }
      if (!claim) {
        return j({ error: "Не удалось создать профиль: " + (claimError?.message || "unknown") }, 500);
      }
    }

    if (!claim.success) {
      if (createdAuthUserThisAttempt) {
        const compensation = await compensateUnclaimedAuthUser();
        if (compensation.profileOrganizationId === effectiveOrgId) {
          claim = { ...claim, success: true, is_existing: false };
        } else if (!compensation.cleaned) {
          return recoveryRequiredResponse(
            "ROLLBACK_INCOMPLETE",
            "Регистрация отклонена, но автоматическая очистка завершилась не полностью. Не создавайте дубль и обратитесь к администратору СИНТАГМЫ.",
          );
        }
      }
      if (!claim.success) {
        const code = claim.code || "REGISTRATION_FAILED";
        return j({
          error: claim.message || "Регистрация отклонена",
          code,
          current_students: claim.current_students,
          max_students: claim.max_students,
          is_unlimited: claim.is_unlimited,
          limit_source: claim.limit_source,
        }, 409);
      }
    }

    isExisting = !!claim.is_existing;

    let enrollmentCreated = false;
    let alreadyEnrolled = false;
    let enrollmentConfirmed = false;
    let profilePersisted: boolean | null = effectiveStudentGroupId ? null : true;
    let groupConfirmed: boolean | null = effectiveStudentGroupId ? false : null;
    let groupCourseId: string | null = null;
    let groupEnrollmentConfirmed: boolean | null = effectiveStudentGroupId ? false : null;

    const enrollmentFailureResponse = (code: string, message: string, status: number) => {
      if (!createdAuthUserThisAttempt && !effectiveStudentGroupId) {
        return j({ error: message, code }, status);
      }
      // The student profile is already committed and must remain usable. Return
      // HTTP 200 so the frontend receives the structured partial state instead
      // of losing it inside FunctionsHttpError.
      return j({
        success: false,
        partial_success: true,
        student_created: createdAuthUserThisAttempt,
        profile_persisted: profilePersisted,
        enrollment_confirmed: enrollmentConfirmed,
        group_confirmed: groupConfirmed,
        group_course_id: groupCourseId,
        group_enrollment_confirmed: groupEnrollmentConfirmed,
        created_auth_user: createdAuthUserThisAttempt,
        user_id: userId,
        is_existing: isExisting,
        enrollment_created: enrollmentCreated,
        already_enrolled: alreadyEnrolled,
        login: generatedLogin || undefined,
        password: publicRegistration ? undefined : (generatedPassword || undefined),
        code,
        error: message,
        message,
      });
    };

    if (effectiveStudentGroupId) {
      // A successful RPC (including a reconciled lost response) is not proof
      // that the requested group was saved, or that its course is unchanged.
      try {
        const { data: savedProfile, error: profileReadError } = await supabaseAdmin
          .from("profiles")
          .select("user_id, organization_id, student_group_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!profileReadError) {
          profilePersisted = savedProfile?.user_id === userId
            && savedProfile.organization_id === effectiveOrgId;
        }
        if (profileReadError || !profilePersisted
          || typeof savedProfile?.student_group_id !== "string"
          || savedProfile.student_group_id.toLowerCase() !== String(effectiveStudentGroupId).toLowerCase()) {
          return enrollmentFailureResponse(
            "STUDENT_GROUP_NOT_CONFIRMED",
            profilePersisted
              ? "Профиль ученика сохранён, но выбранная группа не подтверждена. Проверьте карточку ученика; не создавайте его повторно."
              : "Не удалось подтвердить профиль ученика и выбранную группу после регистрации. Проверьте учётную запись; не создавайте ученика повторно.",
            409,
          );
        }

        let savedGroupCourseId: string | null = null;
        const savedGroupRejection = await preflightRegistrationStudentGroup(
          async (table, id) => {
            const { data, error } = await supabaseAdmin.from(table)
              .select(table === "student_groups" ? "id, organization_id, course_id" : "id, organization_id")
              .eq("id", id).maybeSingle();
            if (table === "student_groups") {
              // The guard validates these unknown facts before we use them.
              const groupFacts = data as unknown as { course_id: string | null } | null;
              savedGroupCourseId = groupFacts?.course_id ?? null;
            }
            return { data: data as unknown, error };
          },
          effectiveOrgId, savedProfile.student_group_id,
        );
        if (savedGroupRejection) {
          return enrollmentFailureResponse(savedGroupRejection.code, savedGroupRejection.error, savedGroupRejection.status);
        }
        groupConfirmed = true;
        groupCourseId = savedGroupCourseId;
        groupEnrollmentConfirmed = groupCourseId ? false : null;
      } catch (groupReadError) {
        console.error("[register-student] saved group verification failed:", groupReadError);
        return enrollmentFailureResponse(
          "STUDENT_GROUP_NOT_CONFIRMED",
          profilePersisted
            ? "Профиль ученика сохранён, но не удалось проверить его группу. Проверьте карточку ученика; не создавайте его повторно."
            : "Не удалось прочитать профиль ученика и проверить его группу после регистрации. Проверьте учётную запись; не создавайте ученика повторно.",
          500,
        );
      }
    }

    // Best-effort FRDO stub (non-fatal)
    if (!isExisting) {
      try {
        const nameParts = String(full_name).trim().split(/\s+/);
        const lastName = nameParts[0] || "";
        const firstName = nameParts[1] || "";
        const middleName = nameParts[2] || "";
        let detectedGender: string | null = null;
        if (middleName) {
          const mn = middleName.toLowerCase();
          if (mn.endsWith("ич") || mn.endsWith("ыч")) detectedGender = "Муж";
          else if (mn.endsWith("на")) detectedGender = "Жен";
        }
        await supabaseAdmin
          .from("student_frdo_data")
          .upsert({
            user_id: userId,
            organization_id: effectiveOrgId,
            last_name: lastName,
            first_name: firstName,
            middle_name: middleName,
            gender: detectedGender,
          }, { onConflict: "user_id,organization_id" });
      } catch (frdoErr) {
        console.error("[register-student] FRDO stub error (non-fatal):", frdoErr);
      }
    }

    // ── Enrollment (idempotent) ──
    const primaryCourseId = effectiveCourseId || groupCourseId;
    const requiredCourseIds = [...new Set([groupCourseId, effectiveCourseId].filter(Boolean))] as string[];
    for (const requiredCourseId of requiredCourseIds) {
      const isGroupCourse = requiredCourseId === groupCourseId;
      const requiresCurrentAccess = !!effectiveStudentGroupId || (
        enrollment_request_source === "organization_add_student" && !publicRegistration
      );
      let courseEnrollmentCreated = false;
      let courseAlreadyEnrolled = false;
      try {
        const { data: existingEnrollment, error: existingEnrollmentError } =
          await supabaseAdmin
            .from("enrollments")
            .select("id, user_id, course_id, status, expires_at")
            .eq("user_id", userId)
            .eq("course_id", requiredCourseId)
            .maybeSingle();

        if (existingEnrollmentError) {
          console.error(
            "[register-student] enrollment preflight failed:",
            existingEnrollmentError,
          );
          return enrollmentFailureResponse(
            "ENROLLMENT_PREFLIGHT_FAILED",
            createdAuthUserThisAttempt
              ? "Ученик сохранён, но база не подтвердила зачисление на курс. Откройте его карточку и повторите зачисление."
              : "Ученик найден, но не удалось проверить его зачисление. Повторите операцию.",
            500,
          );
        } else if (existingEnrollment && (
          !existingEnrollment.id || existingEnrollment.user_id !== userId
          || existingEnrollment.course_id !== requiredCourseId
        )) {
          return enrollmentFailureResponse(
            "ENROLLMENT_NOT_CONFIRMED",
            "Профиль ученика сохранён, но база не подтвердила зачисление на нужный курс. Проверьте карточку ученика.",
            409,
          );
        } else if (
          existingEnrollment
          && requiresCurrentAccess
          && isEnrollmentAccessExpired(existingEnrollment)
        ) {
          return enrollmentFailureResponse(
            "ENROLLMENT_ACCESS_EXPIRED",
            "Ученик уже был зачислен на этот курс, но срок доступа истёк. Измените срок доступа в карточке ученика.",
            409,
          );
        } else if (existingEnrollment) {
          courseAlreadyEnrolled = true;
        } else {
          const { data: insertedEnrollment, error: enrollError } =
            await supabaseAdmin
              .from("enrollments")
              .insert({
                user_id: userId,
                course_id: requiredCourseId,
                status: "active",
                progress: 0,
              })
              .select("id, user_id, course_id")
              .maybeSingle();

          if (enrollError?.code === "23505") {
            // A concurrent request may have won the unique(user_id, course_id)
            // race. Treat it as idempotent only after an exact read-back.
            const { data: concurrentEnrollment, error: concurrentReadError } =
              await supabaseAdmin
                .from("enrollments")
                .select("id, user_id, course_id, status, expires_at")
                .eq("user_id", userId)
                .eq("course_id", requiredCourseId)
                .maybeSingle();

            if (
              concurrentReadError
              || !concurrentEnrollment?.id
              || concurrentEnrollment.user_id !== userId
              || concurrentEnrollment.course_id !== requiredCourseId
            ) {
              console.error(
                "[register-student] duplicate enrollment was not readable:",
                {
                  enrollError,
                  concurrentReadError,
                  concurrentEnrollment,
                },
              );
              return enrollmentFailureResponse(
                "ENROLLMENT_NOT_CONFIRMED",
                "База сообщила о существующем зачислении, но не подтвердила его чтением. Обновите карточку ученика и повторите операцию.",
                409,
              );
            }

            if (
              requiresCurrentAccess
              && isEnrollmentAccessExpired(concurrentEnrollment)
            ) {
              return enrollmentFailureResponse(
                "ENROLLMENT_ACCESS_EXPIRED",
                "Ученик уже был зачислен на этот курс, но срок доступа истёк. Измените срок доступа в карточке ученика.",
                409,
              );
            }

            courseAlreadyEnrolled = true;
          } else {
            let verifiedEnrollment: { id: string; user_id: string; course_id: string; status: string | null; expires_at: string | null } | null = null;
            let verifyError: any = null;

            if (!enrollError && insertedEnrollment?.id) {
              const verifyResult = await supabaseAdmin
                .from("enrollments")
                .select("id, user_id, course_id, status, expires_at")
                .eq("id", insertedEnrollment.id)
                .eq("user_id", userId)
                .eq("course_id", requiredCourseId)
                .maybeSingle();

              verifiedEnrollment = verifyResult.data;
              verifyError = verifyResult.error;
            }

            if (
              enrollError
              || verifyError
              || !insertedEnrollment?.id
              || !verifiedEnrollment?.id
              || verifiedEnrollment.id !== insertedEnrollment.id
              || verifiedEnrollment.user_id !== userId
              || verifiedEnrollment.course_id !== requiredCourseId
            ) {
              console.error(
                "[register-student] enrollment was not confirmed:",
                {
                  enrollError,
                  verifyError,
                  insertedId: insertedEnrollment?.id || null,
                  verifiedId: verifiedEnrollment?.id || null,
                },
              );
              return enrollmentFailureResponse(
                "ENROLLMENT_NOT_CONFIRMED",
                createdAuthUserThisAttempt
                  ? "Ученик сохранён, но база не подтвердила зачисление на курс. Откройте его карточку и повторите зачисление."
                  : "Ученик найден, но база не подтвердила зачисление на курс. Повторите операцию.",
                409,
              );
            }

            if (requiresCurrentAccess && isEnrollmentAccessExpired(verifiedEnrollment)) {
              return enrollmentFailureResponse(
                "ENROLLMENT_ACCESS_EXPIRED",
                "Зачисление найдено, но срок доступа к курсу истёк. Измените срок доступа в карточке ученика.",
                409,
              );
            }
            courseEnrollmentCreated = true;
          }
        }
      } catch (enrollmentError) {
        // A thrown/lost write response is uncertain, not permission to insert
        // again or recreate the student. Keep the committed profile and secret.
        console.error("[register-student] enrollment confirmation failed:", enrollmentError);
        return enrollmentFailureResponse(
          "ENROLLMENT_NOT_CONFIRMED",
          "Профиль ученика сохранён, но зачисление не подтверждено. Проверьте карточку ученика; не создавайте его повторно.",
          500,
        );
      }
      if (isGroupCourse) groupEnrollmentConfirmed = true;
      if (requiredCourseId === primaryCourseId) {
        enrollmentCreated = courseEnrollmentCreated;
        alreadyEnrolled = courseAlreadyEnrolled;
        enrollmentConfirmed = true;
      }
    }

    // Bump registration link usage
    if (publicRegistration && registration_token) {
      try {
        await supabaseAdmin.rpc("increment_registration_link_usage" as any, {
          p_token: registration_token,
        }).throwOnError();
      } catch {
        const { data: cur } = await supabaseAdmin
          .from("registration_links")
          .select("used_count")
          .eq("token", registration_token)
          .maybeSingle();
        await supabaseAdmin
          .from("registration_links")
          .update({ used_count: Number(cur?.used_count || 0) + 1 })
          .eq("token", registration_token);
      }
    }

    let message: string;
    if (isExisting) {
      const nm = existingName || full_name;
      if (!primaryCourseId) message = `Ученик ${nm} уже существует в системе`;
      else if (enrollmentCreated) message = `Ученик ${nm} зачислен на курс`;
      else if (alreadyEnrolled) message = `Ученик ${nm} уже зачислен на этот курс`;
      else message = `Ученик ${nm} добавлен`;
    } else {
      message = `Ученик ${full_name} добавлен. Логин: ${generatedLogin}, Пароль: ${generatedPassword}`;
    }

    // Never return the existing password on a public branch.
    const returnPassword = publicRegistration || isExisting ? undefined : generatedPassword;

    return j({
      success: true,
      user_id: userId,
      is_existing: isExisting,
      enrollment_created: enrollmentCreated,
      already_enrolled: alreadyEnrolled,
      enrollment_confirmed: primaryCourseId ? enrollmentConfirmed : null,
      group_confirmed: groupConfirmed,
      group_course_id: groupCourseId,
      group_enrollment_confirmed: groupEnrollmentConfirmed,
      login: generatedLogin || undefined,
      password: returnPassword,
      message,
      current_students: claim.current_students,
      max_students: claim.max_students,
      is_unlimited: claim.is_unlimited,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[register-student] fatal:", errorMessage);
    return j({ error: errorMessage }, 500);
  }
});
