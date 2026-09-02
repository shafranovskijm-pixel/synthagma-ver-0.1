import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCszStructuredCourseHtml,
  validateCszStructuredCoursePayload,
} from "@/utils/structuredCourseImport";

function radioOptions(name: string): string {
  return ["a", "b", "c", "d"]
    .map((value) => `<label><input type="radio" name="${name}" value="${value}">${value}) Ответ ${value}</label>`)
    .join("");
}

function moduleQuiz(moduleNumber: number): string {
  const questions = Array.from({ length: 5 }, (_, index) => {
    const name = `q${moduleNumber}_${index + 1}`;
    return `<p>${index + 1}. Вопрос ${moduleNumber}.${index + 1}</p>${radioOptions(name)}`;
  }).join("");
  return `<form id="quiz${moduleNumber}">${questions}</form>`;
}

function buildFixture(): string {
  const modules = Array.from({ length: 11 }, (_, index) => {
    const number = index + 1;
    return [
      `<article id="module-${number}-theory"><h2>Модуль ${number}. Тема</h2><p onmouseover="alert(1)">Теория ${number}</p>${moduleQuiz(number)}</article>`,
      `<article id="module-${number}-practice"><h2>Практическая работа ${number}</h2><p>Задание</p></article>`,
      `<article id="module-${number}-self"><h2>Самостоятельная работа ${number}</h2><p>Самостоятельно</p></article>`,
    ].join("");
  }).join("");

  const quizCalls = Array.from({ length: 11 }, (_, index) => {
    const number = index + 1;
    const answers = Array.from({ length: 5 }, (_unused, questionIndex) => `q${number}_${questionIndex + 1}:'a'`).join(",");
    return `checkMini('quiz${number}','result${number}',{${answers}});`;
  }).join("\n");
  const finalAnswers = Array.from({ length: 12 }, (_, index) => `f${index + 1}:'a'`).join(",");
  const finalQuestions = Array.from({ length: 12 }, (_, index) => (
    `<li>Финальный вопрос ${index + 1}${radioOptions(`f${index + 1}`)}</li>`
  )).join("");
  const official = Array.from({ length: 8 }, (_, index) => (
    `<li><a href="https://official.example/${index + 1}">Официальный источник ${index + 1}</a></li>`
  )).join("");
  const manufacturers = Array.from({ length: 20 }, (_, index) => (
    `<li><strong>Модуль ${(index % 10) + 2}. Завод.</strong> <a href="https://vendor.example/${index + 1}">Материал изготовителя ${index + 1}</a></li>`
  )).join("");

  return `<!doctype html><html><head><title>Курс</title></head><body>
    <header><h1>Курс ЦСЗ 178 часов</h1><p>11 модулей; исключительно ЭО и ДОТ.</p></header>
    <article id="materials"><h2>Официальные источники</h2><ul>${official}</ul></article>
    <article id="manufacturer-materials"><h2>Материалы изготовителей</h2><ul>${manufacturers}</ul></article>
    ${modules}
    <article id="final-practice"><h2>Итоговая практическая ситуационная задача</h2><p>Задание</p></article>
    <article id="final-test"><h2>Финальный тест по курсу</h2><p>Зачёт 9 / 12</p><form id="finalQuiz"><ol>${finalQuestions}</ol></form></article>
    <script>function checkMini(){} ${quizCalls} const correctAnswers={${finalAnswers}};</script>
  </body></html>`;
}

function expectCompletePayload(html: string, expectedDocuments: number): void {
  const payload = parseCszStructuredCourseHtml(html);
  const typeCounts = payload.lessons.reduce<Record<string, number>>((counts, lesson) => {
    counts[lesson.type] = (counts[lesson.type] ?? 0) + 1;
    return counts;
  }, {});
  const questionCount = payload.lessons.reduce((total, lesson) => total + lesson.questions.length, 0);
  const finalLessons = payload.lessons.filter((lesson) => lesson.metadata.final_assessment === true);

  expect(payload.modules).toHaveLength(11);
  expect(payload.lessons).toHaveLength(46);
  expect(typeCounts).toEqual({ text: 22, homework: 12, test: 12 });
  expect(questionCount).toBe(67);
  expect(payload.documents).toHaveLength(expectedDocuments);
  expect(finalLessons).toHaveLength(2);
  expect(finalLessons.map((lesson) => lesson.type).sort()).toEqual(["homework", "test"]);
  expect(finalLessons.every((lesson) => lesson.module_key === "module-11")).toBe(true);
  expect(payload.modules.some((module) => module.key === "module-12")).toBe(false);
  expect(payload.lessons.some((lesson) => lesson.content.includes("onmouseover"))).toBe(false);
  expect(() => validateCszStructuredCoursePayload(payload)).not.toThrow();
}

describe("parseCszStructuredCourseHtml", () => {
  it("builds the exact rollback-safe CSZ graph without a twelfth module", () => {
    expectCompletePayload(buildFixture(), 28);
  });

  it("rejects a package when one required test question is missing", () => {
    const html = buildFixture().replace("<p>5. Вопрос 1.5</p>", "");
    expect(() => parseCszStructuredCourseHtml(html)).toThrow(/ожидалось 5 вопросов/);
  });

  it("rejects a graph whose four core lessons are not kept in each module", () => {
    const payload = parseCszStructuredCourseHtml(buildFixture());
    payload.lessons[0].module_key = "module-2";
    expect(() => validateCszStructuredCoursePayload(payload)).toThrow(/module-1.*2 text, 1 homework и 1 test/);
  });

  it("rejects extra or unassigned manufacturer resources", () => {
    const payload = parseCszStructuredCourseHtml(buildFixture());
    payload.documents.push({
      name: "Лишний ресурс",
      type: "link",
      description: "Лишний ресурс",
      file_url: "https://manufacturer.example/extra",
      source_kind: "manufacturer",
      source_module_number: null,
    });
    expect(() => validateCszStructuredCoursePayload(payload)).toThrow(/20 материалов изготовителей/);
  });
});

const packagePath = process.env.CSZ_COURSE_HTML;
const describePreparedPackage = packagePath ? describe : describe.skip;
describePreparedPackage("prepared CSZ package on D:", () => {
  it("contains 11 modules, 46 lessons, 67 questions and all 28 resource links", () => {
    const html = readFileSync(packagePath!, "utf8");
    const payload = parseCszStructuredCourseHtml(html);
    expect(payload.documents.filter((document) => document.source_kind === "official")).toHaveLength(8);
    expect(payload.documents.filter((document) => document.source_kind === "manufacturer")).toHaveLength(20);
    expect(payload.documents.some((document) => document.name.includes("ОП-4(з)-АВСЕ «МИГ Е»"))).toBe(true);
    expectCompletePayload(html, 28);
  });
});
