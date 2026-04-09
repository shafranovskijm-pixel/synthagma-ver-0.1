import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- EditorJS blocks → project JSON blocks converter ---
function editorBlocksToJsonBlocks(blocks: any[]): any[] {
  if (!Array.isArray(blocks)) return [];
  const result: any[] = [];
  for (const block of blocks) {
    const converted = convertBlock(block);
    if (converted) result.push(converted);
  }
  return result;
}

function makeId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

function convertBlock(block: any): any | null {
  const { type, data } = block;
  if (!data) return null;

  switch (type) {
    case "paragraph":
      if (!data.text) return null;
      return { id: makeId(), type: "paragraph", content: data.text };

    case "header": {
      const level = data.level || 2;
      return {
        id: makeId(),
        type: level <= 1 ? "heading1" : "heading2",
        content: data.text || "",
      };
    }

    case "image": {
      const src = data.file?.url || data.url || "";
      if (!src) return null;
      return {
        id: makeId(),
        type: "image",
        content: data.caption || "",
        imageSrc: src,
        imageAlt: data.caption || "",
      };
    }

    case "list":
    case "nestedList": {
      const style = data.style === "ordered" ? "numberedList" : "bulletList";
      const text = flattenListItems(data.items || []);
      return { id: makeId(), type: style, content: text };
    }

    case "delimiter":
      return { id: makeId(), type: "divider", content: "" };

    case "quote":
      return {
        id: makeId(),
        type: "quote",
        content: (data.text || "") + (data.caption ? `\n— ${data.caption}` : ""),
      };

    case "table": {
      if (!data.content || !Array.isArray(data.content)) return null;
      const html = renderTableHtml(data);
      return { id: makeId(), type: "paragraph", content: html };
    }

    case "video":
      return {
        id: makeId(),
        type: "video",
        content: "",
        videoUrl: data.url || data.file?.url || "",
      };

    case "embed":
      return {
        id: makeId(),
        type: "paragraph",
        content: `<em>[Embed: ${data.source || data.embed || ""}]</em>`,
      };

    case "attaches":
    case "file":
      return {
        id: makeId(),
        type: "document",
        content: data.title || data.file?.name || "Вложение",
        documentUrl: data.file?.url || "",
        documentName: data.title || data.file?.name || "Вложение",
      };

    case "warning":
      return {
        id: makeId(),
        type: "callout-warning",
        content: `<strong>${data.title || ""}</strong>\n${data.message || ""}`,
      };

    case "code":
      return {
        id: makeId(),
        type: "paragraph",
        content: `<pre><code>${data.code || ""}</code></pre>`,
      };

    case "raw":
      if (!data.html) return null;
      return { id: makeId(), type: "paragraph", content: data.html };

    default:
      if (data.text) return { id: makeId(), type: "paragraph", content: data.text };
      return null;
  }
}

function flattenListItems(items: any[]): string {
  return items
    .map((item: any) => {
      if (typeof item === "string") return `<li>${item}</li>`;
      const content = item.content || item.text || "";
      const nested =
        item.items && item.items.length > 0
          ? `<ul>${flattenListItems(item.items)}</ul>`
          : "";
      return `<li>${content}${nested}</li>`;
    })
    .join("");
}

function renderTableHtml(data: any): string {
  if (!data.content || !Array.isArray(data.content)) return "";
  const rows = data.content
    .map((row: string[], i: number) => {
      const tag = data.withHeadings && i === 0 ? "th" : "td";
      const cells = row.map((c: string) => `<${tag}>${c}</${tag}>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table>${rows}</table>`;
}

// --- Cookie helper: deduplicating cookie map ---
// cookieMap is now created per-request inside handler to avoid warm-instance leaks

function mergeCookiesFromResponse(response: Response, cookieMap: Map<string, string>) {
  const setCookies: string[] = [];
  if (typeof response.headers.getSetCookie === "function") {
    setCookies.push(...response.headers.getSetCookie());
  } else {
    const raw = response.headers.get("set-cookie");
    if (raw) setCookies.push(raw);
  }
  for (const header of setCookies) {
    const pair = header.split(";")[0].trim();
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      // Simply overwrite — last value wins (handles deleted → real token sequence)
      cookieMap.set(name, value);
    }
  }
}

function getCookieHeader(cookieMap: Map<string, string>): string {
  return Array.from(cookieMap.entries())
    .filter(([_, v]) => v && v !== "deleted")
    .map(([k, v]) => `${k}=${v}`).join("; ");
}

function getAuthToken(cookieMap: Map<string, string>): string | null {
  const t = cookieMap.get("Auth-Token");
  return (t && t !== "deleted") ? t : null;
}

// --- Main handler ---
Deno.serve(async (req) => {
  // Fresh cookie map per request — prevents warm-instance state leaks
  const cookieMap = new Map<string, string>();
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

    // Step 1: Authenticate — follow redirects manually to collect all cookies
    const formData = new FormData();
    formData.append("email", login);
    formData.append("password", password);
    formData.append("fingerprint", crypto.randomUUID());

    // First request — login
    const authRes = await fetch(`${baseUrl}/api/user/auth`, {
      method: "POST",
      body: formData,
      redirect: "manual",
    });

    mergeCookiesFromResponse(authRes);
    log(`Auth response: ${authRes.status}, cookies: ${cookieMap.size > 0 ? "yes" : "none"}`);

    // If redirect, follow it to collect session cookies
    if (authRes.status >= 300 && authRes.status < 400) {
      const location = authRes.headers.get("location");
      if (location) {
        const redirectUrl = location.startsWith("http") ? location : `${baseUrl}${location}`;
        log(`Following redirect to: ${redirectUrl}`);
        const redirectRes = await fetch(redirectUrl, {
          headers: { Cookie: getCookieHeader() },
          redirect: "manual",
        });
        mergeCookiesFromResponse(redirectRes);
        log(`Redirect response: ${redirectRes.status}`);

        // Follow second redirect if any
        if (redirectRes.status >= 300 && redirectRes.status < 400) {
          const loc2 = redirectRes.headers.get("location");
          if (loc2) {
            const rUrl2 = loc2.startsWith("http") ? loc2 : `${baseUrl}${loc2}`;
            const rRes2 = await fetch(rUrl2, {
              headers: { Cookie: getCookieHeader() },
              redirect: "manual",
            });
            mergeCookiesFromResponse(rRes2);
          }
        }
      }
    } else if (!authRes.ok) {
      log(`Auth failed: ${authRes.status}`);
      return new Response(
        JSON.stringify({ error: "Не удалось авторизоваться. Проверьте логин и пароль.", debug: debugLog }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authToken = getAuthToken();
    if (!authToken) {
      log("No Auth-Token received from auth");
      return new Response(
        JSON.stringify({ error: "Авторизация не вернула токен сессии. Проверьте учётные данные.", debug: debugLog }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Auth successful, Auth-Token: ${authToken.substring(0, 20)}...`);

    // Also try to get CSRF / additional session by hitting the school admin page
    try {
      const adminPageRes = await fetch(`${baseUrl}/school/constructor/course/${courseId}`, {
        headers: { Cookie: getCookieHeader(), Authorization: `Bearer ${authToken}` },
        redirect: "manual",
      });
      mergeCookiesFromResponse(adminPageRes);
      log(`Admin page probe: ${adminPageRes.status}`);
    } catch (e) {
      log(`Admin page probe failed: ${e}`);
    }

    // Helper for authenticated requests
    const apiFetch = async (path: string): Promise<{ ok: boolean; status: number; data: any; raw: string }> => {
      try {
        const currentAuth = getAuthToken();
        const headers: Record<string, string> = {
          Accept: "application/json",
          Cookie: getCookieHeader(),
          "X-Requested-With": "XMLHttpRequest",
        };
        if (currentAuth) {
          headers["Authorization"] = `Bearer ${currentAuth}`;
        }
        const res = await fetch(`${baseUrl}${path}`, { headers });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { /* not json */ }
        log(`${path} → ${res.status} (${text.length}b)`);
        mergeCookiesFromResponse(res);
        return { ok: res.ok, status: res.status, data, raw: text };
      } catch (err) {
        log(`${path} → ERROR: ${err}`);
        return { ok: false, status: 0, data: null, raw: "" };
      }
    };

    // Step 2: Get course metadata
    let courseName = "Импортированный курс";
    let courseDescription: string | null = null;
    let importMode: "school" | "student" = "school";

    const schoolCourseRes = await apiFetch(`/api/rest/school/course/${courseId}`);
    if (schoolCourseRes.ok && schoolCourseRes.data) {
      const c = schoolCourseRes.data.course || schoolCourseRes.data;
      courseName = c.name || c.title || courseName;
      courseDescription = c.shortDescription || c.description || null;
      log(`Course: "${courseName}"`);
    } else {
      log(`School course API returned ${schoolCourseRes.status}, trying student API...`);
      importMode = "student";
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
    let schoolApiAvailable = false;

    // Strategy A: School API — step/list (owner/admin)
    const stepListRes = await apiFetch(`/api/rest/school/course/${courseId}/step/list`);
    if (stepListRes.ok && Array.isArray(stepListRes.data)) {
      schoolApiAvailable = true;
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

    // If school API failed, DO NOT silently fall back — report the issue
    if (allLessons.length === 0 && !schoolApiAvailable) {
      // Try student fallback but warn
      log("School API unavailable (401). Trying student flow extraction as fallback...");
      importMode = "student";
      
      const studentCourseRes = await apiFetch(`/api/rest/student/course/${courseId}`);
      if (studentCourseRes.ok && studentCourseRes.data) {
        const lessonIds = new Set<number>();
        
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

        // Also try extracting from course data
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
          error: "Не удалось найти уроки. School API вернул 401 — возможно, аккаунт не является владельцем/администратором школы.",
          importMode,
          schoolApiAvailable,
          debug: debugLog,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Fetch each lesson's content
    const lessonContents: Array<{
      title: string;
      content: string; // JSON stringified array of blocks
      order: number;
      type: string;
    }> = [];

    let lessonsAccessDenied = 0;
    let lessonsWithBlocks = 0;

    for (let i = 0; i < allLessons.length; i++) {
      const lesson = allLessons[i];
      let lessonData: any = null;

      // Try school API first (uuid), then student API
      const paths = [
        `/api/rest/school/lesson/${lesson.uuid}`,
      ];
      if (String(lesson.id) !== lesson.uuid) {
        paths.push(`/api/rest/school/lesson/${lesson.id}`);
      }
      // Student fallback paths
      paths.push(`/api/rest/student/lesson/${lesson.uuid}`);
      if (String(lesson.id) !== lesson.uuid) {
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
        const lessonTitle = lessonData.name || lessonData.title || lesson.title;
        let lessonType = lesson.type;
        let jsonBlocks: any[] = [];

        // EditorJS content in pagesPublished
        const pages = lessonData.pagesPublished || lessonData.pages || [];
        if (Array.isArray(pages) && pages.length > 0) {
          for (const page of pages) {
            // Add page title as heading if present
            if (page.title) {
              jsonBlocks.push({ id: makeId(), type: "heading2", content: page.title });
            }
            const blocks = page.content?.blocks || page.blocks || [];
            if (blocks.length > 0) {
              const converted = editorBlocksToJsonBlocks(blocks);
              jsonBlocks.push(...converted);
            }
          }
        }

        // Fallback: legacy blocks format
        if (jsonBlocks.length === 0 && Array.isArray(lessonData.blocks)) {
          for (const block of lessonData.blocks) {
            if (block.type === "text" && block.content) {
              jsonBlocks.push({ id: makeId(), type: "paragraph", content: block.content });
            } else if (block.type === "video") {
              lessonType = "video";
              const videoUrl = block.url || block.file?.url || block.src || "";
              jsonBlocks.push({ id: makeId(), type: "paragraph", content: videoUrl ? `<a href="${videoUrl}" target="_blank">🎬 Видео: ${videoUrl}</a>` : "<em>[Видео — URL не найден]</em>" });
            } else if (block.type === "test") {
              lessonType = "test";
              jsonBlocks.push({ id: makeId(), type: "paragraph", content: "<em>[Тест — требуется ручной перенос]</em>" });
            }
          }
        }

        if (jsonBlocks.length > 0) lessonsWithBlocks++;

        lessonContents.push({
          title: lessonTitle,
          content: JSON.stringify(jsonBlocks.length > 0 ? jsonBlocks : [{ id: makeId(), type: "paragraph", content: "Пустой урок" }]),
          order: i,
          type: lessonType === "test" ? "test" : "text",
        });
      } else {
        lessonsAccessDenied++;
        lessonContents.push({
          title: lesson.title,
          content: JSON.stringify([{ id: makeId(), type: "paragraph", content: `<em>Нет доступа к уроку (ID: ${lesson.id})</em>` }]),
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

    return new Response(
      JSON.stringify({
        success: true,
        courseId: newCourse.id,
        courseTitle: courseName,
        lessonsTotal: allLessons.length,
        lessonsCreated: createdLessons,
        lessonsWithContent: lessonsWithBlocks,
        lessonsAccessDenied,
        importMode,
        schoolApiAvailable,
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
