import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SkillspaceLessonGroup {
  id: number;
  uuid: string;
  name: string;
  order: number;
  lessons: SkillspaceLesson[];
}

interface SkillspaceLesson {
  id: number;
  uuid: string;
  title: string;
  order: number;
  type: string; // "default", "test", "video", etc.
}

interface SkillspaceLessonContent {
  lesson: {
    id: number;
    uuid: string;
    title: string;
    type: string;
    blocks: Array<{
      id: number;
      uuid: string;
      type: string; // "text", "video", "test", "file", etc.
      content: string | null;
      order: number;
    }>;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, login, password, organizationId } = await req.json();

    if (!url || !login || !password || !organizationId) {
      return new Response(
        JSON.stringify({ error: "Все поля обязательны: url, login, password, organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse URL to extract school slug and course ID
    // Expected format: https://{slug}.skillspace.ru/course/{courseId}/...
    const urlMatch = url.match(
      /https?:\/\/([^.]+)\.skillspace\.ru\/course\/(\d+)/
    );
    if (!urlMatch) {
      return new Response(
        JSON.stringify({ error: "Неверный формат URL. Ожидается: https://{school}.skillspace.ru/course/{id}/..." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const schoolSlug = urlMatch[1];
    const courseId = urlMatch[2];
    const baseUrl = `https://${schoolSlug}.skillspace.ru`;

    console.log(`Parsing course ${courseId} from ${baseUrl}`);

    // Step 1: Authenticate
    const formData = new FormData();
    formData.append("email", login);
    formData.append("password", password);
    formData.append("fingerprint", crypto.randomUUID());

    const authRes = await fetch(`${baseUrl}/api/user/auth`, {
      method: "POST",
      body: formData,
      redirect: "manual",
    });

    if (!authRes.ok && authRes.status !== 302) {
      const authText = await authRes.text();
      console.error("Auth failed:", authRes.status, authText);
      return new Response(
        JSON.stringify({ error: "Не удалось авторизоваться на SkillSpace. Проверьте логин и пароль." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract cookies from auth response
    const setCookies = authRes.headers.getSetCookie?.() || [];
    const cookieHeader = setCookies
      .map((c: string) => c.split(";")[0])
      .join("; ");

    console.log("Auth successful, cookies obtained");

    // Step 2: Fetch course structure
    const courseRes = await fetch(`${baseUrl}/api/rest/student/course/${courseId}`, {
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
      },
    });

    if (!courseRes.ok) {
      console.error("Course fetch failed:", courseRes.status);
      return new Response(
        JSON.stringify({ error: `Не удалось загрузить курс (статус ${courseRes.status}). Проверьте доступ к курсу.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const courseData = await courseRes.json();
    const course = courseData.course;

    if (!course) {
      return new Response(
        JSON.stringify({ error: "Курс не найден в ответе SkillSpace" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Course: "${course.name}", groups: ${course.groupsCount}, lessons: ${course.lessonsQuantity}`);

    // Step 3: Fetch lesson groups (constructor/sidebar)
    // Try the constructor API which returns groups with lessons
    const groupsRes = await fetch(`${baseUrl}/api/rest/student/course/${courseId}/groups`, {
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
      },
    });

    let groups: SkillspaceLessonGroup[] = [];
    let allLessons: { uuid: string; title: string; order: number; type: string; groupName: string }[] = [];

    if (groupsRes.ok) {
      const groupsData = await groupsRes.json();
      groups = groupsData.groups || groupsData || [];
      console.log(`Found ${groups.length} groups`);

      for (const group of groups) {
        if (group.lessons) {
          for (const lesson of group.lessons) {
            allLessons.push({
              uuid: lesson.uuid,
              title: lesson.title,
              order: lesson.order,
              type: lesson.type,
              groupName: group.name,
            });
          }
        }
      }
    } else {
      console.log("Groups endpoint not available, trying flow endpoint...");
      // Try alternative: flow endpoint
      const flowRes = await fetch(`${baseUrl}/api/rest/student/course/${courseId}/flow`, {
        headers: {
          Accept: "application/json",
          Cookie: cookieHeader,
        },
      });
      
      if (flowRes.ok) {
        const flowData = await flowRes.json();
        const flow = flowData.flow || flowData;
        if (flow?.access?.lessons) {
          const lessonIds = flow.access.lessons;
          console.log(`Found ${lessonIds.length} lesson IDs from flow`);
          for (let i = 0; i < lessonIds.length; i++) {
            allLessons.push({
              uuid: String(lessonIds[i]),
              title: `Урок ${i + 1}`,
              order: i,
              type: "default",
              groupName: "Основной модуль",
            });
          }
        }
      }
    }

    // Step 4: Fetch each lesson's content
    const lessonContents: Array<{
      title: string;
      content: string;
      order: number;
      type: string;
    }> = [];

    for (let i = 0; i < allLessons.length; i++) {
      const lesson = allLessons[i];
      console.log(`Fetching lesson ${i + 1}/${allLessons.length}: ${lesson.title}`);

      try {
        const lessonRes = await fetch(
          `${baseUrl}/api/rest/student/lesson/${lesson.uuid}`,
          {
            headers: {
              Accept: "application/json",
              Cookie: cookieHeader,
            },
          }
        );

        if (lessonRes.ok) {
          const lessonData: SkillspaceLessonContent = await lessonRes.json();
          const blocks = lessonData.lesson?.blocks || [];

          // Combine text blocks into lesson content
          let htmlContent = "";
          let lessonType = "text";

          for (const block of blocks) {
            if (block.type === "text" && block.content) {
              htmlContent += block.content;
            } else if (block.type === "video") {
              lessonType = "video";
              htmlContent += `<p><em>[Видео из SkillSpace — требуется ручной перенос]</em></p>`;
            } else if (block.type === "test") {
              lessonType = "test";
              htmlContent += `<p><em>[Тест из SkillSpace — требуется ручной перенос]</em></p>`;
            } else if (block.type === "file" && block.content) {
              htmlContent += `<p><em>[Файл: ${block.content}]</em></p>`;
            }
          }

          lessonContents.push({
            title: lessonData.lesson?.title || lesson.title,
            content: htmlContent || "<p>Контент не удалось извлечь</p>",
            order: i,
            type: lessonType === "test" ? "test" : "text",
          });
        } else {
          console.log(`Lesson ${lesson.uuid} returned ${lessonRes.status}, skipping`);
          lessonContents.push({
            title: lesson.title,
            content: `<p><em>Нет доступа к уроку (статус ${lessonRes.status})</em></p>`,
            order: i,
            type: "text",
          });
        }
      } catch (err) {
        console.error(`Error fetching lesson ${lesson.uuid}:`, err);
        lessonContents.push({
          title: lesson.title,
          content: "<p><em>Ошибка загрузки урока</em></p>",
          order: i,
          type: "text",
        });
      }
    }

    // Step 5: Create course and lessons in our DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // Create the course
    const { data: newCourse, error: courseError } = await supabaseClient
      .from("courses")
      .insert({
        title: course.name || "Импортированный курс",
        description: course.shortDescription || null,
        organization_id: organizationId,
        is_published: false,
      })
      .select("id")
      .single();

    if (courseError || !newCourse) {
      console.error("Failed to create course:", courseError);
      return new Response(
        JSON.stringify({ error: "Не удалось создать курс в базе данных: " + courseError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Created course ${newCourse.id}`);

    // Create lessons
    let createdLessons = 0;
    for (const lesson of lessonContents) {
      const { error: lessonError } = await supabaseClient
        .from("lessons")
        .insert({
          course_id: newCourse.id,
          title: lesson.title,
          content: lesson.content,
          order_index: lesson.order,
          type: lesson.type,
        });

      if (lessonError) {
        console.error(`Failed to create lesson "${lesson.title}":`, lessonError);
      } else {
        createdLessons++;
      }
    }

    console.log(`Created ${createdLessons} lessons`);

    return new Response(
      JSON.stringify({
        success: true,
        courseId: newCourse.id,
        courseTitle: course.name,
        lessonsTotal: allLessons.length,
        lessonsCreated: createdLessons,
        lessonsWithContent: lessonContents.filter(
          (l) => !l.content.includes("Нет доступа") && !l.content.includes("Ошибка загрузки")
        ).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse error:", error);
    return new Response(
      JSON.stringify({ error: "Ошибка парсинга: " + (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
