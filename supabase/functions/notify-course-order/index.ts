import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";
import { logExternalOperation } from "../_shared/external-operation-observability.ts";
import { AccessError } from "../_shared/privileged-access.ts";
import { PLATFORM_CONTACTS } from "../_shared/platform-support-contacts.ts";
import { requireOrderNotificationAccess, escapeOrderNotificationText, claimOrderNotificationDelivery } from "./authorization.ts";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      console.error("Supabase credentials not configured");
      return new Response(
        JSON.stringify({ error: "Supabase not configured", success: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const trusted = await requireOrderNotificationAccess(req, supabase, originalHeader => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: originalHeader } },
    }));
    const { orderId, buyerType, studentsCount, price, sellerOrganizationId } = trusted;
    const courseName = escapeOrderNotificationText(trusted.courseName);
    const buyerName = escapeOrderNotificationText(trusted.buyerName);
    const notes = trusted.notes === null ? null : escapeOrderNotificationText(trusted.notes);
    // Recipient discovery affects seller email only. Platform-owned listings can have a NULL seller.
    let organizationName = "СИНТАГМА";
    let emails: string[] = [];
    if (sellerOrganizationId !== null) {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations").select("name").eq("id", sellerOrganizationId).single();
      if (orgError || !orgData || typeof orgData.name !== "string") {
        // Do not guess seller recipients when their lookup fails. The support destination is already fixed.
        organizationName = "Организация продавца";
        logExternalOperation("error", "smtp_delivery_failed");
      } else {
        organizationName = escapeOrderNotificationText(orgData.name || "Ваша организация");
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles").select("email, full_name")
          .eq("organization_id", sellerOrganizationId).not("email", "is", null);
        if (profilesError) {
          logExternalOperation("error", "smtp_delivery_failed");
        } else {
          emails = (profiles ?? []).filter(p => p.email).map(p => p.email as string);
        }
      }
    }
    logExternalOperation("log", "smtp_notification_started");
    if (emails.length > 0) logExternalOperation("log", "smtp_recipients_ready");

    // A zero-price fulfilled order is a delivery receipt, not evidence of a bank payment.
    const freeReceipt = price === 0;
    const notificationHeading = freeReceipt ? "Курс получен бесплатно" : "Новая заявка на курс!";
    const buyerTypeLabel = "Организация";
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
          .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .header p { margin: 10px 0 0 0; opacity: 0.9; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
          .order-details { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #64748b; font-size: 14px; }
          .detail-value { font-weight: 600; color: #1e293b; }
          .price { font-size: 24px; color: #10b981; font-weight: bold; text-align: center; padding: 20px; }
          .notes { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin-top: 15px; }
          .notes-label { font-size: 12px; color: #92400e; text-transform: uppercase; margin-bottom: 8px; }
          .cta { text-align: center; margin-top: 25px; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 ${notificationHeading}</h1>
            <p>${organizationName}</p>
          </div>
          <div class="content">
            <p>${freeReceipt ? "Курс получен бесплатно." : "Поступила новая заявка на покупку курса из магазина курсов:"}</p>

            <div class="order-details">
              <div class="detail-row">
                <span class="detail-label">Курс</span>
                <span class="detail-value">${courseName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Покупатель</span>
                <span class="detail-value">${buyerName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Тип покупателя</span>
                <span class="detail-value">${buyerTypeLabel}</span>
              </div>
              ${buyerType === "organization" ? `
              <div class="detail-row">
                <span class="detail-label">Количество студентов</span>
                <span class="detail-value">${studentsCount}</span>
              </div>
              ` : ""}
              <div class="price">${formattedPrice}</div>
            </div>

            ${notes ? `
            <div class="notes">
              <div class="notes-label">Комментарий от покупателя</div>
              <p style="margin: 0;">${notes}</p>
            </div>
            ` : ""}

            <div class="cta">
              <p>Перейдите в личный кабинет для обработки заявки:</p>
              <a href="${PLATFORM_CONTACTS.website}/organization" class="button">
                Открыть заявки
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

    // Send to all organization members
    const subject = `${freeReceipt ? "Курс получен бесплатно" : "Новая заявка на курс"} "${trusted.courseName.replace(/[\r\n]+/g, " ")}"`;
    // Send Telegram notification
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TELEGRAM_SUPPORT_CHAT_ID = Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID");

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_SUPPORT_CHAT_ID && await claimOrderNotificationDelivery(supabase, orderId, "telegram", TELEGRAM_SUPPORT_CHAT_ID)) {
      try {
        const tgMessage = [
          `🛒 <b>${notificationHeading}</b>`,
          "",
          `📚 Курс: ${courseName}`,
          `👤 Покупатель: ${buyerName}`,
          `📋 Тип: ${buyerTypeLabel}`,
          ...(buyerType === "organization" ? [`👥 Студентов: ${studentsCount}`] : []),
          `💰 Цена: ${formattedPrice}`,
          ...(notes ? [`\n💬 Комментарий: ${notes}`] : []),
          "",
          `🏢 Продавец: ${organizationName}`,
        ].join("\n");

        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const tgResponse = await fetch(tgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TELEGRAM_SUPPORT_CHAT_ID,
            text: tgMessage,
            parse_mode: "HTML",
          }),
        });
        const tgResult = await tgResponse.json();
        if (!tgResult.ok) {
          ((..._uc027LogArgs: unknown[]) => logExternalOperation("error", "telegram_notification_failed"))("Telegram notification failed:", tgResult.description);
        } else {
          console.log("Telegram notification sent successfully");
        }
      } catch {
        // Fetch errors can contain a bot URL. Never log raw transport errors.
        logExternalOperation("error", "telegram_notification_failed");
      }
    }

    // A seller email transport failure must not prevent the support Telegram attempt.
    let sent = 0;
    for (const email of emails) {
      if (!await claimOrderNotificationDelivery(supabase, orderId, "smtp", email)) continue;
      const r = await sendPlatformEmail({ to: email, subject, html: htmlBody });
      if (r.ok) { sent++; ((..._uc027LogArgs: unknown[]) => logExternalOperation("log", "smtp_delivery_succeeded"))("Email sent to:", email); }
      else { ((..._uc027LogArgs: unknown[]) => logExternalOperation("error", "smtp_delivery_failed"))("Failed to send to:", email, r.error); }
    }


    console.log("Notifications sent successfully:", sent, "of", emails.length);

    return new Response(
      JSON.stringify({ success: true, recipientsCount: sent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    logExternalOperation("error", "operation_failed");
    const errorMessage = error instanceof AccessError ? error.message : "Не удалось отправить уведомление по заказу. Повторите попытку.";
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: error instanceof AccessError ? error.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
};

serve(handler);
