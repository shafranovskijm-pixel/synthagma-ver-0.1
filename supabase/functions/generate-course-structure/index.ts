import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGigaChat, callLovableAIWithTools } from "../_shared/gigachat-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const defaultSystemPrompt = `Ты - эксперт по созданию образовательных курсов для дополнительного профессионального образования (ДПО).

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
5. ОБЯЗАТЕЛЬНО: последний урок курса должен быть тестом с названием "Итоговое тестирование" (тип "test"). Он всегда идёт последним.
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
- Итоговое тестирование (ВСЕГДА последний, тип "test")

ПРАКТИЧЕСКИЕ ЗАДАНИЯ могут быть:
- Ситуационные задачи (описание рабочей ситуации + вопросы для анализа)
- Кейс-стади (реальный или приближённый к реальности случай из практики)
- Анализ нормативного документа (разбор приказа, регламента, инструкции)
- Составление документа (заполнение формы, акта, протокола)
- Разбор типичных ошибок и нарушений

ВАЖНО:
- Ссылайся только на действующие нормативно-правовые акты
- Учитывай современные требования законодательства РФ
- Названия должны отражать конкретное содержание, а не быть абстрактными

КРИТИЧЕСКИ ВАЖНО:
- Последний урок ОБЯЗАТЕЛЬНО должен называться ТОЧНО "Итоговое тестирование" (тип "test")
- Он ВСЕГДА идёт последним в списке, после всех лекций и практик
- НЕ ДОБАВЛЯЙ другие уроки после итогового тестирования

Отвечай СТРОГО в формате JSON: {"lessons": [{"title": "...", "type": "text|test|practice", "description": "..."}]}
Без markdown-обёртки, только JSON.`;

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

    const { data: roleData, error: roleError } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    console.log("Role check for user", user.id, ":", JSON.stringify(roleData), "error:", roleError?.message);

    if (!roleData || (roleData.role !== 'organization' && roleData.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Organization or admin role required.", roleData, roleError: roleError?.message }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { title, description, customSystemPrompt } = await req.json();

    if (!title?.trim()) {
      return new Response(
        JSON.stringify({ error: "Название курса обязательно" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = customSystemPrompt || defaultSystemPrompt;
    const userPrompt = `Создай структуру курса:\nНазвание: ${title}\n${description ? `Описание: ${description}` : ""}\n\nВерни массив уроков.`;

    let lessons: any[] = [];
    let usedModel = "unknown";

    // === Try GigaChat first ===
    try {
      console.log("[generate-course-structure] Trying GigaChat...");
      const gcResponse = await callGigaChat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        "GigaChat-Pro",
        8192
      );

      const cleaned = gcResponse.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      lessons = parsed.lessons || parsed;
      usedModel = "GigaChat-Pro";
      console.log(`[generate-course-structure] GigaChat succeeded: ${lessons.length} lessons`);
    } catch (gcErr) {
      const gcMsg = gcErr instanceof Error ? gcErr.message : String(gcErr);
      console.warn("[generate-course-structure] GigaChat failed, falling back to Lovable AI:", gcMsg);

      // === Fallback: Lovable AI with tool calling ===
      const tool = {
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
      };

      try {
        const result = await callLovableAIWithTools(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tool,
          "google/gemini-3-flash-preview"
        );
        lessons = result.lessons || [];
        usedModel = "Gemini 3 Flash";
      } catch (lovableErr) {
        const lovMsg = lovableErr instanceof Error ? lovableErr.message : String(lovableErr);
        // Surface 402/429 to client
        if (lovMsg.includes("402") || lovMsg.includes("Payment")) {
          return new Response(
            JSON.stringify({ error: "Требуется пополнение баланса." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (lovMsg.includes("429") || lovMsg.includes("Rate limit")) {
          return new Response(
            JSON.stringify({ error: "Превышен лимит запросов. Попробуйте позже." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw lovableErr;
      }
    }

    if (lessons.length === 0) {
      throw new Error("Не удалось сгенерировать структуру курса. Попробуйте ещё раз.");
    }

    // Post-process: ensure last lesson is "Итоговое тестирование" (test)
    const lastLesson = lessons[lessons.length - 1];
    if (lastLesson.type !== "test" || !lastLesson.title?.includes("тестирование")) {
      const finalTestIdx = lessons.findIndex((l: any) =>
        l.type === "test" && (l.title?.includes("Итоговое") || l.title?.includes("итоговое"))
      );
      if (finalTestIdx >= 0 && finalTestIdx !== lessons.length - 1) {
        const [finalTest] = lessons.splice(finalTestIdx, 1);
        lessons.push(finalTest);
      } else if (lastLesson.type !== "test") {
        lessons.push({ title: "Итоговое тестирование", type: "test", description: "Итоговый тест по всему курсу" });
      } else {
        lastLesson.title = "Итоговое тестирование";
      }
    }

    console.log(`Generated course structure for user ${user.id}: ${lessons.length} lessons (model: ${usedModel})`);

    return new Response(
      JSON.stringify({ success: true, lessons, model: usedModel }),
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
