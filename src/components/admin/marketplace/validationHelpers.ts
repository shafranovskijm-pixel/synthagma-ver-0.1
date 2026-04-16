import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";

export interface ValidationRulesConfig {
  minLessons: number;
  minContentLength: number;
  requireText: boolean;
  requireTest: boolean;
  checkDuplicateTitles: boolean;
}

export interface AiPromptsConfig {
  content?: string;
  questions?: string;
  answers?: string;
}

export function checkCriticalError(error: any): boolean {
  const msg = String(error?.message || error || "");
  return msg.includes("402") || msg.includes("429") || msg.includes("Insufficient") || msg.includes("rate limit") || msg.includes("MODERATION");
}

export async function validateCourseIssues(courseId: string, valRules: ValidationRulesConfig): Promise<string[]> {
  const { data: lessons } = await supabase
    .from("lessons").select("id, title, type, content").eq("course_id", courseId);
  const issues: string[] = [];

  if (!lessons?.length) {
    issues.push("Нет уроков");
    return issues;
  }

  const textLessons = lessons.filter(l => l.type === "text" || l.type === "practice");
  const testLessons = lessons.filter(l => l.type === "test");
  if (valRules.requireText && textLessons.length === 0) issues.push("Нет учебных уроков (текст/практика)");
  if (valRules.requireTest && testLessons.length === 0) issues.push("Нет тестов");
  if (lessons.length < valRules.minLessons) issues.push(`Слишком мало уроков (${lessons.length}, нужно минимум ${valRules.minLessons})`);
  
  const emptyLessons = textLessons.filter(l => !l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength);
  if (emptyLessons.length) issues.push(`${emptyLessons.length} уроков без контента`);
  
  const filledLessons = textLessons.filter(l => l.content && l.content !== "[]" && l.content !== "" && l.content.length >= valRules.minContentLength);
  if (textLessons.length > 0 && filledLessons.length === 0) issues.push("Ни один урок не содержит учебного материала");
  
  if (filledLessons.length > 0) {
    let hasAnyImage = false;
    for (const l of filledLessons) {
      try {
        const blocks = JSON.parse(l.content!);
        if (Array.isArray(blocks) && blocks.some((b: any) => b.type === "image" || b.type === "slider")) { hasAnyImage = true; break; }
      } catch {}
    }
    if (!hasAnyImage) issues.push("Нет изображений в уроках");
  }
  
  if (valRules.checkDuplicateTitles) {
    const titles = lessons.map(l => l.title);
    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
    if (dupes.length) issues.push(`Дубликаты: ${[...new Set(dupes)].join(", ")}`);
  }
  
  const testIds = testLessons.map(l => l.id);
  if (testIds.length) {
    const { data: questions } = await supabase
      .from("test_questions").select("id, lesson_id, correct_answer").in("lesson_id", testIds);
    const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
    const unansweredQuestions = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined) || [];
    if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
    if (unansweredQuestions.length) issues.push(`${unansweredQuestions.length} вопросов без ответа`);
  }

  return issues;
}

export async function validateCourseIssuesSimple(courseId: string, valRules: ValidationRulesConfig): Promise<string[]> {
  const { data: lessons } = await supabase
    .from("lessons").select("id, title, type, content").eq("course_id", courseId);
  const issues: string[] = [];

  if (!lessons?.length) {
    issues.push("Нет уроков");
    return issues;
  }

  const textLessons = lessons.filter(l => l.type === "text" || l.type === "practice");
  const testLessons = lessons.filter(l => l.type === "test");
  if (valRules.requireText && textLessons.length === 0) issues.push("Нет учебных уроков");
  if (valRules.requireTest && testLessons.length === 0) issues.push("Нет тестов");
  if (lessons.length < valRules.minLessons) issues.push("Мало уроков");
  
  const emptyLessons = textLessons.filter(l => !l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength);
  if (emptyLessons.length) issues.push(`${emptyLessons.length} без контента`);
  
  if (valRules.checkDuplicateTitles) {
    const titles = lessons.map(l => l.title);
    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
    if (dupes.length) issues.push("Дубликаты");
  }
  
  const testIds = testLessons.map(l => l.id);
  if (testIds.length) {
    const { data: questions } = await supabase
      .from("test_questions").select("id, lesson_id, correct_answer").in("lesson_id", testIds);
    const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
    const unanswered = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined) || [];
    if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
    if (unanswered.length) issues.push(`${unanswered.length} без ответа`);
  }

  return issues;
}

export async function generateContentForLesson(
  lesson: { id: string; title: string; type: string },
  courseId: string, courseTitle: string, streamIndex: number,
  aiProvider: string, gigachatModel?: string, customPrompt?: string, programType?: string,
) {
  const startMs = Date.now();
  const { data, error } = await safeInvoke<any>("gigachat", {
    body: {
      action: "generate_content", courseTitle, lessonTitle: lesson.title, lessonType: lesson.type,
      existingContent: null, ai_provider: aiProvider, stream_index: streamIndex,
      ...(programType ? { programType } : {}),
      ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
      ...(customPrompt ? { customSystemPrompt: customPrompt } : {}),
    },
  });
  if (error) throw error;
  let itemsCount = 0;
  if (data?.content) {
    const blocks = markdownToBlocks(data.content);
    itemsCount = blocks.length;
    const jsonContent = blocks.length > 0 ? blocksToJson(blocks) : data.content;
    await supabase.from("lessons").update({ content: jsonContent }).eq("id", lesson.id);
  }
  await supabase.from("generation_history").insert({
    course_id: courseId, course_title: courseTitle, action: "content",
    details: `Auto-fix: "${lesson.title}"`, items_count: itemsCount,
    stream_index: streamIndex, duration_ms: Date.now() - startMs,
  });
}

export async function generateQuestionsForTest(
  test: { id: string; title: string },
  courseId: string, courseTitle: string, streamIndex: number,
  aiProvider: string, gigachatModel?: string, customPrompt?: string, programType?: string,
) {
  const startMs = Date.now();
  const { data, error } = await safeInvoke<any>("gigachat", {
    body: {
      action: "generate_questions", courseTitle, lessonTitle: test.title,
      ai_provider: aiProvider, stream_index: streamIndex,
      ...(programType ? { programType } : {}),
      ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
      ...(customPrompt ? { customSystemPrompt: customPrompt } : {}),
    },
  });
  if (error) throw error;
  let itemsCount = 0;
  if (data?.questions && !data.parseError && data.questions.length > 0) {
    itemsCount = data.questions.length;
    const toInsert = data.questions.map((q: any, idx: number) => ({
      lesson_id: test.id, question: q.question, options: q.options,
      correct_answer: q.correctAnswer ?? null, explanation: q.explanation || null, order_index: idx,
    }));
    await supabase.from("test_questions").insert(toInsert);
  }
  await supabase.from("generation_history").insert({
    course_id: courseId, course_title: courseTitle, action: "questions",
    details: `Auto-fix: "${test.title}"`, items_count: itemsCount,
    stream_index: streamIndex, duration_ms: Date.now() - startMs,
  });
}
