import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIWithTools } from "../_shared/gigachat-client.ts";

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

    const { lessonTitle, lessonType, courseTitle, courseDescription, previousLessons, ai_provider, taskIndex, lessonIndex, rawText } = await req.json();

    // For "format" mode, rawText is required instead of lessonTitle
    if (lessonType !== "format" && !lessonTitle?.trim()) {
      return new Response(
        JSON.stringify({ error: "Название урока обязательно" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (lessonType === "format" && !rawText?.trim()) {
      return new Response(
        JSON.stringify({ error: "Текст для оформления обязателен" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let usedModel = "unknown";
    let systemPrompt = "";
    let toolDefinition: any = null;

    if (lessonType === "test") {
      systemPrompt = `Ты - эксперт по созданию образовательных тестов для ДПО. Создай тестовые вопросы для урока.

Правила:
1. Создай от 5 до 10 вопросов
2. Каждый вопрос должен иметь 4 варианта ответа
3. Только один ответ правильный
4. Вопросы должны проверять понимание материала, а не запоминание дат
5. Вопросы должны быть разной сложности (от базовых к сложным)
6. Избегай очевидных ответов и формулировок типа "все перечисленное"
7. Ссылайся только на действующие НПА и ГОСТы`;

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
    } else if (lessonType === "practice") {
      const practiceGreetingRule = (lessonIndex != null && lessonIndex > 0)
        ? `9. НЕ начинай с приветствия или обращения к слушателям. Начинай СРАЗУ с описания ситуации.`
        : '';

      systemPrompt = `Ты - эксперт по созданию практических заданий для курсов ДПО. Создай практическое задание (кейс / ситуационную задачу) для урока.

Правила:
1. Контент должен содержать реалистичную рабочую ситуацию или кейс
2. Структура: описание ситуации → вводные данные → задание → вопросы для анализа → ожидаемый результат
3. Используй конкретные цифры, даты, названия (приближенные к реальности)
4. Включи 3-5 вопросов для анализа ситуации
5. Добавь раздел "Нормативная база" со ссылками на действующие НПА
6. Контент минимум 400 слов
7. Типы заданий: разбор ситуации, анализ документа, выявление нарушений, составление плана действий
8. Проверяй актуальность НПА, приказов, постановлений и ГОСТов
${practiceGreetingRule}
10. ОБЯЗАТЕЛЬНО используй callout-блоки:
  - "callout-warning" — для предупреждений и опасных факторов в кейсе
  - "callout-info" — для нормативных ссылок
  - "callout-danger" — для критических нарушений
  - "highlight" — для ключевых выводов`;

      toolDefinition = {
        type: "function",
        function: {
          name: "create_lesson_content",
          description: "Создает контент практического задания",
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
                      enum: ["heading1", "heading2", "paragraph", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip", "callout-danger", "highlight", "accordion"],
                      description: "Тип блока контента. Используй callout-warning для предупреждений, callout-info для справки, callout-danger для нарушений, highlight для ключевых выводов"
                    },
                    content: { type: "string", description: "Содержимое блока" },
                    accordionTitle: { type: "string", description: "Заголовок для accordion блока (только для type=accordion)" }
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
    } else if (lessonType === "format") {
      systemPrompt = `Ты — эксперт по оформлению образовательного контента. Тебе дан сырой текст, скопированный пользователем. Твоя задача — красиво оформить его, НЕ меняя содержание:

1. Разбей на логические секции с заголовками (heading1, heading2)
2. Найди все URL-ссылки и оберни их в HTML-теги <a href="..." target="_blank" rel="noopener noreferrer">текст ссылки</a>
3. Выдели ключевые определения и термины в highlight-блоки
4. Оберни практические советы в callout-tip
5. Важные предупреждения — в callout-warning
6. Справочную/дополнительную информацию — в accordion (обязательно укажи accordionTitle)
7. Перечисления оформи как bulletList или numberedList
8. Длинные абзацы разбей на параграфы по 2-3 предложения
9. НЕ удаляй и не меняй смысл текста — только оформление и структурирование
10. На каждые 3-4 параграфа — минимум 1 callout или highlight блок`;

      toolDefinition = {
        type: "function",
        function: {
          name: "create_lesson_content",
          description: "Оформляет текст в структурированные блоки",
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
                      enum: ["heading1", "heading2", "paragraph", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip", "callout-danger", "highlight", "accordion"],
                      description: "Тип блока контента"
                    },
                    content: { type: "string", description: "Содержимое блока. Для ссылок используй HTML-тег <a>" },
                    accordionTitle: { type: "string", description: "Заголовок для accordion блока (только для type=accordion)" }
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
    } else {
      const greetingRule = (lessonIndex != null && lessonIndex > 0)
        ? `9. НЕ начинай с приветствия или обращения к слушателям (никаких «Уважаемые коллеги», «Дорогие слушатели» и т.п.). Начинай СРАЗУ с тематического содержания.`
        : `9. Можно начать с краткого приветствия слушателей, если это первый урок курса.`;

      systemPrompt = `Ты - эксперт по созданию образовательного контента для курсов ДПО. Создай подробный контент для лекции.

Правила:
1. Контент должен быть структурированным и понятным
2. Используй заголовки, списки, примеры
3. Объясняй сложные концепции простым языком
4. Добавляй практические примеры из реальной профессиональной деятельности
5. Контент должен быть достаточно подробным (минимум 500 слов)
6. Структура: введение, основная часть с подразделами, заключение
7. Проверяй актуальность нормативно-правовых документов и законов. Ссылайся только на действующие редакции НПА, приказов, постановлений и ГОСТов.
8. Актуализируй информацию: не используй устаревшие данные, нормы и формулировки.
${greetingRule}
10. ОБЯЗАТЕЛЬНО используй разнообразные типы блоков для визуального оформления:
  - "callout-warning" — для предупреждений, техники безопасности, опасных факторов
  - "callout-info" — для справочной информации, нормативных ссылок, определений
  - "callout-tip" — для практических советов и рекомендаций
  - "callout-danger" — для критически важной информации, запретов, грубых нарушений
  - "highlight" — для ключевых определений и терминов (выделение)
  - "accordion" — для дополнительных/справочных материалов (укажи accordionTitle)
11. На каждые 3-4 параграфа — минимум 1 callout или highlight блок. Это ОБЯЗАТЕЛЬНО.`;

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
                      enum: ["heading1", "heading2", "paragraph", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip", "callout-danger", "highlight", "accordion"],
                      description: "Тип блока контента. Используй callout-warning для предупреждений, callout-info для справки, callout-tip для советов, callout-danger для запретов, highlight для ключевых терминов, accordion для доп. материалов"
                    },
                    content: { type: "string", description: "Содержимое блока" },
                    accordionTitle: { type: "string", description: "Заголовок для accordion блока (только для type=accordion)" }
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

    const previousLessonsList = Array.isArray(previousLessons) && previousLessons.length > 0
      ? `\n\nУЖЕ СОЗДАННЫЕ УРОКИ (НЕ ДУБЛИРУЙ ИХ СОДЕРЖАНИЕ, создай УНИКАЛЬНЫЙ контент):\n${previousLessons.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}`
      : "";

    const userPrompt = `Создай контент для урока:
Название урока: ${lessonTitle}
${courseTitle ? `Курс: ${courseTitle}` : ""}
${courseDescription ? `Описание курса: ${courseDescription}` : ""}
Тип: ${lessonType === "test" ? "тест с вопросами" : lessonType === "practice" ? "практическое задание (кейс/ситуационная задача)" : "текстовая лекция"}${previousLessonsList}`;

    try {
      const args = await callAIWithTools(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        toolDefinition ? { type: "function", function: toolDefinition.function } : undefined,
        "GigaChat-Pro",
        "google/gemini-3-flash-preview",
        ai_provider,
        taskIndex,
      );

      usedModel = "GigaChat/Lovable AI";
      console.log("AI response for user", user.id, "- extracted", lessonType === "test" ? "questions" : "blocks");

      if (lessonType === "test") {
        return new Response(
          JSON.stringify({ success: true, questions: args.questions || [], model: usedModel }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Post-process: fix accordion blocks with empty content
        const blocks = (args.blocks || []).map((b: any) => {
          if (b.type === "accordion" && !b.content?.trim() && b.accordionTitle?.trim()) {
            return { ...b, content: b.accordionTitle };
          }
          return b;
        }).filter((b: any) => b.content?.trim());

        return new Response(
          JSON.stringify({ success: true, blocks, model: usedModel }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      console.error("AI generation error:", errMsg);
      
      if (errMsg.includes("402") || errMsg.includes("Payment")) {
        return new Response(
          JSON.stringify({ error: "Требуется пополнение баланса." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (errMsg.includes("429") || errMsg.includes("Rate limit")) {
        return new Response(
          JSON.stringify({ error: "Превышен лимит запросов. Попробуйте позже." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw aiErr;
    }
  } catch (error) {
    console.error("generate-lesson-content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Неизвестная ошибка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
