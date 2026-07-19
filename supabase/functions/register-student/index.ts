import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Некорректный запрос: не удалось прочитать данные формы" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      email, password, full_name, organization_id, course_id, company_id,
      custom_login, custom_password, student_group_id, registration_token,
    } = payload || {};

    // ── Public branch: registration by link token (no session required) ──
    let publicRegistration = false;
    let effectiveOrgIdFromToken: string | null = null;
    let effectiveCompanyIdFromToken: string | null = null;
    let effectiveCourseIdFromToken: string | null = null;
    let effectiveGroupIdFromToken: string | null = null;
    let roleData: { role: string } = { role: "organization" }; // synthetic role for downstream checks
    let callerProfile: any = null;

    if (registration_token) {
      const { data: link, error: linkError } = await supabaseAdmin
        .from("registration_links")
        .select("id, organization_id, company_id, course_id, student_group_id, used_count, expires_at, max_uses")
        .eq("token", registration_token)
        .maybeSingle();

      if (linkError || !link) {
        return new Response(
          JSON.stringify({ error: "Ссылка регистрации не найдена или срок её действия истёк." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if ((link as any).expires_at && new Date((link as any).expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "Срок действия ссылки регистрации истёк." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const maxUses = (link as any).max_uses;
      if (maxUses != null && Number(link.used_count || 0) >= Number(maxUses)) {
        return new Response(
          JSON.stringify({ error: "Лимит использований ссылки исчерпан. Попросите новую ссылку." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      publicRegistration = true;
      effectiveOrgIdFromToken = link.organization_id;
      effectiveCompanyIdFromToken = (link as any).company_id || null;
      effectiveCourseIdFromToken = (link as any).course_id || null;
      effectiveGroupIdFromToken = (link as any).student_group_id || null;
      console.log(`[register-student] public token registration → org ${effectiveOrgIdFromToken}`);
    } else {
      // ── Authenticated branch: existing behaviour ──
      const authHeader = req.headers.get('authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Ссылка регистрации недействительна или сессия устарела. Войдите заново или используйте новую ссылку." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: rd } = await supabaseAuth
        .from('user_roles').select('role').eq('user_id', user.id).single();
      if (!rd || !['organization', 'admin', 'company'].includes(rd.role)) {
        return new Response(
          JSON.stringify({ error: "Недостаточно прав. Требуется роль организации, компании или администратора." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      roleData = rd;

      const { data: cp } = await supabaseAdmin
        .from('profiles').select('organization_id').eq('user_id', user.id).maybeSingle();
      callerProfile = cp;
      console.log(`Caller profile lookup for user ${user.id}:`, cp);

      if (!cp && rd.role !== 'admin') {
        return new Response(
          JSON.stringify({
            error: "Ваша сессия устарела. Пожалуйста, выйдите и войдите снова.",
            code: "PROFILE_NOT_FOUND"
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[register-student] request:`, {
      hasFullName: !!full_name,
      hasEmail: !!email,
      hasOrg: !!organization_id,
      hasCustomLogin: !!custom_login,
      hasCustomPassword: !!custom_password,
      callerRole: roleData.role,
      publicRegistration,
    });

    // ── Field-level validation ──
    const missing: string[] = [];
    if (!full_name || typeof full_name !== "string" || !full_name.trim()) missing.push("ФИО");
    if (!publicRegistration && roleData.role !== "company" && !organization_id) missing.push("Организация");
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Не заполнены обязательные поля: ${missing.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine effective org/company based on caller role / registration token
    let effectiveOrgId = publicRegistration ? effectiveOrgIdFromToken : organization_id;
    let effectiveCompanyId = publicRegistration ? effectiveCompanyIdFromToken : company_id;

    if (!publicRegistration) {
      if (roleData.role === 'company') {
        const { data: { user } } = await createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { global: { headers: { Authorization: req.headers.get('authorization') || "" } } }
        ).auth.getUser();
        const { data: companyData } = await supabaseAdmin
          .from('companies')
          .select('id, organization_id')
          .eq('user_id', user!.id)
          .single();
        if (!companyData) {
          return new Response(
            JSON.stringify({ error: "Компания не найдена для текущего пользователя" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        effectiveOrgId = companyData.organization_id;
        effectiveCompanyId = companyData.id;
      } else if (roleData.role !== 'admin' && callerProfile?.organization_id !== effectiveOrgId) {
        return new Response(
          JSON.stringify({ error: "Вы можете создавать учеников только в своей организации" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // For public registration, always take course/group from the token, not the client
    const effectiveCourseId = publicRegistration ? effectiveCourseIdFromToken : course_id;
    const effectiveStudentGroupId = publicRegistration ? effectiveGroupIdFromToken : student_group_id;

    if (!effectiveOrgId) {
      return new Response(
        JSON.stringify({ error: "Не удалось определить организацию для ученика" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[register-student] Registering student: ${full_name} (${email || 'no email'}) → org ${effectiveOrgId}`);

    // ── Student limit check ──
    const planLimits: Record<string, number> = {
      free: 10, start: 100, standard: 200, professional: 1000, maximum: -1
    };

    const { data: orgData, error: orgLookupError } = await supabaseAdmin
      .from('organizations')
      .select('subscription_plan, custom_max_students')
      .eq('id', effectiveOrgId)
      .maybeSingle();

    if (orgLookupError) {
      console.error("[register-student] Org lookup error:", orgLookupError);
      return new Response(
        JSON.stringify({ error: "Не удалось проверить тариф организации: " + orgLookupError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!orgData) {
      return new Response(
        JSON.stringify({ error: "Организация не найдена" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const plan = orgData?.subscription_plan || 'free';
    const customMax = (orgData as any)?.custom_max_students;
    // Custom override takes precedence over plan default
    const maxStudents = customMax != null ? customMax : (planLimits[plan] ?? 10);

    if (maxStudents !== -1) {
      const { data: countResult, error: countError } = await supabaseAdmin.rpc('count_org_students', { org_id: effectiveOrgId });
      if (countError) {
        console.error("[register-student] count_org_students error:", countError);
        return new Response(
          JSON.stringify({ error: "Не удалось посчитать количество учеников: " + countError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const currentCount = Number(countResult) || 0;

      if (currentCount >= maxStudents) {
        return new Response(
          JSON.stringify({
            error: `Лимит тарифа: максимум ${maxStudents} учеников. Перейдите на следующий тариф.`,
            code: "STUDENT_LIMIT_EXCEEDED"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (email) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: `Неверный формат email «${email}». Используйте только латинские буквы.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }


    let userId: string = "";
    let isExisting = false;
    let existingName = "";
    let generatedLogin = "";
    let generatedPassword = "";

    const generateLogin = async (): Promise<string> => {
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      const login = `student_${randomNum}`;
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("login", login)
        .maybeSingle();
      if (existing) {
        return generateLogin();
      }
      return login;
    };

    const generatePassword = (): string => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let pwd = '';
      for (let i = 0; i < 10; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return pwd;
    };

    const createFrdoData = async (uid: string) => {
      const nameParts = full_name.trim().split(/\s+/);
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
          user_id: uid,
          organization_id: effectiveOrgId,
          last_name: lastName,
          first_name: firstName,
          middle_name: middleName,
          gender: detectedGender,
        }, { onConflict: "user_id,organization_id" });
    };

    if (!isExisting) {
      // Use custom login if provided, otherwise generate one
      if (custom_login) {
        // Only ASCII letters, digits, dot, underscore, hyphen — needed for auth email
        if (!/^[a-zA-Z0-9._-]+$/.test(custom_login)) {
          return new Response(
            JSON.stringify({ error: `Логин может содержать только латинские буквы, цифры и знаки . _ -` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Check uniqueness of custom login
        const { data: existingLogin } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("login", custom_login)
          .maybeSingle();
        if (existingLogin) {
          return new Response(
            JSON.stringify({ error: `Логин "${custom_login}" уже занят. Выберите другой.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        generatedLogin = custom_login;
      } else {
        generatedLogin = await generateLogin();
      }
      generatedPassword = custom_password || password || generatePassword();
      if (generatedPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: `Пароль должен быть не короче 6 символов` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const authEmail = `${generatedLogin}@student.local`;

      console.log(`[register-student] creating auth user for login=${generatedLogin}`);
      const createUserPromise = supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name }
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 20000)
      );

      let authData: any;
      try {
        const result: any = await Promise.race([createUserPromise, timeoutPromise]);
        if (result.error) {
          console.error("[register-student] Auth error:", result.error);
          const msg = String(result.error.message || "");
          let friendly = "Не удалось создать учётную запись: " + msg;
          if (/already been registered|already exists|duplicate/i.test(msg)) {
            friendly = "Ученик с таким логином/email уже существует";
          } else if (/password/i.test(msg)) {
            friendly = "Пароль не соответствует требованиям: " + msg;
          } else if (/email/i.test(msg) && /invalid|not valid/i.test(msg)) {
            friendly = "Некорректный внутренний email для логина. Попробуйте другой логин";
          }
          return new Response(
            JSON.stringify({ error: friendly }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        authData = result.data;
      } catch (e) {
        const msg = (e as Error).message;
        console.error("[register-student] createUser exception:", msg);
        if (msg === "AUTH_TIMEOUT") {
          return new Response(
            JSON.stringify({ error: "Сервис авторизации не отвечает. Попробуйте через минуту." }),
            { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: "Ошибка создания пользователя: " + msg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = authData.user.id;
      console.log(`[register-student] auth user created id=${userId}`);

      const { error: profileInsertError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          user_id: userId,
          full_name,
          email: email?.toLowerCase() || null,
          login: generatedLogin,
          generated_password: generatedPassword,
          organization_id: effectiveOrgId,
          company_id: effectiveCompanyId || null,
          student_group_id: student_group_id || null
        }, { onConflict: "user_id" });

      if (profileInsertError) {
        console.error("[register-student] Profile error:", profileInsertError);
        // rollback auth user so admin can retry
        try { await supabaseAdmin.auth.admin.deleteUser(userId); } catch { /* ignore */ }
        const pmsg = String(profileInsertError.message || "");
        let friendly = "Ошибка создания профиля: " + pmsg;
        if (/duplicate key.*profiles_email/i.test(pmsg) || /profiles_email_key/i.test(pmsg)) {
          friendly = `Ученик с email «${email}» уже существует в системе`;
        } else if (/duplicate key.*login/i.test(pmsg)) {
          friendly = `Логин «${generatedLogin}» уже занят`;
        }
        return new Response(
          JSON.stringify({ error: friendly }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "student" }, { onConflict: "user_id,role" });
      if (roleInsertError) {
        console.error("[register-student] Role upsert error:", roleInsertError);
      }

      try {
        await createFrdoData(userId);
      } catch (frdoErr) {
        console.error("[register-student] FRDO data error (non-fatal):", frdoErr);
      }

      console.log(`[register-student] Created student: ${full_name}, login: ${generatedLogin}`);
    }


    let enrollmentCreated = false;
    let alreadyEnrolled = false;
    
    if (course_id) {
      const { data: existingEnrollment } = await supabaseAdmin
        .from("enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", course_id)
        .maybeSingle();

      if (existingEnrollment) {
        alreadyEnrolled = true;
      } else {
        const { error: enrollError } = await supabaseAdmin
          .from("enrollments")
          .insert({ user_id: userId, course_id, status: "active", progress: 0 });
        if (enrollError) {
          console.error("Enrollment error:", enrollError);
        } else {
          enrollmentCreated = true;
        }
      }
    }

    let message: string;
    if (!isExisting && generatedLogin) {
      message = `Ученик ${full_name} добавлен. Логин: ${generatedLogin}, Пароль: ${generatedPassword}`;
    } else if (isExisting) {
      if (!course_id) message = `Ученик ${existingName} уже существует в системе`;
      else if (enrollmentCreated) message = `Ученик ${existingName} зачислен на курс`;
      else if (alreadyEnrolled) message = `Ученик ${existingName} уже зачислен на этот курс`;
      else message = `Ученик ${existingName} добавлен`;
    } else {
      message = `Ученик создан`;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId, 
        is_existing: isExisting,
        enrollment_created: enrollmentCreated,
        login: generatedLogin || undefined,
        password: generatedPassword || undefined,
        message 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
