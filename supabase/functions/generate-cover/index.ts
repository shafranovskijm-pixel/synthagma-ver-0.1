import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { organizationId, courseId, type } = await req.json();
    // type: "org" | "course"

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let context = "";

    if (type === "org" && organizationId) {
      // Fetch org name + all course titles
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();

      const { data: courses } = await supabase
        .from("courses")
        .select("title")
        .eq("organization_id", organizationId)
        .limit(50);

      const courseTitles = (courses || []).map((c: any) => c.title).join(", ");
      context = `Организация: "${org?.name || "Учебный центр"}". Курсы: ${courseTitles || "онлайн-обучение"}`;
    } else if (type === "course" && courseId) {
      const { data: course } = await supabase
        .from("courses")
        .select("title, description, organization_id")
        .eq("id", courseId)
        .single();

      if (course?.organization_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", course.organization_id)
          .single();
        context = `Организация: "${org?.name}". Курс: "${course?.title}". Описание: ${(course?.description || "").slice(0, 200)}`;
      } else {
        context = `Курс: "${course?.title}". Описание: ${(course?.description || "").slice(0, 200)}`;
      }
    } else {
      throw new Error("organizationId or courseId is required");
    }

    // Step 1: Use Lovable AI to generate an image prompt based on context
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Ты генератор промптов для создания обложек. На вход получаешь контекст организации/курса. На выход даёшь ТОЛЬКО короткий промпт на английском (1-2 предложения) для генерации ${type === "org" ? "широкой баннерной обложки учебного центра" : "квадратной обложки курса"}.

Требования к промпту:
- Фотореалистичный стиль, профессиональное качество
- БЕЗ текста, надписей, букв, цифр на изображении
- Один главный объект или сцена, связанная с тематикой
- Красивая цветовая палитра, подходящая для образовательной платформы
- ${type === "org" ? "Широкоформатный баннер с градиентами и абстрактной тематикой направления школы" : "Чистая композиция с центральным объектом"}

Отвечай ТОЛЬКО промптом, без пояснений.`
          },
          {
            role: "user",
            content: context,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI prompt generation error:", aiResponse.status, errorText);
      throw new Error("Failed to generate image prompt");
    }

    const aiData = await aiResponse.json();
    const imagePrompt = aiData.choices?.[0]?.message?.content?.trim() || "";
    console.log(`[generate-cover] Generated prompt: "${imagePrompt}"`);

    if (!imagePrompt) throw new Error("AI returned empty prompt");

    // Step 2: Generate image using Lovable AI image model
    const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: imagePrompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!imageResponse.ok) {
      if (imageResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (imageResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Недостаточно средств для генерации" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await imageResponse.text();
      console.error("Image generation error:", imageResponse.status, text);
      throw new Error("Image generation failed");
    }

    const imageData = await imageResponse.json();
    const base64Url = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!base64Url) {
      console.error("No image in response:", JSON.stringify(imageData).slice(0, 500));
      throw new Error("No image generated");
    }

    // Step 3: Upload to storage
    const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const folder = type === "org" ? "org-covers" : `${courseId}/cover`;
    const fileName = `${folder}/ai-cover-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(fileName, binaryData, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/course-files/${fileName}`;

    // Step 4: Update the record
    if (type === "org" && organizationId) {
      await supabase
        .from("organizations")
        .update({ cover_url: publicUrl })
        .eq("id", organizationId);
    } else if (type === "course" && courseId) {
      await supabase
        .from("courses")
        .update({ cover_image_url: publicUrl })
        .eq("id", courseId);
    }

    return new Response(JSON.stringify({ url: publicUrl, prompt: imagePrompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-cover error:", e);
    const status = e?.status || 500;
    const message = e?.message || (e instanceof Error ? e.message : "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
