// GigaChat integration for test answer generation and content creation
// Uses shared client: GigaChat first → Lovable AI fallback
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
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
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role check
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    
    console.log("Role check for user", user.id, ":", JSON.stringify(roleData), "error:", roleError?.message);
    
    if (roleError || !roleData || (roleData.role !== "organization" && roleData.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Insufficient permissions", detail: roleError?.message || "no matching role" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit (30 req/min for pipeline throughput)
    const rl = checkRateLimit(`gigachat:${user.id}`, { maxRequests: 30, windowSeconds: 60 });
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const body = await req.json();
    const { action, courseTitle, lessonTitle, lessonType, questions, existingContent, customSystemPrompt, previousAnswers, ai_provider, gigachat_model, lovable_model, stream_index, taskIndex: bodyTaskIndex } = body;
    const effectiveTaskIndex = bodyTaskIndex ?? stream_index;

    // Log AI usage (fire-and-forget to reduce latency)
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("user_id", user.id).single();
    if (profile?.organization_id) {
      supabase.from("ai_usage_log").insert({
        user_id: user.id,
        organization_id: profile.organization_id,
        function_name: `gigachat_${action}`,
        tokens_used: 0,
      }).then(() => {});
    }

    let result: any;

    if (action === "generate_answers") {
      // Default to the most powerful model for answer generation
      const effectiveProvider = ai_provider || "lovable_ai";
      const effectiveLovableModel = lovable_model || (effectiveProvider === "lovable_ai" ? "google/gemini-2.5-pro" : undefined);

      const questionsText = questions.map((q: any, i: number) => {
        const opts = q.options.map((o: any, j: number) => {
          const text = typeof o === 'string' ? o : (o?.text || o?.label || String(o));
          return `  ${j + 1}) ${text}`;
        }).join("\n");
        return `Вопрос ${i + 1}: ${q.question}\n${opts}`;
      }).join("\n\n");

      const defaultAnswersPrompt = `Ты эксперт в области промышленной безопасности, охраны труда и нормативов Ростехнадзора. 
Тебе даны тестовые вопросы с вариантами ответов. Определи правильный ответ для каждого вопроса.
Отвечай СТРОГО в формате JSON-массива, где каждый элемент — объект с полями:
- "questionIndex": номер вопроса (начиная с 0)
- "correctAnswer": индекс правильного ответа (начиная с 0)
- "explanation": краткое пояснение, почему этот ответ правильный (1-2 предложения)

Пример: [{"questionIndex": 0, "correctAnswer": 2, "explanation": "Согласно ФЗ-116..."}]
Отвечай ТОЛЬКО JSON-массивом, без markdown-обертки.`;
      const systemPrompt = customSystemPrompt || defaultAnswersPrompt;

      const prompt = `Курс: "${courseTitle}"\nУрок: "${lessonTitle}"\n\n${questionsText}`;
      const { text: response, model } = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ], 16384, effectiveProvider, gigachat_model, effectiveLovableModel, effectiveTaskIndex);

      try {
        const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        result = { answers: JSON.parse(cleaned), model };
      } catch {
        console.error("Failed to parse AI response:", response);
        result = { answers: [], raw: response, parseError: true, model };
      }

    } else if (action === "generate_content") {
      const contextNote = existingContent
        ? `\n\nВ уроке уже есть контент, НЕ повторяй его:\n${existingContent.slice(0, 1500)}`
        : "";

      let defaultContentPrompt: string;
      if (lessonType === "practice") {
        defaultContentPrompt = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай практическое задание (кейс / ситуационную задачу).
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Структура: Описание ситуации → Вводные данные → Задание → Вопросы для анализа → Ожидаемый результат
3. Включи раздел «Нормативная база» со ссылками на ФЗ, приказы, постановления
4. Реалистичный производственный сценарий с конкретными числовыми данными
5. Минимум 400 слов
6. На русском языке
7. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО начинать с мета-фраз: «Отлично!», «Конечно!», «Подготовлю...», «Вот задание...». Начинай СРАЗУ с описания ситуации.${contextNote}`;
      } else {
      defaultContentPrompt = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай подробный учебный материал.
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Ссылки на нормативные документы (ФЗ, приказы, постановления)
3. Практические примеры и ситуации
4. Минимум 500 слов
5. На русском языке
6. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО начинать с мета-фраз: «Отлично!», «Подготовлю для вас...», «Учебный материал по курсу...», «Конечно!», «Вот учебный материал...». Начинай СРАЗУ с содержательного текста: приветствие слушателей («Уважаемые коллеги...») или тематическое введение («Данный урок посвящён...», «Сегодняшний урок рассматривает...»). НЕ упоминай название курса в начале.${contextNote}`;
      }
      const systemPrompt = customSystemPrompt ? (customSystemPrompt + contextNote) : defaultContentPrompt;

      const userPrompt = lessonType === "practice"
        ? `Создай практическое задание (кейс) для урока "${lessonTitle}" курса "${courseTitle}"`
        : `Напиши учебный материал для урока "${lessonTitle}" курса "${courseTitle}"`;

      const { text: content, model } = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ], 4096, ai_provider, gigachat_model, lovable_model, effectiveTaskIndex);
      result = { content, model };

    } else if (action === "generate_questions") {
      const systemPrompt = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай тестовые вопросы.
Отвечай СТРОГО в формате JSON-массива, каждый элемент:
- "question": текст вопроса
- "options": массив из 4 вариантов ответа
- "correctAnswer": индекс правильного ответа (0-3)
- "explanation": краткое пояснение

Создай 10 вопросов разной сложности. Отвечай ТОЛЬКО JSON-массивом.`;

      const { text: response, model } = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: `Создай тестовые вопросы для теста "${lessonTitle}" курса "${courseTitle}"` },
      ], 4096, ai_provider, gigachat_model, lovable_model, effectiveTaskIndex);

      try {
        const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        result = { questions: JSON.parse(cleaned), model };
      } catch {
        result = { questions: [], raw: response, parseError: true, model };
      }

    } else if (action === "generate_structure") {
      const existingLessonsText = body.existingLessons?.length
        ? `\n\nУже существующие уроки (НЕ дублируй):\n${body.existingLessons.map((l: any, i: number) => `${i + 1}. ${l.title} (${l.type})`).join("\n")}`
        : "";

      const structurePrompt = customSystemPrompt || `Ты эксперт по созданию образовательных программ ДПО. Создай структуру курса.
Отвечай СТРОГО в формате JSON-объекта с полем "lessons" — массив объектов:
- "title": название урока
- "type": тип урока ("text", "test", "practice")

Правила структуры:
1. Создай 8-12 уроков
2. Начни с вводного урока (type: "text") — общее введение в тему
3. После каждых 1-2 текстовых лекций добавляй тест (type: "test") для закрепления
4. Ближе к концу добавь 1 практическое задание (type: "practice") — кейс/ситуационная задача
5. Заверши итоговым тестом (type: "test")
6. Названия уроков должны быть конкретными и информативными

Отвечай ТОЛЬКО JSON, без markdown-обертки.${existingLessonsText}`;

      const { text: response, model } = await callAI([
        { role: "system", content: structurePrompt },
        { role: "user", content: `Создай структуру курса "${courseTitle}"` },
      ], 4096, ai_provider, gigachat_model, lovable_model, effectiveTaskIndex);

      try {
        const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        const parsed = JSON.parse(cleaned);
        result = { lessons: parsed.lessons || parsed, model };
      } catch {
        console.error("Failed to parse structure response:", response);
        result = { lessons: [], raw: response, parseError: true, model };
      }

    } else if (action === "verify_answers") {
      // Verification: re-check answers with a different model or prompt
      const questionsText = questions.map((q: any, i: number) => {
        const opts = q.options.map((o: any, j: number) => {
          const text = typeof o === 'string' ? o : (o?.text || o?.label || String(o));
          return `  ${j + 1}) ${text}`;
        }).join("\n");
        const prevAnswer = previousAnswers?.[i];
        const prevNote = prevAnswer !== undefined
          ? `\nПредыдущий ответ ИИ: вариант ${prevAnswer.correctAnswer + 1}${prevAnswer.explanation ? ` (${prevAnswer.explanation})` : ""}`
          : "";
        return `Вопрос ${i + 1}: ${q.question}\n${opts}${prevNote}`;
      }).join("\n\n");

      const verifyPrompt = `Ты эксперт-верификатор в области промышленной безопасности, охраны труда и нормативов Ростехнадзора.

Тебе даны тестовые вопросы с вариантами ответов. Для некоторых вопросов уже есть предыдущий ответ от другого ИИ.
Твоя задача — НЕЗАВИСИМО проверить каждый вопрос и определить правильный ответ.

Если предыдущий ответ верен — подтверди его. Если нет — исправь и объясни почему.

Отвечай СТРОГО в формате JSON-массива:
[{"questionIndex": 0, "correctAnswer": 2, "explanation": "...", "changed": false}]

Поле "changed" = true если твой ответ отличается от предыдущего.
Отвечай ТОЛЬКО JSON-массивом, без markdown-обертки.`;

      const prompt = `Курс: "${courseTitle}"\nУрок: "${lessonTitle}"\n\n${questionsText}`;

      // Use a different model for verification (Lovable AI Gemini Pro for higher accuracy)
      const { text: response, model } = await callAI([
        { role: "system", content: verifyPrompt },
        { role: "user", content: prompt },
      ], 16384, ai_provider, gigachat_model, lovable_model, stream_index);

      try {
        const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        result = { answers: JSON.parse(cleaned), model, isVerification: true };
      } catch {
        console.error("Failed to parse verification response:", response);
        result = { answers: [], raw: response, parseError: true, model, isVerification: true };
      }

    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("GigaChat function error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("rate limit") ? 429 : message.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
