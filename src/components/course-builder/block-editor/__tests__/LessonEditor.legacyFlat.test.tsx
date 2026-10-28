import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, within, waitFor } from "@testing-library/react";
import { useLessonEditor } from "@/hooks/useLessonEditor";
import { normalizeLessonsFromDB } from "@/hooks/useCourseBuilderHelpers";
import { QuizBlock } from "../blocks/QuizBlock";
import { AccordionBlock } from "../blocks/TextBlocks";
import { parseLessonContent } from "../parsers";
import { legacyFixture, rawLegacy, objectQuizFixture, rawObjectQuiz } from "./legacyFixture";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn(), upload: vi.fn(), run: vi.fn() }));
vi.mock("@/components/course-builder/block-editor", async () => vi.importActual("@/components/course-builder/block-editor/parsers"));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, functions: { invoke: mocks.invoke } } }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.invoke, safeFetch: mocks.invoke }));
vi.mock("@/utils/courseBuilderHelpers", () => ({ uploadToStorage: mocks.upload }));
vi.mock("@/utils/htmlCourseParser", () => ({ isHtmlContent: () => false, parseHtmlCourse: vi.fn() }));
vi.mock("@/utils/structuredCourseImport", () => ({ isCszStructuredCourseHtml: () => false }));
vi.mock("@/hooks/useExternalStorageWithProgress", () => ({ useExternalStorageWithProgress: () => ({ uploadWithProgress: mocks.upload, abortUpload: vi.fn() }) }));
vi.mock("@/components/course-builder/AIAvatarLessonEditor", () => ({ defaultAIAvatarConfig: {} }));
vi.mock("@/hooks/useBlockAIGenerate", () => ({ useBlockAIGenerate: () => ({ isGenerating: false, run: mocks.run }) }));
vi.mock("@/components/course-builder/RichTextEditor", () => ({ RichTextEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Текст секции" value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const lesson = { id: "synthetic-lesson", title: "Синтетический урок", type: "text", content: rawLegacy, order_index: 0 };
const noQuestions: [] = [];
type SavedLesson = { title: string; type: string; content: string };
const args = (onSave: (data: SavedLesson) => void) => ({ lesson, isOpen: true, existingQuestions: noQuestions, courseId: "synthetic-course", courseTitle: "Синтетический курс", courseDescription: "TEST", onSave });

describe("legacy editor hydration and save", () => {
  it("hydrates actual editor fields and returns exact original bytes on no-edit Save", () => {
    const onSave = vi.fn<(data: SavedLesson) => void>();
    const { result } = renderHook(() => useLessonEditor(args(onSave)));
    expect(result.current.blocks[1].content).toBe("Первый учебный абзац");
    expect(result.current.blocks[5].quizQuestion).toBe("Сколько будет два плюс два?");
    expect(result.current.blocks[5].quizOptions).toHaveLength(4);
    act(() => result.current.handleSave());
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: lesson.title, type: "text", content: rawLegacy }));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("serializes only the intended legacy text edit and retains all other raw objects", () => {
    const onSave = vi.fn<(data: SavedLesson) => void>();
    const { result } = renderHook(() => useLessonEditor(args(onSave)));
    act(() => result.current.setBlocks(previous => previous.map(block => block.id === "paragraph-1" ? { ...block, content: "Исправленный абзац" } : block)));
    act(() => result.current.handleSave());
    const saved = JSON.parse(onSave.mock.calls[0][0].content);
    expect(saved).toEqual(legacyFixture.map(block => block.id === "paragraph-1" ? { ...block, text: "Исправленный абзац" } : block));
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("normalizes database hydration only in memory, with no auto repair/update", () => {
    const rows = [{ ...lesson, metadata: { keep: true } }, { ...lesson, id: "marker", content: JSON.stringify([{ id: "marker-block", type: "paragraph", text: ":::warning Только исходный текст :::" }]) }, { ...lesson, id: "plain", content: "# Старый заголовок\n\nСтарый абзац без JSON" }];
    const before = JSON.stringify(rows);
    const normalized = normalizeLessonsFromDB(rows, {}, {});
    expect(normalized[0].blocks?.[1].content).toBe("Первый учебный абзац");
    expect(normalized[0].content).toBe(rawLegacy);
    expect(normalized[1].content).toBe(rows[1].content);
    expect(normalized[2].content).toBe(rows[2].content);
    expect(JSON.stringify(rows)).toBe(before);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not choose the first option when the author removes the existing correct option", () => {
    const onUpdate = vi.fn();
    render(<QuizBlock block={parseLessonContent(rawObjectQuiz)[0]} onUpdate={onUpdate} />);
    const optionRow = screen.getByPlaceholderText("Вариант 3").parentElement!;
    fireEvent.click(within(optionRow).getByRole("button"));
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ quizOptions: objectQuizFixture.options.filter(option => option.id !== "option-c") });
    expect(onUpdate.mock.calls[0][0].quizOptions.some((option: { isCorrect: boolean }) => option.isCorrect)).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("does not invent a key when an option is removed from an unconfirmed quiz", () => {
    const unknown = JSON.stringify([{ ...objectQuizFixture, options: objectQuizFixture.options.map(option => ({ ...option, isCorrect: false })) }]);
    const onUpdate = vi.fn();
    render(<QuizBlock block={parseLessonContent(unknown)[0]} onUpdate={onUpdate} />);
    fireEvent.click(within(screen.getByPlaceholderText("Вариант 1").parentElement!).getByRole("button"));
    expect(onUpdate.mock.calls[0][0].quizOptions).toHaveLength(3);
    expect(onUpdate.mock.calls[0][0].quizOptions.every((option: { isCorrect: boolean }) => option.isCorrect === false)).toBe(true);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("retains existing object option IDs and creates an ID only for an explicit newly added option", () => {
    const onUpdate = vi.fn();
    render(<QuizBlock block={parseLessonContent(rawObjectQuiz)[0]} onUpdate={onUpdate} />);
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Добавить вариант" }));
    const options = onUpdate.mock.calls[0][0].quizOptions;
    expect(options.slice(0, 4)).toEqual(objectQuizFixture.options);
    expect(options[4]).toMatchObject({ text: "", isCorrect: false });
    expect(typeof options[4].id).toBe("string");
    expect(options[4].id).not.toBe("");
  });

  it("gives only explicitly AI-created replacement options new IDs while keeping read-time side effects absent", async () => {
    const onUpdate = vi.fn();
    mocks.run.mockImplementationOnce(async (callback: () => Promise<unknown>) => callback());
    mocks.invoke.mockResolvedValueOnce({ data: { quiz: { question: "Новый синтетический вопрос", options: ["А", "Б", "В", "Г"], correctIndex: 1, explanation: "Синтетическое пояснение" } }, error: null });
    render(<QuizBlock block={parseLessonContent(rawObjectQuiz)[0]} onUpdate={onUpdate} />);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать с ИИ" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const options = onUpdate.mock.calls[0][0].quizOptions;
    expect(options.map((option: { text: string }) => option.text)).toEqual(["А", "Б", "В", "Г"]);
    expect(options.map((option: { isCorrect: boolean }) => option.isCorrect)).toEqual([false, true, false, false]);
    expect(new Set(options.map((option: { id: string }) => option.id)).size).toBe(4);
    for (const option of options) { expect(typeof option.id).toBe("string"); expect(objectQuizFixture.options.some(old => old.id === option.id)).toBe(false); }
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it("edits two legacy accordion items separately and treats collapse as view state", () => {
    const onUpdate = vi.fn();
    const block = parseLessonContent(rawLegacy)[4];
    const view = render(<AccordionBlock block={block} onUpdate={onUpdate} />);
    const titles = screen.getAllByPlaceholderText("Заголовок секции") as HTMLInputElement[];
    expect(titles.map(input => input.value)).toEqual(["Раздел А", "Раздел Б"]);
    const bodies = screen.getAllByRole("textbox", { name: "Текст секции" }) as HTMLTextAreaElement[];
    expect(bodies.map(input => input.value)).toEqual(["Содержимое раздела А", "Содержимое раздела Б"]);
    fireEvent.change(bodies[0], { target: { value: "Исправлена только секция А" } });
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ accordionItems: [{ ...legacyFixture[4].items![0], content: "Исправлена только секция А" }, legacyFixture[4].items![1]] });
    onUpdate.mockClear();
    const toggle = view.container.querySelector("button");
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
