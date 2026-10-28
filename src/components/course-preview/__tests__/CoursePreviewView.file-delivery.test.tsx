import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ kind: "text", content: "", documents: false, legacy: false, openDocument: vi.fn(), openAttachment: vi.fn(), dialog: vi.fn() }));
vi.mock("@/hooks/useCoursePreview", () => ({ useCoursePreview: () => ({
  course: { id: "course-a", organization_id: "org-a", title: "Курс", is_published: true, allow_materials_download: true },
  lessons: [{ id: "lesson-a", title: "Лекция", type: mocks.kind }], currentLessonIndex: 0,
  currentLesson: mocks.documents ? null : { id: "lesson-a", title: "Лекция", type: mocks.kind, content: mocks.content },
  loading: false, isTransitioning: false, lessonContentLoading: false, lessonContentError: false,
  testQuestions: [], selectedAnswers: {}, setSelectedAnswers: vi.fn(), lessonAttachments: {},
  courseDocuments: [{ id: "target-doc", course_id: "course-a", name: "Программа.pdf", type: "program", file_url: null, allow_download: true }],
  showDocumentsView: mocks.documents, previewFile: null, closePreviewFile: vi.fn(), openCourseDocument: mocks.openDocument,
  openLessonAttachment: mocks.openAttachment, legacyEmbeddedMediaAllowed: mocks.legacy, contentRef: createRef(), fromStore: false,
  goToNextLesson: vi.fn(), goToPrevLesson: vi.fn(), goToLesson: vi.fn(), goToDocumentsView: vi.fn(), navigateBack: vi.fn(), navigateToEditor: vi.fn(), fetchTestQuestions: vi.fn(),
}) }));
vi.mock("@/integrations/supabase/client", () => {
  const forbidden = () => { throw new Error("OWNER_PREVIEW_VIEW_UNIT_DATABASE_CALL_FORBIDDEN"); };
  return { supabase: { from: forbidden, rpc: forbidden, storage: { from: forbidden }, functions: { invoke: forbidden },
    auth: { getSession: forbidden, getUser: forbidden, onAuthStateChange: forbidden } } };
});
vi.mock("@/components/course-learning/FilePreviewDialog", () => ({ FilePreviewDialog: (props: unknown) => { mocks.dialog(props); return null; } }));
import { CoursePreviewView } from "../CoursePreviewView";
beforeEach(() => { vi.clearAllMocks(); mocks.kind = "text"; mocks.content = "Учебный текст"; mocks.documents = false; mocks.legacy = false; });
afterEach(cleanup);

describe("owner file view does not create a raw fallback", () => {
  it("keeps NULL-URL preview/download actions bound to the target row", () => {
    mocks.documents = true;
    const view = render(<CoursePreviewView embedded />);
    fireEvent.click(screen.getByRole("button", { name: "Просмотр: Программа.pdf" }));
    expect(mocks.openDocument).toHaveBeenCalledWith(expect.objectContaining({ id: "target-doc", file_url: null }));
    fireEvent.click(screen.getByRole("button", { name: "Скачать: Программа.pdf" }));
    expect(mocks.openDocument).toHaveBeenLastCalledWith(expect.objectContaining({ id: "target-doc" }), "download");
    expect(view.container.querySelector("[src],a[href],iframe,object")).toBeNull();
  });

  it("preserves text and tables while stripping HTML resource loads and links before mounting", () => {
    mocks.content = JSON.stringify([{ id: "text", type: "paragraph", content: '<p>Важный учебный текст <a href="https://private.example/raw.pdf">источник</a><img src="https://private.example/a.png"><span style="background-image:url(https://private.example/b)">числа</span></p>' },
      { id: "table", type: "table", content: "", tableHasHeader: true, tableCellsHtml: true, tableRows: [["Показатель", "Значение"], ["Строка", '<img src="https://private.example/c">42']] },
      { id: "media", type: "video", content: "", videoUrl: "https://private.example/video.mp4" }]);
    const view = render(<CoursePreviewView embedded />);
    expect(screen.getByText(/Важный учебный текст/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("42");
    expect(screen.getByText(/точная редакция пока недоступна/)).toBeInTheDocument();
    expect(view.container.querySelector("[src],a[href],iframe,object,[style*='url(']")).toBeNull();
  });

  it.each(["video", "audio", "slider"])("holds unbound %s lessons until the server explicitly classifies the course as legacy", type => {
    mocks.kind = type; mocks.content = "https://private.example/material.mp4";
    const view = render(<CoursePreviewView embedded />);
    expect(screen.getByText(/Точная редакция встроенного материала пока недоступна/)).toBeInTheDocument();
    expect(view.container.querySelector("video,audio,iframe,img,[src],a[href]")).toBeNull();
  });
});
