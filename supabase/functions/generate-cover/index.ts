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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let context = "";
    let coverType: "org" | "course" | "admin" = type;

    if (type === "admin") {
      // Admin dashboard cover — generic educational platform banner
      const { data: orgs } = await supabase
        .from("organizations")
        .select("name")
        .limit(5);
      const orgNames = (orgs || []).map((o: any) => o.name).join(", ");
      context = `Панель администратора образовательной платформы. Организации: ${orgNames || "учебные центры"}`;
      coverType = "admin";
    } else if (type === "org" && organizationId) {
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
      throw new Error("organizationId or courseId is required, or type must be 'admin'");
    }

    const bannerDesc = coverType === "course"
      ? "квадратной обложки курса"
      : "широкой баннерной обложки учебного центра";

    const compositionDesc = coverType === "course"
      ? "Чистая композиция с центральным объектом"
      : "Широкоформатный баннер с градиентами и абстрактной тематикой направления школы";

    // Step 1: Generate image prompt
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
            content: `Ты генератор промптов для создания обложек. На вход получаешь контекст организации/курса. На выход даёшь ТОЛЬКО короткий промпт на английском (1-2 предложения) для генерации ${bannerDesc}.

Требования к промпту:
- Фотореалистичный стиль, профессиональное качество
- БЕЗ текста, надписей, букв, цифр на изображении
- Один главный объект или сцена, связанная с тематикой
- Красивая цветовая палитра, подходящая для образовательной платформы
- ${compositionDesc}

Отвечай ТОЛЬКО промптом, без пояснений.`
          },
          { role: "user", content: context },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI prompt generation error:", aiResponse.status, errorText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Необходимо пополнить баланс ИИ" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Failed to generate image prompt");
    }

    const aiData = await aiResponse.json();
    const imagePrompt = aiData.choices?.[0]?.message?.content?.trim() || "";
    console.log(`[generate-cover] Generated prompt: "${imagePrompt}"`);

    if (!imagePrompt) throw new Error("AI returned empty prompt");

    // Step 2: Generate image (Lovable AI → GigaChat fallback)
    let base64Url: string | null = null;

    try {
      console.log("[generate-cover] Trying Lovable AI image generation...");
      const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (imageResponse.status === 429) {
        console.warn("[generate-cover] Lovable AI rate limited, will try GigaChat...");
      } else if (imageResponse.status === 402) {
        console.warn("[generate-cover] Lovable AI payment required, will try GigaChat...");
      } else if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        base64Url = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
        if (base64Url) {
          console.log("[generate-cover] Lovable AI image generated successfully");
        }
      } else {
        console.warn("[generate-cover] Lovable AI image error:", imageResponse.status);
      }
    } catch (e) {
      console.warn("[generate-cover] Lovable AI image error:", e);
    }

    // GigaChat fallback
    if (!base64Url) {
      console.log("[generate-cover] Falling back to GigaChat...");
      try {
        const gigachatResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ prompt: imagePrompt, provider: "gigachat" }),
        });

        if (gigachatResponse.ok) {
          const gigachatData = await gigachatResponse.json();
          if (gigachatData.url) {
            console.log("[generate-cover] GigaChat returned URL, downloading...");
            const imgDl = await fetch(gigachatData.url);
            if (imgDl.ok) {
              const imgBlob = await imgDl.arrayBuffer();
              const imgBytes = new Uint8Array(imgBlob);
              let binary = "";
              for (let i = 0; i < imgBytes.length; i++) binary += String.fromCharCode(imgBytes[i]);
              base64Url = `data:image/jpeg;base64,${btoa(binary)}`;
              console.log("[generate-cover] GigaChat image downloaded successfully");
            }
          }
        } else {
          console.error("[generate-cover] GigaChat fallback error:", gigachatResponse.status);
        }
      } catch (e) {
        console.error("[generate-cover] GigaChat fallback error:", e);
      }
    }

    if (!base64Url) {
      throw new Error("Не удалось сгенерировать изображение ни одним провайдером");
    }

    // Step 3: Upload to storage
    const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    let folder: string;
    if (coverType === "admin") {
      folder = "admin-covers";
    } else if (coverType === "org") {
      folder = "org-covers";
    } else {
      folder = `${courseId}/cover`;
    }
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
    if (coverType === "admin") {
      // Update admin_branding table
      const { data: existing } = await supabase
        .from("admin_branding")
        .select("id")
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from("admin_branding")
          .update({ cover_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("admin_branding")
          .insert({ cover_url: publicUrl });
      }
    } else if (coverType === "org" && organizationId) {
      await supabase
        .from("organizations")
        .update({ cover_url: publicUrl })
        .eq("id", organizationId);
    } else if (coverType === "course" && courseId) {
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
