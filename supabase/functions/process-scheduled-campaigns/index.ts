// Cron: каждые 5 минут проверяет email_campaigns со scheduled_at <= now() и status='scheduled' и запускает их
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const now = new Date().toISOString();
    const { data: due, error } = await admin
      .from("email_campaigns")
      .select("id, name")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .limit(20);

    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    for (const c of due) {
      try {
        // переводим в draft, чтобы run-email-campaign смог запустить
        await admin.from("email_campaigns").update({ status: "draft" }).eq("id", c.id);
        const { error: invErr } = await admin.functions.invoke("run-email-campaign", {
          body: { campaignId: c.id },
        });
        if (invErr) throw invErr;
        results.push({ id: c.id, name: c.name, started: true });
      } catch (e) {
        results.push({ id: c.id, name: c.name, started: false, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-scheduled-campaigns error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
