import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StatusNotificationRequest {
  orderId: string;
  newStatus: string;
  courseName: string;
  sellerName: string;
  buyerUserId?: string;
  buyerOrganizationId?: string;
  buyerType: string;
  price: number;
}

const statusMessages: Record<string, { subject: string; title: string; message: string; color: string }> = {
  approved: {
    subject: "Заявка одобрена",
    title: "✅ Ваша заявка одобрена!",
    message: "Продавец одобрил вашу заявку на покупку курса. Пожалуйста, ожидайте дальнейших инструкций по оплате и получению доступа.",
    color: "#10b981",
  },
  paid: {
    subject: "Оплата подтверждена",
    title: "💳 Оплата подтверждена!",
    message: "Оплата за курс успешно подтверждена. Скоро вам будет предоставлен доступ к материалам курса.",
    color: "#3b82f6",
  },
  completed: {
    subject: "Заказ выполнен",
    title: "🎉 Заказ выполнен!",
    message: "Ваш заказ успешно выполнен. Доступ к курсу предоставлен. Приятного обучения!",
    color: "#059669",
  },
  cancelled: {
    subject: "Заявка отклонена",
    title: "❌ Заявка отклонена",
    message: "К сожалению, продавец отклонил вашу заявку. Вы можете связаться с организацией для уточнения причин или выбрать другой курс.",
    color: "#ef4444",
  },
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Supabase credentials not configured");
      return new Response(
        JSON.stringify({ error: "Supabase not configured", success: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      orderId,
      newStatus,
      courseName,
      sellerName,
      buyerUserId,
      buyerOrganizationId,
      buyerType,
      price,
    }: StatusNotificationRequest = await req.json();

    console.log("Processing order status notification:", { orderId, newStatus, buyerType });

    const statusInfo = statusMessages[newStatus];
    if (!statusInfo) {
      console.log("No notification needed for status:", newStatus);
      return new Response(
        JSON.stringify({ success: true, message: "No notification for this status" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let buyerEmail: string | null = null;
    let buyerName = "Покупатель";

    if (buyerType === "student" && buyerUserId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", buyerUserId)
        .single();

      buyerEmail = profile?.email || null;
      buyerName = profile?.full_name || "Студент";
    } else if (buyerType === "organization" && buyerOrganizationId) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("organization_id", buyerOrganizationId)
        .not("email", "is", null);

      if (profiles && profiles.length > 0) {
        buyerEmail = profiles[0].email;
        buyerName = profiles[0].full_name || "Организация";
      }
    }

    if (!buyerEmail) {
      console.log("No buyer email found");
      return new Response(
        JSON.stringify({ success: true, message: "No buyer email found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedPrice = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(price);

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${statusInfo.color}; color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
          .message { font-size: 16px; margin-bottom: 25px; }
          .order-details { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #64748b; font-size: 14px; }
          .detail-value { font-weight: 600; color: #1e293b; }
          .cta { text-align: center; margin-top: 25px; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${statusInfo.title}</h1>
          </div>
          <div class="content">
            <p>Здравствуйте, ${buyerName}!</p>
            <p class="message">${statusInfo.message}</p>

            <div class="order-details">
              <div class="detail-row">
                <span class="detail-label">Курс</span>
                <span class="detail-value">${courseName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Продавец</span>
                <span class="detail-value">${sellerName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Сумма</span>
                <span class="detail-value">${formattedPrice}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Номер заявки</span>
                <span class="detail-value">${orderId.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>

            <div class="cta">
              <a href="${req.headers.get("origin") || "https://sintagma.com.ru"}/organization" class="button">
                Перейти в личный кабинет
              </a>
            </div>
          </div>
          <div class="footer">
            <p>Это автоматическое уведомление. Пожалуйста, не отвечайте на это письмо.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendPlatformEmail({
      to: buyerEmail,
      subject: `${statusInfo.subject}: "${courseName}"`,
      html: htmlBody,
    });

    if (!result.ok) {
      throw new Error(result.error || "send failed");
    }

    console.log("Status notification sent to:", buyerEmail);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in notify-order-status function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
