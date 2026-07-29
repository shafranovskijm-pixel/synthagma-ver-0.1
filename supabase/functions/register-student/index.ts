// supabase/functions/register-student/index.ts
// Server-canonical student registration.
// - Removes local plan matrix.
// - Uses public.get_organization_student_capacity for read-only preflight
//   and public.create_student_profile_with_capacity for the atomic slot
//   claim under an advisory lock (see phase 5A.2 migration).
// - Multi-role aware caller authorization (no .single() on user_roles).
// - Rolls back the freshly-created auth-user if the profile claim fails.
// - Idempotent for existing active students in the same organization.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    console.log(`[register-student] ${publicRegistration ? "public" : "auth"} → org ${effectiveOrgId}`);

    // Email format
    if (email) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        return j({ error: `Неверный формат email «${email}». Используйте только латинские буквы.` }, 400);
      }
    }

    // ── Preflight capacity read (informational). Atomic enforcement
    //    happens inside create_student_profile_with_capacity below. ──
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

    // ── Existing-user idempotency (before creating a new auth-user) ──
    // Look up by email in the same org first.
    let existingUserId: string | null = null;
    let existingName: string | null = null;
    let existingLogin: string | null = null;
    let existingArchived = false;

    if (email) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, login, organization_id, archived_at")
        .eq("email", email)
        .maybeSingle();
      if (existing) {
        if (existing.organization_id !== effectiveOrgId) {
          return j({
            error: "Пользователь с таким email уже привязан к другой организации.",
            code: "PROFILE_IN_OTHER_ORG",
          }, 409);
        }
        existingUserId = existing.user_id;
        existingName = existing.full_name || full_name;
        existingLogin = existing.login;
        existingArchived = !!existing.archived_at;
      }
    }

    if (existingArchived) {
      return j({
        error: "Ученик находится в архиве. Восстановите его из архива, чтобы продолжить.",
        code: "STUDENT_ARCHIVED",
      }, 409);
    }

    let userId: string = existingUserId ?? "";
    let isExisting = !!existingUserId;
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
      const createUserPromise = supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 20000)
      );

      let authData: any;
      try {
        const result: any = await Promise.race([createUserPromise, timeoutPromise]);
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
        authData = result.data;
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === "AUTH_TIMEOUT") return j({ error: "Сервис авторизации не отвечает. Попробуйте через минуту." }, 504);
        return j({ error: "Ошибка создания пользователя: " + msg }, 500);
      }

      userId = authData.user.id;
    }

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

    if (claimError || !claimRes) {
      console.error("[register-student] claim error:", claimError);
      // Rollback: only delete the auth-user we just created.
      if (!isExisting && userId) {
        try { await supabaseAdmin.auth.admin.deleteUser(userId); } catch {}
      }
      return j({ error: "Не удалось создать профиль: " + (claimError?.message || "unknown") }, 500);
    }

    const claim: any = claimRes;
    if (!claim.success) {
      // Rollback the auth-user if we created one in this attempt.
      if (!isExisting && userId) {
        try { await supabaseAdmin.auth.admin.deleteUser(userId); } catch {}
      }
      const code = claim.code || "REGISTRATION_FAILED";
      const status = code === "STUDENT_LIMIT_EXCEEDED" ? 409 : 409;
      return j({
        error: claim.message || "Регистрация отклонена",
        code,
        current_students: claim.current_students,
        max_students: claim.max_students,
        is_unlimited: claim.is_unlimited,
        limit_source: claim.limit_source,
      }, status);
    }

    isExisting = !!claim.is_existing;

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
    let enrollmentCreated = false;
    let alreadyEnrolled = false;
    if (effectiveCourseId) {
      const { data: existingEnrollment } = await supabaseAdmin
        .from("enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", effectiveCourseId)
        .maybeSingle();
      if (existingEnrollment) {
        alreadyEnrolled = true;
      } else {
        const { error: enrollError } = await supabaseAdmin
          .from("enrollments")
          .insert({ user_id: userId, course_id: effectiveCourseId, status: "active", progress: 0 });
        if (!enrollError) enrollmentCreated = true;
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
      if (!effectiveCourseId) message = `Ученик ${nm} уже существует в системе`;
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
