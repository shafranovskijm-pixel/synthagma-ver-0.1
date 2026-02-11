import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Напиши статью на тему: "${topic}"` },
        ],
        tools: [
          {
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
          },
        ],
        tool_choice: { type: "function", function: { name: "create_blog_post" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Превышен лимит запросов. Попробуйте позже." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Требуется пополнение баланса для использования ИИ." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response received");

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const blogPost = JSON.parse(toolCall.function.arguments);

    // Generate slug from title
    const slug = blogPost.title
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
