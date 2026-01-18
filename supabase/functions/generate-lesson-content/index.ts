import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { lessonTitle, lessonType, courseTitle, courseDescription } = await req.json();

    if (!lessonTitle?.trim()) {
      return new Response(
        JSON.stringify({ error: "Название урока обязательно" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let systemPrompt = "";
    let toolDefinition: any = null;

    if (lessonType === "test") {
      systemPrompt = `Ты - эксперт по созданию образовательных тестов. Создай тестовые вопросы для урока.

Правила:
1. Создай от 5 до 10 вопросов
2. Каждый вопрос должен иметь 4 варианта ответа
3. Только один ответ правильный
4. Вопросы должны проверять понимание материала
5. Вопросы должны быть разной сложности
6. Избегай очевидных ответов`;

      toolDefinition = {
        type: "function",
        function: {
          name: "create_test_questions",
          description: "Создает тестовые вопросы для урока",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string", description: "Текст вопроса" },
                    options: {
                      type: "array",
                      items: { type: "string" },
                      description: "4 варианта ответа"
                    },
                    correctAnswer: { 
                      type: "number", 
                      description: "Индекс правильного ответа (0-3)" 
                    }
                  },
                  required: ["question", "options", "correctAnswer"],
                  additionalProperties: false
                }
              }
            },
            required: ["questions"],
            additionalProperties: false
          }
        }
      };
    } else {
      systemPrompt = `Ты - эксперт по созданию образовательного контента. Создай подробный контент для урока.

Правила:
1. Контент должен быть структурированным и понятным
2. Используй заголовки, списки, примеры
3. Объясняй сложные концепции простым языком
4. Добавляй практические примеры
5. Контент должен быть достаточно подробным (минимум 500 слов)
6. Структура: введение, основная часть с подразделами, заключение`;

      toolDefinition = {
        type: "function",
        function: {
          name: "create_lesson_content",
          description: "Создает контент урока",
          parameters: {
            type: "object",
            properties: {
              blocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { 
                      type: "string", 
                      enum: ["heading1", "heading2", "paragraph", "bulletList", "numberedList", "quote"],
                      description: "Тип блока контента"
                    },
                    content: { type: "string", description: "Содержимое блока" }
                  },
                  required: ["type", "content"],
                  additionalProperties: false
                }
              }
            },
            required: ["blocks"],
            additionalProperties: false
          }
        }
      };
    }

    const userPrompt = `Создай контент для урока:
Название урока: ${lessonTitle}
${courseTitle ? `Курс: ${courseTitle}` : ""}
${courseDescription ? `Описание курса: ${courseDescription}` : ""}
Тип: ${lessonType === "test" ? "тест с вопросами" : "текстовый урок"}`;

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
        tools: [toolDefinition],
        tool_choice: { 
          type: "function", 
          function: { name: lessonType === "test" ? "create_test_questions" : "create_lesson_content" } 
        }
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
    console.log("AI response for user", user.id);
    
    // Try to get tool call first
    let args: any = null;
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse tool call arguments:", e);
      }
    }
    
    // Fallback: try to parse content as JSON if no tool call
    if (!args) {
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        console.log("No tool call, trying to parse content as JSON");
        try {
          // Try to extract JSON from content
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                           content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            args = JSON.parse(jsonStr);
          }
        } catch (e) {
          console.error("Failed to parse content as JSON:", e);
        }
      }
    }
    
    if (!args) {
      console.error("Could not extract structured data from AI response");
      throw new Error("Неверный формат ответа AI");
    }

    if (lessonType === "test") {
      return new Response(
        JSON.stringify({ success: true, questions: args.questions || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: true, blocks: args.blocks || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("generate-lesson-content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Неизвестная ошибка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
