import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const testState = vi.hoisted(() => ({
  selectedCourseId: "course-a" as string | null,
  courseResponses: new Map<string, Promise<{ data: any; error: any }>>(),
  courseLookups: [] as Array<Record<string, string>>,
  publishResponse: Promise.resolve(true) as Promise<boolean>,
  publishCourse: vi.fn(),
  setCourses: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  canWriteCourses: true,
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "org-1",
    tabNavigation: {
      selectedCourseId: testState.selectedCourseId,
      setSelectedCourseId: vi.fn(),
      setActiveTab: vi.fn(),
    },
    refreshData: vi.fn(),
    refreshEnrollmentData: vi.fn(),
    refreshStudentGrouping: vi.fn(),
    refreshStudentPopulation: vi.fn(),
    refreshGroupDirectory: vi.fn(),
    setCourses: testState.setCourses,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
}));

vi.mock("@/lib/invalidateOrganizationQueries", () => ({
  invalidateOrganizationCourseOverview: vi.fn(),
}));

vi.mock("@/api/courses", () => ({
  publishCourse: (courseId: string, isPublished: boolean) => {
    testState.publishCourse(courseId, isPublished);
    return testState.publishResponse;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: testState.toastSuccess,
    error: testState.toastError,
  },
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  RequirePerm: ({ perm, children }: { perm: string; children: any }) =>
    perm === "courses.write" && testState.canWriteCourses ? children : null,
}));

vi.mock("@/components/organization/CourseDetailsContent", () => ({
  CourseDetailsContent: ({
    course,
    activeTab,
    onCourseUpdated,
  }: {
    course: { title: string; is_published?: boolean };
    activeTab: string;
    onCourseUpdated: () => void;
  }) => (
    <div data-testid="course-details">
      <span>{course.title}</span>
      <span data-testid="active-course-tab">{activeTab}</span>
      <span data-testid="publication-state">{course.is_published ? "Опубликован" : "Черновик"}</span>
      <button type="button" onClick={onCourseUpdated}>Обновить сведения курса</button>
    </div>
  ),
}));

vi.mock("@/components/ui/SigmaSpinner", () => ({
  SigmaSpinner: () => <div data-testid="course-spinner" />,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "courses") {
        const filters: Record<string, string> = {};
        const query = {
          select: () => query,
          eq: (column: string, value: string) => {
            filters[column] = value;
            return query;
          },
          maybeSingle: () => {
            testState.courseLookups.push({ ...filters });
            return testState.courseResponses.get(filters.id)
              ?? Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      }

      if (table === "lessons") {
        const query = {
          select: () => query,
          eq: () => Promise.resolve({ count: 2, error: null }),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

import { CourseDetailsTab } from "@/components/organization/tabs/CourseDetailsTab";

function renderCourseDetailsTab(initialEntry = "/") {
  const RouterWrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  );
  return render(<CourseDetailsTab />, { wrapper: RouterWrapper });
}

describe("CourseDetailsTab URL request ordering", () => {
  beforeEach(() => {
    testState.selectedCourseId = "course-a";
    testState.courseResponses.clear();
    testState.courseLookups.length = 0;
    testState.publishResponse = Promise.resolve(true);
    testState.publishCourse.mockClear();
    testState.setCourses.mockClear();
    testState.toastSuccess.mockClear();
    testState.toastError.mockClear();
    testState.canWriteCourses = true;
  });

  it("keeps course B when the slower course A lookup resolves last", async () => {
    const courseA = deferred<{ data: any; error: null }>();
    const courseB = deferred<{ data: any; error: null }>();
    testState.courseResponses.set("course-a", courseA.promise);
    testState.courseResponses.set("course-b", courseB.promise);

    const view = renderCourseDetailsTab();
    await waitFor(() => expect(testState.courseLookups).toContainEqual({
      id: "course-a",
      organization_id: "org-1",
    }));

    testState.selectedCourseId = "course-b";
    view.rerender(<CourseDetailsTab />);
    await waitFor(() => expect(testState.courseLookups).toContainEqual({
      id: "course-b",
      organization_id: "org-1",
    }));

    await act(async () => {
      courseB.resolve({ data: { id: "course-b", title: "Course B" }, error: null });
      await courseB.promise;
    });
    expect(await screen.findByText("Course B")).toBeInTheDocument();

    await act(async () => {
      courseA.resolve({ data: { id: "course-a", title: "Course A" }, error: null });
      await courseA.promise;
    });

    expect(screen.getByTestId("course-details")).toHaveTextContent("Course B");
    expect(screen.queryByText("Course A")).not.toBeInTheDocument();
  });

  it("clears the previous course while the next URL id is loading", async () => {
    testState.courseResponses.set(
      "course-a",
      Promise.resolve({ data: { id: "course-a", title: "Course A" }, error: null }),
    );
    const courseB = deferred<{ data: any; error: null }>();
    testState.courseResponses.set("course-b", courseB.promise);

    const view = renderCourseDetailsTab();
    expect(await screen.findByText("Course A")).toBeInTheDocument();

    testState.selectedCourseId = "course-b";
    view.rerender(<CourseDetailsTab />);

    await waitFor(() => expect(screen.getByTestId("course-spinner")).toBeInTheDocument());
    expect(screen.queryByText("Course A")).not.toBeInTheDocument();

    await act(async () => {
      courseB.resolve({ data: { id: "course-b", title: "Course B" }, error: null });
      await courseB.promise;
    });
    expect(await screen.findByText("Course B")).toBeInTheDocument();
  });

  it("rejects a direct library URL for an existing course without the explicit gate", async () => {
    testState.courseResponses.set(
      "course-a",
      Promise.resolve({
        data: { id: "course-a", title: "Existing course", landing_content: {} },
        error: null,
      }),
    );

    renderCourseDetailsTab("/?courseSection=library");

    expect(await screen.findByText("Existing course")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("active-course-tab")).toHaveTextContent("editor"));
  });

  it("accepts a direct library URL only for the explicitly enabled course", async () => {
    testState.courseResponses.set(
      "course-a",
      Promise.resolve({
        data: {
          id: "course-a",
          title: "New 178-hour course",
          landing_content: { electronic_library: { enabled: true } },
        },
        error: null,
      }),
    );

    renderCourseDetailsTab("/?courseSection=library");

    expect(await screen.findByText("New 178-hour course")).toBeInTheDocument();
    expect(screen.getByTestId("active-course-tab")).toHaveTextContent("materials");
  });

  it("publishes a draft only after the server confirms the persisted state", async () => {
    const publishResponse = deferred<boolean>();
    testState.publishResponse = publishResponse.promise;
    testState.courseResponses.set(
      "course-a",
      Promise.resolve({ data: { id: "course-a", title: "Course A", is_published: false }, error: null }),
    );

    renderCourseDetailsTab();
    expect(await screen.findByText("Course A")).toBeInTheDocument();
    expect(screen.getByTestId("publication-state")).toHaveTextContent("Черновик");

    fireEvent.click(screen.getByRole("button", { name: "Опубликовать курс" }));

    expect(testState.publishCourse).toHaveBeenCalledWith("course-a", true);
    expect(screen.getByRole("button", { name: "Публикуем…" })).toBeDisabled();
    expect(screen.getByTestId("publication-state")).toHaveTextContent("Черновик");
    expect(testState.setCourses).not.toHaveBeenCalled();

    await act(async () => {
      publishResponse.resolve(true);
      await publishResponse.promise;
    });

    await waitFor(() => expect(screen.getByTestId("publication-state")).toHaveTextContent("Опубликован"));
    expect(screen.getByRole("button", { name: "Снять с публикации" })).toBeEnabled();
    expect(testState.setCourses).toHaveBeenCalledTimes(1);
    expect(testState.toastSuccess).toHaveBeenCalledWith("Курс опубликован");
    expect(testState.toastError).not.toHaveBeenCalled();
  });

  it("keeps a draft unchanged when publication is not confirmed", async () => {
    testState.publishResponse = Promise.resolve(false);
    testState.courseResponses.set(
      "course-a",
      Promise.resolve({ data: { id: "course-a", title: "Course A", is_published: false }, error: null }),
    );

    renderCourseDetailsTab();
    expect(await screen.findByText("Course A")).toBeInTheDocument();
    expect(screen.getByTestId("publication-state")).toHaveTextContent("Черновик");

    fireEvent.click(screen.getByRole("button", { name: "Опубликовать курс" }));

    await waitFor(() => expect(testState.toastError).toHaveBeenCalledWith("Ошибка изменения статуса публикации"));
    expect(screen.getByTestId("publication-state")).toHaveTextContent("Черновик");
    expect(screen.getByRole("button", { name: "Опубликовать курс" })).toBeEnabled();
    expect(testState.setCourses).not.toHaveBeenCalled();
    expect(testState.toastSuccess).not.toHaveBeenCalled();
  });

  it("does not show publication controls without courses.write permission", async () => {
    testState.canWriteCourses = false;
    testState.courseResponses.set(
      "course-a",
      Promise.resolve({ data: { id: "course-a", title: "Course A", is_published: false }, error: null }),
    );

    renderCourseDetailsTab();
    expect(await screen.findByText("Course A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Опубликовать курс" })).not.toBeInTheDocument();
  });

  it("keeps the confirmed publication state when an older background reload finishes later", async () => {
    testState.courseResponses.set(
      "course-a",
      Promise.resolve({ data: { id: "course-a", title: "Course A", is_published: false }, error: null }),
    );

    renderCourseDetailsTab();
    expect(await screen.findByText("Course A")).toBeInTheDocument();

    const staleReload = deferred<{ data: any; error: null }>();
    testState.courseResponses.set("course-a", staleReload.promise);
    fireEvent.click(screen.getByRole("button", { name: "Обновить сведения курса" }));
    await waitFor(() => expect(testState.courseLookups).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Опубликовать курс" }));
    await waitFor(() => expect(screen.getByTestId("publication-state")).toHaveTextContent("Опубликован"));

    await act(async () => {
      staleReload.resolve({
        data: { id: "course-a", title: "Course A (stale)", is_published: false },
        error: null,
      });
      await staleReload.promise;
    });

    expect(screen.getByTestId("publication-state")).toHaveTextContent("Опубликован");
    expect(screen.queryByText("Course A (stale)")).not.toBeInTheDocument();
  });
});
