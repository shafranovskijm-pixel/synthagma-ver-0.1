// SkillSpace lesson extraction and content parsing

import { cleanHtml, editorBlocksToJsonBlocks, makeId } from "./editorjs-converter.ts";
import type { ApiFetchResult } from "./skillspace-auth.ts";

// --- Types ---
export interface LessonInfo {
  id: string | number;
  uuid: string;
  title: string;
  order: number;
  type: string;
  groupName: string;
}

export interface TestQuestion {
  lessonIndex: number;
  question: string;
  options: { text: string }[];
  correct_answer: number | null;
}

export interface ParsedLesson {
  title: string;
  content: string;
  order: number;
  type: string;
  testQuestions?: TestQuestion[];
}

// --- Strategy A: School API step/list ---
export function extractLessonsFromStepList(
  data: any[],
  log: (msg: string) => void,
): LessonInfo[] {
  const lessons: LessonInfo[] = [];
  let idx = 0;
  for (const group of data) {
    const groupName = group.name || group.title || "Модуль";
    const items = group.lessons || group.steps || [];
    for (const l of items) {
      lessons.push({
        id: l.id,
        uuid: l.uuid || String(l.id),
        title: l.name || l.title || `Урок ${idx + 1}`,
        order: idx++,
        type: l.type === "test" ? "test" : "default",
        groupName,
      });
    }
  }
  log(`Strategy A (school/step/list): ${lessons.length} lessons in ${data.length} groups`);
  return lessons;
}

// --- Strategy B: Student flow extraction ---
export function extractLessonsFromFlows(
  data: any,
  log: (msg: string) => void,
): LessonInfo[] {
  const lessonIds = new Set<number>();

  const flows = data.course?.flows || data.flows;
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
  extractIds(data, "courseData");

  if (lessonIds.size === 0) return [];

  const sorted = Array.from(lessonIds).sort((a, b) => a - b);
  const lessons = sorted.map((id, i) => ({
    id,
    uuid: String(id),
    title: `Урок ${i + 1}`,
    order: i,
    type: "default",
    groupName: "Извлечённые уроки",
  }));
  log(`Strategy B (flow extraction): ${lessons.length} lesson IDs`);
  return lessons;
}

// --- Test question extraction (3 strategies) ---
export function extractTestQuestions(
  lessonData: any,
  lessonIndex: number,
  log: (msg: string) => void,
): TestQuestion[] {
  const questions: TestQuestion[] = [];

  // Strategy 1: pagesPublished blocks
  const pagesPublished = Array.isArray(lessonData.pagesPublished) && lessonData.pagesPublished.length > 0 ? lessonData.pagesPublished : null;
  const pages = pagesPublished || lessonData.pages || [];
  if (Array.isArray(pages)) {
    for (const page of pages) {
      const blocks = page.content?.blocks || page.blocks || [];
      for (const block of blocks) {
        if (block.type === "quiz" || block.type === "test" || block.type === "question") {
          const items = block.data?.questions || block.data?.items || [];
          for (const q of items) {
            const parsed = parseQuestion(q, lessonIndex);
            if (parsed) questions.push(parsed);
          }
        }
      }
    }
  }

  // Strategy 2: direct questions field
  if (questions.length === 0) {
    const directQuestions = lessonData.questions || lessonData.test?.questions || lessonData.quiz?.questions || [];
    if (Array.isArray(directQuestions)) {
      for (const q of directQuestions) {
        const parsed = parseQuestion(q, lessonIndex);
        if (parsed) questions.push(parsed);
      }
    }
  }

  // Strategy 3: legacy blocks with type "test"
  if (questions.length === 0 && Array.isArray(lessonData.blocks)) {
    for (const block of lessonData.blocks) {
      if (block.type === "test" || block.type === "quiz") {
        const items = block.questions || block.data?.questions || [];
        for (const q of items) {
          const parsed = parseQuestion(q, lessonIndex);
          if (parsed) questions.push(parsed);
        }
      }
    }
  }

  if (questions.length === 0) {
    const keys = Object.keys(lessonData).join(", ");
    log(`Test lesson raw keys: ${keys}`);
    if (lessonData.pagesPublished?.[0]?.content?.blocks) {
      const blockTypes = lessonData.pagesPublished[0].content.blocks.map((b: any) => b.type).join(", ");
      log(`Test page block types: ${blockTypes}`);
    }
  }

  return questions;
}

function parseQuestion(q: any, lessonIndex: number): TestQuestion | null {
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
    return { lessonIndex, question: qText, options: opts, correct_answer: correctIdx };
  }
  return null;
}

// --- Lesson content parsing ---
export function parseLessonContent(
  lessonData: any,
  lesson: LessonInfo,
  index: number,
  log: (msg: string) => void,
): ParsedLesson {
  const lessonTitle = lessonData.name || lessonData.title || lesson.title;
  let lessonType = lesson.type;

  if (lessonType === "test" || lesson.type === "test") {
    const extractedQuestions = extractTestQuestions(lessonData, index, log);
    log(`Lesson "${lessonTitle}" (test): ${extractedQuestions.length} questions extracted`);
    return {
      title: lessonTitle,
      content: JSON.stringify([]),
      order: index,
      type: "test",
      testQuestions: extractedQuestions,
    };
  }

  // Non-test lesson: extract content blocks
  let jsonBlocks: any[] = [];

  // EditorJS content in pagesPublished
  const pagesPublished = Array.isArray(lessonData.pagesPublished) && lessonData.pagesPublished.length > 0 ? lessonData.pagesPublished : null;
  const pages = pagesPublished || lessonData.pages || [];
  if (Array.isArray(pages) && pages.length > 0) {
    for (const page of pages) {
      if (page.title) {
        jsonBlocks.push({ id: makeId(), type: "heading2", content: cleanHtml(page.title) });
      }
      const blocks = page.content?.blocks || page.blocks || [];
      if (blocks.length > 0) {
        jsonBlocks.push(...editorBlocksToJsonBlocks(blocks));
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

  return {
    title: lessonTitle,
    content: JSON.stringify(jsonBlocks.length > 0 ? jsonBlocks : [{ id: makeId(), type: "paragraph", content: "Пустой урок" }]),
    order: index,
    type: lessonType === "test" ? "test" : "text",
  };
}

// --- Build lesson fetch paths ---
export function getLessonFetchPaths(lesson: LessonInfo): string[] {
  const paths = [
    `/api/rest/school/lesson/${lesson.uuid}?version=published`,
    `/api/rest/school/lesson/${lesson.uuid}`,
  ];
  if (String(lesson.id) !== lesson.uuid) {
    paths.push(`/api/rest/school/lesson/${lesson.id}?version=published`);
    paths.push(`/api/rest/school/lesson/${lesson.id}`);
  }
  paths.push(`/api/rest/school/step/${lesson.uuid}?version=published`);
  paths.push(`/api/rest/school/step/${lesson.uuid}`);
  if (String(lesson.id) !== lesson.uuid) {
    paths.push(`/api/rest/school/step/${lesson.id}?version=published`);
    paths.push(`/api/rest/school/step/${lesson.id}`);
  }
  paths.push(`/api/rest/student/lesson/${lesson.uuid}`);
  paths.push(`/api/rest/student/step/${lesson.uuid}`);
  if (String(lesson.id) !== lesson.uuid) {
    paths.push(`/api/rest/student/lesson/${lesson.id}`);
    paths.push(`/api/rest/student/step/${lesson.id}`);
  }
  return paths;
}

// --- Fallback page fetch paths ---
export function getPageFetchPaths(lesson: LessonInfo): string[] {
  return [
    `/api/rest/school/lesson/${lesson.uuid}/page/list`,
    `/api/rest/school/lesson/${lesson.uuid}/page`,
    `/api/rest/school/step/${lesson.uuid}/page/list`,
    `/api/rest/school/step/${lesson.id}/page/list`,
    `/api/rest/school/step/${lesson.id}/page`,
  ];
}

// --- Fetch lesson content from fallback pages ---
export async function fetchFallbackPages(
  lesson: LessonInfo,
  apiFetch: (path: string) => Promise<ApiFetchResult>,
  log: (msg: string) => void,
): Promise<any[]> {
  const jsonBlocks: any[] = [];
  for (const pagePath of getPageFetchPaths(lesson)) {
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
  return jsonBlocks;
}
