import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cron job: каждые 5 минут продолжает paused-кампании, у которых ещё есть pending получатели
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Найдём кампании в статусе paused
    const { data: paused, error: pErr } = await admin
      .from("email_campaigns")
      .select("id, name, scope, organization_id")
      .eq("status", "paused")
      .order("started_at", { ascending: true })
      .limit(20);

    if (pErr) throw pErr;
    if (!paused || paused.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: "Нет paused-кампаний" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ id: string; name: string; pending: number; resumed: boolean; error?: string }> = [];

    for (const c of paused) {
      try {
        const { count, error: cntErr } = await admin
          .from("email_campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .eq("status", "pending");

        if (cntErr) throw cntErr;
        const pendingCount = count || 0;

        if (pendingCount === 0) {
          // Финализируем как completed
          await admin.from("email_campaigns").update({
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", c.id);
          results.push({ id: c.id, name: c.name, pending: 0, resumed: false });
          continue;
        }

        // Запускаем отправку через run-email-campaign (он сам помечает sending и шлёт)
        const { error: invErr } = await admin.functions.invoke("run-email-campaign", {
          body: { campaignId: c.id },
        });
        if (invErr) throw invErr;

        results.push({ id: c.id, name: c.name, pending: pendingCount, resumed: true });
      } catch (e) {
        results.push({ id: c.id, name: c.name, pending: -1, resumed: false, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-paused-campaigns error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
