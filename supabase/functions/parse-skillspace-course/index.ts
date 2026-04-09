import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const urlMatch = url.match(/https?:\/\/([^.]+)\.skillspace\.ru\/course\/(\d+)/);
    if (!urlMatch) {
      return new Response(
        JSON.stringify({ error: "Неверный формат URL. Ожидается: https://{school}.skillspace.ru/course/{id}/..." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const schoolSlug = urlMatch[1];
    const courseId = urlMatch[2];
    const baseUrl = `https://${schoolSlug}.skillspace.ru`;
    const debugLog: string[] = [];

    const log = (msg: string) => {
      console.log(msg);
      debugLog.push(msg);
    };

    log(`Parsing course ${courseId} from ${baseUrl}`);

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
      log(`Auth failed: ${authRes.status} ${authText.substring(0, 300)}`);
      return new Response(
        JSON.stringify({ error: "Не удалось авторизоваться. Проверьте логин и пароль.", debug: debugLog }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const setCookies = authRes.headers.getSetCookie?.() || [];
    const cookieHeader = setCookies.map((c: string) => c.split(";")[0]).join("; ");
    log("Auth successful");

    // Helper to make authenticated GET requests with logging
    const apiFetch = async (path: string): Promise<{ ok: boolean; status: number; data: any; text: string }> => {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { Accept: "application/json", Cookie: cookieHeader },
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { /* not json */ }
        log(`${path} → ${res.status} (${text.length} bytes, keys: ${data ? Object.keys(data).join(",") : "non-json"})`);
        return { ok: res.ok, status: res.status, data, text };
      } catch (err) {
        log(`${path} → ERROR: ${err}`);
        return { ok: false, status: 0, data: null, text: "" };
      }
    };

    // Step 2: Get course metadata
    const courseRes = await apiFetch(`/api/rest/student/course/${courseId}`);
    if (!courseRes.ok || !courseRes.data?.course) {
      return new Response(
        JSON.stringify({ error: `Не удалось загрузить курс (статус ${courseRes.status})`, debug: debugLog }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const course = courseRes.data.course;
    log(`Course: "${course.name}", groups: ${course.groupsCount}, lessons: ${course.lessonsQuantity}`);

    // Step 3: Try multiple API paths to discover lessons
    interface LessonInfo {
      id: string | number;
      title: string;
      order: number;
      type: string;
      groupName: string;
    }

    let allLessons: LessonInfo[] = [];

    // Strategy A: Constructor API (admin/owner accounts)
    const constructorPaths = [
      `/api/rest/constructor/course/${courseId}`,
      `/api/rest/constructor/course/${courseId}/groups`,
      `/api/rest/constructor/course/${courseId}/lessons`,
      `/api/rest/course/${courseId}/constructor`,
      `/api/rest/course/${courseId}/groups`,
    ];

    for (const path of constructorPaths) {
      if (allLessons.length > 0) break;
      const res = await apiFetch(path);
      if (!res.ok || !res.data) continue;

      // Try to extract lessons from various response shapes
      const data = res.data;
      
      // Shape: { groups: [{ name, lessons: [{ id, title, ... }] }] }
      const groups = data.groups || data.course?.groups;
      if (Array.isArray(groups)) {
        let idx = 0;
        for (const g of groups) {
          const lessons = g.lessons || g.items || [];
          if (Array.isArray(lessons)) {
            for (const l of lessons) {
              allLessons.push({
                id: l.uuid || l.id,
                title: l.title || l.name || `Урок ${idx + 1}`,
                order: idx++,
                type: l.type || "default",
                groupName: g.name || g.title || "Модуль",
              });
            }
          }
        }
        if (allLessons.length > 0) {
          log(`Found ${allLessons.length} lessons from constructor groups at ${path}`);
        }
      }

      // Shape: { lessons: [{ id, title, ... }] }
      const lessonsList = data.lessons || data.course?.lessons;
      if (allLessons.length === 0 && Array.isArray(lessonsList)) {
        allLessons = lessonsList.map((l: any, i: number) => ({
          id: l.uuid || l.id,
          title: l.title || l.name || `Урок ${i + 1}`,
          order: i,
          type: l.type || "default",
          groupName: "Основной модуль",
        }));
        if (allLessons.length > 0) {
          log(`Found ${allLessons.length} lessons from lessons array at ${path}`);
        }
      }
    }

    // Strategy B: Extract lesson IDs from all flows in course response
    if (allLessons.length === 0) {
      log("Constructor APIs failed, extracting lessons from flows...");
      const lessonIds = new Set<number>();

      // Recursively scan the course object for lesson ID arrays
      const extractLessonIds = (obj: any, path = "") => {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          // Check if it's an array of numbers (lesson IDs)
          if (obj.length > 0 && obj.every((v: any) => typeof v === "number")) {
            if (path.toLowerCase().includes("lesson")) {
              obj.forEach((id: number) => lessonIds.add(id));
              log(`Found ${obj.length} lesson IDs at ${path}`);
            }
          }
          obj.forEach((item, i) => extractLessonIds(item, `${path}[${i}]`));
          return;
        }
        for (const [key, val] of Object.entries(obj)) {
          extractLessonIds(val, `${path}.${key}`);
        }
      };

      extractLessonIds(courseRes.data, "courseResponse");

      // Also try the flow endpoint
      const flowRes = await apiFetch(`/api/rest/student/course/${courseId}/flow`);
      if (flowRes.ok && flowRes.data) {
        extractLessonIds(flowRes.data, "flowResponse");
      }

      // Also check all flow objects in the course response for lesson access
      const flows = course.flows || courseRes.data.flows;
      if (Array.isArray(flows)) {
        for (const flow of flows) {
          if (flow?.access?.lessons) {
            const ids = Array.isArray(flow.access.lessons)
              ? flow.access.lessons
              : Object.keys(flow.access.lessons).map(Number);
            ids.forEach((id: number) => lessonIds.add(id));
            log(`Flow "${flow.name || flow.uuid}": found ${ids.length} lesson IDs`);
          }
        }
      }

      if (lessonIds.size > 0) {
        const sortedIds = Array.from(lessonIds).sort((a, b) => a - b);
        allLessons = sortedIds.map((id, i) => ({
          id,
          title: `Урок ${i + 1}`,
          order: i,
          type: "default",
          groupName: "Извлечённые уроки",
        }));
        log(`Total unique lesson IDs from flows: ${lessonIds.size}`);
      }
    }

    // Strategy C: Parse HTML constructor page as last resort
    if (allLessons.length === 0) {
      log("Trying HTML constructor page...");
      try {
        const htmlRes = await fetch(`${baseUrl}/course/${courseId}/constructor`, {
          headers: { Cookie: cookieHeader },
        });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          log(`Constructor HTML: ${html.length} bytes`);
          
          // Try to find __NEXT_DATA__ or similar JSON embedded in HTML
          const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
          if (nextDataMatch) {
            try {
              const nextData = JSON.parse(nextDataMatch[1]);
              log(`Found __NEXT_DATA__, keys: ${Object.keys(nextData).join(",")}`);
              // Extract lessons from Next.js data
              const extractFromNext = (obj: any): any[] => {
                if (!obj || typeof obj !== "object") return [];
                if (Array.isArray(obj)) return obj.flatMap(extractFromNext);
                if (obj.lessons && Array.isArray(obj.lessons)) return obj.lessons;
                if (obj.groups && Array.isArray(obj.groups)) {
                  return obj.groups.flatMap((g: any) => g.lessons || []);
                }
                return Object.values(obj).flatMap(extractFromNext);
              };
              const found = extractFromNext(nextData);
              if (found.length > 0) {
                allLessons = found.map((l: any, i: number) => ({
                  id: l.uuid || l.id,
                  title: l.title || l.name || `Урок ${i + 1}`,
                  order: i,
                  type: l.type || "default",
                  groupName: "Из конструктора",
                }));
                log(`Found ${allLessons.length} lessons from HTML`);
              }
            } catch { /* parse error */ }
          }

          // Fallback: look for lesson data in any script tag
          const scriptMatches = html.matchAll(/"lessons"\s*:\s*(\[.*?\])/gs);
          for (const match of scriptMatches) {
            if (allLessons.length > 0) break;
            try {
              const lessons = JSON.parse(match[1]);
              if (Array.isArray(lessons) && lessons.length > 0) {
                allLessons = lessons.map((l: any, i: number) => ({
                  id: l.uuid || l.id,
                  title: l.title || l.name || `Урок ${i + 1}`,
                  order: i,
                  type: l.type || "default",
                  groupName: "Из HTML",
                }));
                log(`Found ${allLessons.length} lessons from HTML script`);
              }
            } catch { /* parse error */ }
          }
        } else {
          log(`Constructor HTML returned ${htmlRes.status}`);
        }
      } catch (err) {
        log(`HTML fetch error: ${err}`);
      }
    }

    if (allLessons.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Не удалось найти уроки. Возможно, аккаунт не имеет доступа к содержимому курса. Попробуйте использовать аккаунт владельца школы.",
          debug: debugLog,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      
      // Try multiple lesson endpoints
      let lessonData: any = null;
      const lessonPaths = [
        `/api/rest/student/lesson/${lesson.id}`,
        `/api/rest/constructor/lesson/${lesson.id}`,
        `/api/rest/lesson/${lesson.id}`,
      ];

      for (const path of lessonPaths) {
        if (lessonData) break;
        const res = await apiFetch(path);
        if (res.ok && res.data?.lesson) {
          lessonData = res.data;
        }
      }

      if (lessonData?.lesson) {
        const blocks = lessonData.lesson.blocks || [];
        let htmlContent = "";
        let lessonType = "text";

        for (const block of blocks) {
          if (block.type === "text" && block.content) {
            htmlContent += block.content;
          } else if (block.type === "video") {
            lessonType = "video";
            htmlContent += `<p><em>[Видео — требуется ручной перенос]</em></p>`;
          } else if (block.type === "test") {
            lessonType = "test";
            htmlContent += `<p><em>[Тест — требуется ручной перенос]</em></p>`;
          } else if (block.type === "file" && block.content) {
            htmlContent += `<p><em>[Файл: ${block.content}]</em></p>`;
          }
        }

        lessonContents.push({
          title: lessonData.lesson.title || lesson.title,
          content: htmlContent || "<p>Пустой урок</p>",
          order: i,
          type: lessonType === "test" ? "test" : "text",
        });
      } else {
        lessonContents.push({
          title: lesson.title,
          content: `<p><em>Нет доступа к уроку (ID: ${lesson.id})</em></p>`,
          order: i,
          type: "text",
        });
      }

      // Log progress every 10 lessons
      if ((i + 1) % 10 === 0 || i === allLessons.length - 1) {
        log(`Lessons fetched: ${i + 1}/${allLessons.length}`);
      }
    }

    // Step 5: Save to DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

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
      log(`Failed to create course: ${JSON.stringify(courseError)}`);
      return new Response(
        JSON.stringify({ error: "Не удалось создать курс: " + courseError?.message, debug: debugLog }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Created course ${newCourse.id}`);

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
        log(`Failed to create lesson "${lesson.title}": ${lessonError.message}`);
      } else {
        createdLessons++;
      }
    }

    log(`Created ${createdLessons}/${lessonContents.length} lessons`);

    const lessonsWithContent = lessonContents.filter(
      (l) => !l.content.includes("Нет доступа") && l.content !== "<p>Пустой урок</p>"
    ).length;

    return new Response(
      JSON.stringify({
        success: true,
        courseId: newCourse.id,
        courseTitle: course.name,
        lessonsTotal: allLessons.length,
        lessonsCreated: createdLessons,
        lessonsWithContent,
        debug: debugLog,
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
