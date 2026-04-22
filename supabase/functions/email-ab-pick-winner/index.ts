// Cron-функция: для активных A/B-кампаний выбирает победителя по open rate
// и запускает отправку оставшимся получателям с темой-победителем.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Минимальное время с момента отправки sample до выбора победителя
const MIN_WAIT_MINUTES = 30;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const cutoff = new Date(Date.now() - MIN_WAIT_MINUTES * 60 * 1000).toISOString();

    // Кандидаты: A/B-кампании без победителя, sample отправлен ≥ MIN_WAIT_MINUTES назад
    const { data: campaigns, error } = await admin
      .from("email_campaigns")
      .select("id, name, ab_sample_started_at")
      .eq("ab_test_enabled", true)
      .is("ab_winner", null)
      .not("subject_b", "is", null)
      .not("ab_sample_started_at", "is", null)
      .lte("ab_sample_started_at", cutoff);

    if (error) throw error;

    const results: any[] = [];

    for (const c of campaigns || []) {
      // Считаем open rate по a и b
      const { data: aRows } = await admin
        .from("email_campaign_recipients")
        .select("status, opened_at", { count: "exact" })
        .eq("campaign_id", c.id)
        .eq("subject_variant", "a");

      const { data: bRows } = await admin
        .from("email_campaign_recipients")
        .select("status, opened_at", { count: "exact" })
        .eq("campaign_id", c.id)
        .eq("subject_variant", "b");

      const aSent = (aRows || []).filter((r: any) => r.status === "sent" || r.status === "opened" || r.opened_at).length;
      const bSent = (bRows || []).filter((r: any) => r.status === "sent" || r.status === "opened" || r.opened_at).length;
      const aOpened = (aRows || []).filter((r: any) => r.opened_at).length;
      const bOpened = (bRows || []).filter((r: any) => r.opened_at).length;

      // Если в одной из выборок пока нечего сравнивать — ждём
      if (aSent === 0 || bSent === 0) {
        results.push({ campaign: c.id, skipped: "sample not sent yet" });
        continue;
      }

      const aRate = aSent > 0 ? aOpened / aSent : 0;
      const bRate = bSent > 0 ? bOpened / bSent : 0;
      const winner: "a" | "b" = bRate > aRate ? "b" : "a";

      // Помечаем неотправленных pending как winner-вариант
      await admin
        .from("email_campaign_recipients")
        .update({ subject_variant: winner })
        .eq("campaign_id", c.id)
        .eq("status", "pending")
        .is("subject_variant", null);

      await admin.from("email_campaigns").update({
        ab_winner: winner,
        ab_winner_picked_at: new Date().toISOString(),
      }).eq("id", c.id);

      // Запускаем рассылку оставшимся
      try {
        await admin.functions.invoke("run-email-campaign", { body: { campaignId: c.id } });
      } catch (e) {
        console.error("trigger run-email-campaign failed", e);
      }

      results.push({
        campaign: c.id,
        name: c.name,
        winner,
        a: { sent: aSent, opened: aOpened, rate: aRate },
        b: { sent: bSent, opened: bOpened, rate: bRate },
      });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("email-ab-pick-winner error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
