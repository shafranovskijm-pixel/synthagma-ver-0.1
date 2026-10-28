import { describe, expect, it } from "vitest";
import { blocksToJson, jsonToBlocks, parseLessonContent } from "../parsers";
import { legacyFixture, rawLegacy, objectQuizFixture, rawObjectQuiz } from "./legacyFixture";

const parseSaved = (content: string) => JSON.parse(content) as Record<string, unknown>[];

describe("legacy flat lesson blocks", () => {
  it("hydrates all observed legacy block families without changing IDs, order or source", () => {
    const blocks = jsonToBlocks(rawLegacy);
    expect(blocks.map(block => block.id)).toEqual(legacyFixture.map(block => block.id));
    expect(blocks.map(block => block.type)).toEqual(["image", "paragraph", "heading2", "callout-info", "accordion", "quiz", "divider", "button"]);
    expect(blocks[0]).toMatchObject({ imageSrc: "/qa-synthetic.png", imageAlt: "Учебная схема", caption: "Синтетический рисунок", privateExtra: { retain: true } });
    expect(blocks[1].content).toBe("Первый учебный абзац");
    expect(blocks[3]).toMatchObject({ calloutTitle: "Пример", content: "Текст примера" });
    expect(blocks[4].accordionItems).toEqual(legacyFixture[4].items);
    expect(blocks[5].quizOptions?.map(option => option.text)).toEqual(["1", "2", "4", "8"]);
    expect(blocks[5].quizOptions?.map(option => option.isCorrect)).toEqual([false, false, true, false]);
    expect(JSON.stringify(legacyFixture, null, 2) + "\n").toBe(rawLegacy);
  });

  it("returns the original exact bytes on a no-edit save, including unknown fields", () => {
    expect(blocksToJson(parseLessonContent(rawLegacy), rawLegacy)).toBe(rawLegacy);
  });

  it("keeps explicit modern empty fields authoritative over legacy mirrors", () => {
    const original = JSON.stringify([{ id: "modern", type: "paragraph", content: "", text: "Старый текст", extra: 12 }, { id: "quiz", type: "quiz", content: "", quizQuestion: "", question: "Старый вопрос", quizOptions: [], options: ["старый"], correctIndex: 0 }]);
    const blocks = parseLessonContent(original);
    expect(blocks[0].content).toBe("");
    expect(blocks[1].quizQuestion).toBe("");
    expect(blocks[1].quizOptions).toEqual([]);
    expect(blocksToJson(blocks, original)).toBe(original);
  });

  it("does not revert the first save when another block is edited and originalContent advances", () => {
    const initial = parseLessonContent(rawLegacy);
    const first = initial.map(block => block.id === "paragraph-1" ? { ...block, content: "Первая правка" } : block);
    const savedFirst = blocksToJson(first, rawLegacy);
    const second = first.map(block => block.id === "callout-1" ? { ...block, content: "Вторая правка" } : block);
    const savedSecond = blocksToJson(second, savedFirst);
    expect(parseSaved(savedSecond).find(block => block.id === "paragraph-1")?.text).toBe("Первая правка");
    expect(parseSaved(savedSecond).find(block => block.id === "callout-1")?.text).toBe("Вторая правка");
    const reordered = [...second].reverse();
    const savedThird = blocksToJson(reordered, savedSecond);
    expect(parseSaved(savedThird).map(block => block.id)).toEqual(reordered.map(block => block.id));
    expect(parseSaved(savedThird).find(block => block.id === "paragraph-1")).toEqual({ id: "paragraph-1", type: "paragraph", text: "Первая правка", extra: { version: 7 } });
    expect(parseSaved(savedThird).find(block => block.id === "image-1")).toEqual(legacyFixture[0]);
  });

  it("preserves the first quiz question/options/key after a second save with stale legacy mirrors", () => {
    const initial = parseLessonContent(rawLegacy);
    const first = initial.map(block => block.id === "quiz-1" ? { ...block, quizQuestion: "Новый синтетический вопрос", quizOptions: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }, { text: "C", isCorrect: false }, { text: "D", isCorrect: false }] } : block);
    const savedFirst = blocksToJson(first, rawLegacy);
    const second = first.map(block => block.id === "quiz-1" ? { ...block, quizExplanation: "Новое синтетическое пояснение" } : block);
    const savedSecond = blocksToJson(second, savedFirst);
    expect(parseSaved(savedSecond).find(block => block.id === "quiz-1")).toEqual({ ...legacyFixture[5], question: "Новый синтетический вопрос", options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "Новое синтетическое пояснение" });
  });

  it("edits one accordion section without flattening two items or removing their unknown fields", () => {
    const initial = parseLessonContent(rawLegacy);
    const first = initial.map(block => block.id === "accordion-1" ? { ...block, accordionItems: block.accordionItems?.map(item => item.id === "section-a" ? { ...item, content: "Новая первая секция" } : item) } : block);
    const savedFirst = blocksToJson(first, rawLegacy);
    const second = first.map(block => block.id === "accordion-1" ? { ...block, accordionItems: block.accordionItems?.map(item => item.id === "section-b" ? { ...item, title: "Новое имя Б" } : item) } : block);
    const result = parseSaved(blocksToJson(second, savedFirst)).find(block => block.id === "accordion-1");
    expect(result).toEqual({ ...legacyFixture[4], items: [{ ...legacyFixture[4].items![0], content: "Новая первая секция" }, { ...legacyFixture[4].items![1], title: "Новое имя Б" }] });
  });

  it.each([undefined, null, -1, 8, 1.5, "2"])("does not invent a key for absent/invalid legacy correctIndex=%s", correctIndex => {
    const quiz = { id: "missing-key", type: "quiz", question: "Самопроверка", options: ["A", "B", "C", "D"], explanation: "Источник", ...(correctIndex !== undefined ? { correctIndex } : {}) };
    const original = JSON.stringify([quiz], null, 2);
    const blocks = parseLessonContent(original);
    expect(blocks[0].quizOptions?.every(option => !option.isCorrect)).toBe(true);
    expect(blocksToJson(blocks, original)).toBe(original);
    const edited = [{ ...blocks[0], quizExplanation: "Изменено только пояснение" }];
    expect(parseSaved(blocksToJson(edited, original))[0]).toEqual({ ...quiz, explanation: "Изменено только пояснение" });
  });

  it("retains opaque unknown blocks and properties when another block is edited", () => {
    const opaque = { id: "opaque", type: "future-widget", payload: { x: [1, "two"] }, extra: false };
    const original = JSON.stringify([opaque, legacyFixture[1]], null, 2);
    const blocks = parseLessonContent(original);
    expect(blocksToJson(blocks, original)).toBe(original);
    const result = parseSaved(blocksToJson(blocks.map(block => block.id === "paragraph-1" ? { ...block, content: "Изменение" } : block), original));
    expect(result[0]).toEqual(opaque);
  });

  it("leaves another lesson format opaque rather than inventing block IDs or types", () => {
    const source = JSON.stringify([{ id: "slide-one", title: "Слайд", content: "Текст слайда", extra: { keep: true } }], null, 2);
    const blocks = jsonToBlocks(source);
    expect(blocks).toEqual(JSON.parse(source));
    expect(blocksToJson(blocks, source)).toBe(source);
  });

  it("holds a malformed explicit canonical value instead of overwriting it from legacy text", () => {
    const malformed = JSON.stringify([{ id: "bad", type: "paragraph", content: 7, text: "резерв" }]);
    expect(() => parseLessonContent(malformed)).toThrow("Исходные данные сохранены");
    expect(() => blocksToJson([], malformed)).toThrow("Исходные данные сохранены");
  });

  it("uses the existing object-option boolean key without inventing a top-level index", () => {
    const blocks = parseLessonContent(rawObjectQuiz);
    expect(blocks[0].quizOptions).toEqual(objectQuizFixture.options);
    expect(blocksToJson(blocks, rawObjectQuiz)).toBe(rawObjectQuiz);
    expect(parseSaved(blocksToJson(blocks, rawObjectQuiz))[0]).not.toHaveProperty("correctIndex");
  });

  it("retains object IDs, order, flags and unknown fields across two saves and an option reorder", () => {
    const original = JSON.stringify([legacyFixture[1], objectQuizFixture], null, 2);
    const initial = parseLessonContent(original);
    const first = initial.map(block => block.id === "object-quiz" ? { ...block, quizQuestion: "Первое изменение вопроса", quizOptions: block.quizOptions?.map(option => option.id === "option-c" ? { ...option, text: "Четыре" } : option) } : block);
    const savedFirst = blocksToJson(first, original);
    const second = first.map(block => block.id === "object-quiz" ? { ...block, quizExplanation: "Второе изменение пояснения" } : { ...block, content: "Второй абзац" });
    const savedSecond = blocksToJson(second, savedFirst);
    const expected = { ...objectQuizFixture, question: "Первое изменение вопроса", options: objectQuizFixture.options.map(option => option.id === "option-c" ? { ...option, text: "Четыре" } : option), explanation: "Второе изменение пояснения" };
    expect(parseSaved(savedSecond)[1]).toEqual(expected);
    const third = second.map(block => block.id === "object-quiz" ? { ...block, quizOptions: [...block.quizOptions!].reverse() } : block);
    expect(parseSaved(blocksToJson(third, savedSecond))[1]).toEqual({ ...expected, options: [...expected.options].reverse() });
    expect(parseSaved(blocksToJson(third, savedSecond))[1]).not.toHaveProperty("correctIndex");
  });

  it.each(["none", "multiple", "missing", "nonboolean", "conflicting-index", "empty-text"])("holds ambiguous object-option key=%s while preserving raw source on unrelated edit", kind => {
    const quiz = JSON.parse(JSON.stringify(objectQuizFixture));
    if (kind === "none") quiz.options.forEach((option: { isCorrect: boolean }) => { option.isCorrect = false; });
    if (kind === "multiple") quiz.options[0].isCorrect = true;
    if (kind === "missing") delete quiz.options[0].isCorrect;
    if (kind === "nonboolean") quiz.options[0].isCorrect = "true";
    if (kind === "conflicting-index") quiz.correctIndex = 0;
    if (kind === "empty-text") quiz.options[0].text = "";
    const original = JSON.stringify([quiz], null, 2);
    const blocks = parseLessonContent(original);
    expect(blocks[0].quizOptions).toHaveLength(4);
    expect(blocks[0].quizOptions?.some(option => option.isCorrect)).toBe(false);
    expect(blocksToJson(blocks, original)).toBe(original);
    expect(parseSaved(blocksToJson([{ ...blocks[0], quizExplanation: "Только пояснение" }], original))[0]).toEqual({ ...quiz, explanation: "Только пояснение" });
  });

  it("keeps leading-bracket markdown link bytes on a no-edit save", () => {
    const original = "[Учебная ссылка](/qa)\n";
    expect(blocksToJson(parseLessonContent(original), original)).toBe(original);
  });

  it("keeps plain legacy markdown bytes on a no-edit save", () => {
    const original = "# Заголовок\n\n  Старый абзац\n";
    expect(blocksToJson(parseLessonContent(original), original)).toBe(original);
  });
});
