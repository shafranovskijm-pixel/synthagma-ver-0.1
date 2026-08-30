import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  from: vi.fn(),
  courseInsert: vi.fn(),
  courseUpdate: vi.fn(),
  moduleInsert: vi.fn(),
  lessonInsert: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
  resolveCourseWriteScope: vi.fn(),
  authRole: "organization" as "organization" | "admin",
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ courseId: undefined }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "organization@example.test" },
    userRole: mocks.authRole,
    loading: false,
  }),
}));

vi.mock("@/lib/courseImportScope", () => ({
  resolveCourseWriteScope: mocks.resolveCourseWriteScope,
}));

vi.mock("@/hooks/useAiGenerationLimit", () => ({
  useAiGenerationLimit: () => ({
    checkAndNotify: vi.fn().mockResolvedValue(true),
    increment: vi.fn().mockResolvedValue(undefined),
  }),
  setAiLimitContext: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock("@/hooks/useCourseBuilderHelpers", () => ({
  saveDraftToLocal: mocks.saveDraft,
  loadDraftFromLocal: vi.fn().mockReturnValue(null),
  clearDraftFromLocal: mocks.clearDraft,
  normalizeLessonsFromDB: vi.fn().mockReturnValue([]),
  importFiles: vi.fn().mockResolvedValue(0),
  generateAIContent: vi.fn(),
  createFallbackSlides: vi.fn(),
}));

vi.mock("@/utils/safeInvoke", () => ({
  safeInvoke: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock("@/components/course-builder/block-editor", () => ({
  blocksToJson: vi.fn().mockReturnValue("[]"),
  markdownToBlocks: vi.fn().mockReturnValue([]),
  jsonToBlocks: vi.fn().mockReturnValue([]),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { useCourseBuilder } from "@/hooks/useCourseBuilder";

type PersistedCourse = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  is_published: boolean;
};

const ok = { data: null, error: null };
let persistedCourse: PersistedCourse | null;
let nextCourseNumber: number;

function installSupabaseMock() {
  mocks.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { organization_id: "org-1" },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "organizations") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: { subscription_plan: "free" },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "courses") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: persistedCourse ? { ...persistedCourse } : null,
              error: null,
            }),
          }),
        }),
        insert: mocks.courseInsert,
        update: mocks.courseUpdate,
      };
    }

    if (table === "course_modules") {
      return {
        select: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        }),
        insert: mocks.moduleInsert,
      };
    }

    if (table === "lessons") {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        insert: mocks.lessonInsert,
        upsert: vi.fn().mockResolvedValue(ok),
        update: () => ({ in: vi.fn().mockResolvedValue(ok) }),
        delete: () => ({
          eq: () => ({ not: vi.fn().mockResolvedValue(ok) }),
        }),
      };
    }

    if (table === "test_questions" || table === "lesson_attachments") {
      return {
        upsert: vi.fn().mockResolvedValue(ok),
        delete: () => ({ eq: vi.fn().mockResolvedValue(ok) }),
      };
    }

    throw new Error(`Unexpected Supabase table in publication test: ${table}`);
  });
}

async function renderExistingCourse(isPublished: boolean) {
  persistedCourse = {
    id: "course-1",
    organization_id: "org-1",
    title: "Тестовый курс",
    description: null,
    is_published: isPublished,
  };
  const hook = renderHook(() => useCourseBuilder("course-1"));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  await waitFor(() => expect(hook.result.current.courseTitle).toBe("Тестовый курс"));
  return hook;
}

async function renderNewCourse() {
  persistedCourse = null;
  const hook = renderHook(() => useCourseBuilder());
  await waitFor(() => expect(hook.result.current.organizationId).toBe("org-1"));
  return hook;
}

describe("useCourseBuilder publication safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistedCourse = null;
    nextCourseNumber = 1;
    mocks.authRole = "organization";
    mocks.resolveCourseWriteScope.mockResolvedValue({
      organizationId: "org-1",
      source: "current_organization",
    });
    installSupabaseMock();

    mocks.courseInsert.mockImplementation((payload: Omit<PersistedCourse, "id">) => {
      persistedCourse = {
        id: `new-course-${nextCourseNumber++}`,
        is_published: false,
        ...payload,
      };
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { ...persistedCourse }, error: null }),
        }),
      };
    });
    mocks.courseUpdate.mockImplementation((payload: Partial<PersistedCourse>) => ({
      eq: () => {
        if (persistedCourse) persistedCourse = { ...persistedCourse, ...payload };
        return Promise.resolve(ok);
      },
    }));
    mocks.moduleInsert.mockImplementation((payload: Record<string, unknown>) => ({
      select: () => ({
        single: () => Promise.resolve({
          data: { id: "module-1", ...payload },
          error: null,
        }),
      }),
    }));
    mocks.lessonInsert.mockResolvedValue(ok);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["manual save", false],
    ["silent preview save", true],
  ])("keeps a draft unpublished after %s", async (_label, silent) => {
    const hook = await renderExistingCourse(false);
    act(() => {
      hook.result.current.setCourseDescription("Обновлённое описание");
      hook.result.current.markAsChanged();
    });

    await act(async () => {
      await expect(hook.result.current.saveCourse(silent)).resolves.toBe(true);
    });

    expect(mocks.courseUpdate).toHaveBeenCalledWith({
      title: "Тестовый курс",
      description: "Обновлённое описание",
    });
    expect(persistedCourse?.is_published).toBe(false);
    hook.unmount();
  });

  it("keeps an already published course published when its content is saved", async () => {
    const hook = await renderExistingCourse(true);

    await act(async () => {
      await expect(hook.result.current.saveCourse(false)).resolves.toBe(true);
    });

    expect(mocks.courseUpdate.mock.calls[0][0]).not.toHaveProperty("is_published");
    expect(persistedCourse?.is_published).toBe(true);
    hook.unmount();
  });

  it("uses the verified admin-view organization for a new course and its AI tariff context", async () => {
    mocks.authRole = "admin";
    mocks.resolveCourseWriteScope.mockResolvedValueOnce({
      organizationId: "org-admin-view",
      source: "admin_view",
    });

    const hook = renderHook(() => useCourseBuilder());
    await waitFor(() => expect(hook.result.current.organizationId).toBe("org-admin-view"));
    act(() => hook.result.current.setCourseTitle("Курс клиента"));

    await act(async () => {
      await expect(hook.result.current.saveCourse(true)).resolves.toBe(true);
    });

    expect(mocks.resolveCourseWriteScope).toHaveBeenCalledWith({
      userId: "user-1",
      userRole: "admin",
      requestedOrganizationId: null,
    });
    expect(mocks.courseInsert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: "org-admin-view",
      is_published: false,
    }));
    hook.unmount();
  });

  it("does not expose or update an existing course when its organization mismatches the verified scope", async () => {
    persistedCourse = {
      id: "course-foreign",
      organization_id: "org-foreign",
      title: "Чужой курс",
      description: null,
      is_published: false,
    };
    mocks.authRole = "admin";
    mocks.resolveCourseWriteScope.mockRejectedValueOnce(new Error("Курс открыт для другой организации"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const hook = renderHook(() => useCourseBuilder("course-foreign"));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    expect(mocks.resolveCourseWriteScope).toHaveBeenCalledWith({
      userId: "user-1",
      userRole: "admin",
      requestedOrganizationId: "org-foreign",
    });
    expect(hook.result.current.scopeError).toBe("Курс открыт для другой организации");
    expect(hook.result.current.organizationId).toBeNull();
    expect(hook.result.current.courseTitle).toBe("");
    expect(mocks.courseUpdate).not.toHaveBeenCalled();
    consoleError.mockRestore();
    hook.unmount();
  });

  it("fails closed when the organization scope cannot be confirmed", async () => {
    mocks.resolveCourseWriteScope.mockRejectedValueOnce(new Error("Не удалось подтвердить организацию"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const hook = renderHook(() => useCourseBuilder());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    expect(hook.result.current.scopeError).toBe("Не удалось подтвердить организацию");
    expect(hook.result.current.organizationId).toBeNull();
    expect(mocks.courseInsert).not.toHaveBeenCalled();
    consoleError.mockRestore();
    hook.unmount();
  });

  it("uses the ordinary organization's verified current scope", async () => {
    const hook = await renderNewCourse();

    expect(mocks.resolveCourseWriteScope).toHaveBeenCalledWith({
      userId: "user-1",
      userRole: "organization",
      requestedOrganizationId: null,
    });
    expect(hook.result.current.scopeError).toBeNull();
    expect(hook.result.current.organizationId).toBe("org-1");
    hook.unmount();
  });

  it("keeps a draft unpublished when the debounced autosave runs", async () => {
    const hook = await renderExistingCourse(false);
    vi.useFakeTimers();
    act(() => {
      hook.result.current.setCourseDescription("Автосохранение");
      hook.result.current.markAsChanged();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });

    expect(mocks.courseUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.courseUpdate.mock.calls[0][0]).not.toHaveProperty("is_published");
    expect(persistedCourse?.is_published).toBe(false);
    hook.unmount();
  });

  it.each(["full save", "module bootstrap", "single lesson save"])(
    "creates a fail-closed draft through the %s path",
    async (path) => {
      const hook = await renderNewCourse();

      if (path === "full save") {
        act(() => hook.result.current.setCourseTitle("Новый курс"));
        await act(async () => {
          await expect(hook.result.current.saveCourse(true)).resolves.toBe(true);
        });
      } else if (path === "module bootstrap") {
        await act(async () => {
          await hook.result.current.createModule();
        });
      } else {
        await act(async () => {
          await hook.result.current.saveSingleLesson({
            id: "lesson-1",
            title: "Первый урок",
            type: "text",
            content: "",
            expanded: false,
            module_id: null,
          }, 0);
        });
      }

      expect(mocks.courseInsert).toHaveBeenCalledTimes(1);
      expect(mocks.courseInsert.mock.calls[0][0]).toEqual(expect.objectContaining({
        organization_id: "org-1",
        is_published: false,
      }));
      expect(persistedCourse?.is_published).toBe(false);
      hook.unmount();
    },
  );
});
