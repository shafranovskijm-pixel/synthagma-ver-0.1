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
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!SERVICE_KEY || bearer !== SERVICE_KEY) return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
        // fail-safe: кампании с очередью mailing_send_jobs управляются новым воркером
        const { count: managedCount, error: managedErr } = await admin
          .from("mailing_send_jobs")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", c.id);
        if (managedErr) throw managedErr;
        if ((managedCount ?? 0) > 0) {
          results.push({ id: c.id, skipped: true, reason: "managed_by_mailing_send_jobs" });
          continue;
        }

        // No state rewrite: only the atomic run claim can start a due campaign.
        const { data, error: invErr } = await admin.functions.invoke("run-email-campaign", {
          body: { campaignId: c.id },
        });
        if (invErr) throw invErr;
        results.push({ id: c.id, started: data?.ok === true && data?.started > 0,
          reason: data?.reason || (data?.error ? "run_rejected" : undefined) });
      } catch (e) {
        results.push({ id: c.id, started: false, error: (e as Error).message });
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
