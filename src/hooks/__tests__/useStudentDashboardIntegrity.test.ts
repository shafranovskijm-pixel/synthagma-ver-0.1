import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const harness = vi.hoisted(() => ({
  currentUserId: "student-1",
  snapshotResult: {
    data: undefined as unknown,
    error: null as Error | null,
    refetch: vi.fn().mockResolvedValue({ data: undefined, error: null }),
    isFetching: false,
  },
  tableResults: {} as Record<string, { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>>,
  cachedDashboard: null as null | Record<string, unknown>,
  pullToRefreshHandler: null as null | (() => Promise<void>),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: harness.currentUserId, email: "student@example.test" }, signOut: vi.fn() }),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: ({ onRefresh }: { onRefresh: () => Promise<void> }) => {
    harness.pullToRefreshHandler = onRefresh;
    return { ref: { current: null }, pullDistance: 0, isRefreshing: false, canRefresh: false };
  },
}));

vi.mock("@/hooks/useStudentDashboardSnapshot", () => ({
  useStudentDashboardSnapshot: () => harness.snapshotResult,
}));

vi.mock("@/utils/courseCache", () => ({
  cacheDashboardData: vi.fn().mockResolvedValue(undefined),
  getCachedDashboardData: vi.fn(async () => harness.cachedDashboard),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = (table: string) => {
    const result = () => harness.tableResults[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["select", "eq", "in", "is", "order", "limit", "update", "insert", "delete"]) {
      builder[method] = vi.fn(chain);
    }
    builder.maybeSingle = vi.fn(async () => result());
    builder.single = vi.fn(async () => result());
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return builder;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => makeBuilder(table)),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});

import { useStudentDashboard } from "@/hooks/useStudentDashboard";

const cachedCourse = {
  id: "cached-course",
  title: "Последний сохранённый курс",
  description: null,
  duration: null,
  progress: 40,
  totalLessons: 5,
  completedLessons: 2,
  status: "in_progress",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe("useStudentDashboard — целостность при ошибках загрузки", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    harness.currentUserId = "student-1";
    harness.snapshotResult.data = undefined;
    harness.snapshotResult.error = new Error("snapshot unavailable");
    harness.snapshotResult.isFetching = false;
    harness.snapshotResult.refetch = vi.fn().mockResolvedValue({ data: undefined, error: new Error("snapshot unavailable") });
    harness.tableResults = {
      profiles: { data: null, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: null, error: new Error("enrollments unavailable") },
    };
    harness.cachedDashboard = null;
    harness.pullToRefreshHandler = null;
  });

  it("не превращает ошибку snapshot + enrollments в ложные 0 курсов и отдаёт повторяемую ошибку", async () => {
    const { result } = renderHook(() => useStudentDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dashboardLoadError).toMatchObject({ usingCachedData: false });
    expect(result.current.hasDashboardData).toBe(false);
    expect(result.current.retryDashboardLoad).toEqual(expect.any(Function));
  });

  it.each(["profiles", "labor_safety_profiles"])(
    "не считает пустой dashboard успешно загруженным при ошибке %s",
    async (failedTable) => {
      harness.tableResults = {
        profiles: { data: null, error: failedTable === "profiles" ? new Error("profile unavailable") : null },
        labor_safety_profiles: { data: null, error: failedTable === "labor_safety_profiles" ? new Error("labor unavailable") : null },
        enrollments: { data: [], error: null },
      };

      const { result } = renderHook(() => useStudentDashboard());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.dashboardLoadError).toMatchObject({ usingCachedData: false });
      expect(result.current.hasDashboardData).toBe(false);
      expect(result.current.courses).toEqual([]);
    },
  );

  it.each([
    ["courses", "catalog unavailable"],
    ["course_categories", "categories unavailable"],
    ["enrollment_requests", "requests unavailable"],
    ["student_identity_documents", "identity unavailable"],
    ["video_identifications", "video unavailable"],
  ])("показывает явную partial-error при ошибке %s", async (failedTable, message) => {
    harness.tableResults = {
      profiles: {
        data: {
          full_name: "Ученик",
          organization_id: "org-1",
          organizations: { name: "Организация", branding: null, student_dashboard_settings: null, subscription_plan: "free" },
        },
        error: null,
      },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: { data: [], error: failedTable === "courses" ? new Error(message) : null },
      course_categories: { data: [], error: failedTable === "course_categories" ? new Error(message) : null },
      enrollment_requests: { data: [], error: failedTable === "enrollment_requests" ? new Error(message) : null },
      lessons: { data: [], error: null },
      student_identity_documents: { data: [], error: failedTable === "student_identity_documents" ? new Error(message) : null },
      video_identifications: { data: null, error: failedTable === "video_identifications" ? new Error(message) : null },
    };

    const { result } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dashboardLoadError).not.toBeNull();
  });

  it.each(["lessons", "lesson_progress"])(
    "показывает явную partial-error при ошибке %s для назначенного курса",
    async (failedTable) => {
      harness.tableResults = {
        profiles: { data: { full_name: "Ученик", organization_id: null, organizations: null }, error: null },
        labor_safety_profiles: { data: null, error: null },
        enrollments: {
          data: [{
            id: "enrollment-1", progress: 20, status: "active", time_spent: 5, course_id: "course-1",
            courses: { id: "course-1", title: "Курс", description: null, duration: null, skip_video_identification: true, cover_image_url: null, landing_content: null },
          }],
          error: null,
        },
        lessons: {
          data: failedTable === "lesson_progress" ? [{ id: "lesson-1", course_id: "course-1" }] : null,
          error: failedTable === "lessons" ? new Error("lessons unavailable") : null,
        },
        lesson_progress: {
          data: null,
          error: failedTable === "lesson_progress" ? new Error("progress unavailable") : null,
        },
      };

      const { result } = renderHook(() => useStudentDashboard());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.dashboardLoadError).not.toBeNull();
    },
  );

  it("дедуплицирует синхронный двойной retry", async () => {
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик", organization_id: null, onboarding_completed: true },
      org: null,
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик", organization_id: null, organizations: null }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
    };
    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const refetch = deferred<{ data: unknown; error: unknown }>();
    harness.snapshotResult.refetch = vi.fn(() => refetch.promise);
    rerender();
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.retryDashboardLoad();
      second = result.current.retryDashboardLoad();
    });
    expect(harness.snapshotResult.refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      refetch.resolve({ data: harness.snapshotResult.data, error: null });
      await Promise.all([first, second]);
    });
  });

  it("pending retry A не блокирует retry B и не очищает его состояние после позднего завершения", async () => {
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик A", organization_id: null, onboarding_completed: true },
      org: null,
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик A", organization_id: null, organizations: null }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
    };
    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.profile?.full_name).toBe("Ученик A"));

    const refetchA = deferred<{ data: unknown; error: unknown }>();
    harness.snapshotResult.refetch = vi.fn(() => refetchA.promise);
    rerender();
    let retryA!: Promise<void>;
    act(() => { retryA = result.current.retryDashboardLoad(); });

    harness.currentUserId = "student-2";
    harness.snapshotResult.data = {
      profile: { user_id: "student-2", full_name: "Ученик B", organization_id: null, onboarding_completed: true },
      org: null,
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    const refetchB = vi.fn().mockResolvedValue({ data: harness.snapshotResult.data, error: null });
    harness.snapshotResult.refetch = refetchB;
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик B", organization_id: null, organizations: null }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
    };
    rerender();
    await waitFor(() => expect(result.current.profile?.full_name).toBe("Ученик B"));

    await act(async () => { await result.current.retryDashboardLoad(); });
    expect(refetchB).toHaveBeenCalledTimes(1);
    expect(result.current.isRetryingDashboard).toBe(false);

    await act(async () => {
      refetchA.resolve({ data: undefined, error: new Error("late A") });
      await retryA;
    });
    expect(result.current.profile?.full_name).toBe("Ученик B");
    expect(result.current.isRetryingDashboard).toBe(false);
  });

  it("показывает явную ошибку, но сохраняет последний корректный кеш", async () => {
    harness.cachedDashboard = {
      courses: [cachedCourse],
      profile: { full_name: "Ученик", organization_name: "УЦ", organization_id: "org-1" },
      totalTimeSpent: 20,
      totalCompletedLessons: 2,
    };
    const { result } = renderHook(() => useStudentDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.courses).toEqual([cachedCourse]);
    expect(result.current.dashboardLoadError).toMatchObject({ usingCachedData: true });
    expect(result.current.hasDashboardData).toBe(true);

    await act(async () => { await result.current.retryDashboardLoad(); });
    expect(harness.snapshotResult.refetch).toHaveBeenCalled();
    expect(result.current.courses).toEqual([cachedCourse]);
  });

  it("не показывает данные ученика A после переключения effective uid на ученика B", async () => {
    harness.snapshotResult.error = null;
    harness.tableResults.enrollments = {
      data: [{
        id: "enrollment-a",
        progress: 40,
        status: "active",
        time_spent: 20,
        course_id: "course-a",
        courses: {
          id: "course-a",
          title: "Курс ученика A",
          description: null,
          duration: null,
          skip_video_identification: true,
          cover_image_url: null,
          landing_content: null,
        },
      }],
      error: null,
    };
    harness.tableResults.lessons = { data: [], error: null };
    harness.tableResults.lesson_progress = { data: [], error: null };

    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.courses.map(course => course.id)).toEqual(["course-a"]));

    harness.currentUserId = "student-2";
    harness.snapshotResult.error = new Error("snapshot unavailable for B");
    // React Query может сохранить предыдущий data при ошибке refetch. Такой
    // snapshot ученика A нельзя применять под новым query/effective uid B.
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик A", organization_id: "org-a", onboarding_completed: true },
      org: null,
      enrollments: [{
        id: "enrollment-a",
        course_id: "course-a",
        progress: 40,
        status: "active",
        time_spent: 20,
        expires_at: null,
        title: "Курс ученика A",
        description: null,
        duration: null,
        skip_video_identification: true,
        total_lessons: 0,
        completed_lessons: 0,
        cover_image_url: null,
      }],
      documents: { has_passport: false, has_snils: false, has_education: false },
      video_identified: false,
    };
    harness.tableResults.enrollments = { data: null, error: new Error("enrollments unavailable for B") };
    harness.cachedDashboard = null;
    rerender();

    await waitFor(() => expect(result.current.dashboardLoadError).toMatchObject({ usingCachedData: false }));
    expect(result.current.courses).toEqual([]);
    expect(result.current.hasDashboardData).toBe(false);
  });

  it("игнорирует запоздалый ответ A, если B уже стал активным и загрузился", async () => {
    harness.snapshotResult.error = null;
    const enrollmentsA = deferred<{ data: unknown; error: unknown }>();
    harness.tableResults = {
      profiles: {
        data: { full_name: "Ученик A", organization_id: null, organizations: null },
        error: null,
      },
      labor_safety_profiles: { data: null, error: null },
      enrollments: enrollmentsA.promise,
      lessons: { data: [], error: null },
      lesson_progress: { data: [], error: null },
    };

    const { result, rerender } = renderHook(() => useStudentDashboard());

    harness.currentUserId = "student-2";
    harness.tableResults = {
      profiles: {
        data: { full_name: "Ученик B", organization_id: null, organizations: null },
        error: null,
      },
      labor_safety_profiles: { data: null, error: null },
      enrollments: {
        data: [{
          id: "enrollment-b",
          progress: 20,
          status: "active",
          time_spent: 5,
          course_id: "course-b",
          courses: {
            id: "course-b",
            title: "Курс ученика B",
            description: null,
            duration: null,
            skip_video_identification: true,
            cover_image_url: null,
            landing_content: null,
          },
        }],
        error: null,
      },
      lessons: { data: [], error: null },
      lesson_progress: { data: [], error: null },
    };
    rerender();

    await waitFor(() => expect(result.current.courses.map(course => course.id)).toEqual(["course-b"]));
    expect(result.current.profile?.full_name).toBe("Ученик B");

    await act(async () => {
      enrollmentsA.resolve({
        data: [{
          id: "enrollment-a",
          progress: 100,
          status: "completed",
          time_spent: 100,
          course_id: "course-a",
          courses: {
            id: "course-a",
            title: "Курс ученика A",
            description: null,
            duration: null,
            skip_video_identification: true,
            cover_image_url: null,
            landing_content: null,
          },
        }],
        error: null,
      });
      await enrollmentsA.promise;
      await Promise.resolve();
    });

    expect(result.current.courses.map(course => course.id)).toEqual(["course-b"]);
    expect(result.current.profile?.full_name).toBe("Ученик B");
  });

  it("не наследует профиль, организацию, брендинг и тариф A, если snapshot B не содержит организацию", async () => {
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик A", organization_id: "org-a", onboarding_completed: true },
      org: {
        name: "Организация A",
        description: "Описание A",
        branding: {
          coverUrl: "cover-a",
          primaryColor: "#111111",
          secondaryColor: "#222222",
          logoUrl: "logo-a",
          showOrgName: true,
        },
        student_dashboard_settings: {
          showLibrary: false,
          showAchievements: false,
          showAiChat: false,
          showRadio: true,
          showAnnouncements: true,
          catalogMode: "assigned",
          studentTheme: "dark",
        },
        subscription_plan: "professional",
      },
      enrollments: [{
        id: "enrollment-a", course_id: "course-a", progress: 10, status: "active", time_spent: 1, expires_at: null,
        title: "Курс A", description: null, duration: null, skip_video_identification: true,
        total_lessons: 2, completed_lessons: 0, cover_image_url: null,
      }],
      documents: { has_passport: true, has_snils: true, has_education: true },
      video_identified: true,
    };
    harness.tableResults = {
      profiles: { data: null, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: null, error: new Error("legacy unavailable") },
    };

    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.profile?.full_name).toBe("Ученик A"));
    expect(result.current.branding?.logoUrl).toBe("logo-a");
    expect(result.current.orgPlan).toBe("professional");

    harness.currentUserId = "student-2";
    harness.snapshotResult.data = {
      profile: { user_id: "student-2", full_name: "Ученик B", organization_id: null, onboarding_completed: true },
      org: null,
      enrollments: [{
        id: "enrollment-b", course_id: "course-b", progress: 0, status: "active", time_spent: 0, expires_at: null,
        title: "Курс B", description: null, duration: null, skip_video_identification: true,
        total_lessons: 1, completed_lessons: 0, cover_image_url: null,
      }],
      documents: null,
      video_identified: false,
    };
    rerender();

    await waitFor(() => expect(result.current.profile?.full_name).toBe("Ученик B"));
    expect(result.current.profile).toEqual({
      full_name: "Ученик B",
      organization_id: null,
      organization_name: null,
      org_description: null,
    });
    expect(result.current.branding).toBeNull();
    expect(result.current.orgPlan).toBe("free");
    expect(result.current.dashboardSettings).toEqual({
      showLibrary: true,
      showAchievements: true,
      showAiChat: true,
      showRadio: false,
      showAnnouncements: false,
      catalogMode: "catalog",
      studentTheme: null,
    });
    expect(result.current.documentsProgress.completed).toBe(0);
    expect(result.current.isVideoIdentified).toBe(false);
  });

  it("очищает каталог org A при переводе того же uid в org B и не применяет старый cache при ошибке B", async () => {
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик", organization_id: "org-a", onboarding_completed: true },
      org: {
        name: "Организация A",
        description: null,
        branding: { logoUrl: "logo-a" },
        student_dashboard_settings: null,
        subscription_plan: "professional",
      },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: {
        data: { full_name: "Ученик", organization_id: "org-a", organizations: { name: "Организация A", branding: { logoUrl: "logo-a" }, student_dashboard_settings: null, subscription_plan: "professional" } },
        error: null,
      },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: {
        data: [{ id: "catalog-a", title: "Каталог A", description: null, duration: null, price: 0, category_id: "category-a", cover_image_url: null, is_published: true, landing_content: null, require_enrollment_approval: false, hidden_from_catalog: false }],
        error: null,
      },
      course_categories: { data: [{ id: "category-a", name: "Категория A", color: null, hidden_from_catalog: false }], error: null },
      enrollment_requests: { data: [], error: null },
      lessons: { data: [], error: null },
      student_identity_documents: { data: [], error: null },
      video_identifications: { data: null, error: null },
    };
    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.catalogCourses.map(item => item.id)).toEqual(["catalog-a"]));

    harness.cachedDashboard = {
      courses: [cachedCourse],
      profile: { full_name: "Ученик", organization_name: "Организация A", organization_id: "org-a" },
      branding: { coverUrl: "", primaryColor: "#111", secondaryColor: "#222", logoUrl: "logo-a", showOrgName: true },
    };
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик", organization_id: "org-b", onboarding_completed: true },
      org: { name: "Организация B", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "free" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: {
        data: { full_name: "Ученик", organization_id: "org-b", organizations: { name: "Организация B", branding: null, student_dashboard_settings: null, subscription_plan: "free" } },
        error: null,
      },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: { data: null, error: new Error("org B catalog unavailable") },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
    };
    rerender();
    await waitFor(() => expect(result.current.profile?.organization_id).toBe("org-b"));
    await act(async () => { await result.current.retryDashboardLoad(); });

    expect(result.current.dashboardLoadError).not.toBeNull();
    expect(result.current.catalogCourses).toEqual([]);
    expect(result.current.categories).toEqual([]);
    expect(result.current.branding).toBeNull();
    expect(result.current.orgPlan).toBe("free");
    expect(result.current.courses).toEqual([]);
  });

  it("не показывает данные org A даже на первом render после snapshot org B того же uid", async () => {
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик A", organization_id: "org-a", onboarding_completed: true },
      org: { name: "Организация A", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "professional" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: {
        data: { full_name: "Ученик A", organization_id: "org-a", organizations: { name: "Организация A", branding: null, student_dashboard_settings: null, subscription_plan: "professional" } },
        error: null,
      },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: {
        data: [{ id: "catalog-a", title: "Каталог A", description: null, duration: null, price: 0, category_id: null, cover_image_url: null, is_published: true, landing_content: null, require_enrollment_approval: false, hidden_from_catalog: false }],
        error: null,
      },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
      lessons: { data: [], error: null },
      student_identity_documents: { data: [], error: null },
      video_identifications: { data: null, error: null },
    };

    const renderFrames: Array<{ organizationId: string | null | undefined; catalogIds: string[] }> = [];
    const { result, rerender } = renderHook(() => {
      const dashboard = useStudentDashboard();
      renderFrames.push({
        organizationId: dashboard.profile?.organization_id,
        catalogIds: dashboard.catalogCourses.map(course => course.id),
      });
      return dashboard;
    });
    await waitFor(() => expect(result.current.catalogCourses.map(course => course.id)).toEqual(["catalog-a"]));

    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик B", organization_id: "org-b", onboarding_completed: true },
      org: { name: "Организация B", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "free" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    const frameCountBeforeOrgSwitch = renderFrames.length;
    rerender();

    expect(renderFrames[frameCountBeforeOrgSwitch]).toEqual({
      organizationId: undefined,
      catalogIds: [],
    });
  });

  it("не скрывает ошибку legacy-каталога, если успешный snapshot пришёл позже", async () => {
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = undefined;
    harness.tableResults = {
      profiles: {
        data: { full_name: "Ученик", organization_id: "org-a", organizations: { name: "Организация A", branding: null, student_dashboard_settings: null, subscription_plan: "free" } },
        error: null,
      },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: { data: null, error: new Error("catalog unavailable") },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
    };
    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.dashboardLoadError).not.toBeNull());

    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик", organization_id: "org-a", onboarding_completed: true },
      org: { name: "Организация A", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "free" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    rerender();

    await waitFor(() => expect(result.current.profile?.organization_id).toBe("org-a"));
    expect(result.current.dashboardLoadError).toMatchObject({ usingCachedData: true });
    expect(result.current.catalogCourses).toEqual([]);
  });

  it("после позднего первичного snapshot автоматически перезапускает legacy-загрузку каталога", async () => {
    const initialProfile = deferred<{ data: unknown; error: unknown }>();
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = undefined;
    harness.tableResults = {
      profiles: initialProfile.promise,
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
    };
    const { result, rerender } = renderHook(() => useStudentDashboard());

    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик", organization_id: "org-a", onboarding_completed: true },
      org: { name: "Организация A", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "free" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик", organization_id: "org-a", organizations: { name: "Организация A", branding: null, student_dashboard_settings: null, subscription_plan: "free" } }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: {
        data: [{ id: "catalog-a-fresh", title: "Каталог A", description: null, duration: null, price: 0, category_id: null, cover_image_url: null, is_published: true, landing_content: null, require_enrollment_approval: false, hidden_from_catalog: false }],
        error: null,
      },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
      lessons: { data: [], error: null },
      student_identity_documents: { data: [], error: null },
      video_identifications: { data: null, error: null },
    };
    rerender();

    await act(async () => {
      initialProfile.resolve({ data: null, error: new Error("stale initial request") });
      await initialProfile.promise;
    });

    await waitFor(() => expect(result.current.catalogCourses.map(course => course.id)).toEqual(["catalog-a-fresh"]));
    expect(result.current.dashboardLoadError).toBeNull();
  });

  it("использует успешный legacy org B, если React Query удерживает snapshot org A после refetch error", async () => {
    harness.snapshotResult.error = new Error("snapshot refetch failed");
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик A", organization_id: "org-a", onboarding_completed: true },
      org: { name: "Организация A", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "professional" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик B", organization_id: "org-b", organizations: { name: "Организация B", branding: null, student_dashboard_settings: null, subscription_plan: "free" } }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: {
        data: [{ id: "catalog-b", title: "Каталог B", description: null, duration: null, price: 0, category_id: null, cover_image_url: null, is_published: true, landing_content: null, require_enrollment_approval: false, hidden_from_catalog: false }],
        error: null,
      },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
      lessons: { data: [], error: null },
      student_identity_documents: { data: [], error: null },
      video_identifications: { data: null, error: null },
    };

    const { result } = renderHook(() => useStudentDashboard());

    await waitFor(() => expect(result.current.catalogCourses.map(course => course.id)).toEqual(["catalog-b"]));
    expect(result.current.profile?.organization_id).toBe("org-b");
    expect(result.current.loading).toBe(false);
    expect(result.current.dashboardLoadError).toBeNull();
  });

  it("показывает свежий legacy org B после pull-to-refresh, если успешный snapshot org A не изменился", async () => {
    const unchangedSnapshotA = {
      profile: { user_id: "student-1", full_name: "Ученик A", organization_id: "org-a", onboarding_completed: true },
      org: { name: "Организация A", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "professional" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = unchangedSnapshotA;
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик A", organization_id: "org-a", organizations: { name: "Организация A", branding: null, student_dashboard_settings: null, subscription_plan: "professional" } }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: { data: [], error: null },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
      lessons: { data: [], error: null },
      student_identity_documents: { data: [], error: null },
      video_identifications: { data: null, error: null },
    };
    const { result } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.profile?.organization_id).toBe("org-a"));

    harness.tableResults = {
      profiles: { data: { full_name: "Ученик B", organization_id: "org-b", organizations: { name: "Организация B", branding: null, student_dashboard_settings: null, subscription_plan: "free" } }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: {
        data: [{ id: "catalog-b-refresh", title: "Каталог B", description: null, duration: null, price: 0, category_id: null, cover_image_url: null, is_published: true, landing_content: null, require_enrollment_approval: false, hidden_from_catalog: false }],
        error: null,
      },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
      lessons: { data: [], error: null },
      student_identity_documents: { data: [], error: null },
      video_identifications: { data: null, error: null },
    };
    await act(async () => { await harness.pullToRefreshHandler?.(); });

    expect(harness.snapshotResult.data).toBe(unchangedSnapshotA);
    expect(result.current.profile?.organization_id).toBe("org-b");
    expect(result.current.catalogCourses.map(course => course.id)).toEqual(["catalog-b-refresh"]);
    expect(result.current.loading).toBe(false);
  });

  it("не перезаписывает свежий legacy-прогресс поздним snapshot того же uid/org", async () => {
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = undefined;
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик", organization_id: "org-a", organizations: { name: "Организация A", branding: null, student_dashboard_settings: null, subscription_plan: "free" } }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: {
        data: [{
          id: "enrollment-fresh", progress: 80, status: "active", time_spent: 12, course_id: "course-fresh",
          courses: { id: "course-fresh", title: "Свежий курс", description: null, duration: null, skip_video_identification: true, cover_image_url: null, landing_content: null },
        }],
        error: null,
      },
      lessons: { data: [{ id: "lesson-fresh", course_id: "course-fresh" }], error: null },
      lesson_progress: { data: [{ lesson_id: "lesson-fresh" }], error: null },
      courses: { data: [], error: null },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
      student_identity_documents: { data: [], error: null },
      video_identifications: { data: null, error: null },
    };
    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.courses).toEqual([
      expect.objectContaining({ id: "course-fresh", progress: 80, completedLessons: 1 }),
    ]));

    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик", organization_id: "org-a", onboarding_completed: true },
      org: { name: "Организация A", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "free" },
      enrollments: [{
        id: "enrollment-stale", course_id: "course-fresh", progress: 10, status: "active", time_spent: 1, expires_at: null,
        title: "Свежий курс", description: null, duration: null, skip_video_identification: true,
        total_lessons: 1, completed_lessons: 0, cover_image_url: null,
      }],
      documents: null,
      video_identified: false,
    };
    rerender();

    expect(result.current.courses).toEqual([
      expect.objectContaining({ id: "course-fresh", progress: 80, completedLessons: 1 }),
    ]);
  });

  it("не применяет pending legacy-ответ org A после snapshot того же uid в org B", async () => {
    const profileA = deferred<{ data: unknown; error: unknown }>();
    harness.snapshotResult.error = null;
    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик A", organization_id: "org-a", onboarding_completed: true },
      org: { name: "Организация A", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "professional" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: profileA.promise,
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
    };
    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.profile?.organization_id).toBe("org-a"));

    harness.snapshotResult.data = {
      profile: { user_id: "student-1", full_name: "Ученик B", organization_id: "org-b", onboarding_completed: true },
      org: { name: "Организация B", description: null, branding: null, student_dashboard_settings: null, subscription_plan: "free" },
      enrollments: [],
      documents: null,
      video_identified: false,
    };
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик B", organization_id: "org-b", organizations: null }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: [], error: null },
      courses: {
        data: [{ id: "catalog-b", title: "Каталог B", description: null, duration: null, price: 0, category_id: null, cover_image_url: null, is_published: true, landing_content: null, require_enrollment_approval: false, hidden_from_catalog: false }],
        error: null,
      },
      course_categories: { data: [], error: null },
      enrollment_requests: { data: [], error: null },
      lessons: { data: [], error: null },
      student_identity_documents: { data: [], error: null },
      video_identifications: { data: null, error: null },
    };
    rerender();
    await waitFor(() => expect(result.current.profile?.organization_id).toBe("org-b"));

    await act(async () => {
      profileA.resolve({
        data: {
          full_name: "Ученик A",
          organization_id: "org-a",
          organizations: { name: "Организация A", branding: null, student_dashboard_settings: null, subscription_plan: "professional" },
        },
        error: null,
      });
      await profileA.promise;
      await Promise.resolve();
    });

    expect(result.current.profile?.full_name).toBe("Ученик B");
    expect(result.current.profile?.organization_id).toBe("org-b");
    expect(result.current.orgPlan).toBe("free");
    await waitFor(() => expect(result.current.catalogCourses.map(course => course.id)).toEqual(["catalog-b"]));
    expect(result.current.dashboardLoadError).toBeNull();
  });

  it("сохраняет свежий snapshot B, если его legacy enrollments запрос завершился ошибкой", async () => {
    harness.snapshotResult.error = null;
    harness.tableResults = {
      profiles: { data: { full_name: "Ученик A", organization_id: null, organizations: null }, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: {
        data: [{
          id: "enrollment-a", progress: 10, status: "active", time_spent: 1, course_id: "course-a",
          courses: { id: "course-a", title: "Курс A", description: null, duration: null, skip_video_identification: true, cover_image_url: null, landing_content: null },
        }],
        error: null,
      },
      lessons: { data: [], error: null },
      lesson_progress: { data: [], error: null },
    };
    const { result, rerender } = renderHook(() => useStudentDashboard());
    await waitFor(() => expect(result.current.courses.map(course => course.id)).toEqual(["course-a"]));

    harness.currentUserId = "student-2";
    harness.snapshotResult.data = {
      profile: { user_id: "student-2", full_name: "Ученик B", organization_id: null, onboarding_completed: true },
      org: null,
      enrollments: [{
        id: "enrollment-b", course_id: "course-b", progress: 25, status: "active", time_spent: 4, expires_at: null,
        title: "Курс B", description: null, duration: null, skip_video_identification: true,
        total_lessons: 4, completed_lessons: 1, cover_image_url: null,
      }],
      documents: { has_passport: false, has_snils: false, has_education: false },
      video_identified: false,
    };
    harness.tableResults = {
      profiles: { data: null, error: null },
      labor_safety_profiles: { data: null, error: null },
      enrollments: { data: null, error: new Error("legacy B unavailable") },
    };
    harness.cachedDashboard = null;
    rerender();

    await waitFor(() => expect(result.current.dashboardLoadError).toMatchObject({ usingCachedData: true }));
    expect(result.current.courses.map(course => course.id)).toEqual(["course-b"]);
    expect(result.current.profile?.full_name).toBe("Ученик B");
  });
});
