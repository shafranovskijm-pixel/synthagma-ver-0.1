import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    console.log("SMTP Config:", { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_FROM });

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
      return new Response(
        JSON.stringify({ error: "SMTP credentials are not fully configured", config: { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_FROM } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to } = await req.json();

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Missing 'to' email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending test email to:", to);

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
      to: to,
      subject: "Тестовое письмо - SMTP проверка",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #6366f1;">✅ SMTP работает!</h1>
          <p>Это тестовое письмо для проверки настроек SMTP.</p>
          <p>Если вы видите это сообщение, значит конфигурация корректна.</p>
          <hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="color: #64748b; font-size: 12px;">
            Отправлено: ${new Date().toLocaleString('ru-RU')}<br>
            SMTP сервер: ${SMTP_HOST}:${SMTP_PORT}
          </p>
        </div>
      `,
    });

    await client.close();

    console.log("Test email sent successfully to:", to);

    return new Response(
      JSON.stringify({ success: true, message: `Email sent to ${to}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in test-smtp function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
