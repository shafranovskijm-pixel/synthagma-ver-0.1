import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Base64 encode for UTF-8 strings
function base64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

// Encode subject for email (RFC 2047)
function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${base64Encode(subject)}?=`;
}

interface PasswordResetRequest {
  email: string;
  redirectTo: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = Deno.env.get("SMTP_PORT");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");
    const SMTP_FROM = Deno.env.get("SMTP_FROM");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
      console.error("SMTP credentials not fully configured");
      return new Response(
        JSON.stringify({ error: "SMTP credentials are not fully configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Supabase credentials not configured");
      return new Response(
        JSON.stringify({ error: "Supabase credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, redirectTo }: PasswordResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing password reset for:", email);

    // Create Supabase admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Generate password reset link using admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectTo || `${SUPABASE_URL.replace('.supabase.co', '.lovableproject.com')}/reset-password`,
      },
    });

    if (error) {
      console.error("Error generating reset link:", error);
      // Don't reveal if email exists or not
      return new Response(
        JSON.stringify({ success: true, message: "If this email exists, a reset link has been sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resetLink = data.properties?.action_link;

    if (!resetLink) {
      console.error("No action link generated");
      return new Response(
        JSON.stringify({ success: true, message: "If this email exists, a reset link has been sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Reset link generated, sending via SMTP");

    // Build HTML email
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">Восстановление пароля</h1>
      </div>
      
      <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        Вы запросили сброс пароля для вашего аккаунта. Нажмите на кнопку ниже, чтобы установить новый пароль:
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
          Сбросить пароль
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.
      </p>
      
      <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
        Ссылка действительна в течение 24 часов.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        Если кнопка не работает, скопируйте эту ссылку в браузер:<br>
        <a href="${resetLink}" style="color: #6366f1; word-break: break-all;">${resetLink}</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    // Build raw email with proper encoding
    const encodedSubject = encodeSubject("Восстановление пароля");
    const encodedHtml = base64Encode(htmlContent);

    const rawEmail = [
      `From: ${SMTP_FROM}`,
      `To: ${email}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodedHtml.match(/.{1,76}/g)?.join('\r\n') || encodedHtml,
    ].join('\r\n');

    // Connect via TLS
    const conn = await Deno.connectTls({
      hostname: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    async function readResponse(): Promise<string> {
      const buffer = new Uint8Array(1024);
      const n = await conn.read(buffer);
      if (n === null) return "";
      return decoder.decode(buffer.subarray(0, n));
    }

    async function sendCommand(cmd: string): Promise<string> {
      await conn.write(encoder.encode(cmd + "\r\n"));
      return await readResponse();
    }

    // SMTP handshake
    let response = await readResponse();
    console.log("Server greeting:", response);

    response = await sendCommand(`EHLO localhost`);
    console.log("EHLO response:", response);

    // AUTH LOGIN
    response = await sendCommand(`AUTH LOGIN`);
    console.log("AUTH response:", response);

    response = await sendCommand(btoa(SMTP_USER));
    console.log("User response:", response);

    response = await sendCommand(btoa(SMTP_PASS));
    console.log("Pass response:", response);

    // Extract email from SMTP_FROM (may contain display name)
    const emailMatch = SMTP_FROM.match(/<([^>]+)>/) || [null, SMTP_FROM];
    const fromEmail = emailMatch[1] || SMTP_FROM;

    // MAIL FROM
    response = await sendCommand(`MAIL FROM:<${fromEmail}>`);
    console.log("MAIL FROM response:", response);

    // RCPT TO
    response = await sendCommand(`RCPT TO:<${email}>`);
    console.log("RCPT TO response:", response);

    // DATA
    response = await sendCommand(`DATA`);
    console.log("DATA response:", response);

    // Send email content
    await conn.write(encoder.encode(rawEmail + "\r\n.\r\n"));
    response = await readResponse();
    console.log("Email data response:", response);

    // QUIT
    response = await sendCommand(`QUIT`);
    console.log("QUIT response:", response);

    conn.close();

    console.log("Password reset email sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-password-reset function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
