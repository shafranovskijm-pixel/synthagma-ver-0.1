import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Create authenticated client to verify the caller
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user identity
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has appropriate role (organization or admin)
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || (roleData.role !== 'organization' && roleData.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Organization or admin role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { title, description } = await req.json();

    if (!title?.trim()) {
      return new Response(
        JSON.stringify({ error: "Название курса обязательно" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Ты - эксперт по созданию образовательных курсов. Твоя задача - создать структуру курса на основе названия и описания.

Правила:
1. Создай от 5 до 12 уроков в зависимости от сложности темы
2. Каждый урок должен иметь тип: "text" (теория), "video" (видеоурок), "audio" (аудиолекция), или "test" (тест)
3. Структура должна быть логичной: от простого к сложному
4. Начинай с введения, заканчивай итоговым тестом
5. Добавляй тесты после каждых 2-3 теоретических уроков
6. Названия уроков должны быть конкретными и информативными

Ответ должен содержать массив уроков в формате JSON.`;

    const userPrompt = `Создай структуру курса:
Название: ${title}
${description ? `Описание: ${description}` : ""}

Верни массив уроков.`;

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
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_course_structure",
              description: "Создает структуру курса с уроками",
              parameters: {
                type: "object",
                properties: {
                  lessons: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Название урока" },
                        type: { 
                          type: "string", 
                          enum: ["text", "video", "audio", "test"],
                          description: "Тип урока"
                        },
                        description: { type: "string", description: "Краткое описание содержания урока" }
                      },
                      required: ["title", "type"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["lessons"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_course_structure" } }
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
          JSON.stringify({ error: "Требуется пополнение баланса." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Ошибка AI сервиса");
    }

    const result = await response.json();
    
    console.log("AI response structure:", JSON.stringify(result, null, 2).substring(0, 500));
    
    let lessons = [];
    
    // Try to extract from tool call first
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.name === "create_course_structure") {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        lessons = args.lessons || [];
      } catch (e) {
        console.error("Failed to parse tool call arguments:", e);
      }
    }
    
    // Fallback: try to parse from message content if tool call didn't work
    if (lessons.length === 0) {
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        console.log("Trying to parse from content:", content.substring(0, 300));
        try {
          // Try to find JSON in the content
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            lessons = JSON.parse(jsonMatch[0]);
          } else {
            const objMatch = content.match(/\{[\s\S]*"lessons"[\s\S]*\}/);
            if (objMatch) {
              const parsed = JSON.parse(objMatch[0]);
              lessons = parsed.lessons || [];
            }
          }
        } catch (e) {
          console.error("Failed to parse content as JSON:", e);
        }
      }
    }
    
    if (lessons.length === 0) {
      console.error("No lessons extracted. Full response:", JSON.stringify(result));
      throw new Error("Не удалось сгенерировать структуру курса. Попробуйте ещё раз.");
    }

    console.log(`Generated course structure for user ${user.id}: ${lessons.length} lessons`);

    return new Response(
      JSON.stringify({ success: true, lessons }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-course-structure error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Неизвестная ошибка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
