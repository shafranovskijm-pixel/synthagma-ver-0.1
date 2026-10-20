import type { ComponentProps, ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson, LessonType } from "../LessonTypeConfig";
import type { ContentBlock } from "../block-editor/types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), blockEditor: vi.fn(), replacement: vi.fn(),
  speak: vi.fn(), changeVoice: vi.fn(), stopTTS: vi.fn(), stopSpeech: vi.fn(),
  generate: vi.fn(), videoUpload: vi.fn(), kinescopeUpload: vi.fn(), cancelUpload: vi.fn(), upload: vi.fn(),
}));

// Keep the real lesson component and ordinary UI primitives. External media,
// speech and generation services, and their child editors, are inert witnesses.
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@dnd-kit/sortable", () => ({ useSortable: () => ({
  attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false,
}) }));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ limits: { kinescopeEnabled: false } }) }));
vi.mock("@/hooks/useLessonTTS", () => ({ useLessonTTS: () => ({
  saluteVoice: "synthetic-voice", isSaluteSpeaking: false, isSaluteLoading: false,
  handleSaluteTTS: mocks.speak, handleVoiceChange: mocks.changeVoice, stopSaluteTTS: mocks.stopTTS,
  SALUTE_VOICES: [{ id: "synthetic-voice", name: "Тестовый голос" }],
}) }));
vi.mock("@/hooks/useLessonMedia", () => ({ useLessonMedia: () => ({
  handleStopSpeech: mocks.stopSpeech, handleGenerateContent: mocks.generate, isGeneratingContent: false,
  handleVideoUpload: mocks.videoUpload, handleKinescopeUpload: mocks.kinescopeUpload, cancelVideoUpload: mocks.cancelUpload,
  kinescopeUploadProgress: null, compressionProgress: null, videoUploadProgress: null,
  uploadStartTime: null, uploadedBytes: 0, uploadFileSize: 0,
  videoInputRef: { current: null }, kinescopeInputRef: { current: null },
}) }));
vi.mock("@/utils/courseBuilderHelpers", () => ({ uploadToStorage: mocks.upload }));
vi.mock("sonner", () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/course-builder/block-editor/parsers", () => ({ blocksToJson: (blocks: unknown) => JSON.stringify(blocks) }));
vi.mock("@/components/course-builder/block-editor/BlockEditorMain", () => ({
  BlockEditor: (props: { blocks: ContentBlock[]; onChange: (blocks: ContentBlock[]) => void; readOnly?: boolean }) => {
    mocks.blockEditor(props);
    return <div data-testid="block-editor" data-block-count={props.blocks.length} data-read-only={String(!!props.readOnly)}>
      {!props.readOnly && <button onClick={() => props.onChange([{ id: "edited-block", type: "paragraph", content: "Edited locally" }])}>Изменить тестовый блок</button>}
    </div>;
  },
}));
vi.mock("@/components/course-builder/ReplaceTextLessonContent", () => ({
  ReplaceTextLessonContent: (props: unknown) => { mocks.replacement(props); return <button data-testid="replace-content">Заменить содержание из MD/HTML</button>; },
}));
vi.mock("@/components/course-builder/TestQuestionEditor", () => ({ TestQuestionEditor: () => <div data-testid="test-editor" /> }));
vi.mock("@/components/course-builder/SliderLessonEditor", () => ({ SliderLessonEditor: () => <div data-testid="slider-editor" /> }));
vi.mock("@/components/course-builder/MediaLibraryDialog", () => ({ MediaLibraryDialog: () => <div data-testid="media-library" /> }));
vi.mock("@/components/course-builder/VideoPreviewInline", () => ({ VideoPreviewInline: () => <div data-testid="video-preview" /> }));
vi.mock("@/components/video/HlsVideoPlayer", () => ({ HlsVideoPlayer: () => <div data-testid="hls-player" /> }));
vi.mock("@/components/course-builder/LazyMediaPreview", () => ({ LazyMediaPreview: ({ children }: { children?: ReactNode }) => <div data-testid="lazy-media">{children}</div> }));
vi.mock("@/components/course-builder/UploadProgressBlock", () => ({ UploadProgressBlock: () => <div data-testid="upload-progress" /> }));
vi.mock("@/components/course-builder/TestImportDialog", () => ({ TestImportDialog: ({ children }: { children?: ReactNode }) => <div data-testid="test-import">{children}</div> }));
vi.mock("@/components/course-builder/TestAnswersDialog", () => ({ TestAnswersDialog: ({ children }: { children?: ReactNode }) => <div data-testid="test-answers">{children}</div> }));

import { SortableLessonItem } from "../SortableLessonItem";

const lesson = (changes: Partial<Lesson> = {}): Lesson => ({
  id: "lesson-a", type: "text", title: "Существующий урок", content: "", expanded: true, __contentLoaded: false, ...changes,
});
function props(changes: Partial<ComponentProps<typeof SortableLessonItem>> = {}) {
  return {
    lesson: lesson(), index: 0, courseId: "course-a", courseTitle: "Synthetic course", courseDescription: "Description",
    organizationId: "org-a", onToggle: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(),
    contentStatus: "loading" as const, onRetryContent: vi.fn(), ...changes,
  };
}
function expectNoContentActions(container: HTMLElement) {
  for (const id of ["block-editor", "replace-content", "test-editor", "slider-editor", "media-library", "video-preview", "hls-player", "lazy-media", "upload-progress", "test-import", "test-answers"]) {
    expect(screen.queryByTestId(id)).toBeNull();
  }
  expect(screen.queryByRole("button", { name: /Озвучить|Написать с AI|Сгенерировать вопросы с AI|Ответы через AI|Выбрать файл|Из загруженных/ })).toBeNull();
  expect(container.querySelector('input[type="file"], audio, video, iframe, img, [contenteditable="true"]')).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1); // Header title remains editable.
  expect(mocks.blockEditor).not.toHaveBeenCalled();
  expect(mocks.replacement).not.toHaveBeenCalled();
  expect(mocks.speak).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.videoUpload).not.toHaveBeenCalled();
  expect(mocks.kinescopeUpload).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("unknown lesson content cannot mount editors or content actions", () => {
  it.each(["text", "lesson", "practice", "video", "audio", "image", "test", "slider", "feedback", "homework", "ai_avatar"] satisfies LessonType[])(
    "shows a loading status and protects all content controls for %s",
    type => {
      const original = lesson({ type, content: "Synthetic unknown content must stay hidden" });
      const input = props({ lesson: original });
      const { container } = render(<SortableLessonItem {...input} />);
      expect(screen.getByRole("status")).toHaveTextContent("Загрузка содержимого урока");
      expect(screen.queryByText("Synthetic unknown content must stay hidden")).toBeNull();
      expect(screen.queryByRole("button", { name: "Повторить загрузку" })).toBeNull();
      expectNoContentActions(container);
      expect(input.onUpdate).not.toHaveBeenCalled();
      expect(original.__contentLoaded).toBe(false);
      expect(original.content).toBe("Synthetic unknown content must stay hidden");
    },
  );

  it("keeps the same safe loading state before the first content request has a status", () => {
    const { container } = render(<SortableLessonItem {...props({ contentStatus: undefined })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Загрузка содержимого урока");
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).toBeNull();
    expectNoContentActions(container);
  });

  it.each([
    ["error", "Не удалось загрузить содержимое урока. Исходные данные не изменены."],
    ["missing", "Урок не найден или больше недоступен. Содержимое не заменено пустым."],
    ["conflict", "Урок изменился во время загрузки. Текущее содержимое сохранено."],
  ] as const)("keeps editors closed after %s and retries only through the explicit callback", (contentStatus, message) => {
    const input = props({ contentStatus });
    const { container } = render(<SortableLessonItem {...input} />);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expectNoContentActions(container);
    expect(input.onRetryContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(input.onRetryContent).toHaveBeenCalledTimes(1);
    expect(input.onUpdate).not.toHaveBeenCalled();
    expect(input.onToggle).not.toHaveBeenCalled();
  });

  it("preserves the title, delete and expand controls while content is pending", () => {
    const input = props();
    const { container } = render(<SortableLessonItem {...input} />);
    const card = container.querySelector('[data-lesson-id="lesson-a"]')!;
    const header = card.firstElementChild as HTMLElement;
    expect(card).toHaveClass("border", "border-border", "rounded-xl", "overflow-hidden", "bg-card", "scroll-mt-24");
    expect(header).toHaveClass("flex", "items-center", "gap-3", "p-4", "cursor-pointer");
    fireEvent.change(within(header).getByRole("textbox"), { target: { value: "Уточнённое название" } });
    expect(input.onUpdate).toHaveBeenCalledExactlyOnceWith({ title: "Уточнённое название" });
    expect(input.onToggle).not.toHaveBeenCalled();
    fireEvent.click(within(header).getByRole("button"));
    expect(input.onDelete).toHaveBeenCalledTimes(1);
    expect(input.onToggle).not.toHaveBeenCalled();
    fireEvent.click(header);
    expect(input.onToggle).toHaveBeenCalledTimes(1);
    expectNoContentActions(container);
  });

  it("does not mount the pending panel or any editor for a collapsed lesson", () => {
    const input = props({ lesson: lesson({ expanded: false }) });
    const { container } = render(<SortableLessonItem {...input} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expectNoContentActions(container);
  });
});

describe("confirmed empty or locally created content remains editable", () => {
  it.each([true, undefined])("mounts the editor for a legitimate empty lesson with loaded flag %s", loaded => {
    const input = props({ lesson: lesson({ content: "", blocks: undefined, __contentLoaded: loaded }), contentStatus: undefined });
    render(<SortableLessonItem {...input} />);
    expect(screen.getByTestId("block-editor")).toHaveAttribute("data-block-count", "0");
    expect(screen.getByTestId("block-editor")).toHaveAttribute("data-read-only", "false");
    expect(screen.getByRole("button", { name: "Заменить содержание из MD/HTML" })).toBeInTheDocument();
    expect(screen.queryByText("Загрузка содержимого урока…")).toBeNull();
    expect(input.onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Озвучить" }));
    expect(mocks.speak).toHaveBeenCalledExactlyOnceWith([]);
    fireEvent.click(screen.getByRole("button", { name: "Изменить тестовый блок" }));
    const blocks: ContentBlock[] = [{ id: "edited-block", type: "paragraph", content: "Edited locally" }];
    expect(input.onUpdate).toHaveBeenCalledExactlyOnceWith({ blocks, content: JSON.stringify(blocks) });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("opens an editor only after rerender receives confirmed content", () => {
    const input = props();
    const view = render(<SortableLessonItem {...input} />);
    expectNoContentActions(view.container);
    const blocks: ContentBlock[] = [{ id: "loaded-block", type: "paragraph", content: "Server content" }];
    view.rerender(<SortableLessonItem {...input} lesson={lesson({ __contentLoaded: true, blocks, content: JSON.stringify(blocks) })} contentStatus={undefined} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("block-editor")).toHaveAttribute("data-block-count", "1");
    expect(mocks.blockEditor.mock.calls[mocks.blockEditor.mock.calls.length - 1]?.[0].blocks).toEqual(blocks);
    expect(input.onUpdate).not.toHaveBeenCalled();
  });

  it("keeps a confirmed editor available with the late-load conflict notice", () => {
    const blocks: ContentBlock[] = [{ id: "current-block", type: "paragraph", content: "Newer local content" }];
    const input = props({ lesson: lesson({ __contentLoaded: true, blocks, content: JSON.stringify(blocks) }), contentStatus: "conflict" });
    render(<SortableLessonItem {...input} />);
    expect(screen.getByRole("status")).toHaveTextContent("Поздняя загрузка не заменила текущее содержимое урока.");
    expect(screen.getByTestId("block-editor")).toHaveAttribute("data-block-count", "1");
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).toBeNull();
    expect(input.onUpdate).not.toHaveBeenCalled();
  });
});
