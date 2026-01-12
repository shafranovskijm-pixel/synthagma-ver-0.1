import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReminderRequest {
  email: string;
  studentName: string;
  missingDocuments: string[];
  organizationName: string;
  loginUrl: string;
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

    const { email, studentName, missingDocuments, organizationName, loginUrl }: ReminderRequest = await req.json();

    if (!email || !missingDocuments || missingDocuments.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending documents reminder to:", email);

    const documentsList = missingDocuments
      .map((doc) => `<li style="margin: 8px 0; padding: 8px 12px; background: #fef2f2; border-radius: 6px; color: #991b1b;">${doc}</li>`)
      .join("");

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
          .alert-box { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .documents-list { list-style: none; padding: 0; margin: 15px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⚠️ Требуются документы</h1>
            ${organizationName ? `<p style="margin: 10px 0 0 0; opacity: 0.9;">${organizationName}</p>` : ""}
          </div>
          <div class="content">
            <p>Здравствуйте${studentName ? `, ${studentName}` : ""}!</p>
            <p>Для продолжения обучения необходимо загрузить недостающие документы в личный кабинет.</p>
            
            <div class="alert-box">
              <h3 style="margin: 0 0 10px 0; color: #92400e;">📋 Недостающие документы:</h3>
              <ul class="documents-list">
                ${documentsList}
              </ul>
            </div>
            
            <p><strong>Почему это важно:</strong></p>
            <ul>
              <li>Паспорт и СНИЛС необходимы для внесения данных в государственные системы</li>
              <li>Документ об образовании подтверждает право на освоение программы</li>
            </ul>
            
            <p>Пожалуйста, войдите в личный кабинет и загрузите документы в раздел "Мои документы":</p>
            <a href="${loginUrl}" class="button">Загрузить документы</a>
            
            <p style="margin-top: 30px; font-size: 14px; color: #64748b;">
              Если у вас возникли вопросы, свяжитесь с администрацией ${organizationName || "организации"}.
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
      subject: `Требуется загрузить документы - ${organizationName || "Обучение"}`,
      html: htmlBody,
    });

    await client.close();

    console.log("Reminder email sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-documents-reminder function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
