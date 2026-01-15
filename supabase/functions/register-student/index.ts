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

    const { email, password, full_name, organization_id, course_id, company_id, no_login } = await req.json();

    console.log(`Registering student: ${full_name} (${email}) for org: ${organization_id}, no_login: ${no_login}`);

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
    let isNoLogin = no_login === true;
    let generatedLogin = "";
    let generatedPassword = "";

    // Generate unique login for no-login students
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
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let password = '';
      for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    if (isNoLogin) {
      // Create student with auto-generated login (allows duplicate emails)
      userId = crypto.randomUUID();
      generatedLogin = await generateLogin();
      generatedPassword = generatePassword();
      
      // Create auth user with generated email
      const fakeEmail = `${generatedLogin}@student.local`;
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: fakeEmail,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name, is_login_user: true }
      });

      if (authError) {
        console.error("Auth error for login user:", authError);
        return new Response(
          JSON.stringify({ error: "Ошибка создания пользователя: " + authError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = authData.user.id;
      
      // Create/update profile with login and password (upsert to handle existing profiles from trigger)
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          user_id: userId,
          full_name,
          email: email?.toLowerCase() || null,
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

      console.log(`Created login-based student: ${full_name}, login: ${generatedLogin}`);
    } else {
      // Check if user already exists by email in profiles
      if (email) {
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("user_id, full_name, organization_id")
          .eq("email", email.toLowerCase())
          .maybeSingle();

        if (existingProfile) {
          // User already exists - use existing user and update their org if needed
          userId = existingProfile.user_id;
          isExisting = true;
          existingName = existingProfile.full_name || full_name;
          
          // If user is in a different org, update to current org
          if (existingProfile.organization_id !== organization_id) {
            const { error: updateError } = await supabaseAdmin
              .from("profiles")
              .update({
                organization_id,
                company_id: company_id || null
              })
              .eq("user_id", userId);
            
            if (updateError) {
              console.error("Profile update error:", updateError);
            } else {
              console.log(`Updated user ${email} to org ${organization_id}`);
            }
          } else {
            console.log(`User already exists in this org: ${email}`);
          }
        } else {
          // Check if user exists in auth but not in profiles
          const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
          const existingAuthUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
          
          if (existingAuthUser) {
            // User exists in auth but not in profiles - create profile
            userId = existingAuthUser.id;
            isExisting = true;
            existingName = (existingAuthUser.user_metadata?.full_name as string) || full_name;
            
            // Generate login for credential storage
            const loginForStorage = await generateLogin();
            
            // Create profile for existing auth user
            const { error: profileError } = await supabaseAdmin
              .from("profiles")
              .insert({
                user_id: userId,
                full_name: existingName,
                email: email.toLowerCase(),
                organization_id,
                company_id: company_id || null,
                login: loginForStorage,
                generated_password: password || null
              });

            if (profileError) {
              console.error("Profile creation error for existing auth user:", profileError);
            } else {
              console.log(`Created profile for existing auth user: ${email}`);
            }

            // Assign student role if not exists
            await supabaseAdmin
              .from("user_roles")
              .upsert({
                user_id: userId,
                role: "student"
              }, { onConflict: "user_id" });
          }
        }
      }

      if (!isExisting) {
        // Create new user with auth
        if (!password) {
          return new Response(
            JSON.stringify({ error: "Пароль обязателен для ученика с доступом в систему" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!email) {
          return new Response(
            JSON.stringify({ error: "Email обязателен для ученика с доступом в систему" }),
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

        // Generate login for credential storage
        const loginForStorage = await generateLogin();
        
        // Upsert profile (trigger may have already created one)
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .upsert({
            user_id: userId,
            full_name,
            email: email.toLowerCase(),
            organization_id,
            company_id: company_id || null,
            login: loginForStorage,
            generated_password: password
          }, { onConflict: "user_id" });

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
    if (isNoLogin) {
      message = course_id 
        ? `Ученик ${full_name} добавлен. Логин: ${generatedLogin}, Пароль: ${generatedPassword}`
        : `Ученик ${full_name} добавлен. Логин: ${generatedLogin}, Пароль: ${generatedPassword}`;
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
        is_no_login: isNoLogin,
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
