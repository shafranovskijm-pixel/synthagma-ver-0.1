import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
        // Get org telegram_chat_id if notify_organization
        if (cr.notify_organization && TELEGRAM_BOT_TOKEN) {
          const { data: org } = await supabase
            .from("organizations")
            .select("name, telegram_chat_id")
            .eq("id", cr.organization_id)
            .maybeSingle();

          if (org?.telegram_chat_id) {
            // Get course name
            const { data: course } = await supabase
              .from("courses")
              .select("title")
              .eq("id", cr.course_id)
              .maybeSingle();

            // Get student name
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", cr.user_id)
              .maybeSingle();

            const message = `🔔 <b>Напоминание о переобучении</b>\n\n` +
              `📚 Курс: <b>${course?.title || "Курс"}</b>\n` +
              `👤 Слушатель: ${profile?.full_name || "—"}\n` +
              `📅 Дата прохождения: ${new Date(cr.completed_at).toLocaleDateString("ru-RU")}\n` +
              `⏰ Дата переобучения: ${new Date(cr.reminder_date).toLocaleDateString("ru-RU")}\n` +
              (cr.reminder_text ? `\n${cr.reminder_text}` : "");

            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: org.telegram_chat_id, text: message, parse_mode: "HTML" }),
            });
            const tgResult = await response.json();
            if (tgResult.ok) {
              console.log(`Sent course reminder ${cr.id} to org ${org.telegram_chat_id}`);
            }
          }
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
