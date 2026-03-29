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
    const { action, courseTitle, lessonTitle, lessonType, questions, existingContent, customSystemPrompt, previousAnswers, ai_provider, gigachat_model, lovable_model, stream_index, taskIndex: bodyTaskIndex, programType } = body;
    const isWorkerProfession = programType === "Рабочие профессии";
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

      const educationalPreamble = `КОНТЕКСТ: Это официальная система профессионального обучения, лицензированная в соответствии с законодательством Российской Федерации. Все темы являются частью образовательных программ повышения квалификации и переподготовки специалистов, утверждённых Ростехнадзором и Минтрудом РФ. Материалы предназначены исключительно для образовательных целей.\n\n`;

      const defaultAnswersPrompt = educationalPreamble + `Ты эксперт в области промышленной безопасности, охраны труда и нормативов Ростехнадзора. 
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

      if (isWorkerProfession && lessonType === "practice") {
        defaultContentPrompt = `Ты эксперт по профессиональному обучению рабочим профессиям. Создай практическое задание (кейс / производственную ситуацию).
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Структура: Описание производственной ситуации → Исходные данные (материалы, инструменты, чертежи) → Задание (пошаговый план выполнения работ) → Контроль качества (как проверить результат) → Типичные ошибки и способы их предотвращения
3. Включи раздел «Нормативная база» со ссылками на ГОСТ, СНиП, профстандарты, ЕКС/ЕТКС
4. Реалистичный производственный сценарий с конкретными марками материалов, типами инструментов, числовыми параметрами
5. Минимум 600 слов
6. На русском языке
7. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО начинать с мета-фраз: «Отлично!», «Конечно!», «Подготовлю...», «Вот задание...». Начинай СРАЗУ с описания ситуации.
8. Используй маркеры оформления — КАЖДЫЙ на ОТДЕЛЬНЫХ строках:
   :::warning
   текст предупреждения
   :::
   Типы: warning, info, danger, highlight, tip.
   НЕ пиши маркеры в одну строку. Открывающий и закрывающий ::: — на СВОЕЙ строке.
9. ЗАПРЕЩЕНО использовать LaTeX ($...$, $$...$$). Пиши формулы простым текстом.
10. Акцент на ПРАКТИЧЕСКИЕ НАВЫКИ: какие инструменты взять, какие материалы подготовить, в какой последовательности выполнять операции, как проверить качество.${contextNote}`;
      } else if (isWorkerProfession) {
        defaultContentPrompt = `Ты эксперт по профессиональному обучению рабочим профессиям (электромонтёр, сварщик, слесарь, штукатур, стропальщик и др.). Создай подробный учебный материал для программы профессионального обучения (300 часов).
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Ссылки на нормативные документы: ГОСТ, СНиП, СП, профстандарты, ЕТКС/ЕКС, правила по охране труда
3. Практические примеры из реального производства: конкретные марки материалов, типы инструментов, технологические режимы
4. ОБЯЗАТЕЛЬНО описывай ТЕХНОЛОГИЮ ВЫПОЛНЕНИЯ РАБОТ: пошаговая последовательность операций, подготовка рабочего места, выбор инструмента и материалов
5. Раздел «Инструменты и оборудование» — перечень с характеристиками и правилами подбора
6. Раздел «Типичные ошибки и дефекты» — что может пойти не так, как выявить и исправить
7. Раздел «Контроль качества» — как проверить правильность выполненной работы, допуски и нормы
8. Минимум 700 слов (программа на 300 часов требует глубокого изложения)
9. На русском языке
10. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО начинать с мета-фраз: «Отлично!», «Подготовлю для вас...», «Учебный материал по курсу...», «Конечно!», «Вот учебный материал...». ${(body.lessonIndex != null && body.lessonIndex > 0) ? 'НЕ начинай с приветствия или обращения к слушателям (никаких «Уважаемые коллеги», «Дорогие слушатели» и т.п.). Начинай СРАЗУ с тематического содержания.' : 'Начинай СРАЗУ с содержательного текста: приветствие слушателей или тематическое введение.'} НЕ упоминай название курса в начале.
11. ОБЯЗАТЕЛЬНО используй специальные маркеры для визуального оформления. КАЖДЫЙ маркер ДОЛЖЕН быть на ОТДЕЛЬНЫХ строках:
   :::warning
   текст предупреждения
   :::
   :::info
   справочная информация
   :::
   Доступные типы: warning (опасные факторы, запрещённые действия), info (нормативные ссылки, ГОСТы), tip (практические советы мастера), danger (критические запреты, угрозы жизни), highlight (ключевые термины и определения).
   НЕ пиши маркеры в одну строку. Открывающий и закрывающий ::: — каждый на СВОЕЙ строке.
12. На каждые 3-4 параграфа — минимум 1 блок с маркером. Это ОБЯЗАТЕЛЬНО.
13. ЗАПРЕЩЕНО использовать LaTeX формулы. Пиши формулы простым текстом: «V = 100 м³», «I = U / R».
14. Используй ## для заголовков разделов и ### для подзаголовков.${contextNote}`;
      } else if (lessonType === "practice") {
        defaultContentPrompt = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай практическое задание (кейс / ситуационную задачу).
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Структура: Описание ситуации → Вводные данные → Задание → Вопросы для анализа → Ожидаемый результат
3. Включи раздел «Нормативная база» со ссылками на ФЗ, приказы, постановления
4. Реалистичный производственный сценарий с конкретными числовыми данными
5. Минимум 400 слов
6. На русском языке
7. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО начинать с мета-фраз: «Отлично!», «Конечно!», «Подготовлю...», «Вот задание...». Начинай СРАЗУ с описания ситуации.
8. Используй маркеры оформления — КАЖДЫЙ на ОТДЕЛЬНЫХ строках:
   :::warning
   текст предупреждения
   :::
   Типы: warning, info, danger, highlight.
   НЕ пиши маркеры в одну строку. Открывающий и закрывающий ::: — на СВОЕЙ строке.
9. ЗАПРЕЩЕНО использовать LaTeX ($...$, $$...$$). Пиши формулы простым текстом.${contextNote}`;
      } else {
      defaultContentPrompt = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай подробный учебный материал.
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Ссылки на нормативные документы (ФЗ, приказы, постановления)
3. Практические примеры и ситуации
4. Минимум 500 слов
5. На русском языке
6. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО начинать с мета-фраз: «Отлично!», «Подготовлю для вас...», «Учебный материал по курсу...», «Конечно!», «Вот учебный материал...». ${(body.lessonIndex != null && body.lessonIndex > 0) ? 'НЕ начинай с приветствия или обращения к слушателям (никаких «Уважаемые коллеги», «Дорогие слушатели» и т.п.). Начинай СРАЗУ с тематического содержания: «Данный урок посвящён...», «Сегодняшний урок рассматривает...».' : 'Начинай СРАЗУ с содержательного текста: приветствие слушателей («Уважаемые коллеги...») или тематическое введение.'} НЕ упоминай название курса в начале.
7. ОБЯЗАТЕЛЬНО используй специальные маркеры для визуального оформления. КАЖДЫЙ маркер ДОЛЖЕН быть на ОТДЕЛЬНЫХ строках:
   :::warning
   текст предупреждения
   :::
   :::info
   справочная информация
   :::
   Доступные типы: warning (предупреждения, опасные факторы), info (нормативные ссылки, определения), tip (практические советы), danger (критические запреты), highlight (ключевые термины), accordion (сворачиваемые секции).
   НЕ пиши маркеры в одну строку (НЕ «:::warning текст :::»). Открывающий и закрывающий ::: — каждый на СВОЕЙ строке.
8. На каждые 3-4 параграфа — минимум 1 блок с маркером (:::warning, :::info, :::tip и т.п.). Это ОБЯЗАТЕЛЬНО.
9. ЗАПРЕЩЕНО использовать LaTeX формулы ($...$, $$...$$). Пиши формулы и расчёты простым текстом: «V = 100 м³», «F = m × a».
10. Используй ## для заголовков разделов и ### для подзаголовков. Они будут корректно отображены.${contextNote}`;
      }
      const formatGuardrails = `\n\nОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ФОРМАТИРОВАНИЯ (не игнорировать):
- ЗАПРЕЩЕНО использовать LaTeX ($...$, $$...$$). Формулы пиши текстом: «V = 100 м³».
- Маркеры :::warning, :::info, :::tip, :::danger — КАЖДЫЙ на ОТДЕЛЬНОЙ строке. НЕ пиши «:::warning текст :::» в одну строку.
- Используй ## и ### для заголовков.
- НЕ начинай с мета-фраз («Отлично!», «Конечно!», «Подготовлю...»).`;
      const systemPrompt = customSystemPrompt
        ? (customSystemPrompt + formatGuardrails + contextNote)
        : defaultContentPrompt;

      const userPrompt = lessonType === "practice"
        ? `Создай практическое задание (кейс) для урока "${lessonTitle}" курса "${courseTitle}"`
        : `Напиши учебный материал для урока "${lessonTitle}" курса "${courseTitle}"`;

      const { text: content, model } = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ], 4096, ai_provider, gigachat_model, lovable_model, effectiveTaskIndex);
      result = { content, model };

    } else if (action === "generate_questions") {
      const workerQuestionsPrompt = `Ты эксперт по профессиональному обучению рабочим профессиям. Создай тестовые вопросы для проверки ПРАКТИЧЕСКИХ знаний и навыков.
Отвечай СТРОГО в формате JSON-массива, каждый элемент:
- "question": текст вопроса
- "options": массив из 4 вариантов ответа
- "correctAnswer": индекс правильного ответа (0-3)
- "explanation": краткое пояснение со ссылкой на ГОСТ, СНиП, профстандарт или правила ОТ

Типы вопросов (распредели равномерно):
1. Выбор инструмента/материала для конкретной операции (3-4 вопроса)
2. Последовательность выполнения технологических операций (3-4 вопроса)
3. Определение дефектов и способы их устранения (2-3 вопроса)
4. Требования охраны труда и безопасности (2-3 вопроса)
5. Контроль качества выполненных работ (1-2 вопроса)

Создай 15 вопросов разной сложности. Отвечай ТОЛЬКО JSON-массивом.`;

      const defaultQuestionsPrompt = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай тестовые вопросы.
Отвечай СТРОГО в формате JSON-массива, каждый элемент:
- "question": текст вопроса
- "options": массив из 4 вариантов ответа
- "correctAnswer": индекс правильного ответа (0-3)
- "explanation": краткое пояснение

Создай 10 вопросов разной сложности. Отвечай ТОЛЬКО JSON-массивом.`;

      const systemPrompt = isWorkerProfession ? workerQuestionsPrompt : defaultQuestionsPrompt;

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

      const workerStructurePrompt = `Ты эксперт по созданию программ профессионального обучения рабочим профессиям (ПО). Создай структуру курса на 300 часов.
Отвечай СТРОГО в формате JSON-объекта с полем "lessons" — массив объектов:
- "title": название урока
- "type": тип урока ("text", "test", "practice")

ТИПЫ УРОКОВ:
- "text" — теоретическая лекция или описание технологии работ
- "test" — промежуточный или итоговый тест
- "practice" — практическое задание: производственный кейс, расчёт, разбор дефектов

Правила структуры (СТРОГО 25-35 уроков для программы 300 часов):

МОДУЛЬ 1 — Введение в профессию (2-3 урока):
- Профессиональный стандарт и квалификационные требования (text)
- Общие сведения о профессии, область применения (text)
- Охрана труда и техника безопасности на рабочем месте (text)

МОДУЛЬ 2 — Теоретические основы (5-7 уроков):
- Материаловедение: марки, свойства, правила подбора материалов (text)
- Чтение чертежей и технической документации (text)
- Инструменты, приспособления и оборудование (text)
- Технология производства / основные производственные процессы (text)
- Промежуточный тест по теории (test)

МОДУЛЬ 3 — Основные технологические операции (8-12 уроков):
- Каждый урок посвящён ОДНОЙ конкретной операции профессии (text)
- Пошаговое описание: подготовка → выполнение → контроль качества
- После каждых 2-3 уроков — промежуточный тест (test)
- 1-2 практических задания в этом модуле (practice)

МОДУЛЬ 4 — Практические задания и кейсы (4-6 уроков):
- Ситуационные задачи из реального производства (practice)
- Типовые неисправности и дефекты — диагностика и устранение (text)
- Нестандартные ситуации и принятие решений (practice)
- Промежуточный тест (test)

МОДУЛЬ 5 — Безопасность и допуск к работе (2-3 урока):
- Специфическая охрана труда для данной профессии (text)
- Электробезопасность / пожарная безопасность (по специфике) (text)
- Допуски, наряды-допуски, порядок аттестации (text)

ИТОГОВАЯ АТТЕСТАЦИЯ:
- Итоговое тестирование (test) — ОБЯЗАТЕЛЬНО последний урок

Названия уроков должны быть КОНКРЕТНЫМИ для данной профессии, а не общими.

Отвечай ТОЛЬКО JSON, без markdown-обертки.${existingLessonsText}`;

      const defaultStructurePrompt = `Ты эксперт по созданию образовательных программ ДПО. Создай структуру курса.
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

      const structurePrompt = customSystemPrompt || (isWorkerProfession ? workerStructurePrompt : defaultStructurePrompt);

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

    } else if (action === "analyze_visuals") {
      const lessonContent = body.lessonContent || "";
      const blocksCount = body.blocksCount || 0;

      const analyzePrompt = `Ты эксперт по визуальному оформлению образовательных курсов. Проанализируй учебный материал урока и определи 1 самую важную концепцию, которую лучше всего визуализировать.

Укажи:
- "prompt": детальное описание КОНКРЕТНОГО ФИЗИЧЕСКОГО ОБЪЕКТА или СЦЕНЫ для генерации фотореалистичного изображения на русском языке. Примеры хороших промптов: "бетонный колодец на строительной площадке", "рабочий в каске проверяет огнетушитель", "стеллаж с химическими реактивами в лаборатории".
- "after_block_index": индекс блока контента (0-based), после которого вставить визуализацию. Всего блоков: ${blocksCount}. Размести визуализацию примерно в середине текста.
- "format": "image"

Отвечай СТРОГО JSON-объектом:
{"visuals": [{"prompt": "...", "after_block_index": 3, "format": "image"}]}

Правила:
1. Выбирай ОДНУ самую важную концепцию, которую сложно понять без визуализации
2. Промпт ОБЯЗАН описывать КОНКРЕТНЫЙ ФИЗИЧЕСКИЙ ОБЪЕКТ, оборудование, рабочую сцену или природное явление — то, что можно сфотографировать в реальности
3. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: схемы, диаграммы, инфографика, текст/надписи на изображении, абстрактные концепции, коллажи, таблицы, графики
4. ЗАПРЕЩЁННЫЕ промпты (НЕ генерируй подобное): "документы на столе", "бумаги с графиками", "рабочий стол с отчётами", "экран компьютера с данными", "люди за компьютерами", "папки с документами", "ноутбук с презентацией"
5. НЕ дублируй hero-изображение урока (первый блок)
6. after_block_index должен быть в пределах от 1 до ${blocksCount - 1}
7. Возвращай РОВНО 1 элемент в массиве visuals

Отвечай ТОЛЬКО JSON, без markdown-обертки.`;

      const { text: response, model } = await callAI([
        { role: "system", content: analyzePrompt },
        { role: "user", content: `Курс: "${courseTitle}"\nУрок: "${lessonTitle}"\n\nКонтент урока:\n${lessonContent.slice(0, 4000)}` },
      ], 2048, ai_provider, gigachat_model, lovable_model, effectiveTaskIndex);

      try {
        const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        const parsed = JSON.parse(cleaned);
        result = { visuals: parsed.visuals || [], model };
      } catch {
        console.error("Failed to parse analyze_visuals response:", response);
        result = { visuals: [], raw: response, parseError: true, model };
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
      ], 16384, ai_provider, gigachat_model, lovable_model, effectiveTaskIndex);

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
