import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  builder: {} as Record<string, any>, navigate: vi.fn(), save: vi.fn(), current: vi.fn(), committed: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate, useParams: () => ({}) }));
vi.mock("@/hooks/useCourseBuilder", () => ({ useCourseBuilder: () => mocks.builder }));
vi.mock("@/hooks/useCourseReview", () => ({ useCourseReview: () => ({
  isReviewing: false, reviewResult: null, activeFindings: [], dismissedIds: [], appliedIds: [], applyingId: null,
  startReview: vi.fn(), dismissFinding: vi.fn(), dismissAll: vi.fn(), applyFinding: vi.fn(), resetReview: vi.fn(),
}) }));
vi.mock("@/hooks/useCourseSnapshots", () => ({ useCourseSnapshots: () => ({
  snapshots: [], isLoading: false, isCreating: false, isRestoring: false,
  createSnapshot: vi.fn(), restoreSnapshot: vi.fn(), deleteSnapshot: vi.fn(),
}) }));
vi.mock("@/components/course-builder/CourseBuilderLessonsNav", () => ({ CourseBuilderLessonsNav: () => null }));
vi.mock("@/components/course-builder/SortableLessonItem", () => ({ SortableLessonItem: () => null }));
vi.mock("@/components/course-builder/AIGenerateDialog", () => ({ AIGenerateDialog: () => null }));
vi.mock("@/components/course-builder/AIActionsMenu", () => ({ AIActionsMenu: () => null }));
vi.mock("@/components/course-builder/CourseReviewDialog", () => ({ CourseReviewDialog: () => null }));
vi.mock("@/components/course-builder/CourseSnapshotsDialog", () => ({ CourseSnapshotsDialog: () => null }));
vi.mock("@/components/course-builder/CourseGenerationProgress", () => ({ CourseGenerationProgress: () => null }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import CourseBuilder from "../CourseBuilder";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  mocks.current.mockReturnValue(true); mocks.committed.mockReturnValue("confirmed-created-a"); mocks.save.mockResolvedValue(true);
  const callbacks = Object.fromEntries([
    "setCourseTitle", "setCourseDescription", "setShowExitDialog", "setShowAIGenerateDialog", "addLesson", "updateLesson", "deleteLesson", "toggleLesson", "markAsChanged",
    "handleAIGenerate", "handleGenerateStructure", "handleFileImport", "handleSaveAndExit", "handleExitWithoutSave", "handleBackClick", "handleDragEnd",
    "setActiveLessonId", "scrollToLesson", "loadLessonContent", "createModule", "renameModule", "deleteModule", "toggleModuleCollapsed", "collapseAllModules", "expandAllModules",
  ].map(name => [name, vi.fn()]));
  mocks.builder = { ...callbacks, courseTitle: "Synthetic course", courseDescription: "", lessons: [], modules: [], sensors: [],
    isLoading: false, isGenerating: false, isSaving: false, isImporting: false, hasUnsavedChanges: true,
    showExitDialog: false, showAIGenerateDialog: false, courseId: undefined, organizationId: "org-a", scopeError: null,
    lessonContentStatus: {}, draftStatus: "", activeLessonId: null, autoSaveStatus: "idle",
    saveCourse: mocks.save, isCurrentContext: mocks.current, getCommittedCourseId: mocks.committed,
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const preview = () => fireEvent.click(screen.getByRole("button", { name: "Предпросмотр" }));

describe("actual builder preview honors confirmed saves and captured context", () => {
  it("does not navigate or emit success when the save returned false", async () => {
    mocks.save.mockResolvedValue(false); render(<CourseBuilder />);
    await act(async () => { preview(); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(true);
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("uses the confirmed created ID without reading an arbitrary browser pathname", async () => {
    window.history.replaceState({}, "", "/course-builder/unrelated-route"); render(<CourseBuilder />);
    await act(async () => { preview(); });
    expect(mocks.navigate).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/course-preview/confirmed-created-a");
  });

  it("rejects a completion after the captured context changed", async () => {
    const pending = deferred<boolean>(); mocks.save.mockReturnValue(pending.promise); render(<CourseBuilder />);
    act(preview); mocks.current.mockReturnValue(false);
    await act(async () => { pending.resolve(true); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it.each(["unmount", "different ID", "context change", "new unsaved edit"])("rejects the delayed navigation after %s", async transition => {
    const view = render(<CourseBuilder />);
    await act(async () => { preview(); });
    if (transition === "unmount") { mocks.current.mockReturnValue(false); view.unmount(); }
    if (transition === "different ID") mocks.committed.mockReturnValue("created-b");
    if (transition === "context change") mocks.current.mockReturnValue(false);
    if (transition === "new unsaved edit") mocks.committed.mockReturnValue(null);
    act(() => { vi.advanceTimersByTime(100); });
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("opens an unchanged existing course without a redundant save", () => {
    mocks.builder.courseId = "existing-a"; mocks.builder.hasUnsavedChanges = false;
    render(<CourseBuilder />); act(preview);
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/course-preview/existing-a"); expect(mocks.save).not.toHaveBeenCalled();
  });
});
