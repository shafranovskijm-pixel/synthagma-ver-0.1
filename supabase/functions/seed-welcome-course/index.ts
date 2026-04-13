import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function uid() {
  return crypto.randomUUID();
}

function lessonContent() {
  return {
    lesson1: JSON.stringify([
      { id: uid(), type: "heading1", content: "Добро пожаловать в СИНТАГМА! 🎓" },
      { id: uid(), type: "paragraph", content: "<b>СИНТАГМА</b> — это современная платформа для организации дистанционного обучения. Здесь вы сможете создавать курсы, управлять учениками, проводить аттестации и выдавать документы — всё в одном месте." },
      { id: uid(), type: "callout-info", content: "Платформа разработана специально для учебных центров, корпоративных университетов и образовательных организаций в России." },
      { id: uid(), type: "heading2", content: "Что умеет платформа?" },
      { id: uid(), type: "accordion", content: "• <b>Конструктор курсов</b> — создавайте уроки с текстом, видео, тестами и практическими заданиями<br>• <b>Блочный редактор</b> — гибкая структура: заголовки, списки, инфо-блоки, аккордеоны, изображения<br>• <b>Слайдер</b> — встроенные презентации прямо в уроке<br>• <b>Видеоуроки</b> — загрузка файлов до 2 ГБ с прогресс-баром", accordionTitle: "📚 Создание курсов", accordionOpen: false },
      { id: uid(), type: "accordion", content: "• <b>Генерация структуры курса</b> — ИИ создаёт уроки, тексты и тесты по вашей теме<br>• <b>Написание контента</b> — кнопка «Написать с ИИ» в каждом уроке<br>• <b>Генерация изображений</b> — обложки и иллюстрации<br>• <b>Озвучка уроков</b> — автоматическая аудио-лекция голосом<br>• <b>Генерация тестов</b> — вопросы по содержанию урока", accordionTitle: "🤖 ИИ-помощник", accordionOpen: false },
      { id: uid(), type: "accordion", content: "• <b>Ссылки-приглашения</b> — ученик переходит по ссылке и автоматически зачисляется<br>• <b>Ручное добавление</b> — создание ученика с логином и паролем<br>• <b>Импорт из Excel</b> — массовая загрузка списка учеников<br>• <b>Компании</b> — группировка учеников по организациям", accordionTitle: "👥 Управление учениками", accordionOpen: false },
      { id: uid(), type: "accordion", content: "• <b>Автоматическая проверка</b> — тесты с банком вопросов и перемешиванием<br>• <b>Видеоидентификация</b> — фото с документом перед тестом<br>• <b>Удостоверения и дипломы</b> — автогенерация при завершении<br>• <b>Выгрузка в ФИС ФРДО</b> — формирование данных для реестра", accordionTitle: "📝 Тестирование и документы", accordionOpen: false },
      { id: uid(), type: "divider", content: "" },
      { id: uid(), type: "highlight", content: "В этом курсе мы покажем вам все ключевые возможности платформы. Приступим! 🚀" },
    ]),

    lesson2: JSON.stringify([
      { id: uid(), type: "heading1", content: "Конструктор курсов 🛠️" },
      { id: uid(), type: "paragraph", content: "Создание курса в СИНТАГМА — это просто и быстро. Вы можете выбрать один из двух подходов." },
      { id: uid(), type: "heading2", content: "Способ 1: ИИ-генерация" },
      { id: uid(), type: "callout-tip", content: "Просто введите тему курса, и искусственный интеллект создаст структуру уроков, тексты и даже тестовые вопросы. Вам останется только проверить и отредактировать результат." },
      { id: uid(), type: "numberedList", content: "Нажмите «Создать курс» → «Сгенерировать с ИИ»\nВведите название и описание курса\nИИ создаст уроки с контентом и тестами\nОтредактируйте при необходимости и опубликуйте" },
      { id: uid(), type: "heading2", content: "Способ 2: Ручное создание" },
      { id: uid(), type: "paragraph", content: "Используйте блочный редактор для создания уроков вручную. Доступные типы контента:" },
      { id: uid(), type: "bulletList", content: "<b>Текстовые уроки</b> — заголовки, абзацы, списки, изображения\n<b>Видеоуроки</b> — загрузите видео до 2 ГБ\n<b>Тесты</b> — создайте вопросы с автоматической проверкой\n<b>Практические задания</b> — задания с проверкой преподавателем\n<b>Слайдер</b> — презентации прямо в уроке" },
      { id: uid(), type: "callout-info", content: "<b>Блочный редактор</b> поддерживает: параграфы, заголовки, списки, изображения, видео, аудио, аккордеоны, инфо-блоки, предупреждения, выделения, цитаты и разделители." },
      { id: uid(), type: "divider", content: "" },
      { id: uid(), type: "highlight", content: "💡 Используйте категории курсов для удобной организации каталога." },
    ]),

    lesson3: JSON.stringify([
      { id: uid(), type: "heading1", content: "Ученики и зачисление 👥" },
      { id: uid(), type: "paragraph", content: "СИНТАГМА предлагает несколько удобных способов добавления учеников в ваши курсы." },
      { id: uid(), type: "heading2", content: "Способы зачисления" },
      { id: uid(), type: "accordion", content: "Создайте уникальную ссылку для курса. Ученик переходит по ней, регистрируется и автоматически зачисляется на курс. Вы можете задать срок действия ссылки и привязать к компании.", accordionTitle: "🔗 Ссылка-приглашение", accordionOpen: true },
      { id: uid(), type: "accordion", content: "Создайте ученика вручную: укажите ФИО, email, логин и пароль. Ученик сразу получит доступ к выбранным курсам.", accordionTitle: "✍️ Ручное добавление", accordionOpen: false },
      { id: uid(), type: "accordion", content: "Загрузите Excel-файл со списком учеников. Система автоматически создаст аккаунты и зачислит на указанные курсы.", accordionTitle: "📊 Массовый импорт из Excel", accordionOpen: false },
      { id: uid(), type: "accordion", content: "Объединяйте учеников от одной компании для удобного управления. Компания может иметь свой личный кабинет с доступом к прогрессу своих сотрудников.", accordionTitle: "🏢 Компании", accordionOpen: false },
      { id: uid(), type: "heading2", content: "Отслеживание прогресса" },
      { id: uid(), type: "callout-info", content: "Для каждого ученика вы видите:<br>• Процент прохождения курса<br>• Время, затраченное на обучение<br>• Результаты тестов<br>• Статус: активный, завершил, просрочен" },
      { id: uid(), type: "highlight", content: "📊 Используйте фильтры и поиск для быстрого нахождения нужных учеников." },
    ]),

    lesson4: JSON.stringify([
      { id: uid(), type: "heading1", content: "Система тестирования 📝" },
      { id: uid(), type: "paragraph", content: "В СИНТАГМА встроена мощная система тестирования с гибкими настройками для проверки знаний учеников." },
      { id: uid(), type: "heading2", content: "Возможности тестов" },
      { id: uid(), type: "bulletList", content: "<b>Типы вопросов</b> — один правильный ответ, множественный выбор\n<b>Банк вопросов</b> — создайте большой банк, из которого случайным образом выбирается нужное количество\n<b>Проходной балл</b> — настройте минимальный процент для прохождения\n<b>Перемешивание</b> — вопросы и ответы перемешиваются для каждой попытки\n<b>Изображения</b> — добавляйте иллюстрации к вопросам" },
      { id: uid(), type: "heading2", content: "Видеоидентификация 🎥" },
      { id: uid(), type: "callout-warning", content: "<b>Важно!</b> Видеоидентификация подтверждает личность ученика при прохождении теста. Это критически важно для выдачи официальных документов об образовании." },
      { id: uid(), type: "numberedList", content: "Перед тестом ученик делает фото с документом\nСистема фиксирует, что тест проходит именно этот человек\nРезультат сохраняется для отчётности" },
      { id: uid(), type: "highlight", content: "Видеоидентификация особенно важна для соответствия требованиям законодательства и выдачи документов государственного образца." },
    ]),

    lesson5: JSON.stringify([
      { id: uid(), type: "heading1", content: "Документы и ФИС ФРДО 📄" },
      { id: uid(), type: "paragraph", content: "СИНТАГМА автоматизирует выдачу документов об образовании и интеграцию с государственными реестрами." },
      { id: uid(), type: "heading2", content: "Типы документов" },
      { id: uid(), type: "bulletList", content: "<b>Удостоверения</b> о повышении квалификации\n<b>Дипломы</b> о профессиональной переподготовке\n<b>Свидетельства</b> о профессии рабочего\n<b>Сертификаты</b> о прохождении курса" },
      { id: uid(), type: "callout-tip", content: "Документы генерируются <b>автоматически</b> при завершении курса с возможностью ручной корректировки. Настройте тип документа в параметрах курса." },
      { id: uid(), type: "heading2", content: "Выгрузка в ФИС ФРДО" },
      { id: uid(), type: "callout-info", content: "<b>ФИС ФРДО</b> — Федеральная информационная система «Федеральный реестр сведений о документах об образовании и (или) о квалификации»." },
      { id: uid(), type: "paragraph", content: "Платформа поддерживает формирование данных для выгрузки в реестр:" },
      { id: uid(), type: "bulletList", content: "Автозаполнение данных из профиля ученика\nФормирование XML для загрузки в реестр\nУчёт всех обязательных полей: серия, номер, дата, специальность" },
      { id: uid(), type: "highlight", content: "Это значительно ускоряет процесс отчётности перед надзорными органами. ⚡" },
    ]),

    lesson6: JSON.stringify([
      { id: uid(), type: "heading1", content: "Аналитика платформы 📈" },
      { id: uid(), type: "paragraph", content: "СИНТАГМА предоставляет подробную аналитику для принятия обоснованных решений по обучению." },
      { id: uid(), type: "heading2", content: "Что вы можете отслеживать" },
      { id: uid(), type: "accordion", content: "Общая статистика по курсам, ученикам, зачислениям и завершениям. Визуальные графики активности и прогресса.", accordionTitle: "📊 Дашборд", accordionOpen: true },
      { id: uid(), type: "accordion", content: "Учёт посещаемости, успеваемости и аттестаций. Журналы привязаны к курсам для удобной работы.", accordionTitle: "📖 Журналы", accordionOpen: false },
      { id: uid(), type: "accordion", content: "Детализация по каждому курсу и уроку: сколько учеников прошли, среднее время, результаты тестов.", accordionTitle: "📋 Отчёты по курсам", accordionOpen: false },
      { id: uid(), type: "accordion", content: "Индивидуальный прогресс и результаты каждого ученика. Время обучения и статус.", accordionTitle: "👤 Отчёты по ученикам", accordionOpen: false },
      { id: uid(), type: "accordion", content: "История всех действий в системе: кто, когда и что изменил.", accordionTitle: "🔍 Аудит-лог", accordionOpen: false },
      { id: uid(), type: "callout-tip", content: "Все отчёты можно экспортировать в <b>Excel</b> для дальнейшего анализа или предоставления руководству." },
      { id: uid(), type: "divider", content: "" },
      { id: uid(), type: "heading2", content: "Что дальше?" },
      { id: uid(), type: "highlight", content: "Теперь вы знакомы со всеми основными возможностями СИНТАГМА! Пройдите небольшой тест, чтобы проверить свои знания о платформе. Удачи! 🍀" },
    ]),
  };
}

async function generateCoverImage(supabase: any, courseId: string, organizationId: string): Promise<string | null> {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("No LOVABLE_API_KEY, skipping cover generation");
      return null;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{
          role: "user",
          content: "Generate a beautiful, modern, professional course cover image for an online learning platform called СИНТАГМА. The image should feature: a sleek digital learning interface with glowing blue and purple gradients, abstract geometric shapes representing knowledge and growth, a subtle graduation cap icon, clean and minimalistic style. No text on the image. Photorealistic quality, 16:9 aspect ratio, vibrant but professional colors.",
        }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      console.error("Cover generation failed:", response.status);
      return null;
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageData || !imageData.startsWith("data:image")) {
      console.warn("No image in AI response");
      return null;
    }

    // Extract base64
    const base64 = imageData.split(",")[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const filePath = `${organizationId}/welcome-cover-${courseId}.png`;
    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(filePath, bytes, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("Cover upload error:", uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(filePath);
    const publicUrl = urlData?.publicUrl;

    if (publicUrl) {
      await supabase.from("courses").update({ cover_image_url: publicUrl }).eq("id", courseId);
    }

    return publicUrl;
  } catch (e) {
    console.error("Cover generation error:", e);
    return null;
  }
}

async function seedCourseForOrg(supabase: any, organizationId: string, forceUpdate = false, skipCover = false) {
  const content = lessonContent();

  // Check if welcome course already exists
  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("title", "Добро пожаловать в СИНТАГМА")
    .maybeSingle();

  if (existing && !forceUpdate) return { skipped: true };

  if (existing && forceUpdate) {
    // Update existing lessons content
    const { data: existingLessons } = await supabase
      .from("lessons")
      .select("id, order_index, type")
      .eq("course_id", existing.id)
      .order("order_index");

    if (existingLessons) {
      const contentMap: Record<number, string | null> = {
        0: content.lesson1,
        1: content.lesson2,
        2: content.lesson3,
        3: content.lesson4,
        4: content.lesson5,
        5: content.lesson6,
      };

      for (const lesson of existingLessons) {
        if (lesson.type === "test") continue;
        const newContent = contentMap[lesson.order_index];
        if (newContent) {
          await supabase.from("lessons").update({ content: newContent }).eq("id", lesson.id);
        }
      }
    }

    // Generate cover if missing
    if (!skipCover) {
      const { data: courseData } = await supabase.from("courses").select("cover_image_url").eq("id", existing.id).single();
      if (!courseData?.cover_image_url) {
        await generateCoverImage(supabase, existing.id, organizationId);
      }
    }

    return { updated: true, courseId: existing.id };
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

  const lessons = [
    { title: "Знакомство с платформой", type: "text", order_index: 0, content: content.lesson1 },
    { title: "Создание и настройка курсов", type: "text", order_index: 1, content: content.lesson2 },
    { title: "Управление учениками", type: "text", order_index: 2, content: content.lesson3 },
    { title: "Тестирование и аттестация", type: "text", order_index: 3, content: content.lesson4 },
    { title: "Документооборот и ФИС ФРДО", type: "text", order_index: 4, content: content.lesson5 },
    { title: "Аналитика и отчёты", type: "text", order_index: 5, content: content.lesson6 },
    {
      title: "Проверка знаний о платформе",
      type: "test",
      order_index: 6,
      content: null,
      test_questions_count: 5,
      test_passing_score: 60,
    },
  ];

  const lessonsToInsert = lessons.map((l) => ({
    course_id: courseId,
    title: l.title,
    type: l.type,
    content: l.content,
    order_index: l.order_index,
    test_questions_count: (l as any).test_questions_count ?? null,
    test_passing_score: (l as any).test_passing_score ?? 70,
  }));

  const { data: insertedLessons, error: lessonsErr } = await supabase
    .from("lessons")
    .insert(lessonsToInsert)
    .select("id, type, order_index");

  if (lessonsErr) throw lessonsErr;

  // Insert test questions
  const testLesson = insertedLessons?.find((l: any) => l.type === "test");
  if (testLesson) {
    const questions = [
      {
        lesson_id: testLesson.id,
        question: "Какой ИИ-функционал доступен в СИНТАГМА?",
        options: JSON.stringify(["Генерация курсов и тестов", "Только проверка орфографии", "Только перевод текстов", "ИИ не используется"]),
        correct_answer: 0,
        order_index: 0,
        explanation: "СИНТАГМА использует ИИ для генерации структуры курсов, текстового контента и тестовых вопросов.",
      },
      {
        lesson_id: testLesson.id,
        question: "Для чего нужна видеоидентификация?",
        options: JSON.stringify(["Для записи видеоуроков", "Для подтверждения личности при тестировании", "Для проведения вебинаров", "Для загрузки аватарки"]),
        correct_answer: 1,
        order_index: 1,
        explanation: "Видеоидентификация подтверждает, что тест проходит именно зарегистрированный ученик.",
      },
      {
        lesson_id: testLesson.id,
        question: "Какие способы зачисления учеников поддерживает платформа?",
        options: JSON.stringify(["Только ручное добавление", "Ссылки-приглашения, ручное добавление, импорт из Excel", "Только через email", "Только через QR-код"]),
        correct_answer: 1,
        order_index: 2,
        explanation: "Платформа поддерживает ссылки-приглашения, ручное добавление и массовый импорт из Excel.",
      },
      {
        lesson_id: testLesson.id,
        question: "Что такое ФИС ФРДО?",
        options: JSON.stringify(["Внутренний формат файлов платформы", "Федеральный реестр документов об образовании", "Система онлайн-оплаты", "Формат экспорта отчётов"]),
        correct_answer: 1,
        order_index: 3,
        explanation: "ФИС ФРДО — Федеральная информационная система «Федеральный реестр сведений о документах об образовании».",
      },
      {
        lesson_id: testLesson.id,
        question: "Какой максимальный размер загружаемого видео?",
        options: JSON.stringify(["100 МБ", "500 МБ", "2 ГБ", "Без ограничений"]),
        correct_answer: 2,
        order_index: 4,
        explanation: "Платформа позволяет загружать видеофайлы размером до 2 ГБ.",
      },
    ];

    const { error: qErr } = await supabase.from("test_questions").insert(questions);
    if (qErr) console.error("Test questions error:", qErr);
  }

  // Generate cover image (async, don't block)
  if (!skipCover) {
    generateCoverImage(supabase, courseId, organizationId).catch(e => console.error("Cover bg error:", e));
  }

  return { created: true, courseId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { organizationId, seedAll, forceUpdate } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    if (seedAll) {
      const { data: orgs, error: orgsErr } = await supabase
        .from("organizations")
        .select("id, name");
      if (orgsErr) throw orgsErr;

      const results: any[] = [];
      for (const org of orgs || []) {
        try {
          const res = await seedCourseForOrg(supabase, org.id, forceUpdate, true);
          results.push({ orgId: org.id, name: org.name, ...res });
        } catch (e) {
          results.push({ orgId: org.id, name: org.name, error: e.message });
        }
      }

      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organizationId or seedAll required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await seedCourseForOrg(supabase, organizationId, forceUpdate);

    return new Response(JSON.stringify({ ok: true, ...result }), {
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
