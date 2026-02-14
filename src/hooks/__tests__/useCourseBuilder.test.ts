import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock dependencies
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ courseId: undefined }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user-id", email: "test@test.com" },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "new-course" }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

vi.mock("@/utils/courseBuilderHelpers", () => ({
  getExternalStorageConfig: vi.fn().mockResolvedValue(null),
  uploadToStorage: vi.fn().mockResolvedValue("https://example.com/file.mp3"),
}));

vi.mock("@/components/course-builder/BlockEditor", () => ({
  htmlToBlocks: vi.fn().mockReturnValue([]),
  blocksToJson: vi.fn().mockReturnValue("[]"),
  jsonToBlocks: vi.fn().mockReturnValue([]),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { useCourseBuilder } from "@/hooks/useCourseBuilder";

describe("useCourseBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with empty state for new course", () => {
    const { result } = renderHook(() => useCourseBuilder());

    expect(result.current.courseTitle).toBe("");
    expect(result.current.courseDescription).toBe("");
    expect(result.current.lessons).toEqual([]);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.isLoading).toBe(false); // no courseId
    expect(result.current.isImporting).toBe(false);
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.showExitDialog).toBe(false);
    expect(result.current.showAIGenerateDialog).toBe(false);
  });

  it("can update course title", () => {
    const { result } = renderHook(() => useCourseBuilder());
    act(() => { result.current.setCourseTitle("Новый курс"); });
    expect(result.current.courseTitle).toBe("Новый курс");
  });

  it("can update course description", () => {
    const { result } = renderHook(() => useCourseBuilder());
    act(() => { result.current.setCourseDescription("Описание курса"); });
    expect(result.current.courseDescription).toBe("Описание курса");
  });

  it("adds a text lesson", () => {
    const { result } = renderHook(() => useCourseBuilder());
    act(() => { result.current.addLesson("text"); });
    expect(result.current.lessons).toHaveLength(1);
    expect(result.current.lessons[0].type).toBe("text");
    expect(result.current.lessons[0].title).toBe("Новый урок");
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it("adds different lesson types", () => {
    const { result } = renderHook(() => useCourseBuilder());
    act(() => { result.current.addLesson("video"); });
    expect(result.current.lessons[0].type).toBe("video");
    act(() => { result.current.addLesson("test"); });
    expect(result.current.lessons[1].type).toBe("test");
    act(() => { result.current.addLesson("audio"); });
    expect(result.current.lessons[2].type).toBe("audio");
    act(() => { result.current.addLesson("slider"); });
    expect(result.current.lessons[3].type).toBe("slider");
    expect(result.current.lessons).toHaveLength(4);
  });

  it("updates a lesson", () => {
    const { result } = renderHook(() => useCourseBuilder());
    act(() => { result.current.addLesson("text"); });
    const lessonId = result.current.lessons[0].id;
    act(() => { result.current.updateLesson(lessonId, { title: "Обновлённый урок" }); });
    expect(result.current.lessons[0].title).toBe("Обновлённый урок");
  });

  it("deletes a lesson", () => {
    const { result } = renderHook(() => useCourseBuilder());
    act(() => { result.current.addLesson("text"); });
    const lessonId = result.current.lessons[0].id;
    act(() => { result.current.deleteLesson(lessonId); });
    expect(result.current.lessons).toHaveLength(0);
  });

  it("toggles lesson expanded state", () => {
    const { result } = renderHook(() => useCourseBuilder());
    act(() => { result.current.addLesson("text"); });
    const lessonId = result.current.lessons[0].id;
    const initialExpanded = result.current.lessons[0].expanded;
    act(() => { result.current.toggleLesson(lessonId); });
    expect(result.current.lessons[0].expanded).toBe(!initialExpanded);
  });

  it("can toggle AI generate dialog", () => {
    const { result } = renderHook(() => useCourseBuilder());
    act(() => { result.current.setShowAIGenerateDialog(true); });
    expect(result.current.showAIGenerateDialog).toBe(true);
    act(() => { result.current.setShowAIGenerateDialog(false); });
    expect(result.current.showAIGenerateDialog).toBe(false);
  });

  it("provides DnD sensors", () => {
    const { result } = renderHook(() => useCourseBuilder());
    expect(result.current.sensors).toBeDefined();
  });
});
