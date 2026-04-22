// Public read-only info about a webinar by public_token. No auth required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string" || token.length < 8) {
      return json({ error: "Bad token" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: w, error } = await admin
      .from("webinars")
      .select(
        "id, title, description, scheduled_at, status, source_type, allow_guests, guest_password, cover_image_url, embed_url, external_url",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (error || !w) return json({ error: "Webinar not found" }, 404);

    return json({
      ok: true,
      webinar: {
        id: w.id,
        title: w.title,
        description: w.description,
        scheduled_at: w.scheduled_at,
        status: w.status,
        source_type: w.source_type,
        allow_guests: w.allow_guests,
        requires_password: !!w.guest_password,
        cover_image_url: w.cover_image_url,
        // For external/kinescope webinars, we expose the embed link too
        embed_url: w.source_type === "external" ? w.embed_url || w.external_url : null,
      },
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
