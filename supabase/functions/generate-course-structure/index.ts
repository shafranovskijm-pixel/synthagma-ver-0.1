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

    const systemPrompt = `Ты - эксперт по созданию образовательных курсов для дополнительного профессионального образования (ДПО).

Твоя задача - создать структуру учебного курса на основе названия и описания.

ТИПЫ УРОКОВ (используй ТОЛЬКО эти три):
- "text" — теоретическая лекция (основной тип)
- "test" — промежуточный или итоговый тест для проверки знаний
- "practice" — практическое задание: ситуационная задача, кейс, анализ документа, разбор реальной ситуации

ЗАПРЕЩЕНО использовать типы "video" и "audio" — курс полностью текстовый.

ПРАВИЛА СТРУКТУРЫ:
1. Создай от 8 до 15 уроков в зависимости от сложности темы
2. Начинай с вводной лекции (общие понятия, цели курса, нормативная база)
3. После каждых 2-3 теоретических лекций ставь промежуточный тест
4. Включи 1-2 практических задания (кейсы, ситуационные задачи, анализ документов)
5. Завершай курс итоговым тестом
6. Названия уроков должны быть конкретными и профессиональными
7. Логика: от базовых понятий → к деталям → к практике → к проверке

ПРИМЕРНАЯ СТРУКТУРА:
- Лекция: Введение и основные понятия
- Лекция: [Тема 1]
- Лекция: [Тема 2]  
- Тест: Проверка знаний по темам 1-2
- Лекция: [Тема 3]
- Практика: Ситуационная задача / кейс
- Лекция: [Тема 4]
- Лекция: [Тема 5]
- Тест: Проверка знаний по темам 3-5
- Практика: Анализ документа / разбор случая
- Итоговый тест

ПРАКТИЧЕСКИЕ ЗАДАНИЯ могут быть:
- Ситуационные задачи (описание рабочей ситуации + вопросы для анализа)
- Кейс-стади (реальный или приближённый к реальности случай из практики)
- Анализ нормативного документа (разбор приказа, регламента, инструкции)
- Составление документа (заполнение формы, акта, протокола)
- Разбор типичных ошибок и нарушений

ВАЖНО:
- Ссылайся только на действующие нормативно-правовые акты
- Учитывай современные требования законодательства РФ
- Названия должны отражать конкретное содержание, а не быть абстрактными`;

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
                          enum: ["text", "test", "practice"],
                          description: "Тип урока: text (лекция), test (тест), practice (практическое задание)"
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
    
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.name === "create_course_structure") {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        lessons = args.lessons || [];
      } catch (e) {
        console.error("Failed to parse tool call arguments:", e);
      }
    }
    
    if (lessons.length === 0) {
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        try {
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
