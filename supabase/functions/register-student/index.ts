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
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || !['organization', 'admin', 'company'].includes(roleData.role)) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Organization, company or admin role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    console.log(`Caller profile lookup for user ${user.id}:`, callerProfile);

    // Admins can work without a profile; other roles require one
    if (!callerProfile && roleData.role !== 'admin') {
      console.error(`Profile not found for user ${user.id}.`);
      return new Response(
        JSON.stringify({ 
          error: "Ваша сессия устарела. Пожалуйста, выйдите и войдите снова.",
          code: "PROFILE_NOT_FOUND"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name, organization_id, course_id, company_id, custom_login, custom_password, student_group_id } = await req.json();

    console.log(`Registering student: ${full_name} (${email}) for org: ${organization_id}`);

    // Determine effective org/company based on caller role
    let effectiveOrgId = organization_id;
    let effectiveCompanyId = company_id;

    if (roleData.role === 'company') {
      const { data: companyData } = await supabaseAdmin
        .from('companies')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single();

      if (!companyData) {
        return new Response(
          JSON.stringify({ error: "Company not found for this user" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      effectiveOrgId = companyData.organization_id;
      effectiveCompanyId = companyData.id;
    } else if (roleData.role !== 'admin' && callerProfile?.organization_id !== effectiveOrgId) {
      return new Response(
        JSON.stringify({ error: "You can only register students in your own organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!full_name || !effectiveOrgId) {
      return new Response(
        JSON.stringify({ error: "Заполните все обязательные поля" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Student limit check ──
    const planLimits: Record<string, number> = {
      free: 10, start: 100, standard: 200, professional: 1000, maximum: -1
    };

    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('subscription_plan, custom_max_students')
      .eq('id', effectiveOrgId)
      .single();

    const plan = orgData?.subscription_plan || 'free';
    const customMax = (orgData as any)?.custom_max_students;
    // Custom override takes precedence over plan default
    const maxStudents = customMax != null ? customMax : (planLimits[plan] ?? 10);

    if (maxStudents !== -1) {
      const { data: countResult } = await supabaseAdmin.rpc('count_org_students', { org_id: effectiveOrgId });
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
          JSON.stringify({ error: "Неверный формат email. Используйте только латинские буквы." }),
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
      const authEmail = `${generatedLogin}@student.local`;
      
      const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name }
      });

      if (createAuthError) {
        console.error("Auth error:", createAuthError);
        return new Response(
          JSON.stringify({ error: "Ошибка создания пользователя: " + createAuthError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = authData.user.id;
      
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
        console.error("Profile error:", profileInsertError);
        return new Response(
          JSON.stringify({ error: "Ошибка создания профиля: " + profileInsertError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "student" });

      await createFrdoData(userId);

      console.log(`Created student: ${full_name}, login: ${generatedLogin}`);
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
