import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CSZ_COURSE_TITLE,
  CSZ_MODULE_TITLES,
  parseCszStructuredCourseHtml,
  validateCszStructuredCoursePayload,
} from "@/utils/structuredCourseImport";

function buildQuestion(id: string, number: number) {
  return {
    id,
    prompt: `Вопрос ${id}`,
    question: `Вопрос ${id}`,
    options: ["Ответ A", "Ответ B", "Ответ C", "Ответ D"],
    correct_option: "ABCD"[number % 4],
    correct_index: number % 4,
    rationale: `Пояснение ${id}`,
  };
}

function buildFixture(): { html: string; closedKeys: string } {
  const modules = Array.from({ length: 11 }, (_, index) => {
    const number = index + 1;
    const moduleTitle = CSZ_MODULE_TITLES[index];
    return [
      `<article id="module-${number}-theory"><h2>${moduleTitle}</h2><p onmouseover="alert(1)">Теория ${number}</p></article>`,
      `<article id="module-${number}-practice"><h2>Практическое задание ${number}. Тема</h2><p>Задание ${number}</p></article>`,
      `<article id="module-${number}-test"><h2>Промежуточная аттестация. Модуль ${number}</h2><p>5 вопросов</p></article>`,
    ].join("");
  }).join("");
  const official = Array.from({ length: 8 }, (_, index) => (
    `<li><a href="https://official.example/${index + 1}">Официальный источник ${index + 1}</a></li>`
  )).join("");
  const html = `<!doctype html><html><head><title>Курс</title></head><body>
    <header><h1>${CSZ_COURSE_TITLE}</h1><p>11 модулей; исключительно ЭО и ДОТ.</p></header>
    <article id="materials"><h2>Официальные источники</h2><ul>${official}</ul></article>
    ${modules}
    <article id="final-practice"><h2>Итоговая практико-ориентированная задача</h2><p>Задание</p></article>
    <article id="final-test"><h2>Итоговый тест</h2><p>12 вопросов; проходной балл 70%.</p></article>
  </body></html>`;
  const closedKeys = JSON.stringify({
    modules: Array.from({ length: 11 }, (_, index) => {
      const number = index + 1;
      const moduleId = `M${String(number).padStart(2, "0")}`;
      return {
        module_id: moduleId,
        title: CSZ_MODULE_TITLES[index].replace(new RegExp(`^Модуль ${number}\\. `), ""),
        questions: Array.from({ length: 5 }, (_unused, questionIndex) => (
          buildQuestion(`${moduleId}-Q${String(questionIndex + 1).padStart(2, "0")}`, questionIndex)
        )),
      };
    }),
    final_questions: Array.from({ length: 12 }, (_unused, index) => (
      buildQuestion(`F-Q${String(index + 1).padStart(2, "0")}`, index)
    )),
  });
  return { html, closedKeys };
}

function expectCompletePayload(html: string, closedKeys: string): void {
  const payload = parseCszStructuredCourseHtml(html, closedKeys);
  const typeCounts = payload.lessons.reduce<Record<string, number>>((counts, lesson) => {
    counts[lesson.type] = (counts[lesson.type] ?? 0) + 1;
    return counts;
  }, {});
  const questionCount = payload.lessons.reduce((total, lesson) => total + lesson.questions.length, 0);

  expect(payload.schema_version).toBe(2);
  expect(payload.modules).toHaveLength(11);
  expect(payload.lessons).toHaveLength(35);
  expect(typeCounts).toEqual({ text: 11, homework: 12, test: 12 });
  expect(questionCount).toBe(67);
  expect(payload.documents).toHaveLength(8);
  expect(payload.documents.every((document) => document.source_kind === "official")).toBe(true);
  expect(payload.lessons.every((lesson) => lesson.test_passing_score === 70)).toBe(true);
  expect(payload.lessons.filter((lesson) => lesson.type === "test").every((lesson) => lesson.content === "")).toBe(true);
  expect(payload.lessons.some((lesson) => lesson.key.endsWith("-self"))).toBe(false);
  expect(payload.lessons.some((lesson) => /correct_(?:answer|index)|<form|видео/i.test(lesson.content))).toBe(false);
  expect(() => validateCszStructuredCoursePayload(payload)).not.toThrow();
}

describe("parseCszStructuredCourseHtml v2", () => {
  it("combines learner-safe HTML and closed keys into the exact 35-lesson graph", () => {
    const fixture = buildFixture();
    expectCompletePayload(fixture.html, fixture.closedKeys);
  });

  it("rejects a missing module question", () => {
    const fixture = buildFixture();
    const keys = JSON.parse(fixture.closedKeys);
    keys.modules[0].questions.pop();
    expect(() => parseCszStructuredCourseHtml(fixture.html, JSON.stringify(keys))).toThrow(/ожидалось 5 вопросов/);
  });

  it("rejects a question bank whose module title differs from the HTML", () => {
    const fixture = buildFixture();
    const keys = JSON.parse(fixture.closedKeys);
    keys.modules[4].title = "Другая тема";
    expect(() => parseCszStructuredCourseHtml(fixture.html, JSON.stringify(keys))).toThrow(/M05.*название не совпадает/);
  });

  it("rejects a course title that differs from the approved programme", () => {
    const fixture = buildFixture();
    const html = fixture.html.replace(CSZ_COURSE_TITLE, "Сокращённое название курса");
    expect(() => parseCszStructuredCourseHtml(html, fixture.closedKeys)).toThrow(
      /название курса не совпадает с утверждённой программой/,
    );
  });

  it("rejects an invalid correct answer index", () => {
    const fixture = buildFixture();
    const keys = JSON.parse(fixture.closedKeys);
    keys.final_questions[0].correct_index = 4;
    expect(() => parseCszStructuredCourseHtml(fixture.html, JSON.stringify(keys))).toThrow(/correct_index/);
  });

  it("rejects a letter key that disagrees with correct_index", () => {
    const fixture = buildFixture();
    const keys = JSON.parse(fixture.closedKeys);
    keys.modules[0].questions[1].correct_option = "A";
    keys.modules[0].questions[1].correct_index = 1;
    expect(() => parseCszStructuredCourseHtml(fixture.html, JSON.stringify(keys))).toThrow(
      /correct_option должен точно соответствовать correct_index/,
    );
  });

  it("rejects answer keys or forms leaked into learner HTML", () => {
    const fixture = buildFixture();
    const unsafeHtml = fixture.html.replace("</body>", "<form><input data-correct='1'></form></body>");
    expect(() => parseCszStructuredCourseHtml(unsafeHtml, fixture.closedKeys)).toThrow(/ключ ответа/);
  });

  it("rejects an altered graph before persistence", () => {
    const fixture = buildFixture();
    const payload = parseCszStructuredCourseHtml(fixture.html, fixture.closedKeys);
    payload.lessons[0].module_key = "module-2";
    expect(() => validateCszStructuredCoursePayload(payload)).toThrow(/module-1.*точном порядке/);
  });
});

describe("CSZ v2 migration guard", () => {
  it("revokes the obsolete authenticated v1 entrypoint", () => {
    const migration = readFileSync(
      "supabase/migrations/20260903110000_import_csz_course_draft_v2.sql",
      "utf8",
    );
    expect(migration).toContain(
      "to_regprocedure('public.import_csz_course_draft_v1(uuid,jsonb)')",
    );
    expect(migration).toMatch(
      /EXECUTE 'REVOKE ALL ON FUNCTION public\.import_csz_course_draft_v1\(uuid, jsonb\) FROM authenticated'/,
    );
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS metadata jsonb/);
    expect(migration).toContain("lessons_metadata_is_object");
    expect(migration).toContain("idx_lessons_final_assessment");
    expect(migration).toMatch(/v_actual_lessons <> 35/);
    expect(migration).toMatch(/v_actual_questions <> 67/);
    expect(migration).toMatch(/test_passing_score[^]*?70/);
    expect(migration).toContain(CSZ_COURSE_TITLE);
  });

  it("does not expose the obsolete v1 RPC in generated application types", () => {
    const generatedTypes = readFileSync(
      "src/integrations/supabase/types.ts",
      "utf8",
    );
    expect(generatedTypes).not.toContain("import_csz_course_draft_v1:");
    expect(generatedTypes).toContain("import_csz_course_draft_v2:");
  });
});

const packageHtmlPath = process.env.CSZ_COURSE_HTML;
const packageKeysPath = process.env.CSZ_COURSE_KEYS;
const describePreparedPackage = packageHtmlPath && packageKeysPath ? describe : describe.skip;
describePreparedPackage("prepared CSZ package on D:", () => {
  it("contains 11 modules, 35 lessons, 67 questions and 8 official links", () => {
    const html = readFileSync(packageHtmlPath!, "utf8");
    const closedKeys = readFileSync(packageKeysPath!, "utf8");
    expectCompletePayload(html, closedKeys);
  });
});
