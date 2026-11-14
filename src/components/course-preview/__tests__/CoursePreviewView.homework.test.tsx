import { createRef } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preview = vi.hoisted(() => ({ content: null as string | null, kind:'homework', legacy:false, loading:false, blocks:vi.fn(), lessons:null as any[]|null,go:vi.fn() }));
vi.mock("@/hooks/useCoursePreview", () => ({
  useCoursePreview: () => ({
    course: { id: "course-a", title: "Курс", is_published: false },
    lessons: preview.lessons || [{ id: "homework-a", title: "Самостоятельная работа С1", type: preview.kind }],
    currentLesson: { id: "homework-a", title: "Самостоятельная работа С1", type: preview.kind, content: preview.content },
    legacyEmbeddedMediaAllowed:preview.legacy, lessonContentLoading:preview.loading,
    currentLessonIndex: 0, loading: false, isTransitioning: false,
    testQuestions: [], selectedAnswers: {}, lessonAttachments: {}, courseDocuments: [],
    showDocumentsView: false, previewFile: null, contentRef: createRef(), fromStore: false,
    goToNextLesson: vi.fn(), goToPrevLesson: vi.fn(), goToLesson: preview.go, goToDocumentsView: vi.fn(),
    navigateBack: vi.fn(), navigateToEditor: vi.fn(), fetchTestQuestions: vi.fn(),
  }),
}));
vi.mock("@/components/course-learning/FilePreviewDialog", () => ({ FilePreviewDialog: () => null }));
vi.mock('@/components/course-builder/block-editor',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/components/course-builder/block-editor')>();
 return {...actual,BlockRenderer:(props:any)=>{preview.blocks(props);return <div data-testid="authored-blocks">{props.blocks.map((b:any)=><p key={b.id}>{b.content}</p>)}</div>;}};
});

import { CoursePreviewView } from "../CoursePreviewView";

beforeEach(() => { vi.clearAllMocks();preview.content = null;preview.kind='homework';preview.legacy=false;preview.loading=false;preview.lessons=null; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("homework in read-only course preview", () => {
  it('shows saved module boundaries in the author outline without changing navigation indexes',()=>{
    preview.lessons=[{id:'one',title:'Первый урок',type:'text',module_id:'m1',module_title:'Введение'},{id:'two',title:'Второй урок',type:'text',module_id:'m1',module_title:'Введение'},{id:'three',title:'Третий урок',type:'text',module_id:'m2',module_title:'Практические работы'}];
    render(<MemoryRouter><CoursePreviewView embedded /></MemoryRouter>);
    expect(screen.getAllByRole('heading',{name:'Введение'})).toHaveLength(1);expect(screen.getByRole('heading',{name:'Практические работы'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Третий урок/}));expect(preview.go).toHaveBeenCalledExactlyOnceWith(2);
  });
  it('renders authored practice blocks in preview without creating submission controls',()=>{
    preview.kind='practice';preview.legacy=true;preview.content=JSON.stringify([{id:'instruction',type:'paragraph',content:'Постройте учебную модель'}]);
    const view=render(<MemoryRouter><CoursePreviewView embedded /></MemoryRouter>);
    expect(screen.getByTestId('authored-blocks')).toHaveTextContent('Постройте учебную модель');
    expect(preview.blocks).toHaveBeenCalled();expect(view.container.querySelector('input[type=file],textarea')).toBeNull();
  });
  it('preserves the resource fence while making practice instructions visible',()=>{
    preview.kind='practice';preview.content=JSON.stringify([{id:'instruction',type:'paragraph',content:'Сравните грани модели'},{id:'video',type:'video',content:'https://private.example/raw'}]);
    const view=render(<MemoryRouter><CoursePreviewView embedded /></MemoryRouter>);
    expect(screen.getByText('Сравните грани модели')).toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('точная редакция пока недоступна');
    expect(preview.blocks).not.toHaveBeenCalled();expect(view.container.querySelector('img,iframe,audio,video')).toBeNull();
  });
  it.each([
    "Условия С1\n\nСоставьте письменный план проверки.\n\n1. Укажите источники.\n2. Сохраните границы результата.\n\n[Материал](https://example.test/source)",
    "Составьте письменный план проверки.\n\nСохраните обозначения: (x₂ − x₁) / 2; x < y.\n<a href=\"https://example.test/source\">Материал</a><script>alert('unsafe')</script>",
  ])("renders stored task content and provides no submission or grading controls", (content) => {
    preview.content = content;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
    const view = render(<MemoryRouter><CoursePreviewView embedded /></MemoryRouter>);
    const task = screen.getByRole("region", { name: "Предпросмотр письменного задания" });
    expect(task).toHaveTextContent("Составьте письменный план проверки.");
    expect(within(task).getByRole("document", { name: "Условия задания" }).textContent).toBe(content);
    expect(task.querySelector("script")).toBeNull();
    expect(task).toHaveTextContent("Отправка ответа и просмотр оценки доступны в кабинете слушателя");
    expect(screen.getByRole("button", { name: /Самостоятельная работа С1/ })).toHaveTextContent("Письменное задание");
    expect(within(task).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(task).queryByRole("button")).not.toBeInTheDocument();
    expect(view.container.querySelector('input[type="file"]')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fabricate a task or a submission result when content is unavailable", () => {
    render(<MemoryRouter><CoursePreviewView embedded /></MemoryRouter>);
    const task = screen.getByRole("region", { name: "Предпросмотр письменного задания" });
    expect(task).toHaveTextContent("Содержимое задания недоступно");
    expect(task).not.toHaveTextContent("Выполнено");
    expect(task).not.toHaveTextContent("Ждёт проверки");
  });
});
