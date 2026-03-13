import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/gigachat-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, context } = await req.json();

    console.log("Processing student chat request for user", user.id, "with", messages?.length || 0, "messages");

    // Build context-aware system prompt
    let contextInfo = '';
    if (context) {
      if (context.courseTitle) {
        contextInfo += `\n\nТекущий курс: "${context.courseTitle}"`;
      }
      if (context.lessonTitle) {
        contextInfo += `\nТекущий урок: "${context.lessonTitle}"`;
        if (context.lessonType === 'test') {
          contextInfo += ' (это тестовый урок)';
        }
      }
      if (context.lessonContent) {
        contextInfo += `\n\nСодержание текущего урока:\n${context.lessonContent.substring(0, 4000)}`;
      }
    }

    const systemPrompt = `Ты — ИИ-помощник образовательной платформы СИНТАГМА. 
Твоя задача — помогать студентам в обучении:
- Объяснять сложные концепции простым языком
- Отвечать на вопросы по материалам курсов
- Помогать с домашними заданиями и тестами
- Мотивировать студентов продолжать обучение
- Давать полезные советы по эффективному обучению

Будь дружелюбным, терпеливым и поддерживающим. Используй примеры для лучшего понимания.
Отвечай на русском языке. Если вопрос не связан с обучением, вежливо направь разговор в образовательное русло.
${contextInfo}`;

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Use shared callAI with automatic Lovable AI → GigaChat fallback
    const result = await callAI(
      allMessages,
      4096,
      undefined, // default: Lovable AI first, GigaChat fallback
      "GigaChat-Max",
      "google/gemini-3-flash-preview",
    );

    console.log("Successfully generated response for user", user.id, "via model:", result.model);

    return new Response(
      JSON.stringify({ content: result.text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Произошла ошибка при обработке запроса";
    console.error("Student chat error:", msg);

    // Surface specific error codes
    if (msg.includes("402")) {
      return new Response(
        JSON.stringify({ error: "Все провайдеры ИИ недоступны. Обратитесь к администратору." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
