import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- Clean HTML entities ---
function cleanHtml(text: string): string {
  if (!text) return text;
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00A0/g, " ")
    .replace(/ {2,}/g, " ");
}

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
      return { id: makeId(), type: "paragraph", content: cleanHtml(data.text) };

    case "header": {
      const level = data.level || 2;
      return {
        id: makeId(),
        type: level <= 1 ? "heading1" : "heading2",
        content: cleanHtml(data.text || ""),
      };
    }

    case "image": {
      const src = data.file?.url || data.url || "";
      if (!src) return null;
      return {
        id: makeId(),
        type: "image",
        content: cleanHtml(data.caption || ""),
        imageSrc: src,
        imageAlt: cleanHtml(data.caption || ""),
      };
    }

    case "list":
    case "nestedList": {
      const style = data.style === "ordered" ? "numberedList" : "bulletList";
      const text = cleanHtml(flattenListItems(data.items || []));
      return { id: makeId(), type: style, content: text };
    }

    case "delimiter":
      return { id: makeId(), type: "divider", content: "" };

    case "quote":
      return {
        id: makeId(),
        type: "quote",
        content: cleanHtml((data.text || "") + (data.caption ? `\n— ${data.caption}` : "")),
      };

    case "table": {
      if (!data.content || !Array.isArray(data.content)) return null;
      const html = renderTableHtml(data);
      return { id: makeId(), type: "paragraph", content: cleanHtml(html) };
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
        content: cleanHtml(data.title || data.file?.name || "Вложение"),
        documentUrl: data.file?.url || "",
        documentName: cleanHtml(data.title || data.file?.name || "Вложение"),
      };

    case "warning":
      return {
        id: makeId(),
        type: "callout-warning",
        content: cleanHtml(`<strong>${data.title || ""}</strong>\n${data.message || ""}`),
      };

    case "code":
      return {
        id: makeId(),
        type: "paragraph",
        content: `<pre><code>${data.code || ""}</code></pre>`,
      };

    case "raw":
      if (!data.html) return null;
      return { id: makeId(), type: "paragraph", content: cleanHtml(data.html) };

    default:
      if (data.text) return { id: makeId(), type: "paragraph", content: cleanHtml(data.text) };
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
    const { url, login, password, organizationId, existingCourseId } = await req.json();
    const isUpdateMode = !!existingCourseId;

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
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Origin": baseUrl,
        "Referer": `${baseUrl}/signin`,
      },
    });

    mergeCookiesFromResponse(authRes, cookieMap);
    log(`Auth response: ${authRes.status}, cookies: ${cookieMap.size > 0 ? "yes" : "none"}`);

    // If redirect, follow it to collect session cookies
    if (authRes.status >= 300 && authRes.status < 400) {
      const location = authRes.headers.get("location");
      if (location) {
        const redirectUrl = location.startsWith("http") ? location : `${baseUrl}${location}`;
        log(`Following redirect to: ${redirectUrl}`);
        const redirectRes = await fetch(redirectUrl, {
          headers: { Cookie: getCookieHeader(cookieMap) },
          redirect: "manual",
        });
        mergeCookiesFromResponse(redirectRes, cookieMap);
        log(`Redirect response: ${redirectRes.status}`);

        // Follow second redirect if any
        if (redirectRes.status >= 300 && redirectRes.status < 400) {
          const loc2 = redirectRes.headers.get("location");
          if (loc2) {
            const rUrl2 = loc2.startsWith("http") ? loc2 : `${baseUrl}${loc2}`;
            const rRes2 = await fetch(rUrl2, {
              headers: { Cookie: getCookieHeader(cookieMap) },
              redirect: "manual",
            });
            mergeCookiesFromResponse(rRes2, cookieMap);
          }
        }
      }
    } else if (!authRes.ok) {
      const authBody = await authRes.text();
      log(`Auth failed: ${authRes.status}, body: ${authBody.substring(0, 500)}`);
      return new Response(
        JSON.stringify({ error: "Не удалось авторизоваться. Проверьте логин и пароль.", debug: debugLog }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authToken = getAuthToken(cookieMap);
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
        headers: { Cookie: getCookieHeader(cookieMap) },
        redirect: "manual",
      });
      mergeCookiesFromResponse(adminPageRes, cookieMap);
      log(`Admin page probe: ${adminPageRes.status}`);
    } catch (e) {
      log(`Admin page probe failed: ${e}`);
    }

    // Helper for authenticated requests with retry on HTTP/2 errors
    const apiFetch = async (path: string, maxRetries = 3): Promise<{ ok: boolean; status: number; data: any; raw: string }> => {
      const headers: Record<string, string> = {
        "Accept": "application/json, text/plain, */*",
        "Cookie": getCookieHeader(cookieMap),
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      };
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const res = await fetch(`${baseUrl}${path}`, { headers });
          const text = await res.text();
          let data = null;
          try { data = JSON.parse(text); } catch { /* not json */ }
          log(`${path} → ${res.status} (${text.length}b)`);
          mergeCookiesFromResponse(res, cookieMap);
          // Preserve raw text for small responses (< 2KB) for debugging
          const rawForDebug = text.length < 2000 ? text : "";
          return { ok: res.ok, status: res.status, data, raw: rawForDebug };
        } catch (err) {
          const errStr = String(err);
          const isRetryable = errStr.includes("http2") || errStr.includes("connection error") || errStr.includes("SendRequest");
          if (isRetryable && attempt < maxRetries - 1) {
            const delay = (attempt + 1) * 1000;
            log(`${path} → RETRY ${attempt + 1}/${maxRetries} after ${delay}ms (${errStr.substring(0, 80)})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          log(`${path} → ERROR: ${err}`);
          return { ok: false, status: 0, data: null, raw: "" };
        }
      }
      return { ok: false, status: 0, data: null, raw: "" };
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
    interface TestQuestion {
      lessonIndex: number;
      question: string;
      options: { text: string }[];
      correct_answer: number | null;
    }

    const lessonContents: Array<{
      title: string;
      content: string;
      order: number;
      type: string;
      testQuestions?: TestQuestion[];
    }> = [];

    let lessonsAccessDenied = 0;
    let lessonsWithBlocks = 0;

    for (let i = 0; i < allLessons.length; i++) {
      const lesson = allLessons[i];
      let lessonData: any = null;

      // Try school API first (uuid), then student API. Add ?version=published variant.
      const paths = [
        `/api/rest/school/lesson/${lesson.uuid}?version=published`,
        `/api/rest/school/lesson/${lesson.uuid}`,
      ];
      if (String(lesson.id) !== lesson.uuid) {
        paths.push(`/api/rest/school/lesson/${lesson.id}?version=published`);
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

        if (lessonType === "test" || lesson.type === "test") {
          lessonType = "test";
          // Extract test questions from SkillSpace data
          const extractedQuestions: TestQuestion[] = [];
          
          // Strategy 1: questions in pagesPublished blocks
          const pages = lessonData.pagesPublished || lessonData.pages || [];
          if (Array.isArray(pages)) {
            for (const page of pages) {
              const blocks = page.content?.blocks || page.blocks || [];
              for (const block of blocks) {
                if (block.type === "quiz" || block.type === "test" || block.type === "question") {
                  const questions = block.data?.questions || block.data?.items || [];
                  for (const q of questions) {
                    const qText = cleanHtml(q.title || q.text || q.question || "");
                    const opts = (q.answers || q.options || q.variants || []).map((a: any) => ({
                      text: cleanHtml(typeof a === "string" ? a : (a.text || a.title || a.answer || String(a)))
                    }));
                    let correctIdx: number | null = null;
                    if (typeof q.correctAnswer === "number") correctIdx = q.correctAnswer;
                    else if (typeof q.correct === "number") correctIdx = q.correct;
                    else if (Array.isArray(q.answers || q.options || q.variants)) {
                      const arr = q.answers || q.options || q.variants || [];
                      const ci = arr.findIndex((a: any) => a.correct === true || a.isCorrect === true || a.is_correct === true);
                      if (ci >= 0) correctIdx = ci;
                    }
                    if (qText && opts.length > 0) {
                      extractedQuestions.push({ lessonIndex: i, question: qText, options: opts, correct_answer: correctIdx });
                    }
                  }
                }
              }
            }
          }

          // Strategy 2: direct questions field
          const directQuestions = lessonData.questions || lessonData.test?.questions || lessonData.quiz?.questions || [];
          if (Array.isArray(directQuestions) && extractedQuestions.length === 0) {
            for (const q of directQuestions) {
              const qText = cleanHtml(q.title || q.text || q.question || "");
              const opts = (q.answers || q.options || q.variants || []).map((a: any) => ({
                text: cleanHtml(typeof a === "string" ? a : (a.text || a.title || a.answer || String(a)))
              }));
              let correctIdx: number | null = null;
              if (typeof q.correctAnswer === "number") correctIdx = q.correctAnswer;
              else if (typeof q.correct === "number") correctIdx = q.correct;
              else {
                const arr = q.answers || q.options || q.variants || [];
                if (Array.isArray(arr)) {
                  const ci = arr.findIndex((a: any) => a.correct === true || a.isCorrect === true || a.is_correct === true);
                  if (ci >= 0) correctIdx = ci;
                }
              }
              if (qText && opts.length > 0) {
                extractedQuestions.push({ lessonIndex: i, question: qText, options: opts, correct_answer: correctIdx });
              }
            }
          }

          // Strategy 3: legacy blocks with type "test"
          if (Array.isArray(lessonData.blocks) && extractedQuestions.length === 0) {
            for (const block of lessonData.blocks) {
              if (block.type === "test" || block.type === "quiz") {
                const questions = block.questions || block.data?.questions || [];
                for (const q of questions) {
                  const qText = cleanHtml(q.title || q.text || q.question || "");
                  const opts = (q.answers || q.options || q.variants || []).map((a: any) => ({
                    text: cleanHtml(typeof a === "string" ? a : (a.text || a.title || a.answer || String(a)))
                  }));
                  let correctIdx: number | null = null;
                  const arr = q.answers || q.options || q.variants || [];
                  if (Array.isArray(arr)) {
                    const ci = arr.findIndex((a: any) => a.correct === true || a.isCorrect === true || a.is_correct === true);
                    if (ci >= 0) correctIdx = ci;
                  }
                  if (qText && opts.length > 0) {
                    extractedQuestions.push({ lessonIndex: i, question: qText, options: opts, correct_answer: correctIdx });
                  }
                }
              }
            }
          }

          log(`Lesson "${lessonTitle}" (test): ${extractedQuestions.length} questions extracted`);

          // Log raw test data structure for debugging if no questions found
          if (extractedQuestions.length === 0) {
            const keys = Object.keys(lessonData).join(", ");
            log(`Test lesson raw keys: ${keys}`);
            if (lessonData.pagesPublished?.[0]?.content?.blocks) {
              const blockTypes = lessonData.pagesPublished[0].content.blocks.map((b: any) => b.type).join(", ");
              log(`Test page block types: ${blockTypes}`);
            }
          }

          lessonContents.push({
            title: lessonTitle,
            content: JSON.stringify([]),
            order: i,
            type: "test",
            testQuestions: extractedQuestions,
          });
        } else {
          // Non-test lesson: extract content blocks
          let jsonBlocks: any[] = [];

          // EditorJS content in pagesPublished
          const pages = lessonData.pagesPublished || lessonData.pages || [];
          if (Array.isArray(pages) && pages.length > 0) {
            for (const page of pages) {
              if (page.title) {
                jsonBlocks.push({ id: makeId(), type: "heading2", content: cleanHtml(page.title) });
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
                jsonBlocks.push({ id: makeId(), type: "paragraph", content: cleanHtml(block.content) });
              } else if (block.type === "video") {
                lessonType = "video";
                const videoUrl = block.url || block.file?.url || block.src || "";
                jsonBlocks.push({ id: makeId(), type: "paragraph", content: videoUrl ? `<a href="${videoUrl}" target="_blank">🎬 Видео: ${videoUrl}</a>` : "<em>[Видео — URL не найден]</em>" });
              }
            }
          }

          // Fallback: fetch pages separately when inline content is empty
          if (jsonBlocks.length === 0) {
            const pagePaths = [
              `/api/rest/school/lesson/${lesson.uuid}/page/list`,
              `/api/rest/school/lesson/${lesson.uuid}/page`,
              `/api/rest/school/step/${lesson.uuid}/page/list`,
              `/api/rest/school/step/${lesson.id}/page/list`,
              `/api/rest/school/step/${lesson.id}/page`,
            ];
            for (const pagePath of pagePaths) {
              const pageRes = await apiFetch(pagePath);
              if (pageRes.ok && pageRes.data) {
                const pagesArray = Array.isArray(pageRes.data) ? pageRes.data : 
                                   pageRes.data.pages || pageRes.data.list || pageRes.data.items || [pageRes.data];
                for (const page of pagesArray) {
                  if (page.title) {
                    jsonBlocks.push({ id: makeId(), type: "heading2", content: cleanHtml(page.title) });
                  }
                  const blocks = page.content?.blocks || page.blocks || [];
                  if (blocks.length > 0) {
                    jsonBlocks.push(...editorBlocksToJsonBlocks(blocks));
                  }
                }
                if (jsonBlocks.length > 0) {
                  log(`Fallback page fetch success via ${pagePath}: ${jsonBlocks.length} blocks`);
                  break;
                }
              }
            }
          }

          // Log raw data when still empty for debugging
          if (jsonBlocks.length === 0) {
            const rawKeys = Object.keys(lessonData).join(", ");
            log(`Empty lesson "${lessonTitle}" keys: ${rawKeys}`);
            if (lessonData.pagesPublished) {
              log(`pagesPublished: ${JSON.stringify(lessonData.pagesPublished).substring(0, 300)}`);
            }
            if (lessonData.pages) {
              log(`pages: ${JSON.stringify(lessonData.pages).substring(0, 300)}`);
            }
          }

          if (jsonBlocks.length > 0) lessonsWithBlocks++;

          lessonContents.push({
            title: lessonTitle,
            content: JSON.stringify(jsonBlocks.length > 0 ? jsonBlocks : [{ id: makeId(), type: "paragraph", content: "Пустой урок" }]),
            order: i,
            type: lessonType === "test" ? "test" : "text",
          });
        }
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

    // Step 4.5: Download media files and reupload to our storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    let filesTransferred = 0;
    let filesFailed = 0;

    const extFromContentType = (ct: string): string => {
      const map: Record<string, string> = {
        "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
        "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
        "application/pdf": "pdf", "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
      };
      return map[ct.split(";")[0].trim()] || "bin";
    };

    const extFromUrl = (u: string): string => {
      try {
        const pathname = new URL(u).pathname;
        const m = pathname.match(/\.(\w{2,5})$/);
        return m ? m[1].toLowerCase() : "";
      } catch { return ""; }
    };

    const downloadAndReupload = async (fileUrl: string): Promise<string | null> => {
      if (!fileUrl || !fileUrl.startsWith("http")) return null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const headers: Record<string, string> = {
          "Cookie": getCookieHeader(cookieMap),
        };
        if (fileUrl.includes("skillspace.ru")) {
          headers["sec-fetch-dest"] = "empty";
          headers["sec-fetch-mode"] = "cors";
          headers["sec-fetch-site"] = "same-origin";
        }

        const res = await fetch(fileUrl, { headers, signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
          log(`Download failed ${res.status}: ${fileUrl.substring(0, 100)}`);
          return null;
        }

        const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
        // Skip files larger than 50MB to avoid memory issues
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        if (contentLength > MAX_FILE_SIZE) {
          log(`File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB), keeping original URL: ${fileUrl.substring(0, 80)}`);
          return null;
        }

        const ct = res.headers.get("content-type") || "application/octet-stream";
        
        // Skip video files entirely — they are too large for edge function memory
        if (ct.startsWith("video/") || fileUrl.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i)) {
          log(`Skipping video file (memory constraint): ${fileUrl.substring(0, 80)}`);
          // Don't consume the body to free memory
          try { res.body?.cancel(); } catch {}
          return null;
        }

        const arrayBuf = await res.arrayBuffer();
        // Double-check actual size
        if (arrayBuf.byteLength > MAX_FILE_SIZE) {
          log(`File actually ${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)}MB, skipping`);
          return null;
        }

        const blob = new Blob([arrayBuf], { type: ct });
        const ext = extFromUrl(fileUrl) || extFromContentType(ct);
        const storagePath = `${organizationId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadErr } = await supabaseClient.storage
          .from("course-files")
          .upload(storagePath, blob, { contentType: ct, upsert: true });

        if (uploadErr) {
          log(`Upload error: ${uploadErr.message} for ${fileUrl.substring(0, 80)}`);
          return null;
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/course-files/${storagePath}`;
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        log(`Transferred ${sizeMB}MB → course-files/${storagePath}`);
        filesTransferred++;
        return publicUrl;
      } catch (err) {
        log(`Download error: ${String(err).substring(0, 100)} for ${fileUrl.substring(0, 80)}`);
        return null;
      }
    };

    // Process all lesson blocks to download and reupload media (skip in update mode — already done)
    if (isUpdateMode) {
      log(`Step 4.5: Skipping media download in update mode`);
    } else {
    log(`Step 4.5: Downloading media files...`);
    for (let li = 0; li < lessonContents.length; li++) {
      const lesson = lessonContents[li];
      let blocks: any[];
      try { blocks = JSON.parse(lesson.content); } catch { continue; }
      let changed = false;

      for (const block of blocks) {
        if (block.type === "image" && block.imageSrc && block.imageSrc.startsWith("http")) {
          const newUrl = await downloadAndReupload(block.imageSrc);
          if (newUrl) { block.imageSrc = newUrl; changed = true; }
          else filesFailed++;
        }
        if (block.type === "video" && block.videoUrl && block.videoUrl.startsWith("http")) {
          const newUrl = await downloadAndReupload(block.videoUrl);
          if (newUrl) { block.videoUrl = newUrl; changed = true; }
          else filesFailed++;
        }
        if (block.type === "document" && block.documentUrl && block.documentUrl.startsWith("http")) {
          const newUrl = await downloadAndReupload(block.documentUrl);
          if (newUrl) { block.documentUrl = newUrl; changed = true; }
          else filesFailed++;
        }
        // Also handle inline links in paragraph/HTML content pointing to skillspace
        if (block.content && typeof block.content === "string" && block.content.includes("skillspace.ru")) {
          const hrefRegex = /href="(https?:\/\/[^"]*skillspace\.ru[^"]*)"/g;
          let match;
          const replacements: Array<[string, string]> = [];
          while ((match = hrefRegex.exec(block.content)) !== null) {
            const origUrl = match[1];
            if (origUrl.match(/\.(pdf|doc|docx|xlsx|pptx|mp4|mp3|zip|rar)(\?|$)/i)) {
              const newUrl = await downloadAndReupload(origUrl);
              if (newUrl) replacements.push([origUrl, newUrl]);
              else filesFailed++;
            }
          }
          for (const [orig, repl] of replacements) {
            block.content = block.content.replaceAll(orig, repl);
            changed = true;
          }
        }
      }

      if (changed) {
        lessonContents[li].content = JSON.stringify(blocks);
      }

      if ((li + 1) % 10 === 0 || li === lessonContents.length - 1) {
        log(`Media processing: ${li + 1}/${lessonContents.length} lessons`);
      }
    }
    } // end if !isUpdateMode

    log(`Media transfer complete: ${filesTransferred} transferred, ${filesFailed} failed`);

    // Step 5: Save to DB
    let targetCourseId: string;
    let lessonsUpdated = 0;

    if (isUpdateMode) {
      // UPDATE MODE: update existing course lessons
      targetCourseId = existingCourseId;
      log(`Update mode: updating course ${targetCourseId}`);

      // Get existing lessons
      const { data: existingLessons } = await supabaseClient
        .from("lessons")
        .select("id, order_index, title, type")
        .eq("course_id", targetCourseId)
        .order("order_index");

      const existingMap = new Map<number, any>();
      if (existingLessons) {
        for (const el of existingLessons) existingMap.set(el.order_index, el);
      }

      let createdLessons = 0;
      let totalTestQuestions = 0;

      for (const lesson of lessonContents) {
        const existing = existingMap.get(lesson.order);

        if (existing) {
          // Update content (cleaned)
          const { error: updateErr } = await supabaseClient
            .from("lessons")
            .update({ content: lesson.content, title: lesson.title })
            .eq("id", existing.id);

          if (!updateErr) lessonsUpdated++;

          // For test lessons: add questions if none exist
          if (lesson.type === "test" && lesson.testQuestions && lesson.testQuestions.length > 0) {
            const { count } = await supabaseClient
              .from("test_questions")
              .select("id", { count: "exact", head: true })
              .eq("lesson_id", existing.id);

            if ((count || 0) === 0) {
              const questionsToInsert = lesson.testQuestions.map((q, qi) => ({
                lesson_id: existing.id,
                question: q.question,
                options: q.options,
                correct_answer: q.correct_answer,
                order_index: qi,
              }));

              const { error: qError } = await supabaseClient
                .from("test_questions")
                .insert(questionsToInsert);

              if (!qError) {
                totalTestQuestions += questionsToInsert.length;
                await supabaseClient
                  .from("lessons")
                  .update({ type: "test", test_questions_count: questionsToInsert.length, test_passing_score: 60 })
                  .eq("id", existing.id);
                log(`Added ${questionsToInsert.length} questions to existing lesson "${existing.title}"`);
              }
            }
          }
        } else {
          // Create new lesson (not in existing course)
          const { data: newLesson, error: lessonError } = await supabaseClient
            .from("lessons")
            .insert({
              course_id: targetCourseId,
              title: lesson.title,
              content: lesson.content,
              order_index: lesson.order,
              type: lesson.type,
              test_passing_score: lesson.type === "test" ? 60 : 0,
            })
            .select("id")
            .single();

          if (!lessonError) {
            createdLessons++;
            if (lesson.type === "test" && lesson.testQuestions && lesson.testQuestions.length > 0 && newLesson) {
              const questionsToInsert = lesson.testQuestions.map((q, qi) => ({
                lesson_id: newLesson.id,
                question: q.question,
                options: q.options,
                correct_answer: q.correct_answer,
                order_index: qi,
              }));
              const { error: qError } = await supabaseClient.from("test_questions").insert(questionsToInsert);
              if (!qError) totalTestQuestions += questionsToInsert.length;
            }
          }
        }
      }

      log(`Update complete: ${lessonsUpdated} updated, ${createdLessons} created, ${totalTestQuestions} test questions`);

      return new Response(
        JSON.stringify({
          success: true,
          updateMode: true,
          courseId: targetCourseId,
          courseTitle: courseName,
          lessonsTotal: allLessons.length,
          lessonsUpdated,
          lessonsCreated: createdLessons,
          lessonsWithContent: lessonsWithBlocks,
          lessonsAccessDenied,
          filesTransferred,
          filesFailed,
          testQuestionsCreated: totalTestQuestions,
          importMode,
          schoolApiAvailable,
          debug: debugLog,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CREATE MODE (original behavior)
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
    let totalTestQuestions = 0;
    for (const lesson of lessonContents) {
      const { data: newLesson, error: lessonError } = await supabaseClient
        .from("lessons")
        .insert({
          course_id: newCourse.id,
          title: lesson.title,
          content: lesson.content,
          order_index: lesson.order,
          type: lesson.type,
          test_passing_score: lesson.type === "test" ? 60 : 0,
        })
        .select("id")
        .single();

      if (lessonError) {
        log(`Failed to create lesson "${lesson.title}": ${lessonError.message}`);
      } else {
        createdLessons++;
        if (lesson.type === "test" && lesson.testQuestions && lesson.testQuestions.length > 0 && newLesson) {
          const questionsToInsert = lesson.testQuestions.map((q, qi) => ({
            lesson_id: newLesson.id,
            question: q.question,
            options: q.options,
            correct_answer: q.correct_answer,
            order_index: qi,
          }));

          const { error: qError } = await supabaseClient
            .from("test_questions")
            .insert(questionsToInsert);

          if (qError) {
            log(`Failed to insert ${questionsToInsert.length} questions for "${lesson.title}": ${qError.message}`);
          } else {
            totalTestQuestions += questionsToInsert.length;
            await supabaseClient
              .from("lessons")
              .update({ test_questions_count: questionsToInsert.length })
              .eq("id", newLesson.id);
            log(`Inserted ${questionsToInsert.length} test questions for "${lesson.title}"`);
          }
        }
      }
    }

    log(`Created ${createdLessons}/${lessonContents.length} lessons, ${totalTestQuestions} test questions`);

    return new Response(
      JSON.stringify({
        success: true,
        courseId: newCourse.id,
        courseTitle: courseName,
        lessonsTotal: allLessons.length,
        lessonsCreated: createdLessons,
        lessonsWithContent: lessonsWithBlocks,
        lessonsAccessDenied,
        filesTransferred,
        filesFailed,
        testQuestionsCreated: totalTestQuestions,
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
