import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { email, studentName, missingDocuments, organizationName, loginUrl }: ReminderRequest = await req.json();

    if (!email || !missingDocuments || missingDocuments.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const documentsList = missingDocuments
      .map((doc) => `<li style="margin: 8px 0; padding: 8px 12px; background: #fef2f2; border-radius: 6px; color: #991b1b;">${doc}</li>`)
      .join("");

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">⚠️ Требуются документы</h1>
        ${organizationName ? `<p style="margin: 10px 0 0 0; opacity: 0.9;">${organizationName}</p>` : ""}
      </div>
      <div style="padding: 30px;">
        <p style="font-size: 16px;">Здравствуйте${studentName ? `, ${studentName}` : ""}!</p>
        <p style="font-size: 16px;">Для продолжения обучения необходимо загрузить недостающие документы в личный кабинет.</p>
        <div style="background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #92400e;">📋 Недостающие документы:</h3>
          <ul style="list-style: none; padding: 0; margin: 15px 0;">${documentsList}</ul>
        </div>
        <p style="font-size: 16px;"><strong>Почему это важно:</strong></p>
        <ul style="margin: 10px 0;">
          <li>Паспорт и СНИЛС необходимы для внесения данных в государственные системы</li>
          <li>Документ об образовании подтверждает право на освоение программы</li>
        </ul>
        <p style="font-size: 16px;">Пожалуйста, войдите в личный кабинет и загрузите документы в раздел "Мои документы":</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Загрузить документы
          </a>
        </div>
        <p style="margin-top: 20px; font-size: 14px; color: #64748b;">
          Если у вас возникли вопросы, свяжитесь с администрацией ${organizationName || "организации"}.
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

    const subject = `Требуется загрузить документы - ${organizationName || "Обучение"}`;

    const result = await sendPlatformEmail({
      to: email,
      subject,
      html,
    });

    if (!result.ok) {
      if (result.rateLimited) {
        return new Response(
          JSON.stringify({ error: result.error, retryAfterSeconds: result.retryAfterSeconds }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(result.retryAfterSeconds || 60),
            },
          }
        );
      }
      throw new Error(result.error || "send failed");
    }

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
