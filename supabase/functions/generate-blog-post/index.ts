import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithTools } from "../_shared/gigachat-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateRequest {
  topic: string;
  category: string;
  style?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, category, style = "информативный" }: GenerateRequest = await req.json();

    console.log("Generating blog post for topic:", topic);

    const systemPrompt = `Ты — профессиональный копирайтер для EdTech-платформы СИНТАГМА. 
Пиши статьи на русском языке для блога об онлайн-обучении, автоматизации образовательных процессов и EdTech-технологиях.

Требования к статье:
- Стиль: ${style}
- Категория: ${category}
- Язык: русский
- Целевая аудитория: руководители образовательных организаций, HR-директора, методисты

Формат ответа (строго JSON):
{
  "title": "Заголовок статьи (до 80 символов)",
  "excerpt": "Краткое описание статьи для превью (до 200 символов)",
  "content": "Полный текст статьи в формате Markdown с заголовками ##, списками, выделением **жирным**",
  "readTime": "X мин"
}`;

    const tool = {
      type: "function",
      function: {
        name: "create_blog_post",
        description: "Создает структурированную статью для блога",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Заголовок статьи" },
            excerpt: { type: "string", description: "Краткое описание для превью" },
            content: { type: "string", description: "Полный текст статьи в Markdown" },
            readTime: { type: "string", description: "Время чтения, например '5 мин'" },
          },
          required: ["title", "excerpt", "content", "readTime"],
          additionalProperties: false,
        },
      },
    };

    let blogPost: any;
    try {
      blogPost = await callAIWithTools(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Напиши статью на тему: "${topic}"` },
        ],
        tool,
        "GigaChat-Max",
        "google/gemini-3-flash-preview",
        "gigachat",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("AI error:", msg);
      if (msg.includes("429")) {
        return new Response(
          JSON.stringify({ error: "Превышен лимит запросов. Попробуйте позже." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (msg.includes("402")) {
        return new Response(
          JSON.stringify({ error: "Требуется пополнение баланса для использования ИИ." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw err;
    }

    console.log("AI response received");

    // Generate slug from title
    const slug = (blogPost.title || "")
      .toLowerCase()
      .replace(/[^a-zа-яё0-9\s]/gi, "")
      .replace(/\s+/g, "-")
      .substring(0, 100);

    return new Response(
      JSON.stringify({
        success: true,
        post: {
          ...blogPost,
          slug,
          category,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error generating blog post:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate blog post" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
