import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BlockRenderer } from "../BlockRenderer";
import { parseLessonContent } from "../parsers";
import type { ContentBlock } from "../types";
import { rawLegacy, objectQuizFixture, rawObjectQuiz } from "./legacyFixture";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@/mobile/NativeWebMaterial", () => ({ NativeWebMaterial: () => null }));
vi.mock("@/components/course-builder/LazyMediaPreview", () => ({ LazyMediaPreview: () => null }));
vi.mock("@/components/course-builder/VideoPreviewInline", () => ({ VideoPreviewInline: () => null }));
vi.mock("../FormulaRender", () => ({ FormulaRender: () => null }));
vi.mock("@/utils/proxyFetch", () => ({ proxiedAssetUrl: (url: string) => url }));
afterEach(cleanup);

describe("actual legacy block renderer", () => {
  it("renders legacy text/images/headings and all four quiz options without the undefined.split crash", () => {
    render(<BlockRenderer blocks={parseLessonContent(rawLegacy)} />);
    expect(screen.getByText("Первый учебный абзац")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Учебный раздел", level: 2 })).toBeTruthy();
    expect(screen.getByAltText("Учебная схема").getAttribute("src")).toBe("/qa-synthetic.png");
    for (const option of ["1", "2", "4", "8"]) expect(screen.getByRole("button", { name: option })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
    expect(screen.getByText(/Правильно! Два плюс два/)).toBeTruthy();
  });

  it("keeps both legacy accordion sections independently available", () => {
    render(<BlockRenderer blocks={parseLessonContent(rawLegacy)} />);
    fireEvent.click(screen.getByRole("button", { name: "Раздел А" }));
    expect(screen.getByText("Содержимое раздела А")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Раздел Б" }));
    expect(screen.getByText("Содержимое раздела Б")).toBeTruthy();
    expect(screen.getByText("Содержимое раздела А")).toBeTruthy();
  });

  it.each([undefined, null, -1, 9, 1.5, "2"])("holds checking for unconfirmed legacy correctIndex=%s without marking every answer wrong", correctIndex => {
    const original = JSON.stringify([{ id: "unknown", type: "quiz", question: "Синтетическая самопроверка", options: ["А", "Б", "В", "Г"], ...(correctIndex !== undefined ? { correctIndex } : {}) }]);
    render(<BlockRenderer blocks={parseLessonContent(original)} />);
    expect(screen.getByText("Ответ для этой самопроверки пока не подтверждён")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Б" }));
    const check = screen.getByRole("button", { name: "Проверить" });
    expect(check.hasAttribute("disabled")).toBe(true);
    fireEvent.click(check);
    expect(screen.queryByText(/Неправильно/)).toBeNull();
    expect(screen.queryByText(/Правильно!/)).toBeNull();
  });

  it("keeps a modern quiz with exactly one correct option working", () => {
    render(<BlockRenderer blocks={[{ id: "modern", type: "quiz", content: "", quizQuestion: "Синтетический вопрос", quizOptions: [{ text: "Да", isCorrect: true }, { text: "Нет", isCorrect: false }], quizExplanation: "Синтетическое пояснение" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Да" }));
    expect(screen.getByRole("button", { name: "Проверить" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
    expect(screen.getByText(/Правильно! Синтетическое пояснение/)).toBeTruthy();
    expect(screen.queryByText("Ответ для этой самопроверки пока не подтверждён")).toBeNull();
  });

  it("renders all four existing object options and checks their explicit boolean key without a top-level index", () => {
    render(<BlockRenderer blocks={parseLessonContent(rawObjectQuiz)} />);
    for (const option of objectQuizFixture.options) expect(screen.getByRole("button", { name: option.text })).toBeTruthy();
    expect(screen.queryByText("Ответ для этой самопроверки пока не подтверждён")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(screen.getByRole("button", { name: "Проверить" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
    expect(screen.getByText(/Правильно! Два плюс два/)).toBeTruthy();
  });

  it("still displays object choices when a conflicting second key requires unconfirmed checking", () => {
    const raw = JSON.stringify([{ ...objectQuizFixture, correctIndex: 0 }]);
    render(<BlockRenderer blocks={parseLessonContent(raw)} />);
    for (const option of objectQuizFixture.options) expect(screen.getByRole("button", { name: option.text })).toBeTruthy();
    expect(screen.getByText("Ответ для этой самопроверки пока не подтверждён")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(screen.getByRole("button", { name: "Проверить" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText(/Неправильно/)).toBeNull();
  });

  it("does not throw if a direct renderer caller has no content string", () => {
    const missing = { id: "missing", type: "paragraph" } as ContentBlock;
    expect(() => render(<BlockRenderer blocks={[missing]} />)).not.toThrow();
  });
});
