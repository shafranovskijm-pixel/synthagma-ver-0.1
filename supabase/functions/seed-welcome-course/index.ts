import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { organizationId } = await req.json();
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organizationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if welcome course already exists
    const { data: existing } = await supabase
      .from("courses")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("title", "Добро пожаловать в СИНТАГМА")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ ok: true, message: "already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the welcome course
    const { data: course, error: courseErr } = await supabase
      .from("courses")
      .insert({
        organization_id: organizationId,
        title: "Добро пожаловать в СИНТАГМА",
        description: "Приветственный курс для знакомства с платформой СИНТАГМА. Узнайте обо всех возможностях: создание курсов с ИИ, тестирование, видеоидентификация, документооборот, ФРДО и многое другое.",
        is_published: true,
        catalog_order: 0,
      })
      .select("id")
      .single();

    if (courseErr) throw courseErr;

    const courseId = course.id;

    // Lessons content (Markdown block-editor JSON format)
    const lessons = [
      {
        title: "Знакомство с платформой",
        type: "text",
        order_index: 0,
        content: JSON.stringify([
          { type: "heading", content: "Добро пожаловать в СИНТАГМА! 🎓" },
          { type: "text", content: "СИНТАГМА — это современная платформа для организации дистанционного обучения. Здесь вы сможете создавать курсы, управлять учениками, проводить аттестации и выдавать документы — всё в одном месте." },
          { type: "heading", content: "Что умеет платформа?" },
          { type: "text", content: "• **Конструктор курсов** — создавайте уроки с текстом, видео, тестами и практическими заданиями\n• **ИИ-помощник** — генерируйте курсы, тесты и контент за считанные минуты\n• **Управление учениками** — зачисление, группы, приглашения по ссылкам\n• **Тестирование** — автоматическая проверка знаний с различными типами вопросов\n• **Видеоидентификация** — подтверждение личности при прохождении тестов\n• **Документооборот** — сертификаты, удостоверения, выгрузка в ФИС ФРДО\n• **Аналитика** — подробная статистика по курсам и ученикам\n• **Вебинары** — проведение онлайн-занятий (скоро)\n• **3D-тренажёры** — интерактивные симуляции (скоро)" },
          { type: "text", content: "В этом курсе мы покажем вам все ключевые возможности платформы. Приступим! 🚀" },
        ]),
      },
      {
        title: "Создание и настройка курсов",
        type: "text",
        order_index: 1,
        content: JSON.stringify([
          { type: "heading", content: "Конструктор курсов 🛠️" },
          { type: "text", content: "Создание курса в СИНТАГМА — это просто и быстро. Вы можете выбрать один из двух подходов:" },
          { type: "heading", content: "Способ 1: ИИ-генерация" },
          { type: "text", content: "Просто введите тему курса, и искусственный интеллект создаст структуру уроков, тексты и даже тестовые вопросы. Вам останется только проверить и отредактировать результат.\n\n**Как это работает:**\n1. Нажмите «Создать курс» → «Сгенерировать с ИИ»\n2. Введите название и описание курса\n3. ИИ создаст уроки с контентом и тестами\n4. Отредактируйте при необходимости и опубликуйте" },
          { type: "heading", content: "Способ 2: Ручное создание" },
          { type: "text", content: "Используйте блочный редактор для создания уроков вручную:\n\n• **Текстовые уроки** — заголовки, абзацы, списки, изображения\n• **Видеоуроки** — загрузите видео до 2 ГБ\n• **Тесты** — создайте вопросы с автоматической проверкой\n• **Практические задания** — задания с проверкой преподавателем\n• **Слайды** — презентации прямо в уроке" },
          { type: "text", content: "💡 **Совет:** Используйте категории курсов для удобной организации каталога." },
        ]),
      },
      {
        title: "Управление учениками",
        type: "text",
        order_index: 2,
        content: JSON.stringify([
          { type: "heading", content: "Ученики и зачисление 👥" },
          { type: "text", content: "СИНТАГМА предлагает несколько способов добавления учеников:" },
          { type: "heading", content: "Способы зачисления" },
          { type: "text", content: "• **Ссылка-приглашение** — создайте уникальную ссылку для курса. Ученик переходит по ней, регистрируется и автоматически зачисляется\n• **Ручное добавление** — создайте ученика вручную с логином и паролем\n• **Массовый импорт** — загрузите список учеников из Excel-файла\n• **Компании** — объединяйте учеников от одной компании для удобного управления" },
          { type: "heading", content: "Отслеживание прогресса" },
          { type: "text", content: "Для каждого ученика вы видите:\n• Процент прохождения курса\n• Время, затраченное на обучение\n• Результаты тестов\n• Статус: активный, завершил, просрочен\n\nВсё это доступно в реальном времени в разделе «Ученики» вашего курса." },
          { type: "text", content: "📊 **Совет:** Используйте фильтры и поиск для быстрого нахождения нужных учеников." },
        ]),
      },
      {
        title: "Тестирование и аттестация",
        type: "text",
        order_index: 3,
        content: JSON.stringify([
          { type: "heading", content: "Система тестирования 📝" },
          { type: "text", content: "В СИНТАГМА встроена мощная система тестирования с гибкими настройками:" },
          { type: "heading", content: "Возможности тестов" },
          { type: "text", content: "• **Типы вопросов** — один правильный ответ, множественный выбор\n• **Банк вопросов** — создайте большой банк, из которого случайным образом выбирается нужное количество\n• **Проходной балл** — настройте минимальный процент для прохождения\n• **Перемешивание** — вопросы и ответы перемешиваются для каждой попытки\n• **Изображения** — добавляйте иллюстрации к вопросам" },
          { type: "heading", content: "Видеоидентификация 🎥" },
          { type: "text", content: "Для повышения достоверности аттестации включите видеоидентификацию:\n\n1. Перед тестом ученик делает фото с документом\n2. Система фиксирует, что тест проходит именно этот человек\n3. Результат сохраняется для отчётности\n\nЭто особенно важно для выдачи официальных документов и соответствия требованиям законодательства." },
        ]),
      },
      {
        title: "Документооборот и ФИС ФРДО",
        type: "text",
        order_index: 4,
        content: JSON.stringify([
          { type: "heading", content: "Документы и ФРДО 📄" },
          { type: "text", content: "СИНТАГМА автоматизирует выдачу документов об образовании:" },
          { type: "heading", content: "Документы" },
          { type: "text", content: "• **Удостоверения** о повышении квалификации\n• **Дипломы** о профессиональной переподготовке\n• **Свидетельства** о профессии рабочего\n• **Сертификаты** о прохождении курса\n\nДокументы генерируются автоматически при завершении курса с возможностью ручной корректировки." },
          { type: "heading", content: "Выгрузка в ФИС ФРДО" },
          { type: "text", content: "Платформа поддерживает формирование данных для выгрузки в Федеральный реестр документов об образовании (ФИС ФРДО):\n\n• Автозаполнение данных из профиля ученика\n• Формирование XML для загрузки в реестр\n• Учёт всех обязательных полей: серия, номер, дата, специальность\n\nЭто значительно ускоряет процесс отчётности перед надзорными органами." },
        ]),
      },
      {
        title: "Аналитика и отчёты",
        type: "text",
        order_index: 5,
        content: JSON.stringify([
          { type: "heading", content: "Аналитика платформы 📈" },
          { type: "text", content: "СИНТАГМА предоставляет подробную аналитику для принятия решений:" },
          { type: "heading", content: "Что вы можете отслеживать" },
          { type: "text", content: "• **Дашборд** — общая статистика по курсам, ученикам и завершениям\n• **Журналы** — учёт посещаемости, успеваемости и аттестаций\n• **Отчёты по курсам** — детализация по каждому курсу и уроку\n• **Отчёты по ученикам** — индивидуальный прогресс и результаты\n• **Аудит-лог** — история всех действий в системе" },
          { type: "heading", content: "Экспорт данных" },
          { type: "text", content: "Все отчёты можно экспортировать в Excel для дальнейшего анализа или предоставления руководству.\n\n🎯 **Совет:** Регулярно просматривайте аналитику, чтобы улучшать качество курсов и повышать вовлечённость учеников." },
          { type: "heading", content: "Что дальше?" },
          { type: "text", content: "Теперь вы знакомы со всеми основными возможностями СИНТАГМА! Пройдите небольшой тест, чтобы проверить свои знания о платформе. Удачи! 🍀" },
        ]),
      },
      {
        title: "Проверка знаний о платформе",
        type: "test",
        order_index: 6,
        content: null,
        test_questions_count: 5,
        test_passing_score: 60,
      },
    ];

    // Insert lessons
    const lessonsToInsert = lessons.map((l) => ({
      course_id: courseId,
      title: l.title,
      type: l.type,
      content: l.content,
      order_index: l.order_index,
      test_questions_count: l.test_questions_count ?? null,
      test_passing_score: l.test_passing_score ?? 70,
    }));

    const { data: insertedLessons, error: lessonsErr } = await supabase
      .from("lessons")
      .insert(lessonsToInsert)
      .select("id, type, order_index");

    if (lessonsErr) throw lessonsErr;

    // Add test questions for the test lesson
    const testLesson = insertedLessons?.find((l: any) => l.type === "test");
    if (testLesson) {
      const questions = [
        {
          lesson_id: testLesson.id,
          question: "Какой ИИ-функционал доступен в СИНТАГМА?",
          options: JSON.stringify([
            "Генерация курсов и тестов",
            "Только проверка орфографии",
            "Только перевод текстов",
            "ИИ не используется",
          ]),
          correct_answer: 0,
          order_index: 0,
          explanation: "СИНТАГМА использует ИИ для генерации структуры курсов, текстового контента и тестовых вопросов.",
        },
        {
          lesson_id: testLesson.id,
          question: "Для чего нужна видеоидентификация?",
          options: JSON.stringify([
            "Для записи видеоуроков",
            "Для подтверждения личности при тестировании",
            "Для проведения вебинаров",
            "Для загрузки аватарки",
          ]),
          correct_answer: 1,
          order_index: 1,
          explanation: "Видеоидентификация подтверждает, что тест проходит именно зарегистрированный ученик.",
        },
        {
          lesson_id: testLesson.id,
          question: "Какие способы зачисления учеников поддерживает платформа?",
          options: JSON.stringify([
            "Только ручное добавление",
            "Ссылки-приглашения, ручное добавление, импорт из Excel",
            "Только через email",
            "Только через QR-код",
          ]),
          correct_answer: 1,
          order_index: 2,
          explanation: "Платформа поддерживает ссылки-приглашения, ручное добавление и массовый импорт из Excel.",
        },
        {
          lesson_id: testLesson.id,
          question: "Что такое ФИС ФРДО?",
          options: JSON.stringify([
            "Внутренний формат файлов платформы",
            "Федеральный реестр документов об образовании",
            "Система онлайн-оплаты",
            "Формат экспорта отчётов",
          ]),
          correct_answer: 1,
          order_index: 3,
          explanation: "ФИС ФРДО — Федеральная информационная система «Федеральный реестр сведений о документах об образовании».",
        },
        {
          lesson_id: testLesson.id,
          question: "Какой максимальный размер загружаемого видео?",
          options: JSON.stringify([
            "100 МБ",
            "500 МБ",
            "2 ГБ",
            "Без ограничений",
          ]),
          correct_answer: 2,
          order_index: 4,
          explanation: "Платформа позволяет загружать видеофайлы размером до 2 ГБ.",
        },
      ];

      const { error: qErr } = await supabase.from("test_questions").insert(questions);
      if (qErr) console.error("Test questions error:", qErr);
    }

    return new Response(JSON.stringify({ ok: true, courseId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("seed-welcome-course error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
