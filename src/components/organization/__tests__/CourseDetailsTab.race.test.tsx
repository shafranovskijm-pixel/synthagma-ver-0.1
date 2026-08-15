import { act, render, screen, waitFor } from "@testing-library/react";
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
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
}));

vi.mock("@/lib/invalidateOrganizationQueries", () => ({
  invalidateOrganizationCourseOverview: vi.fn(),
}));

vi.mock("@/components/organization/CourseDetailsContent", () => ({
  CourseDetailsContent: ({ course }: { course: { title: string } }) => (
    <div data-testid="course-details">{course.title}</div>
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

describe("CourseDetailsTab URL request ordering", () => {
  beforeEach(() => {
    testState.selectedCourseId = "course-a";
    testState.courseResponses.clear();
    testState.courseLookups.length = 0;
  });

  it("keeps course B when the slower course A lookup resolves last", async () => {
    const courseA = deferred<{ data: any; error: null }>();
    const courseB = deferred<{ data: any; error: null }>();
    testState.courseResponses.set("course-a", courseA.promise);
    testState.courseResponses.set("course-b", courseB.promise);

    const view = render(<CourseDetailsTab />);
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

    const view = render(<CourseDetailsTab />);
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
});
