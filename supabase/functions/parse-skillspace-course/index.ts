import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mergeCookiesFromResponse, getCookieHeader, getAuthToken, createApiFetch } from "../_shared/skillspace-auth.ts";
import { extractLessonsFromStepList, extractLessonsFromFlows, parseLessonContent, getLessonFetchPaths, fetchFallbackPages, makeId, type LessonInfo, type ParsedLesson } from "../_shared/skillspace-lessons.ts";
import { createMediaTransfer } from "../_shared/skillspace-media.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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
    const log = (msg: string) => { console.log(msg); debugLog.push(msg); };

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
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Origin": baseUrl,
        "Referer": `${baseUrl}/signin`,
      },
    });

    mergeCookiesFromResponse(authRes, cookieMap);
    log(`Auth response: ${authRes.status}, cookies: ${cookieMap.size > 0 ? "yes" : "none"}`);

    if (authRes.status >= 300 && authRes.status < 400) {
      const location = authRes.headers.get("location");
      if (location) {
        const redirectUrl = location.startsWith("http") ? location : `${baseUrl}${location}`;
        log(`Following redirect to: ${redirectUrl}`);
        const redirectRes = await fetch(redirectUrl, { headers: { Cookie: getCookieHeader(cookieMap) }, redirect: "manual" });
        mergeCookiesFromResponse(redirectRes, cookieMap);
        log(`Redirect response: ${redirectRes.status}`);

        if (redirectRes.status >= 300 && redirectRes.status < 400) {
          const loc2 = redirectRes.headers.get("location");
          if (loc2) {
            const rUrl2 = loc2.startsWith("http") ? loc2 : `${baseUrl}${loc2}`;
            const rRes2 = await fetch(rUrl2, { headers: { Cookie: getCookieHeader(cookieMap) }, redirect: "manual" });
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

    // CSRF probe
    try {
      const adminPageRes = await fetch(`${baseUrl}/school/constructor/course/${courseId}`, {
        headers: { Cookie: getCookieHeader(cookieMap) }, redirect: "manual",
      });
      mergeCookiesFromResponse(adminPageRes, cookieMap);
      log(`Admin page probe: ${adminPageRes.status}`);
    } catch (e) { log(`Admin page probe failed: ${e}`); }

    const apiFetch = createApiFetch(baseUrl, cookieMap, log);

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
    let allLessons: LessonInfo[] = [];
    let schoolApiAvailable = false;

    const stepListRes = await apiFetch(`/api/rest/school/course/${courseId}/step/list`);
    if (stepListRes.ok && Array.isArray(stepListRes.data)) {
      schoolApiAvailable = true;
      allLessons = extractLessonsFromStepList(stepListRes.data, log);
    }

    if (allLessons.length === 0 && !schoolApiAvailable) {
      log("School API unavailable (401). Trying student flow extraction as fallback...");
      importMode = "student";
      const studentCourseRes = await apiFetch(`/api/rest/student/course/${courseId}`);
      if (studentCourseRes.ok && studentCourseRes.data) {
        allLessons = extractLessonsFromFlows(studentCourseRes.data, log);
      }
    }

    if (allLessons.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Не удалось найти уроки. School API вернул 401 — возможно, аккаунт не является владельцем/администратором школы.",
          importMode, schoolApiAvailable, debug: debugLog,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Fetch each lesson's content
    const lessonContents: ParsedLesson[] = [];
    let lessonsAccessDenied = 0;
    let lessonsWithBlocks = 0;

    for (let i = 0; i < allLessons.length; i++) {
      const lesson = allLessons[i];
      let lessonData: any = null;
      const lessonPaths = getLessonFetchPaths(lesson);

      let bestLessonData: any = null;
      let bestRawSize = 0;

      for (const path of lessonPaths) {
        const res = await apiFetch(path);
        if (res.ok && res.data) {
          const candidate = res.data.lesson || res.data.step || res.data;
          const rawSize = res.raw ? res.raw.length : JSON.stringify(candidate).length;

          if (!bestLessonData) { bestLessonData = candidate; bestRawSize = rawSize; }
          if (rawSize > bestRawSize + 200) {
            bestLessonData = candidate; bestRawSize = rawSize;
            log(`Better response from ${path}: ${rawSize}b vs ${bestRawSize}b`);
          }
          if (rawSize > 600) { lessonData = candidate; break; }
        }
      }

      if (!lessonData && bestLessonData) {
        lessonData = bestLessonData;
        if (bestRawSize <= 600) {
          log(`⚠ Small response (${bestRawSize}b) for lesson "${lesson.title}" (uuid=${lesson.uuid}, id=${lesson.id}). Keys: ${Object.keys(lessonData).join(", ")}`);
          log(`  Data snippet: ${JSON.stringify(lessonData).substring(0, 500)}`);
        }
      }

      if (lessonData) {
        const parsed = parseLessonContent(lessonData, lesson, i, log);

        // Fallback page fetch for empty non-test lessons
        if (parsed.type !== "test") {
          const blocks = JSON.parse(parsed.content);
          if (blocks.length === 0 || (blocks.length === 1 && blocks[0].content === "Пустой урок")) {
            const fallbackBlocks = await fetchFallbackPages(lesson, apiFetch, log);
            if (fallbackBlocks.length > 0) {
              parsed.content = JSON.stringify(fallbackBlocks);
            }
          }
        }

        const blocks = JSON.parse(parsed.content);
        if (blocks.length > 0 && !(blocks.length === 1 && blocks[0].content === "Пустой урок")) {
          lessonsWithBlocks++;
        }

        lessonContents.push(parsed);
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

    // Step 4.5: Media transfer
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const mediaTransfer = createMediaTransfer(supabaseClient, supabaseUrl, organizationId, cookieMap, log);

    if (isUpdateMode) {
      log(`Step 4.5: Skipping media download in update mode`);
    } else {
      await mediaTransfer.processLessonMedia(lessonContents);
    }

    const { filesTransferred, filesFailed } = mediaTransfer.getStats();
    log(`Media transfer complete: ${filesTransferred} transferred, ${filesFailed} failed`);

    // Step 5: Save to DB
    if (isUpdateMode) {
      return await saveUpdateMode(supabaseClient, existingCourseId, lessonContents, {
        courseName, allLessons, lessonsWithBlocks, lessonsAccessDenied,
        filesTransferred, filesFailed, importMode, schoolApiAvailable, debugLog, log,
      });
    }

    return await saveCreateMode(supabaseClient, organizationId, lessonContents, {
      courseName, courseDescription, allLessons, lessonsWithBlocks, lessonsAccessDenied,
      filesTransferred, filesFailed, importMode, schoolApiAvailable, debugLog, log,
    });
  } catch (error) {
    console.error("Parse error:", error);
    return new Response(
      JSON.stringify({ error: "Ошибка парсинга: " + (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- DB save helpers ---

async function saveUpdateMode(
  supabaseClient: any,
  targetCourseId: string,
  lessonContents: ParsedLesson[],
  ctx: any,
): Promise<Response> {
  ctx.log(`Update mode: updating course ${targetCourseId}`);

  const { data: existingLessons } = await supabaseClient
    .from("lessons")
    .select("id, order_index, title, type")
    .eq("course_id", targetCourseId)
    .order("order_index");

  const existingMap = new Map<number, any>();
  if (existingLessons) {
    for (const el of existingLessons) existingMap.set(el.order_index, el);
  }

  let lessonsUpdated = 0;
  let createdLessons = 0;
  let totalTestQuestions = 0;

  for (const lesson of lessonContents) {
    const existing = existingMap.get(lesson.order);

    if (existing) {
      const { error: updateErr } = await supabaseClient
        .from("lessons")
        .update({ content: lesson.content, title: lesson.title })
        .eq("id", existing.id);
      if (!updateErr) lessonsUpdated++;

      if (lesson.type === "test" && lesson.testQuestions && lesson.testQuestions.length > 0) {
        const { count } = await supabaseClient
          .from("test_questions")
          .select("id", { count: "exact", head: true })
          .eq("lesson_id", existing.id);

        if ((count || 0) === 0) {
          const questionsToInsert = lesson.testQuestions.map((q, qi) => ({
            lesson_id: existing.id, question: q.question, options: q.options, correct_answer: q.correct_answer, order_index: qi,
          }));
          const { error: qError } = await supabaseClient.from("test_questions").insert(questionsToInsert);
          if (!qError) {
            totalTestQuestions += questionsToInsert.length;
            await supabaseClient.from("lessons").update({ type: "test", test_questions_count: questionsToInsert.length, test_passing_score: 60 }).eq("id", existing.id);
            ctx.log(`Added ${questionsToInsert.length} questions to existing lesson "${existing.title}"`);
          }
        }
      }
    } else {
      const { data: newLesson, error: lessonError } = await supabaseClient
        .from("lessons")
        .insert({ course_id: targetCourseId, title: lesson.title, content: lesson.content, order_index: lesson.order, type: lesson.type, test_passing_score: lesson.type === "test" ? 60 : 0 })
        .select("id").single();

      if (!lessonError) {
        createdLessons++;
        if (lesson.type === "test" && lesson.testQuestions && lesson.testQuestions.length > 0 && newLesson) {
          const questionsToInsert = lesson.testQuestions.map((q, qi) => ({
            lesson_id: newLesson.id, question: q.question, options: q.options, correct_answer: q.correct_answer, order_index: qi,
          }));
          const { error: qError } = await supabaseClient.from("test_questions").insert(questionsToInsert);
          if (!qError) totalTestQuestions += questionsToInsert.length;
        }
      }
    }
  }

  ctx.log(`Update complete: ${lessonsUpdated} updated, ${createdLessons} created, ${totalTestQuestions} test questions`);

  return new Response(
    JSON.stringify({
      success: true, updateMode: true, courseId: targetCourseId, courseTitle: ctx.courseName,
      lessonsTotal: ctx.allLessons.length, lessonsUpdated, lessonsCreated: createdLessons,
      lessonsWithContent: ctx.lessonsWithBlocks, lessonsAccessDenied: ctx.lessonsAccessDenied,
      filesTransferred: ctx.filesTransferred, filesFailed: ctx.filesFailed,
      testQuestionsCreated: totalTestQuestions, importMode: ctx.importMode, schoolApiAvailable: ctx.schoolApiAvailable,
      debug: ctx.debugLog,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function saveCreateMode(
  supabaseClient: any,
  organizationId: string,
  lessonContents: ParsedLesson[],
  ctx: any,
): Promise<Response> {
  const { data: newCourse, error: courseError } = await supabaseClient
    .from("courses")
    .insert({ title: ctx.courseName, description: ctx.courseDescription, organization_id: organizationId, is_published: false })
    .select("id").single();

  if (courseError || !newCourse) {
    ctx.log(`Failed to create course: ${JSON.stringify(courseError)}`);
    return new Response(
      JSON.stringify({ error: "Не удалось создать курс: " + courseError?.message, debug: ctx.debugLog }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  ctx.log(`Created course ${newCourse.id}`);

  let createdLessons = 0;
  let totalTestQuestions = 0;
  for (const lesson of lessonContents) {
    const { data: newLesson, error: lessonError } = await supabaseClient
      .from("lessons")
      .insert({ course_id: newCourse.id, title: lesson.title, content: lesson.content, order_index: lesson.order, type: lesson.type, test_passing_score: lesson.type === "test" ? 60 : 0 })
      .select("id").single();

    if (lessonError) {
      ctx.log(`Failed to create lesson "${lesson.title}": ${lessonError.message}`);
    } else {
      createdLessons++;
      if (lesson.type === "test" && lesson.testQuestions && lesson.testQuestions.length > 0 && newLesson) {
        const questionsToInsert = lesson.testQuestions.map((q, qi) => ({
          lesson_id: newLesson.id, question: q.question, options: q.options, correct_answer: q.correct_answer, order_index: qi,
        }));
        const { error: qError } = await supabaseClient.from("test_questions").insert(questionsToInsert);
        if (qError) {
          ctx.log(`Failed to insert ${questionsToInsert.length} questions for "${lesson.title}": ${qError.message}`);
        } else {
          totalTestQuestions += questionsToInsert.length;
          await supabaseClient.from("lessons").update({ test_questions_count: questionsToInsert.length }).eq("id", newLesson.id);
          ctx.log(`Inserted ${questionsToInsert.length} test questions for "${lesson.title}"`);
        }
      }
    }
  }

  ctx.log(`Created ${createdLessons}/${lessonContents.length} lessons, ${totalTestQuestions} test questions`);

  return new Response(
    JSON.stringify({
      success: true, courseId: newCourse.id, courseTitle: ctx.courseName,
      lessonsTotal: ctx.allLessons.length, lessonsCreated: createdLessons,
      lessonsWithContent: ctx.lessonsWithBlocks, lessonsAccessDenied: ctx.lessonsAccessDenied,
      filesTransferred: ctx.filesTransferred, filesFailed: ctx.filesFailed,
      testQuestionsCreated: totalTestQuestions, importMode: ctx.importMode, schoolApiAvailable: ctx.schoolApiAvailable,
      debug: ctx.debugLog,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
