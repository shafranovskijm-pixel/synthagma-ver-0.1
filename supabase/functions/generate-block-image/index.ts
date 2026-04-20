// Generate image via Lovable AI Gateway (Nano Banana — google/gemini-2.5-flash-image)
// Returns { url } where url is a data:image/png;base64,... that the client uploads to storage if needed.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = (body?.prompt || "").toString().trim();
    const imageUrl = body?.imageUrl as string | undefined;
    const model = (body?.model as string | undefined) || "google/gemini-2.5-flash-image";

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build messages — text-only, or multimodal for editing
    const userContent: any[] = [{ type: "text", text: prompt }];
    if (imageUrl) {
      userContent.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userContent }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text().catch(() => "");
      console.error("Lovable AI image gateway error:", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Add credits to your Lovable AI workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Image gateway error: ${aiResp.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const dataUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
    if (!dataUrl) {
      return new Response(JSON.stringify({ error: "No image returned by AI gateway" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to upload to storage so we get a stable URL (data URLs may be huge to persist in DB)
    let publicUrl: string | null = null;
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && dataUrl.startsWith("data:image/")) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          const mime = match[1];
          const ext = mime.split("/")[1].split("+")[0];
          const bin = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
          const fileName = `ai-block-images/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("course-files")
            .upload(fileName, bin, { contentType: mime, upsert: true });
          if (!upErr) {
            publicUrl = `${SUPABASE_URL}/storage/v1/object/public/course-files/${fileName}`;
          } else {
            console.warn("Storage upload failed, returning data URL:", upErr.message);
          }
        }
      }
    } catch (e) {
      console.warn("Storage upload exception, falling back to data URL:", e);
    }

    return new Response(JSON.stringify({ url: publicUrl || dataUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-block-image error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
