import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = Deno.env.get("SMTP_PORT");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");
    const SMTP_FROM = Deno.env.get("SMTP_FROM");
    
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
      console.error("SMTP credentials are not fully configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, name, login, password, loginUrl, organizationName }: CredentialsRequest = await req.json();

    if (!email || !login || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending credentials email to:", email);
    console.log("SMTP Config - Host:", SMTP_HOST, "Port:", SMTP_PORT, "User:", SMTP_USER);

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
          .credentials { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .credential-item { margin: 15px 0; }
          .credential-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
          .credential-value { font-size: 18px; font-weight: bold; color: #1e293b; font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-top: 4px; display: inline-block; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Добро пожаловать!</h1>
            ${organizationName ? `<p style="margin: 10px 0 0 0; opacity: 0.9;">${organizationName}</p>` : ''}
          </div>
          <div class="content">
            <p>Здравствуйте${name ? `, ${name}` : ''}!</p>
            <p>Ваш аккаунт в системе обучения готов к использованию. Ниже приведены ваши данные для входа:</p>
            
            <div class="credentials">
              <div class="credential-item">
                <div class="credential-label">Логин</div>
                <div class="credential-value">${login}</div>
              </div>
              <div class="credential-item">
                <div class="credential-label">Пароль</div>
                <div class="credential-value">${password}</div>
              </div>
            </div>
            
            <p>Для входа в систему нажмите кнопку ниже:</p>
            <a href="${loginUrl}" class="button">Войти в систему</a>
            
            <p style="margin-top: 30px; font-size: 14px; color: #64748b;">
              Если кнопка не работает, скопируйте и вставьте эту ссылку в браузер:<br>
              <a href="${loginUrl}" style="color: #6366f1;">${loginUrl}</a>
            </p>
          </div>
          <div class="footer">
            <p>Это письмо было отправлено автоматически. Пожалуйста, не отвечайте на него.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: parseInt(SMTP_PORT, 10),
        tls: true,
        auth: {
          username: SMTP_USER,
          password: SMTP_PASS,
        },
      },
    });

    await client.send({
      from: SMTP_FROM,
      to: email,
      subject: `Ваши данные для входа${organizationName ? ` - ${organizationName}` : ''}`,
      html: htmlBody,
    });

    await client.close();

    console.log("Email sent successfully to:", email);

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
