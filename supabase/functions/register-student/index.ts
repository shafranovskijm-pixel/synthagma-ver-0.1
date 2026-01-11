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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { email, password, full_name, organization_id, course_id, company_id } = await req.json();

    console.log(`Registering student: ${email} for org: ${organization_id}, company: ${company_id || 'none'}`);

    if (!email || !full_name || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Заполните все обязательные поля" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format (only ASCII characters allowed)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Неверный формат email. Используйте только латинские буквы." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists by email in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name")
      .eq("email", email.toLowerCase())
      .single();

    let userId: string;
    let isExisting = false;
    let existingName = "";

    if (existingProfile) {
      // User already exists - use existing user
      userId = existingProfile.user_id;
      isExisting = true;
      existingName = existingProfile.full_name || full_name;
      console.log(`User already exists: ${email}, enrolling to course`);
    } else {
      // Create new user
      if (!password) {
        return new Response(
          JSON.stringify({ error: "Пароль обязателен для нового ученика" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      });

      if (authError) {
        console.error("Auth error:", authError);
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = authData.user.id;

      // Create profile with company_id if provided
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: userId,
          full_name,
          email: email.toLowerCase(),
          organization_id,
          company_id: company_id || null
        });

      if (profileError) {
        console.error("Profile error:", profileError);
      }

      // Assign student role
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: userId,
          role: "student"
        });

      if (roleError) {
        console.error("Role error:", roleError);
      }
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
        .single();

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
    if (isExisting) {
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

    console.log(`Successfully processed student: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId, 
        is_existing: isExisting,
        enrollment_created: enrollmentCreated,
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
