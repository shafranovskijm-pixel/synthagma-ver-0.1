import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_HINTS: Record<string, string> = {
  friendly: "warm friendly smile, soft lighting",
  strict: "serious confident expression, formal business attire",
  mentor: "wise experienced look, calm gaze",
  peer: "casual modern look, approachable",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user?.id) return json({ error: "Unauthorized" }, 401);

    const { name, subject, style } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY не настроен");

    const styleHint = STYLE_HINTS[style] || STYLE_HINTS.friendly;
    const prompt = `Professional portrait photo of an educator/teacher${name ? ` named ${name}` : ""}, expert in ${subject || "education"}. ${styleHint}. Studio lighting, neutral background, looking at camera, head and shoulders, photorealistic, high quality, suitable as a profile avatar.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (resp.status === 429) return json({ error: "Превышен лимит запросов" }, 429);
    if (resp.status === 402) return json({ error: "Недостаточно ИИ-кредитов" }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("Image gen error", resp.status, t);
      return json({ error: "Не удалось сгенерировать изображение" }, 500);
    }

    const data = await resp.json();
    const dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
    if (!dataUrl) return json({ error: "Модель не вернула изображение" }, 500);

    // Загружаем base64 → storage
    const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) return json({ error: "Неверный формат изображения" }, 500);
    const [, mime, b64] = m;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1] || "png";
    const path = `ai-avatars/${u.user.id}/${Date.now()}.${ext}`;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: upErr } = await admin.storage.from("course-files").upload(path, bytes, {
      contentType: mime, upsert: false,
    });
    if (upErr) {
      console.error("Storage upload error", upErr);
      return json({ error: "Не удалось сохранить изображение" }, 500);
    }
    const { data: pub } = admin.storage.from("course-files").getPublicUrl(path);
    return json({ imageUrl: pub.publicUrl });
  } catch (e) {
    console.error("[ai-avatar-generate-image]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(d: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(d), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status,
  });
}
