import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- EditorJS blocks → HTML converter ---
function editorBlocksToHtml(blocks: any[]): string {
  if (!Array.isArray(blocks)) return "";
  return blocks.map(blockToHtml).join("\n");
}

function blockToHtml(block: any): string {
  const { type, data } = block;
  if (!data) return "";

  switch (type) {
    case "paragraph":
      return `<p>${data.text || ""}</p>`;
    case "header":
      const lvl = Math.min(Math.max(data.level || 2, 1), 6);
      return `<h${lvl}>${data.text || ""}</h${lvl}>`;
    case "image":
      const src = data.file?.url || data.url || "";
      const caption = data.caption ? `<figcaption>${data.caption}</figcaption>` : "";
      return src ? `<figure><img src="${src}" alt="${data.caption || ""}" />${caption}</figure>` : "";
    case "list":
    case "nestedList":
      return renderList(data);
    case "delimiter":
      return "<hr />";
    case "quote":
      return `<blockquote><p>${data.text || ""}</p>${data.caption ? `<cite>${data.caption}</cite>` : ""}</blockquote>`;
    case "table":
      return renderTable(data);
    case "video":
      return `<p><em>[Видео: ${data.url || data.file?.url || "требуется ручной перенос"}]</em></p>`;
    case "embed":
      return `<p><em>[Embed: ${data.source || data.embed || ""}]</em></p>`;
    case "attaches":
    case "file":
      return `<p><em>[Файл: ${data.title || data.file?.name || "вложение"}]</em></p>`;
    case "warning":
      return `<div class="warning"><strong>${data.title || ""}</strong><p>${data.message || ""}</p></div>`;
    case "code":
      return `<pre><code>${data.code || ""}</code></pre>`;
    case "raw":
      return data.html || "";
    default:
      // Unknown block — try to extract text
      if (data.text) return `<p>${data.text}</p>`;
      return "";
  }
}

function renderList(data: any): string {
  const tag = data.style === "ordered" ? "ol" : "ul";
  const items = data.items || [];
  const lis = items.map((item: any) => {
    if (typeof item === "string") return `<li>${item}</li>`;
    // Nested list item: { content, items }
    const content = item.content || item.text || "";
    const nested = item.items && item.items.length > 0 ? renderList({ ...data, items: item.items }) : "";
    return `<li>${content}${nested}</li>`;
  }).join("");
  return `<${tag}>${lis}</${tag}>`;
}

function renderTable(data: any): string {
  if (!data.content || !Array.isArray(data.content)) return "";
  const rows = data.content.map((row: string[], i: number) => {
    const tag = data.withHeadings && i === 0 ? "th" : "td";
    const cells = row.map((c: string) => `<${tag}>${c}</${tag}>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table>${rows}</table>`;
}

// --- Main handler ---
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

    // Helper for authenticated requests
    const apiFetch = async (path: string): Promise<{ ok: boolean; status: number; data: any }> => {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { Accept: "application/json", Cookie: cookieHeader },
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { /* not json */ }
        log(`${path} → ${res.status} (${text.length}b)`);
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        log(`${path} → ERROR: ${err}`);
        return { ok: false, status: 0, data: null };
      }
    };

    // Step 2: Get course metadata
    let courseName = "Импортированный курс";
    let courseDescription: string | null = null;

    const schoolCourseRes = await apiFetch(`/api/rest/school/course/${courseId}`);
    if (schoolCourseRes.ok && schoolCourseRes.data) {
      const c = schoolCourseRes.data.course || schoolCourseRes.data;
      courseName = c.name || c.title || courseName;
      courseDescription = c.shortDescription || c.description || null;
      log(`Course: "${courseName}"`);
    } else {
      // Fallback to student API
      const studentCourseRes = await apiFetch(`/api/rest/student/course/${courseId}`);
      if (studentCourseRes.ok && studentCourseRes.data?.course) {
        courseName = studentCourseRes.data.course.name || courseName;
        courseDescription = studentCourseRes.data.course.shortDescription || null;
        log(`Course (student API): "${courseName}"`);
      }
    }

    // Step 3: Get lessons list
    interface LessonInfo {
      id: string | number;
      uuid: string;
      title: string;
      order: number;
      type: string;
      groupName: string;
    }

    let allLessons: LessonInfo[] = [];

    // Strategy A: School API — step/list (owner/admin)
    const stepListRes = await apiFetch(`/api/rest/school/course/${courseId}/step/list`);
    if (stepListRes.ok && Array.isArray(stepListRes.data)) {
      let idx = 0;
      for (const group of stepListRes.data) {
        const groupName = group.name || group.title || "Модуль";
        const lessons = group.lessons || group.steps || [];
        for (const l of lessons) {
          allLessons.push({
            id: l.id,
            uuid: l.uuid || String(l.id),
            title: l.name || l.title || `Урок ${idx + 1}`,
            order: idx++,
            type: l.type === "test" ? "test" : "default",
            groupName,
          });
        }
      }
      log(`Strategy A (school/step/list): ${allLessons.length} lessons in ${stepListRes.data.length} groups`);
    }

    // Strategy B: Fallback — extract lesson IDs from student course flows
    if (allLessons.length === 0) {
      log("School API unavailable, falling back to student flow extraction...");
      const studentCourseRes = await apiFetch(`/api/rest/student/course/${courseId}`);
      if (studentCourseRes.ok && studentCourseRes.data) {
        const lessonIds = new Set<number>();
        const extractIds = (obj: any, path = "") => {
          if (!obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) {
            if (obj.length > 0 && obj.every((v: any) => typeof v === "number") && path.toLowerCase().includes("lesson")) {
              obj.forEach((id: number) => lessonIds.add(id));
            }
            obj.forEach((item, i) => extractIds(item, `${path}[${i}]`));
            return;
          }
          for (const [key, val] of Object.entries(obj)) {
            extractIds(val, `${path}.${key}`);
          }
        };
        extractIds(studentCourseRes.data, "courseData");

        const flows = studentCourseRes.data.course?.flows || studentCourseRes.data.flows;
        if (Array.isArray(flows)) {
          for (const flow of flows) {
            if (flow?.access?.lessons) {
              const ids = Array.isArray(flow.access.lessons)
                ? flow.access.lessons
                : Object.keys(flow.access.lessons).map(Number);
              ids.forEach((id: number) => lessonIds.add(id));
            }
          }
        }

        if (lessonIds.size > 0) {
          const sorted = Array.from(lessonIds).sort((a, b) => a - b);
          allLessons = sorted.map((id, i) => ({
            id,
            uuid: String(id),
            title: `Урок ${i + 1}`,
            order: i,
            type: "default",
            groupName: "Извлечённые уроки",
          }));
          log(`Strategy B (flow extraction): ${allLessons.length} lesson IDs`);
        }
      }
    }

    if (allLessons.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Не удалось найти уроки. Попробуйте использовать аккаунт владельца школы.",
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
      let lessonData: any = null;

      // Try school API first (uses uuid), then student API
      const paths = [
        `/api/rest/school/lesson/${lesson.uuid}`,
        `/api/rest/student/lesson/${lesson.uuid}`,
      ];
      // If uuid differs from id, also try with id
      if (String(lesson.id) !== lesson.uuid) {
        paths.push(`/api/rest/school/lesson/${lesson.id}`);
        paths.push(`/api/rest/student/lesson/${lesson.id}`);
      }

      for (const path of paths) {
        if (lessonData) break;
        const res = await apiFetch(path);
        if (res.ok && res.data) {
          lessonData = res.data.lesson || res.data;
        }
      }

      if (lessonData) {
        let htmlContent = "";
        const lessonTitle = lessonData.name || lessonData.title || lesson.title;
        let lessonType = lesson.type;

        // EditorJS content in pagesPublished
        const pages = lessonData.pagesPublished || lessonData.pages || [];
        if (Array.isArray(pages) && pages.length > 0) {
          for (const page of pages) {
            const blocks = page.content?.blocks || page.blocks || [];
            if (blocks.length > 0) {
              htmlContent += editorBlocksToHtml(blocks);
            }
          }
        }

        // Fallback: legacy blocks format
        if (!htmlContent && Array.isArray(lessonData.blocks)) {
          for (const block of lessonData.blocks) {
            if (block.type === "text" && block.content) {
              htmlContent += block.content;
            } else if (block.type === "video") {
              lessonType = "video";
              htmlContent += `<p><em>[Видео — требуется ручной перенос]</em></p>`;
            } else if (block.type === "test") {
              lessonType = "test";
              htmlContent += `<p><em>[Тест — требуется ручной перенос]</em></p>`;
            }
          }
        }

        lessonContents.push({
          title: lessonTitle,
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
        title: courseName,
        description: courseDescription,
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
        courseTitle: courseName,
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
