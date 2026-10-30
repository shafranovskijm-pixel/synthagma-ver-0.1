import { forwardRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ kind: "text", content: "", legacy: false, library: false, download: false, image: false, generation: 1, course: "course-a", dialog: vi.fn(), reader: vi.fn(), video: vi.fn(), slider: vi.fn(), blocks: vi.fn(), complete: vi.fn(), submit: vi.fn(), answers: vi.fn(), mobile: false, lessonCount: 1, accessible: [0], completed: [] as number[], current: 0, run: null as { enrollmentId: string; epoch: string } | null, offline: false, admin: false, go: vi.fn(), history: vi.fn() }));
vi.mock("react-router-dom", () => ({ useParams: () => ({ courseId: mocks.course }), useSearchParams: () => [new URLSearchParams(mocks.library ? "view=library" : ""), vi.fn()] }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@/hooks/useSwipeGesture", () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock("@/hooks/usePostpaidLessonActivity", () => ({ usePostpaidLessonActivity: () => {} }));
vi.mock("@/hooks/usePlatformHomeworkTaskProof", () => ({ usePlatformHomeworkTaskProof: () => ({ scope: null, proof: null }) }));
vi.mock("@/hooks/useCourseLearning", () => ({ getOptionText: (value: any) => value.text || String(value), useCourseLearning: () => ({
  user: { id: "actor" }, navigate: vi.fn(), isMobile: mocks.mobile, contentRef: { current: null }, course: { id: mocks.course, organization_id: "actual-course-org", title: "Курс", allow_materials_download: mocks.download, landing_content: { electronic_library: { enabled: true } } },
  lessons: Array.from({ length: mocks.lessonCount }, (_, i) => ({ id: i ? `lesson-${i}` : "lesson", type: mocks.kind, title: i ? `Урок ${i + 1}` : "Урок" })), currentLesson: { id: mocks.current ? `lesson-${mocks.current}` : "lesson", course_id: mocks.course, type: mocks.kind, title: "Урок", content: mocks.content }, currentLessonIndex: mocks.current, lessonProgress: [], loading: false,
  testQuestions: mocks.image ? [{ id: "question", question: "Вопрос", options: ["Ответ"], image_url: "/private/question.png" }] : [], allBankQuestions: [], testAttemptId: "attempt", testSubmitted: false, testScore: null, testPassingScore: 70,
  testExplanations: {}, answers: {}, setAnswers: mocks.answers, submitTest: mocks.submit, testQuestionsLoading: false, testQuestionsError: null,
  ttsSettings: { provider: "none" }, sidebarOpen: false, setSidebarOpen: vi.fn(), setTtsSettingsOpen: vi.fn(), setTtsSettings: vi.fn(),
  isLessonAccessible: (index: number) => mocks.accessible.includes(index), isLessonCompleted: (id: string) => mocks.completed.includes(id === 'lesson' ? 0 : Number(id.split('-')[1])), markLessonComplete: mocks.complete, goToLesson: mocks.go, getLessonIcon: () => "text", lessonButtonRefs: { current: [] },
  lessonAttachments: {}, courseDocuments: [{ id: "stable-document", course_id: mocks.course, organization_id: "actual-course-org", lesson_id: null, module_id: null, reference_kind: "course_document", name: "Программа.pdf", file_url: null, file_type: "pdf", file_size: null, category: "material", visible_to_students: true, allow_download: true }], materialsError: false,
  courseFileDeliveryMode: mocks.legacy ? { state: "legacy", context: { mode: "legacy" } } : { state: "frozen_required", context: { mode: "frozen_required", cohort: null } }, fileEffectiveUserId: "actor", fileViewGeneration: mocks.generation,
  isOfflineMode: mocks.offline, isAdminView: mocks.admin, learningRun: mocks.run, completedCount: 0, progressPercent: 0, chatMessages: [], chatInput: "", chatScrollRef: { current: null }, isChatOpen: false,
}) }));
vi.mock("@/components/course-learning/FilePreviewDialog", () => ({ FilePreviewDialog: (props: unknown) => { mocks.dialog(props); return null; } }));
vi.mock("@/components/course-library/CourseLibraryReader", () => ({ CourseLibraryReader: (props: unknown) => { mocks.reader(props); return <p>Библиотека</p>; } }));
vi.mock("@/components/course-learning/VideoPlayerInline", () => ({ VideoPlayerInline: (props: unknown) => { mocks.video(props); return <video src="/raw-video" />; } }));
vi.mock("@/components/course-learning/SliderLessonViewer", () => ({ SliderLessonViewer: (props: unknown) => { mocks.slider(props); return <iframe src="/raw-slides" title="raw" />; } }));
vi.mock("@/components/course-builder/block-editor", () => ({ BlockRenderer: (props: unknown) => { mocks.blocks(props); return <img src="/raw-block" />; } }));
vi.mock("@/components/course-learning/CourseSidebar", () => ({ CourseSidebarContent: () => null }));
vi.mock("@/components/course-learning/AiChatPanel", () => ({ AiChatPanel: () => null }));
vi.mock("@/components/course-learning/LessonAIAvatar", () => ({ LessonAIAvatar: () => <img src="/raw-avatar" /> }));
vi.mock("@/components/course-learning/HomeworkSubmission", () => ({ HomeworkSubmission: () => null }));
vi.mock("@/components/course-learning/HomeworkTaskDescription", () => ({ HomeworkTaskDescription: () => null, canRenderPlatformHomeworkHtml: () => false }));
vi.mock("@/components/course-learning/TestAttemptStatus", () => ({ TestAttemptStatus: () => null }));
vi.mock("@/components/course-learning/TestAttemptHistory", () => ({ TestAttemptHistory: (props: unknown) => { mocks.history(props); return <p>История прохождений</p>; } }));
vi.mock("@/components/student/VideoIdentification", () => ({ VideoIdentification: () => null }));
vi.mock("@/components/student/TTSSettingsDialog", () => ({ TTSSettingsDialog: () => null, SALUTE_VOICES: [], saveTTSSettings: vi.fn() }));
vi.mock("@/components/ui/SigmaLogo", () => ({ SigmaLogo: () => null }));
vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: forwardRef(({children}: any, ref: any) => <div ref={ref}>{children}</div>) }));
import CourseLearning from "../CourseLearning";
beforeEach(() => { vi.clearAllMocks(); mocks.kind = "text"; mocks.content = "Учебный текст"; mocks.legacy = false; mocks.library = false; mocks.download = false; mocks.image = false; mocks.generation = 1; mocks.course = "course-a"; mocks.mobile = false; mocks.lessonCount = 1; mocks.accessible = [0]; mocks.completed = []; mocks.current = 0; mocks.run = null; mocks.offline = false; mocks.admin = false; });
afterEach(cleanup);
describe("learner file delivery page integration", () => {
  it("disables and marks locked mobile dots even when an old completed badge exists", () => {
    mocks.mobile = true; mocks.lessonCount = 3; mocks.completed = [2];
    render(<CourseLearning />);
    const second = screen.getByRole("button", { name: "Урок 2: Урок 2 — заблокирован" });
    const third = screen.getByRole("button", { name: "Урок 3: Урок 3 — заблокирован" });
    expect(second).toBeDisabled(); expect(third).toBeDisabled(); expect(third.querySelector('.lucide-lock')).not.toBeNull();
    fireEvent.click(second); expect(mocks.go).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Следующий урок" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Урок 1: Урок" })).toBeEnabled();
  });
  it("holds a currently inaccessible lesson body while leaving its read-only course history available", () => {
    mocks.current = 1; mocks.lessonCount = 3; mocks.kind = "video"; mocks.legacy = true; mocks.run = { enrollmentId: "enrollment", epoch: "1" };
    render(<CourseLearning />);
    expect(screen.getByText(/Урок пока недоступен/)).toBeInTheDocument();
    expect(mocks.video).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: /Завершить урок/ })).not.toBeInTheDocument();
    expect(screen.getByText("История прохождений")).toBeInTheDocument();
  });
  it("keeps history scope valid across lesson changes and invalidates it when the run changes", () => {
    mocks.lessonCount = 3; mocks.accessible = [0, 1, 2]; mocks.run = { enrollmentId: "enrollment", epoch: "1" };
    const view = render(<CourseLearning />);
    const first = mocks.history.mock.calls.at(-1)![0] as { isCurrent: () => boolean };
    mocks.current = 1; view.rerender(<CourseLearning />); expect(first.isCurrent()).toBe(true);
    mocks.run = { enrollmentId: "enrollment", epoch: "2" }; view.rerender(<CourseLearning />); expect(first.isCurrent()).toBe(false);
  });
  it("does not offer an active completion button from offline materials without a confirmed run", () => {
    mocks.offline = true;
    render(<CourseLearning />);
    expect(screen.getByRole("button", { name: "Завершить урок" })).toBeDisabled();
    expect(screen.getByText(/Актуальный прогресс не подтверждён/)).toBeInTheDocument();
  });
  it("preserves readable text without mounting resource blocks while mode is frozen", () => {
    mocks.content = JSON.stringify([{ id: "a", type: "paragraph", content: "Учебный текст <img src='/secret'>" }, { id: "d", type: "document", documentUrl: "urn:bound", content: "" }]);
    const view = render(<CourseLearning />); expect(view.container.textContent).toContain("Учебный текст"); expect(view.container.querySelector("[src],[href],iframe")).toBeNull(); expect(mocks.blocks).not.toHaveBeenCalled();
  });
  it.each(["video", "audio", "slider", "ai_avatar"])("holds unsupported %s before mounting and does not auto-complete", kind => {
    mocks.kind = kind; mocks.content = "https://private.example/raw"; const view = render(<CourseLearning />); expect(view.container.querySelector("[src],[href],iframe,audio,video")).toBeNull(); expect(mocks.video).not.toHaveBeenCalled(); expect(mocks.slider).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("keeps the original renderer after an explicit legacy classification", () => {
    mocks.legacy = true; mocks.kind = "video"; mocks.content = "/ordinary"; render(<CourseLearning />); expect(mocks.video).toHaveBeenCalled();
  });
  it("sends exact course org/effective actor to the library reader", () => {
    mocks.library = true; render(<CourseLearning />); expect(mocks.reader).toHaveBeenCalledWith(expect.objectContaining({ courseId: "course-a", organizationId: "actual-course-org", effectiveUserId: "actor" }));
  });
  it("opens NULL-URL target references and respects the explicit course download denial", () => {
    const view = render(<CourseLearning />); fireEvent.click(screen.getByRole("button", { name: /Программа.pdf/ })); expect(mocks.dialog).toHaveBeenLastCalledWith(expect.objectContaining({ reference: expect.objectContaining({ referenceId: "stable-document", legacyUrl: null }), allowDownload: false, effectiveUserId: "actor" }));
    mocks.dialog.mockClear(); mocks.generation++; view.rerender(<CourseLearning />); expect(mocks.dialog).not.toHaveBeenCalled();
  });
  it("does not mount an unbound question image or submit an image-dependent test", () => {
    mocks.kind = "test"; mocks.image = true; const view = render(<CourseLearning />); expect(view.container.querySelector("img")).toBeNull(); expect((screen.getByRole("button", { name: "Отправить ответы" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Ответ")); expect(mocks.answers).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
});
