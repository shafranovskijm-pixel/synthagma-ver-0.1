import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client to verify the caller
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user identity
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has organization or admin role
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || (roleData.role !== 'organization' && roleData.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Organization or admin role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client FIRST (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get caller's organization using admin client (bypasses RLS)
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    console.log(`Caller profile lookup for user ${user.id}:`, callerProfile, profileError);

    const { email, password, full_name, organization_id, course_id, company_id, no_login } = await req.json();

    console.log(`Registering student: ${full_name} (${email}) for org: ${organization_id}, no_login: ${no_login}`);

    // SECURITY: Verify the caller has access to the target organization
    if (roleData.role !== 'admin' && callerProfile?.organization_id !== organization_id) {
      return new Response(
        JSON.stringify({ error: "You can only register students in your own organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!full_name || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Заполните все обязательные поля" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format if provided (only ASCII characters allowed)
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

    // Generate unique login
    const generateLogin = async (): Promise<string> => {
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      const login = `student_${randomNum}`;
      
      // Check if login already exists
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("login", login)
        .maybeSingle();
      
      if (existing) {
        return generateLogin(); // Recursively try again
      }
      return login;
    };

    // Generate random password
    const generatePassword = (): string => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let pwd = '';
      for (let i = 0; i < 10; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return pwd;
    };

    // Check if user already exists by email in profiles
    if (email) {
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, organization_id, login")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (existingProfile) {
        // User already exists
        userId = existingProfile.user_id;
        isExisting = true;
        existingName = existingProfile.full_name || full_name;
        generatedLogin = existingProfile.login || "";
        
        // Update org if different
        if (existingProfile.organization_id !== organization_id) {
          await supabaseAdmin
            .from("profiles")
            .update({
              organization_id,
              company_id: company_id || null
            })
            .eq("user_id", userId);
          console.log(`Updated user ${email} to org ${organization_id}`);
        }
      }
    }

    if (!isExisting) {
      // Create new student - ALWAYS use login-based auth email
      generatedLogin = await generateLogin();
      generatedPassword = password || generatePassword();
      
      // Auth email is always login@student.local for consistent login
      const authEmail = `${generatedLogin}@student.local`;
      
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name }
      });

      if (authError) {
        console.error("Auth error:", authError);
        return new Response(
          JSON.stringify({ error: "Ошибка создания пользователя: " + authError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = authData.user.id;
      
      // Create profile with login credentials and optional real email for contact
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          user_id: userId,
          full_name,
          email: email?.toLowerCase() || null, // Real email for contact only
          login: generatedLogin,
          generated_password: generatedPassword,
          organization_id,
          company_id: company_id || null
        }, { onConflict: "user_id" });

      if (profileError) {
        console.error("Profile error:", profileError);
        return new Response(
          JSON.stringify({ error: "Ошибка создания профиля: " + profileError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Assign student role
      await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: userId,
          role: "student"
        });

      console.log(`Created student: ${full_name}, login: ${generatedLogin}`);
    }

    // Enroll in course if specified
    let enrollmentCreated = false;
    let alreadyEnrolled = false;
    
    if (course_id) {
      // Check if already enrolled
      const { data: existingEnrollment } = await supabaseAdmin
        .from("enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", course_id)
        .maybeSingle();

      if (existingEnrollment) {
        console.log(`User already enrolled in course: ${course_id}`);
        alreadyEnrolled = true;
      } else {
        const { error: enrollError } = await supabaseAdmin
          .from("enrollments")
          .insert({
            user_id: userId,
            course_id,
            status: "active",
            progress: 0
          });

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
      if (!course_id) {
        message = `Ученик ${existingName} уже существует в системе`;
      } else if (enrollmentCreated) {
        message = `Ученик ${existingName} зачислен на курс`;
      } else if (alreadyEnrolled) {
        message = `Ученик ${existingName} уже зачислен на этот курс`;
      } else {
        message = `Ученик ${existingName} добавлен`;
      }
    } else {
      message = `Ученик создан`;
    }

    console.log(`Successfully processed student: ${full_name}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId!, 
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
