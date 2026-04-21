import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 1x1 transparent GIF
const TRACKING_PIXEL = Uint8Array.from(atob(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
), (c) => c.charCodeAt(0));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t");
    if (!token) {
      return new Response(TRACKING_PIXEL, {
        headers: { ...corsHeaders, "Content-Type": "image/gif", "Cache-Control": "no-store" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: rec } = await admin
      .from("email_campaign_recipients")
      .select("id, campaign_id, opened_at, status")
      .eq("open_token", token)
      .maybeSingle();

    if (rec && !rec.opened_at) {
      await admin.from("email_campaign_recipients").update({
        opened_at: new Date().toISOString(),
        status: rec.status === "sent" ? "opened" : rec.status,
      }).eq("id", rec.id);

      // Инкрементируем open_count в кампании
      const { data: camp } = await admin
        .from("email_campaigns").select("open_count").eq("id", rec.campaign_id).maybeSingle();
      if (camp) {
        await admin.from("email_campaigns").update({
          open_count: (camp.open_count || 0) + 1,
        }).eq("id", rec.campaign_id);
      }
    }

    return new Response(TRACKING_PIXEL, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e) {
    console.error("track-email-open error", e);
    return new Response(TRACKING_PIXEL, {
      headers: { ...corsHeaders, "Content-Type": "image/gif" },
    });
  }
});
