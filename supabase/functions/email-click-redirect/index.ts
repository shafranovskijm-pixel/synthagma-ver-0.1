// Click tracking redirect: записывает клик и редиректит на оригинальный URL
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t");           // open_token получателя
    const target = url.searchParams.get("u");          // оригинальный URL (urlencoded)

    if (!target) {
      return new Response("Missing target URL", { status: 400, headers: corsHeaders });
    }

    let decodedTarget: string;
    try {
      decodedTarget = decodeURIComponent(target);
      // safety: только http/https
      if (!/^https?:\/\//i.test(decodedTarget)) throw new Error("bad scheme");
      new URL(decodedTarget); // throws if invalid
    } catch {
      return new Response("Invalid target URL", { status: 400, headers: corsHeaders });
    }

    if (token) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);

      // Не блокируем редирект — записываем клик асинхронно
      (async () => {
        try {
          const { data: rec } = await admin
            .from("email_campaign_recipients")
            .select("id, campaign_id, opened_at, status")
            .eq("open_token", token)
            .maybeSingle();

          if (rec) {
            const ua = req.headers.get("user-agent") || null;
            const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

            await admin.from("email_campaign_clicks").insert({
              campaign_id: rec.campaign_id,
              recipient_id: rec.id,
              url: decodedTarget,
              user_agent: ua,
              ip_address: ip,
            });

            // Инкрементируем click_count кампании
            const { data: c } = await admin.from("email_campaigns")
              .select("click_count").eq("id", rec.campaign_id).maybeSingle();
            await admin.from("email_campaigns").update({
              click_count: (c?.click_count || 0) + 1,
            }).eq("id", rec.campaign_id);

            // Если клик — фиксируем как открытие (если не было)
            if (!rec.opened_at) {
              await admin.from("email_campaign_recipients").update({
                opened_at: new Date().toISOString(),
                status: rec.status === "sent" ? "opened" : rec.status,
              }).eq("id", rec.id);
              const { data: camp } = await admin.from("email_campaigns")
                .select("open_count").eq("id", rec.campaign_id).maybeSingle();
              await admin.from("email_campaigns").update({
                open_count: (camp?.open_count || 0) + 1,
              }).eq("id", rec.campaign_id);
            }
          }
        } catch (e) {
          console.error("click track error", e);
        }
      })();
    }

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: decodedTarget, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("email-click-redirect error", e);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }
});
