import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendEmailViaSMTP(
  to: string,
  subject: string,
  htmlBody: string,
  _smtpHost?: string,
  _smtpPort?: string,
  _smtpUser?: string,
  _smtpPass?: string,
  _smtpFrom?: string,
): Promise<boolean> {
  const r = await sendPlatformEmail({ to, subject, html: htmlBody, skipRateLimit: true });
  if (!r.ok) console.error(`Failed to send email to ${to}:`, r.error);
  else console.log(`Email sent to ${to}`);
  return r.ok;
}

function buildReminderEmailHtml(
  courseName: string,
  studentName: string,
  completedAt: string,
  reminderDate: string,
  orgName: string,
  reminderText: string | null,
  recipientType: "student" | "company" | "organization",
): string {
  const completedFormatted = new Date(completedAt).toLocaleDateString("ru-RU");
  const reminderFormatted = new Date(reminderDate).toLocaleDateString("ru-RU");

  const greeting = recipientType === "student"
    ? `Здравствуйте${studentName ? `, ${studentName}` : ""}!`
    : `Уважаемые коллеги!`;

  const intro = recipientType === "student"
    ? `Приближается срок повторного прохождения курса.`
    : `Напоминаем о необходимости переобучения сотрудника.`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f5f5f5;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:30px;text-align:center;">
    <h1 style="margin:0;font-size:22px;">⏰ Напоминание о переобучении</h1>
    <p style="margin:10px 0 0;opacity:0.9;">${orgName}</p>
  </div>
  <div style="padding:30px;">
    <p style="font-size:16px;">${greeting}</p>
    <p style="font-size:16px;">${intro}</p>
    <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 8px;"><strong>📚 Курс:</strong> ${courseName}</p>
      <p style="margin:0 0 8px;"><strong>👤 Слушатель:</strong> ${studentName || "—"}</p>
      <p style="margin:0 0 8px;"><strong>📅 Дата прохождения:</strong> ${completedFormatted}</p>
      <p style="margin:0;"><strong>⏰ Дата переобучения:</strong> ${reminderFormatted}</p>
    </div>
    ${reminderText ? `<div style="background:#f0f9ff;border:1px solid #93c5fd;border-radius:8px;padding:16px;margin:20px 0;"><p style="margin:0;">${reminderText}</p></div>` : ""}
    <p style="font-size:14px;color:#64748b;margin-top:20px;">Пожалуйста, обеспечьте своевременное прохождение повторного обучения.</p>
  </div>
  <div style="background:#f8fafc;padding:15px;text-align:center;border-top:1px solid #e2e8f0;">
    <p style="color:#9ca3af;font-size:12px;margin:0;">Автоматическое уведомление от платформы СИНТАГМА</p>
  </div>
</div></div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = Deno.env.get("SMTP_PORT");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");
    const SMTP_FROM = Deno.env.get("SMTP_FROM");
    const smtpConfigured = !!(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const today = new Date().toISOString().split('T')[0];
    const results: { id: string; type: string; success: boolean; error?: string }[] = [];

    // ========== 1. Process organization_reminders ==========
    const { data: orgReminders, error: orgFetchError } = await supabase
      .from("organization_reminders")
      .select(`
        id, title, description, reminder_date, telegram_chat_id, organization_id,
        organizations (name)
      `)
      .eq("reminder_date", today)
      .eq("is_completed", false)
      .not("telegram_chat_id", "is", null);

    if (orgFetchError) throw orgFetchError;

    console.log(`Found ${orgReminders?.length || 0} org reminders for today`);

    for (const reminder of orgReminders || []) {
      if (!reminder.telegram_chat_id || !TELEGRAM_BOT_TOKEN) continue;

      const orgs = reminder.organizations as unknown as { name: string } | { name: string }[] | null;
      const orgName = Array.isArray(orgs) ? orgs[0]?.name : orgs?.name || "Организация";
      
      const message = `🔔 <b>Напоминание</b>\n\n` +
        `<b>${reminder.title}</b>\n` +
        (reminder.description ? `${reminder.description}\n\n` : "\n") +
        `📍 ${orgName}\n` +
        `📅 ${new Date(reminder.reminder_date).toLocaleDateString("ru-RU")}`;

      try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: reminder.telegram_chat_id, text: message, parse_mode: "HTML" }),
        });
        const result = await response.json();
        if (result.ok) {
          results.push({ id: reminder.id, type: "org_reminder", success: true });
        } else {
          results.push({ id: reminder.id, type: "org_reminder", success: false, error: result.description });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        results.push({ id: reminder.id, type: "org_reminder", success: false, error: msg });
      }
    }

    // ========== 2. Process course_reminders ==========
    const { data: courseReminders, error: crFetchError } = await supabase
      .from("course_reminders")
      .select("*")
      .lte("reminder_date", today)
      .eq("is_sent", false)
      .eq("is_dismissed", false);

    if (crFetchError) throw crFetchError;

    console.log(`Found ${courseReminders?.length || 0} course reminders to process`);

    for (const cr of courseReminders || []) {
      try {
        // Get course name
        const { data: course } = await supabase
          .from("courses")
          .select("title")
          .eq("id", cr.course_id)
          .maybeSingle();

        // Get student info
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", cr.user_id)
          .maybeSingle();

        // Get org info
        const { data: org } = await supabase
          .from("organizations")
          .select("name, telegram_chat_id")
          .eq("id", cr.organization_id)
          .maybeSingle();

        const courseName = course?.title || "Курс";
        const studentName = profile?.full_name || "—";
        const studentEmail = profile?.email || null;
        const orgName = org?.name || "Организация";

        // Get company info if linked
        let companyEmail: string | null = null;
        if (cr.company_id) {
          const { data: company } = await supabase
            .from("companies")
            .select("email")
            .eq("id", cr.company_id)
            .maybeSingle();
          companyEmail = company?.email || null;
        }

        // --- Telegram to organization ---
        if (cr.notify_organization && TELEGRAM_BOT_TOKEN && org?.telegram_chat_id) {
          const message = `🔔 <b>Напоминание о переобучении</b>\n\n` +
            `📚 Курс: <b>${courseName}</b>\n` +
            `👤 Слушатель: ${studentName}\n` +
            `📅 Дата прохождения: ${new Date(cr.completed_at).toLocaleDateString("ru-RU")}\n` +
            `⏰ Дата переобучения: ${new Date(cr.reminder_date).toLocaleDateString("ru-RU")}\n` +
            (cr.reminder_text ? `\n${cr.reminder_text}` : "");

          try {
            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: org.telegram_chat_id, text: message, parse_mode: "HTML" }),
            });
            const tgResult = await response.json();
            if (tgResult.ok) {
              console.log(`Telegram sent for reminder ${cr.id} to org`);
            }
          } catch (e) {
            console.error(`Telegram error for ${cr.id}:`, e);
          }
        }

        // --- Email to student ---
        if (cr.notify_student && smtpConfigured && studentEmail && !studentEmail.endsWith("@student.local")) {
          const html = buildReminderEmailHtml(courseName, studentName, cr.completed_at, cr.reminder_date, orgName, cr.reminder_text, "student");
          await sendEmailViaSMTP(studentEmail, `Напоминание о переобучении — ${courseName}`, html, SMTP_HOST!, SMTP_PORT!, SMTP_USER!, SMTP_PASS!, SMTP_FROM!);
          console.log(`Email sent to student ${studentEmail} for reminder ${cr.id}`);
        }

        // --- Email to company ---
        if (cr.notify_company && smtpConfigured && companyEmail) {
          const html = buildReminderEmailHtml(courseName, studentName, cr.completed_at, cr.reminder_date, orgName, cr.reminder_text, "company");
          await sendEmailViaSMTP(companyEmail, `Напоминание о переобучении сотрудника — ${courseName}`, html, SMTP_HOST!, SMTP_PORT!, SMTP_USER!, SMTP_PASS!, SMTP_FROM!);
          console.log(`Email sent to company ${companyEmail} for reminder ${cr.id}`);
        }

        // Mark as sent
        await supabase
          .from("course_reminders")
          .update({ is_sent: true })
          .eq("id", cr.id);

        results.push({ id: cr.id, type: "course_reminder", success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        results.push({ id: cr.id, type: "course_reminder", success: false, error: msg });
        console.error(`Error processing course reminder ${cr.id}:`, msg);
      }
    }

    return new Response(
      JSON.stringify({ 
        org_reminders_processed: orgReminders?.length || 0,
        course_reminders_processed: courseReminders?.length || 0,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing reminders:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
