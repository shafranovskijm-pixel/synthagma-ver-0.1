// Sends two login links (auto-login + credentials-prefilled) to the student's email
// via platform SMTP. Caller must be the organization staff (students.manage perm)
// or a global admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://sintagma.com.ru";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: aErr } = await sbAuth.auth.getUser();
    if (aErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load student profile + organization
    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("user_id, full_name, email, login, organization_id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (pErr || !profile?.organization_id) {
      return new Response(JSON.stringify({ error: "Student not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Permission check: admin OR org staff with students.manage
    const { data: isAdmin } = await sb.rpc("has_role", { _role: "admin", _user_id: user.id }).maybeSingle?.() ?? { data: null };
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: hasPerm } = await sb.rpc("has_org_staff_permission", {
        _user_id: user.id,
        _org_id: profile.organization_id,
        _permission: "students.manage",
      });
      allowed = !!hasPerm;
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.email) {
      return new Response(JSON.stringify({ error: "У ученика не указан email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get or create token
    const { data: existing } = await sb
      .from("student_login_tokens")
      .select("token")
      .eq("user_id", user_id)
      .eq("organization_id", profile.organization_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token = existing?.token as string | undefined;
    if (!token) {
      const { data: created, error: cErr } = await sb
        .from("student_login_tokens")
        .insert({
          user_id,
          organization_id: profile.organization_id,
          created_by: user.id,
        })
        .select("token")
        .single();
      if (cErr || !created) {
        return new Response(JSON.stringify({ error: "Failed to create token" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      token = created.token as string;
    }

    // Get decrypted password (if available)
    let password: string | null = null;
    try {
      const { data: pw } = await sb.rpc("get_decrypted_student_password", { p_user_id: user_id });
      if (typeof pw === "string" && pw) password = pw;
    } catch (_) { /* ignore */ }

    const autoUrl = `${BASE_URL}/auto-login?token=${encodeURIComponent(token)}`;
    const credsUrl = profile.login && password
      ? `${BASE_URL}/login?u=${encodeURIComponent(profile.login)}&p=${encodeURIComponent(password)}`
      : null;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#14b8a6 0%,#06b6d4 100%);color:white;padding:30px;text-align:center;">
        <h1 style="margin:0;font-size:24px;">Ссылка для входа</h1>
      </div>
      <div style="padding:30px;color:#333;">
        <p>Здравствуйте${profile.full_name ? `, ${profile.full_name}` : ""}!</p>
        <p>Для входа в кабинет ученика нажмите на кнопку ниже. Ссылка работает без ввода логина и пароля.</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="${autoUrl}" style="display:inline-block;background:linear-gradient(135deg,#14b8a6,#06b6d4);color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;">Войти в систему</a>
        </div>
        <p style="color:#9ca3af;font-size:12px;">Если кнопка не работает, скопируйте ссылку в браузер:<br>
          <a href="${autoUrl}" style="color:#14b8a6;word-break:break-all;">${autoUrl}</a>
        </p>
        ${credsUrl ? `
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:14px;color:#4a4a4a;">Или войдите вручную:</p>
        <p style="font-size:14px;color:#4a4a4a;"><b>Логин:</b> ${profile.login}<br><b>Пароль:</b> ${password}</p>
        <p style="font-size:12px;color:#9ca3af;">Ссылка с подставленными логином и паролем:<br><a href="${credsUrl}" style="color:#14b8a6;word-break:break-all;">${credsUrl}</a></p>
        ` : ""}
      </div>
    </div>
  </div>
</body></html>`;

    const result = await sendPlatformEmail({
      to: profile.email,
      subject: "Ваша ссылка для входа",
      html,
    });
    if (!result.ok) throw new Error(result.error || "send failed");

    return new Response(JSON.stringify({ ok: true, auto_url: autoUrl, creds_url: credsUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-student-login-link error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
