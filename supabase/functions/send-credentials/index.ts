import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CredentialsRequest {
  email: string;
  name: string;
  login: string;
  password: string;
  loginUrl: string;
  organizationName?: string;
}

const handler = async (req: Request): Promise<Response> => {
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

    if (!roleData || (roleData.role !== 'organization' && roleData.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Organization or admin role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, name, login, password, loginUrl, organizationName }: CredentialsRequest = await req.json();

    if (!email || !login || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Validate loginUrl is from allowed domains
    const allowedPatterns = [
      /^https:\/\/[a-z0-9-]+\.lovable\.app/,
      /^https:\/\/[a-z0-9-]+\.lovable\.dev/,
      /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app/,
      /^https:\/\/[a-z0-9-]+\.lovableproject\.com/,
      /^http:\/\/localhost/,
      /^https:\/\/xn--80aaiswd0ak\.xn--p1ai/,
      /^https:\/\/синтагма\.рф/,
      /^https:\/\/(www\.)?sintagma\.com\.ru/,
    ];

    const isAllowedUrl = allowedPatterns.some(pattern => pattern.test(loginUrl));
    if (!isAllowedUrl) {
      console.error("Invalid loginUrl domain:", loginUrl);
      return new Response(
        JSON.stringify({ error: "Invalid login URL domain" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending credentials email to:", email);

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Добро пожаловать!</h1>
        ${organizationName ? `<p style="margin: 10px 0 0 0; opacity: 0.9;">${organizationName}</p>` : ''}
      </div>

      <div style="padding: 30px;">
        <p style="color: #333; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Здравствуйте${name ? `, ${name}` : ''}!
        </p>

        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Ваш аккаунт в системе обучения готов к использованию. Ниже приведены ваши данные для входа:
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div style="margin-bottom: 15px;">
            <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Логин</div>
            <div style="font-size: 18px; font-weight: bold; color: #1e293b; font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-top: 4px; display: inline-block;">${login}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Пароль</div>
            <div style="font-size: 18px; font-weight: bold; color: #1e293b; font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-top: 4px; display: inline-block;">${password}</div>
          </div>
        </div>

        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Для входа в систему нажмите кнопку ниже:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}"
             style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
            Войти в систему
          </a>
        </div>

        <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
          Если кнопка не работает, скопируйте эту ссылку в браузер:<br>
          <a href="${loginUrl}" style="color: #6366f1; word-break: break-all;">${loginUrl}</a>
        </p>
      </div>

      <div style="background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Это письмо было отправлено автоматически. Пожалуйста, не отвечайте на него.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const subjectText = organizationName
      ? `Ваши данные для входа - ${organizationName}`
      : 'Ваши данные для входа';

    const result = await sendPlatformEmail({
      to: email,
      subject: subjectText,
      html: htmlBody,
    });

    if (!result.ok) {
      throw new Error(result.error || "send failed");
    }

    console.log("Credentials email sent successfully to:", email, "by user:", user.id);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-credentials function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
