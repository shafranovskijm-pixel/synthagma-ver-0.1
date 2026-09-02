import { blocksToJson, htmlToBlocks } from "@/components/course-builder/block-editor";
import type { LessonType, TestQuestionLocal } from "@/components/course-builder/LessonTypeConfig";
import { sanitizeCourseHtml } from "@/lib/security/courseHtml";
import {
  extractCorrectAnswersFromScript,
  extractFinalTestQuestions,
  extractQuestionsFromForm,
} from "@/utils/htmlCourseParser";

export type StructuredCourseDocumentKind = "official" | "manufacturer";

export interface StructuredCourseModuleInput {
  key: string;
  title: string;
  order_index: number;
}

export interface StructuredCourseQuestionInput {
  question: string;
  options: { text: string }[];
  correct_answer: number;
  order_index: number;
  explanation: string | null;
}

export interface StructuredCourseLessonInput {
  key: string;
  module_key: string;
  title: string;
  type: Extract<LessonType, "text" | "homework" | "test">;
  content: string;
  order_index: number;
  test_passing_score: number;
  metadata: Record<string, unknown>;
  questions: StructuredCourseQuestionInput[];
}

export interface StructuredCourseDocumentInput {
  name: string;
  type: "link";
  description: string;
  file_url: string;
  source_kind: StructuredCourseDocumentKind;
  source_module_number: number | null;
}

export interface StructuredCourseDraftPayload {
  schema_version: 1;
  source_kind: "csz-178h-html";
  title: string;
  description: string;
  modules: StructuredCourseModuleInput[];
  lessons: StructuredCourseLessonInput[];
  documents: StructuredCourseDocumentInput[];
}

export class StructuredCourseValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Структурированный импорт отклонён: ${issues.join("; ")}`);
    this.name = "StructuredCourseValidationError";
    this.issues = issues;
  }
}

const MODULE_COUNT = 11;
const LESSON_COUNT = 46;
const QUESTION_COUNT = 67;
const RESOURCE_ARTICLES: Record<string, StructuredCourseDocumentKind> = {
  materials: "official",
  "manufacturer-materials": "manufacturer",
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function requireArticle(doc: Document, id: string): HTMLElement {
  const article = doc.getElementById(id);
  if (!article || article.tagName !== "ARTICLE") {
    throw new StructuredCourseValidationError([`не найден article#${id}`]);
  }
  return article;
}

function articleContent(article: HTMLElement): string {
  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(
    ".aura, form, script, button, [id^='result'], label:has(input[type='checkbox'][data-done])",
  ).forEach((element) => element.remove());

  const safeHtml = sanitizeCourseHtml(clone.innerHTML);
  return blocksToJson(htmlToBlocks(safeHtml));
}

function toQuestions(questions: TestQuestionLocal[]): StructuredCourseQuestionInput[] {
  return questions.map((question, index) => ({
    question: normalizeText(question.question),
    options: question.options.map((option) => ({ text: normalizeText(option.text) })),
    correct_answer: question.correct_answer,
    order_index: index,
    explanation: normalizeText(question.explanation) || null,
  }));
}

function extractResourceDocuments(doc: Document): StructuredCourseDocumentInput[] {
  const documents: StructuredCourseDocumentInput[] = [];

  for (const [articleId, sourceKind] of Object.entries(RESOURCE_ARTICLES)) {
    const article = requireArticle(doc, articleId);
    article.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
      const href = anchor.href.trim();
      const containerText = normalizeText(anchor.closest("li")?.textContent || anchor.parentElement?.textContent);
      const moduleMatch = containerText.match(/Модуль\s+(\d+)/i);
      documents.push({
        name: normalizeText(anchor.textContent) || href,
        type: "link",
        description: containerText,
        file_url: href,
        source_kind: sourceKind,
        source_module_number: moduleMatch ? Number(moduleMatch[1]) : null,
      });
    });
  }

  return documents;
}

export function isCszStructuredCourseHtml(html: string): boolean {
  if (!/<article\s+id=["']module-1-theory["']/i.test(html)) return false;
  return /<article\s+id=["']final-test["']/i.test(html)
    && /<article\s+id=["']materials["']/i.test(html);
}

/**
 * Converts the prepared CSZ 178-hour HTML into the only payload accepted by
 * import_csz_course_draft_v1. Nothing is persisted here. The database RPC
 * performs a second validation and inserts the whole graph in one transaction.
 */
export function parseCszStructuredCourseHtml(html: string): StructuredCourseDraftPayload {
  if (!isCszStructuredCourseHtml(html)) {
    throw new StructuredCourseValidationError(["файл не соответствует формату курса ЦСЗ"]);
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const h1 = doc.querySelector("h1");
  const title = normalizeText(h1?.textContent || doc.querySelector("title")?.textContent);
  const description = normalizeText(h1?.parentElement?.querySelector("p")?.textContent);
  const modules: StructuredCourseModuleInput[] = [];
  const lessons: StructuredCourseLessonInput[] = [];
  let lessonOrder = 0;

  for (let moduleNumber = 1; moduleNumber <= MODULE_COUNT; moduleNumber += 1) {
    const moduleKey = `module-${moduleNumber}`;
    const theory = requireArticle(doc, `${moduleKey}-theory`);
    const practice = requireArticle(doc, `${moduleKey}-practice`);
    const selfStudy = requireArticle(doc, `${moduleKey}-self`);
    const moduleTitle = normalizeText(theory.querySelector("h2")?.textContent);
    if (!moduleTitle) {
      throw new StructuredCourseValidationError([`у ${moduleKey} отсутствует заголовок`]);
    }

    modules.push({ key: moduleKey, title: moduleTitle, order_index: moduleNumber - 1 });

    const baseMetadata = { module_number: moduleNumber, final_assessment: false };
    lessons.push({
      key: `${moduleKey}-theory`,
      module_key: moduleKey,
      title: moduleTitle,
      type: "text",
      content: articleContent(theory),
      order_index: lessonOrder++,
      test_passing_score: 60,
      metadata: { ...baseMetadata, source_article_id: `${moduleKey}-theory` },
      questions: [],
    });
    lessons.push({
      key: `${moduleKey}-practice`,
      module_key: moduleKey,
      title: normalizeText(practice.querySelector("h2")?.textContent) || `Практическая работа ${moduleNumber}`,
      type: "homework",
      content: articleContent(practice),
      order_index: lessonOrder++,
      test_passing_score: 60,
      metadata: { ...baseMetadata, source_article_id: `${moduleKey}-practice` },
      questions: [],
    });
    lessons.push({
      key: `${moduleKey}-self`,
      module_key: moduleKey,
      title: normalizeText(selfStudy.querySelector("h2")?.textContent) || `Самостоятельная работа ${moduleNumber}`,
      type: "text",
      content: articleContent(selfStudy),
      order_index: lessonOrder++,
      test_passing_score: 60,
      metadata: { ...baseMetadata, source_article_id: `${moduleKey}-self` },
      questions: [],
    });

    const forms = theory.querySelectorAll("form[id]");
    const moduleQuestions: TestQuestionLocal[] = [];
    forms.forEach((form) => moduleQuestions.push(...extractQuestionsFromForm(form, doc)));
    lessons.push({
      key: `${moduleKey}-test`,
      module_key: moduleKey,
      title: `Тест: ${moduleTitle}`,
      type: "test",
      content: "",
      order_index: lessonOrder++,
      test_passing_score: 60,
      metadata: { ...baseMetadata, source_article_id: `${moduleKey}-theory` },
      questions: toQuestions(moduleQuestions),
    });
  }

  // The programme has 11 modules. Its two final-assessment lessons are a
  // distinct block inside module 11, never a synthetic twelfth module.
  const finalPractice = requireArticle(doc, "final-practice");
  lessons.push({
    key: "final-practice",
    module_key: "module-11",
    title: normalizeText(finalPractice.querySelector("h2")?.textContent) || "Итоговая практическая ситуационная задача",
    type: "homework",
    content: articleContent(finalPractice),
    order_index: lessonOrder++,
    test_passing_score: 60,
    metadata: {
      module_number: 11,
      final_assessment: true,
      assessment_block: "final_assessment",
      source_article_id: "final-practice",
    },
    questions: [],
  });

  const finalTest = requireArticle(doc, "final-test");
  const finalForm = finalTest.querySelector("form#finalQuiz");
  if (!finalForm) throw new StructuredCourseValidationError(["не найден form#finalQuiz"]);
  const finalQuestions = extractFinalTestQuestions(finalForm, extractCorrectAnswersFromScript(doc));
  const scoreMatch = (finalTest.textContent || "").match(/(\d+)\s*\/\s*(\d+)/);
  const finalPassingScore = scoreMatch
    ? Math.round((Number(scoreMatch[1]) / Number(scoreMatch[2])) * 100)
    : 60;
  lessons.push({
    key: "final-test",
    module_key: "module-11",
    title: normalizeText(finalTest.querySelector("h2")?.textContent) || "Финальный тест по курсу",
    type: "test",
    content: "",
    order_index: lessonOrder++,
    test_passing_score: finalPassingScore,
    metadata: {
      module_number: 11,
      final_assessment: true,
      assessment_block: "final_assessment",
      source_article_id: "final-test",
    },
    questions: toQuestions(finalQuestions),
  });

  const payload: StructuredCourseDraftPayload = {
    schema_version: 1,
    source_kind: "csz-178h-html",
    title,
    description,
    modules,
    lessons,
    documents: extractResourceDocuments(doc),
  };
  validateCszStructuredCoursePayload(payload);
  return payload;
}

export function validateCszStructuredCoursePayload(payload: StructuredCourseDraftPayload): void {
  const issues: string[] = [];
  const typeCounts = { text: 0, homework: 0, test: 0 };
  const moduleKeys = new Set(payload.modules.map((module) => module.key));
  const lessonKeys = new Set(payload.lessons.map((lesson) => lesson.key));

  if (payload.schema_version !== 1) issues.push("schema_version должен быть 1");
  if (payload.source_kind !== "csz-178h-html") issues.push("неверный source_kind");
  if (!payload.title.trim()) issues.push("пустое название курса");
  if (payload.modules.length !== MODULE_COUNT) issues.push(`ожидалось 11 модулей, получено ${payload.modules.length}`);
  if (moduleKeys.size !== payload.modules.length) issues.push("ключи модулей не уникальны");
  if (payload.lessons.length !== LESSON_COUNT) issues.push(`ожидалось 46 уроков, получено ${payload.lessons.length}`);
  if (lessonKeys.size !== payload.lessons.length) issues.push("ключи уроков не уникальны");

  payload.modules.forEach((module, index) => {
    if (module.key !== `module-${index + 1}`) issues.push(`неверный ключ модуля ${index + 1}`);
    if (module.order_index !== index) issues.push(`неверный order_index у ${module.key}`);
    if (!module.title.trim()) issues.push(`пустой заголовок у ${module.key}`);
  });

  let questionCount = 0;
  payload.lessons.forEach((lesson, index) => {
    if (!moduleKeys.has(lesson.module_key)) issues.push(`${lesson.key} ссылается на неизвестный модуль`);
    if (lesson.order_index !== index) issues.push(`неверный order_index у ${lesson.key}`);
    if (!lesson.title.trim()) issues.push(`пустой заголовок у ${lesson.key}`);
    if (!Number.isInteger(lesson.test_passing_score) || lesson.test_passing_score < 0 || lesson.test_passing_score > 100) {
      issues.push(`${lesson.key}: неверный проходной балл`);
    }
    typeCounts[lesson.type] += 1;
    questionCount += lesson.questions.length;

    if (lesson.type !== "test") {
      try {
        if (!Array.isArray(JSON.parse(lesson.content))) issues.push(`${lesson.key}: content должен быть массивом блоков`);
      } catch {
        issues.push(`${lesson.key}: content содержит некорректный JSON`);
      }
    }

    if (lesson.type === "test") {
      const expected = lesson.metadata.final_assessment === true ? 12 : 5;
      if (lesson.questions.length !== expected) {
        issues.push(`${lesson.key}: ожидалось ${expected} вопросов, получено ${lesson.questions.length}`);
      }
    } else if (lesson.questions.length !== 0) {
      issues.push(`${lesson.key}: вопросы допустимы только для test`);
    }

    lesson.questions.forEach((question, questionIndex) => {
      if (!question.question.trim()) issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: пустой текст`);
      if (question.options.length !== 4) issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: должно быть 4 ответа`);
      if (question.options.some((option) => !option.text.trim())) issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: пустой вариант`);
      if (question.correct_answer < 0 || question.correct_answer >= question.options.length) {
        issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: неверный correct_answer`);
      }
    });
  });

  if (typeCounts.text !== 22 || typeCounts.homework !== 12 || typeCounts.test !== 12) {
    issues.push(`неверные типы уроков: text=${typeCounts.text}, homework=${typeCounts.homework}, test=${typeCounts.test}`);
  }
  if (questionCount !== QUESTION_COUNT) issues.push(`ожидалось 67 вопросов, получено ${questionCount}`);

  const finalLessons = payload.lessons.filter((lesson) => lesson.metadata.final_assessment === true);
  if (finalLessons.length !== 2) issues.push(`ожидалось 2 итоговых урока, получено ${finalLessons.length}`);
  if (finalLessons.some((lesson) => lesson.module_key !== "module-11")) {
    issues.push("итоговые уроки должны находиться в module-11");
  }
  if (!finalLessons.some((lesson) => lesson.type === "homework") || !finalLessons.some((lesson) => lesson.type === "test")) {
    issues.push("итоговый блок должен содержать homework и test");
  }

  payload.modules.forEach((module) => {
    const moduleLessons = payload.lessons.filter(
      (lesson) => lesson.module_key === module.key && lesson.metadata.final_assessment !== true,
    );
    const moduleTypeCounts = moduleLessons.reduce(
      (counts, lesson) => ({ ...counts, [lesson.type]: counts[lesson.type] + 1 }),
      { text: 0, homework: 0, test: 0 },
    );
    if (
      moduleLessons.length !== 4
      || moduleTypeCounts.text !== 2
      || moduleTypeCounts.homework !== 1
      || moduleTypeCounts.test !== 1
    ) {
      issues.push(`${module.key}: ожидалось 2 text, 1 homework и 1 test`);
    }
  });

  const officialCount = payload.documents.filter((document) => document.source_kind === "official").length;
  const manufacturerCount = payload.documents.filter((document) => document.source_kind === "manufacturer").length;
  if (officialCount !== 8) issues.push(`ожидалось 8 официальных источников, получено ${officialCount}`);
  if (manufacturerCount !== 20) issues.push(`ожидалось 20 материалов изготовителей, получено ${manufacturerCount}`);
  const manufacturerModules = new Set<number>();
  payload.documents.forEach((document, index) => {
    if (!document.name.trim()) issues.push(`ресурс ${index + 1}: пустое название`);
    if (!/^https:\/\//i.test(document.file_url)) issues.push(`ресурс ${index + 1}: разрешён только HTTPS URL`);
    if (document.source_kind === "manufacturer") {
      if (
        !Number.isInteger(document.source_module_number)
        || (document.source_module_number as number) < 2
        || (document.source_module_number as number) > 11
      ) {
        issues.push(`ресурс ${index + 1}: материал изготовителя должен быть привязан к модулю 2–11`);
      } else {
        manufacturerModules.add(document.source_module_number as number);
      }
    }
  });
  for (let moduleNumber = 2; moduleNumber <= 11; moduleNumber += 1) {
    if (!manufacturerModules.has(moduleNumber)) {
      issues.push(`для модуля ${moduleNumber} нет материала изготовителя`);
    }
  }

  if (issues.length > 0) throw new StructuredCourseValidationError(issues);
}
