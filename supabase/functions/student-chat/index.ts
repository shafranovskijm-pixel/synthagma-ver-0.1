import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Processing student chat request with", messages?.length || 0, "messages");

    const systemPrompt = `Ты — ИИ-помощник образовательной платформы СИНТАГМА. 
Твоя задача — помогать студентам в обучении:
- Объяснять сложные концепции простым языком
- Отвечать на вопросы по материалам курсов
- Помогать с домашними заданиями и тестами
- Мотивировать студентов продолжать обучение
- Давать полезные советы по эффективному обучению

Будь дружелюбным, терпеливым и поддерживающим. Используй примеры для лучшего понимания.
Отвечай на русском языке. Если вопрос не связан с обучением, вежливо направь разговор в образовательное русло.`;

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
          ...messages,
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Слишком много запросов. Пожалуйста, подождите немного." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Требуется пополнение баланса для использования ИИ." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Извините, не удалось получить ответ.";

    console.log("Successfully generated response");

    return new Response(
      JSON.stringify({ content }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Student chat error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Произошла ошибка при обработке запроса" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
