import { blocksToJson, htmlToBlocks } from "@/components/course-builder/block-editor";
import type { LessonType } from "@/components/course-builder/LessonTypeConfig";
import { sanitizeCourseHtml } from "@/lib/security/courseHtml";

export interface StructuredCourseModuleInput {
  key: string;
  title: string;
  order_index: number;
}

export interface StructuredCourseQuestionInput {
  key: string;
  question: string;
  options: { text: string }[];
  correct_answer: number;
  correct_option: "A" | "B" | "C" | "D";
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
  source_name: string;
  source_kind: "official";
  source_module_number: null;
  library_category: "legal_acts";
  usage_basis: "official_open_source";
  library_status: "needs_review";
}

export interface StructuredCourseDraftPayload {
  schema_version: 2;
  source_kind: "csz-178h-html-with-closed-keys";
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
const LESSON_COUNT = 35;
const QUESTION_COUNT = 67;
const PASSING_SCORE = 70;
const MAX_CLOSED_KEYS_SIZE = 2 * 1024 * 1024;
const LEARNER_FORBIDDEN_PATTERN = /(?:<\s*(?:script|form|video)\b|correct_(?:answer|index|option)|data-correct|youtube|rutube|видео)/i;

export const CSZ_COURSE_TITLE = "Деятельность по монтажу, техническому обслуживанию и ремонту средств обеспечения пожарной безопасности зданий и сооружений";

export const CSZ_MODULE_TITLES = [
  "Модуль 1. Общепрофессиональный модуль",
  "Модуль 2. Монтаж, техническое обслуживание и ремонт систем пожаротушения и их элементов, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 3. Монтаж, техническое обслуживание и ремонт систем пожарной и охранно-пожарной сигнализации и их элементов, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 4. Монтаж, техническое обслуживание и ремонт систем противопожарного водоснабжения и их элементов, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 5. Монтаж, техническое обслуживание и ремонт автоматических систем (элементов автоматических систем) противодымной вентиляции, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 6. Монтаж, техническое обслуживание и ремонт систем оповещения и эвакуации при пожаре и их элементов, включая диспетчеризацию и проведение пусконаладочных работ, в том числе фотолюминесцентных эвакуационных систем и их элементов",
  "Модуль 7. Монтаж, техническое обслуживание и ремонт автоматических систем (элементов автоматических систем) передачи извещений о пожаре, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 8. Монтаж, техническое обслуживание и ремонт противопожарных занавесов и завес, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 9. Монтаж, техническое обслуживание и ремонт заполнений проемов в противопожарных преградах",
  "Модуль 10. Выполнение работ по огнезащите материалов, изделий и конструкций",
  "Модуль 11. Монтаж, техническое обслуживание и ремонт первичных средств пожаротушения",
] as const;

type UnknownRecord = Record<string, unknown>;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function paddedNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function titleWithoutModulePrefix(title: string, moduleNumber: number): string {
  return normalizeText(title).replace(new RegExp(`^Модуль\\s+${moduleNumber}\\.\\s*`, "i"), "");
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
    ".aura, form, script, video, button, [id^='result'], [data-correct], [data-answer], label:has(input[type='checkbox'][data-done])",
  ).forEach((element) => element.remove());

  const safeHtml = sanitizeCourseHtml(clone.innerHTML);
  if (LEARNER_FORBIDDEN_PATTERN.test(safeHtml)) {
    throw new StructuredCourseValidationError([
      `article#${article.id} содержит форму, ключ ответа или видеоматериал`,
    ]);
  }
  return blocksToJson(htmlToBlocks(safeHtml));
}

function questionFromUnknown(
  value: unknown,
  expectedKey: string,
  context: string,
  orderIndex: number,
  issues: string[],
): StructuredCourseQuestionInput | null {
  const record = asRecord(value);
  if (!record) {
    issues.push(`${context}: вопрос должен быть объектом`);
    return null;
  }

  const key = normalizeText(typeof record.id === "string" ? record.id : "");
  const prompt = normalizeText(typeof record.prompt === "string" ? record.prompt : "");
  const duplicateQuestion = normalizeText(typeof record.question === "string" ? record.question : "");
  const rationale = normalizeText(typeof record.rationale === "string" ? record.rationale : "");
  const optionsInput = Array.isArray(record.options) ? record.options : [];
  const options = optionsInput.map((option) => normalizeText(typeof option === "string" ? option : ""));
  const correctIndex = record.correct_index;
  const correctOption = typeof record.correct_option === "string" ? record.correct_option : "";

  if (key !== expectedKey) issues.push(`${context}: ожидался id ${expectedKey}, получен ${key || "пустой"}`);
  if (!prompt) issues.push(`${context}: пустой текст вопроса`);
  if (duplicateQuestion && duplicateQuestion !== prompt) issues.push(`${context}: поля prompt и question расходятся`);
  if (options.length !== 4 || options.some((option) => !option)) {
    issues.push(`${context}: должно быть ровно 4 непустых варианта ответа`);
  }
  if (!Number.isInteger(correctIndex) || (correctIndex as number) < 0 || (correctIndex as number) > 3) {
    issues.push(`${context}: correct_index должен быть целым числом от 0 до 3`);
  }
  if (
    !Number.isInteger(correctIndex)
    || correctOption !== "ABCD"[correctIndex as number]
  ) {
    issues.push(`${context}: correct_option должен точно соответствовать correct_index`);
  }

  if (
    key !== expectedKey
    || !prompt
    || options.length !== 4
    || options.some((option) => !option)
    || !Number.isInteger(correctIndex)
    || (correctIndex as number) < 0
    || (correctIndex as number) > 3
    || correctOption !== "ABCD"[correctIndex as number]
  ) {
    return null;
  }

  return {
    key,
    question: prompt,
    options: options.map((text) => ({ text })),
    correct_answer: correctIndex as number,
    correct_option: correctOption as "A" | "B" | "C" | "D",
    order_index: orderIndex,
    explanation: rationale || null,
  };
}

function parseClosedQuestionBank(
  json: string,
  moduleTitles: string[],
): { modules: StructuredCourseQuestionInput[][]; final: StructuredCourseQuestionInput[] } {
  if (!json.trim()) {
    throw new StructuredCourseValidationError(["не выбран закрытый JSON с ключами тестов"]);
  }
  if (new TextEncoder().encode(json).byteLength > MAX_CLOSED_KEYS_SIZE) {
    throw new StructuredCourseValidationError(["закрытый JSON с ключами превышает 2 МБ"]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new StructuredCourseValidationError(["закрытый файл ключей содержит некорректный JSON"]);
  }

  const root = asRecord(parsed);
  if (!root) throw new StructuredCourseValidationError(["закрытый JSON должен содержать объект"]);

  const issues: string[] = [];
  const modulesInput = Array.isArray(root.modules) ? root.modules : [];
  const finalInput = Array.isArray(root.final_questions) ? root.final_questions : [];
  if (modulesInput.length !== MODULE_COUNT) {
    issues.push(`в закрытом JSON ожидалось 11 модулей, получено ${modulesInput.length}`);
  }
  if (finalInput.length !== 12) {
    issues.push(`в закрытом JSON ожидалось 12 итоговых вопросов, получено ${finalInput.length}`);
  }

  const modules: StructuredCourseQuestionInput[][] = [];
  for (let index = 0; index < MODULE_COUNT; index += 1) {
    const moduleNumber = index + 1;
    const expectedModuleId = `M${paddedNumber(moduleNumber)}`;
    const module = asRecord(modulesInput[index]);
    if (!module) {
      issues.push(`закрытый JSON: отсутствует ${expectedModuleId}`);
      modules.push([]);
      continue;
    }

    const moduleId = normalizeText(typeof module.module_id === "string" ? module.module_id : "");
    const bankTitle = normalizeText(typeof module.title === "string" ? module.title : "");
    const htmlTitle = titleWithoutModulePrefix(moduleTitles[index] ?? "", moduleNumber);
    if (moduleId !== expectedModuleId) {
      issues.push(`закрытый JSON: ожидался module_id ${expectedModuleId}, получен ${moduleId || "пустой"}`);
    }
    if (!bankTitle || bankTitle !== htmlTitle) {
      issues.push(`${expectedModuleId}: название не совпадает с HTML`);
    }

    const questionsInput = Array.isArray(module.questions) ? module.questions : [];
    if (questionsInput.length !== 5) {
      issues.push(`${expectedModuleId}: ожидалось 5 вопросов, получено ${questionsInput.length}`);
    }
    const questions: StructuredCourseQuestionInput[] = [];
    for (let questionIndex = 0; questionIndex < 5; questionIndex += 1) {
      const expectedKey = `${expectedModuleId}-Q${paddedNumber(questionIndex + 1)}`;
      const question = questionFromUnknown(
        questionsInput[questionIndex], expectedKey, `${expectedModuleId}, вопрос ${questionIndex + 1}`, questionIndex, issues,
      );
      if (question) questions.push(question);
    }
    modules.push(questions);
  }

  const final: StructuredCourseQuestionInput[] = [];
  for (let index = 0; index < 12; index += 1) {
    const expectedKey = `F-Q${paddedNumber(index + 1)}`;
    const question = questionFromUnknown(
      finalInput[index], expectedKey, `итоговый вопрос ${index + 1}`, index, issues,
    );
    if (question) final.push(question);
  }

  if (issues.length > 0) throw new StructuredCourseValidationError(issues);
  return { modules, final };
}

function extractOfficialDocuments(doc: Document): StructuredCourseDocumentInput[] {
  const article = requireArticle(doc, "materials");
  const documents: StructuredCourseDocumentInput[] = [];
  article.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const rawHref = normalizeText(anchor.getAttribute("href"));
    let url: URL;
    try {
      url = new URL(rawHref);
    } catch {
      throw new StructuredCourseValidationError([`некорректная ссылка официального источника: ${rawHref || "пустая"}`]);
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new StructuredCourseValidationError([`официальный источник должен иметь безопасную HTTPS-ссылку: ${rawHref}`]);
    }
    documents.push({
      name: normalizeText(anchor.textContent) || url.toString(),
      type: "link",
      description: normalizeText(anchor.closest("li")?.textContent || anchor.parentElement?.textContent),
      file_url: url.toString(),
      source_name: url.hostname,
      source_kind: "official",
      source_module_number: null,
      library_category: "legal_acts",
      usage_basis: "official_open_source",
      library_status: "needs_review",
    });
  });
  return documents;
}

export function isCszStructuredCourseHtml(html: string): boolean {
  if (!/<article\s+id=["']module-1-theory["']/i.test(html)) return false;
  return /<article\s+id=["']final-test["']/i.test(html)
    && /<article\s+id=["']materials["']/i.test(html);
}

/** Builds learner-safe HTML plus a separate closed JSON bank into a v2 payload. */
export function parseCszStructuredCourseHtml(
  html: string,
  closedQuestionBankJson: string,
): StructuredCourseDraftPayload {
  if (!isCszStructuredCourseHtml(html)) {
    throw new StructuredCourseValidationError(["файл не соответствует формату курса ЦСЗ"]);
  }
  if (LEARNER_FORBIDDEN_PATTERN.test(html)) {
    throw new StructuredCourseValidationError([
      "HTML курса содержит форму, скрипт, ключ ответа или видеоматериал; ключи допустимы только в закрытом JSON",
    ]);
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  if (doc.querySelector("#manufacturer-materials, [id$='-self']")) {
    throw new StructuredCourseValidationError([
      "v2 не принимает старые материалы изготовителей или отдельные уроки самостоятельной работы",
    ]);
  }

  const h1 = doc.querySelector("h1");
  const title = normalizeText(h1?.textContent || doc.querySelector("title")?.textContent);
  const description = normalizeText(h1?.parentElement?.querySelector("p")?.textContent);
  const moduleArticles = Array.from({ length: MODULE_COUNT }, (_, index) => {
    const moduleNumber = index + 1;
    const moduleKey = `module-${moduleNumber}`;
    const theory = requireArticle(doc, `${moduleKey}-theory`);
    const practice = requireArticle(doc, `${moduleKey}-practice`);
    const test = requireArticle(doc, `${moduleKey}-test`);
    const moduleTitle = normalizeText(theory.querySelector("h2")?.textContent);
    if (moduleTitle !== CSZ_MODULE_TITLES[index]) {
      throw new StructuredCourseValidationError([`${moduleKey}: заголовок не совпадает с утверждённой программой`]);
    }
    return { moduleNumber, moduleKey, moduleTitle, theory, practice, test };
  });
  const questionBank = parseClosedQuestionBank(
    closedQuestionBankJson,
    moduleArticles.map((module) => module.moduleTitle),
  );

  const modules: StructuredCourseModuleInput[] = [];
  const lessons: StructuredCourseLessonInput[] = [];
  let lessonOrder = 0;
  moduleArticles.forEach(({ moduleNumber, moduleKey, moduleTitle, theory, practice, test }, index) => {
    modules.push({ key: moduleKey, title: moduleTitle, order_index: index });
    const baseMetadata = { module_number: moduleNumber, final_assessment: false };
    lessons.push(
      {
        key: `${moduleKey}-theory`, module_key: moduleKey, title: moduleTitle, type: "text",
        content: articleContent(theory), order_index: lessonOrder++, test_passing_score: PASSING_SCORE,
        metadata: { ...baseMetadata, source_article_id: `${moduleKey}-theory` }, questions: [],
      },
      {
        key: `${moduleKey}-practice`, module_key: moduleKey,
        title: normalizeText(practice.querySelector("h2")?.textContent) || `Практическое задание ${moduleNumber}`,
        type: "homework", content: articleContent(practice), order_index: lessonOrder++,
        test_passing_score: PASSING_SCORE,
        metadata: { ...baseMetadata, source_article_id: `${moduleKey}-practice` }, questions: [],
      },
      {
        key: `${moduleKey}-test`, module_key: moduleKey,
        title: normalizeText(test.querySelector("h2")?.textContent) || `Промежуточная аттестация. Модуль ${moduleNumber}`,
        type: "test", content: "", order_index: lessonOrder++, test_passing_score: PASSING_SCORE,
        metadata: { ...baseMetadata, source_article_id: `${moduleKey}-test` },
        questions: questionBank.modules[index],
      },
    );
  });

  const finalPractice = requireArticle(doc, "final-practice");
  lessons.push({
    key: "final-practice", module_key: "module-11",
    title: normalizeText(finalPractice.querySelector("h2")?.textContent) || "Итоговая практико-ориентированная задача",
    type: "homework", content: articleContent(finalPractice), order_index: lessonOrder++,
    test_passing_score: PASSING_SCORE,
    metadata: { module_number: 11, final_assessment: true, assessment_block: "final_assessment", source_article_id: "final-practice" },
    questions: [],
  });

  const finalTest = requireArticle(doc, "final-test");
  lessons.push({
    key: "final-test", module_key: "module-11",
    title: normalizeText(finalTest.querySelector("h2")?.textContent) || "Итоговый тест",
    type: "test", content: "", order_index: lessonOrder++, test_passing_score: PASSING_SCORE,
    metadata: { module_number: 11, final_assessment: true, assessment_block: "final_assessment", source_article_id: "final-test" },
    questions: questionBank.final,
  });

  const payload: StructuredCourseDraftPayload = {
    schema_version: 2,
    source_kind: "csz-178h-html-with-closed-keys",
    title,
    description,
    modules,
    lessons,
    documents: extractOfficialDocuments(doc),
  };
  validateCszStructuredCoursePayload(payload);
  return payload;
}

export function validateCszStructuredCoursePayload(payload: StructuredCourseDraftPayload): void {
  const issues: string[] = [];
  const typeCounts = { text: 0, homework: 0, test: 0 };
  const moduleKeys = new Set(payload.modules.map((module) => module.key));
  const lessonKeys = new Set(payload.lessons.map((lesson) => lesson.key));

  if (payload.schema_version !== 2) issues.push("schema_version должен быть 2");
  if (payload.source_kind !== "csz-178h-html-with-closed-keys") issues.push("неверный source_kind");
  if (payload.title !== CSZ_COURSE_TITLE) issues.push("название курса не совпадает с утверждённой программой");
  if (payload.modules.length !== MODULE_COUNT) issues.push(`ожидалось 11 модулей, получено ${payload.modules.length}`);
  if (moduleKeys.size !== payload.modules.length) issues.push("ключи модулей не уникальны");
  if (payload.lessons.length !== LESSON_COUNT) issues.push(`ожидалось 35 уроков, получено ${payload.lessons.length}`);
  if (lessonKeys.size !== payload.lessons.length) issues.push("ключи уроков не уникальны");

  payload.modules.forEach((module, index) => {
    if (module.key !== `module-${index + 1}`) issues.push(`неверный ключ модуля ${index + 1}`);
    if (module.order_index !== index) issues.push(`неверный order_index у ${module.key}`);
    if (module.title !== CSZ_MODULE_TITLES[index]) issues.push(`неверный заголовок у ${module.key}`);
  });

  let questionCount = 0;
  payload.lessons.forEach((lesson, index) => {
    if (!moduleKeys.has(lesson.module_key)) issues.push(`${lesson.key} ссылается на неизвестный модуль`);
    if (lesson.order_index !== index) issues.push(`неверный order_index у ${lesson.key}`);
    if (!lesson.title.trim()) issues.push(`пустой заголовок у ${lesson.key}`);
    if (lesson.test_passing_score !== PASSING_SCORE) issues.push(`${lesson.key}: проходной балл должен быть 70%`);
    typeCounts[lesson.type] += 1;
    questionCount += lesson.questions.length;

    if (lesson.type !== "test") {
      try {
        if (!Array.isArray(JSON.parse(lesson.content))) issues.push(`${lesson.key}: content должен быть массивом блоков`);
      } catch {
        issues.push(`${lesson.key}: content содержит некорректный JSON`);
      }
      if (LEARNER_FORBIDDEN_PATTERN.test(lesson.content)) {
        issues.push(`${lesson.key}: learner content содержит форму, ключ ответа или видеоматериал`);
      }
    } else if (lesson.content !== "") {
      issues.push(`${lesson.key}: HTML теста должен быть пустым; вопросы хранятся отдельно`);
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
      const expectedQuestionKey = lesson.metadata.final_assessment === true
        ? `F-Q${paddedNumber(questionIndex + 1)}`
        : `M${paddedNumber(Number(lesson.metadata.module_number))}-Q${paddedNumber(questionIndex + 1)}`;
      if (question.key !== expectedQuestionKey) issues.push(`${lesson.key}: неверный ключ ${question.key}`);
      if (question.order_index !== questionIndex) issues.push(`${lesson.key}: неверный порядок вопроса ${question.key}`);
      if (!question.question.trim()) issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: пустой текст`);
      if (question.options.length !== 4) issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: должно быть 4 ответа`);
      if (question.options.some((option) => !option.text.trim())) issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: пустой вариант`);
      if (!Number.isInteger(question.correct_answer) || question.correct_answer < 0 || question.correct_answer > 3) {
        issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: неверный correct_answer`);
      }
      if (question.correct_option !== "ABCD"[question.correct_answer]) {
        issues.push(`${lesson.key}, вопрос ${questionIndex + 1}: correct_option не соответствует correct_answer`);
      }
    });
  });

  if (typeCounts.text !== 11 || typeCounts.homework !== 12 || typeCounts.test !== 12) {
    issues.push(`неверные типы уроков: text=${typeCounts.text}, homework=${typeCounts.homework}, test=${typeCounts.test}`);
  }
  if (questionCount !== QUESTION_COUNT) issues.push(`ожидалось 67 вопросов, получено ${questionCount}`);

  payload.modules.forEach((module, index) => {
    const moduleNumber = index + 1;
    const normalLessons = payload.lessons.filter(
      (lesson) => lesson.module_key === module.key && lesson.metadata.final_assessment !== true,
    );
    const expectedKeys = [`${module.key}-theory`, `${module.key}-practice`, `${module.key}-test`];
    if (
      normalLessons.length !== 3
      || normalLessons.map((lesson) => lesson.key).join("|") !== expectedKeys.join("|")
      || normalLessons.map((lesson) => lesson.type).join("|") !== "text|homework|test"
      || normalLessons[0]?.title !== module.title
      || !normalLessons[1]?.title.startsWith(`Практическое задание ${moduleNumber}.`)
      || normalLessons[2]?.title !== `Промежуточная аттестация. Модуль ${moduleNumber}`
      || normalLessons.some((lesson) => lesson.metadata.module_number !== moduleNumber)
    ) {
      issues.push(`${module.key}: ожидались theory, practice и test в точном порядке`);
    }
  });

  const finalLessons = payload.lessons.filter((lesson) => lesson.metadata.final_assessment === true);
  if (
    finalLessons.length !== 2
    || finalLessons[0]?.key !== "final-practice"
    || finalLessons[0]?.type !== "homework"
    || finalLessons[0]?.title !== "Итоговая практико-ориентированная задача"
    || finalLessons[1]?.key !== "final-test"
    || finalLessons[1]?.type !== "test"
    || finalLessons[1]?.title !== "Итоговый тест"
    || finalLessons.some((lesson) => lesson.module_key !== "module-11")
  ) {
    issues.push("итоговый блок должен содержать final-practice и final-test внутри module-11");
  }

  if (payload.documents.length !== 8) {
    issues.push(`ожидалось 8 официальных источников, получено ${payload.documents.length}`);
  }
  const urls = new Set<string>();
  payload.documents.forEach((document, index) => {
    if (!document.name.trim()) issues.push(`ресурс ${index + 1}: пустое название`);
    try {
      const url = new URL(document.file_url);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe");
    } catch {
      issues.push(`ресурс ${index + 1}: разрешён только абсолютный HTTPS URL без учётных данных`);
    }
    if (urls.has(document.file_url)) issues.push(`ресурс ${index + 1}: URL дублируется`);
    urls.add(document.file_url);
    if (
      document.source_kind !== "official"
      || document.source_module_number !== null
      || document.library_category !== "legal_acts"
      || document.usage_basis !== "official_open_source"
      || document.library_status !== "needs_review"
    ) {
      issues.push(`ресурс ${index + 1}: неверная стратегия электронной библиотеки`);
    }
  });

  if (issues.length > 0) throw new StructuredCourseValidationError(issues);
}
