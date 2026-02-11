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

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Fetch reminders for today that haven't been completed and have telegram_chat_id
    const { data: reminders, error: fetchError } = await supabase
      .from("organization_reminders")
      .select(`
        id,
        title,
        description,
        reminder_date,
        telegram_chat_id,
        organization_id,
        organizations (name)
      `)
      .eq("reminder_date", today)
      .eq("is_completed", false)
      .not("telegram_chat_id", "is", null);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${reminders?.length || 0} reminders for today`);

    const results: { id: string; success: boolean; error?: string }[] = [];

    // Send Telegram notifications
    for (const reminder of reminders || []) {
      if (!reminder.telegram_chat_id || !TELEGRAM_BOT_TOKEN) {
        continue;
      }

      const orgs = reminder.organizations as unknown as { name: string } | { name: string }[] | null;
      const orgName = Array.isArray(orgs) ? orgs[0]?.name : orgs?.name || "Организация";
      
      const message = `🔔 <b>Напоминание</b>\n\n` +
        `<b>${reminder.title}</b>\n` +
        (reminder.description ? `${reminder.description}\n\n` : "\n") +
        `📍 ${orgName}\n` +
        `📅 ${new Date(reminder.reminder_date).toLocaleDateString("ru-RU")}`;

      try {
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        const response = await fetch(telegramUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: reminder.telegram_chat_id,
            text: message,
            parse_mode: "HTML",
          }),
        });

        const result = await response.json();
        
        if (result.ok) {
          results.push({ id: reminder.id, success: true });
          console.log(`Sent reminder ${reminder.id} to ${reminder.telegram_chat_id}`);
        } else {
          results.push({ id: reminder.id, success: false, error: result.description });
          console.error(`Failed to send reminder ${reminder.id}:`, result.description);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        results.push({ id: reminder.id, success: false, error: message });
        console.error(`Error sending reminder ${reminder.id}:`, message);
      }
    }

    return new Response(
      JSON.stringify({ 
        processed: reminders?.length || 0,
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