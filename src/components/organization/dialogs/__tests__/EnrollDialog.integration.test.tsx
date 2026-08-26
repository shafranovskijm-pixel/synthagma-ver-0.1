import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  existingEnrollmentsResult: { data: [] as Array<{ user_id: string }>, error: null as Error | null },
  insertResult: {
    data: [] as Array<{ id: string; user_id: string; course_id: string }>,
    error: null as Error | null,
  },
  readbackResult: {
    data: [] as Array<{ id: string; user_id: string; course_id: string }>,
    error: null as Error | null,
  },
  enrollmentSelectQueryCount: 0,
  enrollmentInsert: vi.fn(),
  enrollmentInsertReturningSelect: vi.fn(),
  enrollmentSelect: vi.fn(),
  fetchStudentsByUserIds: vi.fn(),
  invalidateQueries: vi.fn(),
  organizationSelect: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: testState.invalidateQueries }),
}));

vi.mock("@/api/students", () => ({
  deleteStudent: vi.fn(),
  fetchStudentsByUserIds: testState.fetchStudentsByUserIds,
}));

vi.mock("@/utils/generateEnrollmentOrder", () => ({
  generateEnrollmentOrder: vi.fn().mockResolvedValue(null),
}));

vi.mock("sonner", () => ({
  toast: {
    error: testState.toastError,
    info: testState.toastInfo,
    success: testState.toastSuccess,
    warning: testState.toastWarning,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "enrollments") {
        return {
          insert: (rows: unknown[]) => {
            testState.enrollmentInsert(rows);
            const result = Promise.resolve(testState.insertResult);
            return {
              select: (columns: string) => {
                testState.enrollmentInsertReturningSelect(columns);
                return result;
              },
              then: result.then.bind(result),
              catch: result.catch.bind(result),
              finally: result.finally.bind(result),
            };
          },
          select: (columns: string) => {
            testState.enrollmentSelect(columns);
            const queryResult = testState.enrollmentSelectQueryCount === 0
              ? testState.existingEnrollmentsResult
              : testState.readbackResult;
            testState.enrollmentSelectQueryCount += 1;
            return {
              eq: (column: string, value: string) => ({
                in: (inColumn: string, values: string[]) => {
                  testState.enrollmentSelect({ column, value, inColumn, values });
                  return Promise.resolve(queryResult);
                },
              }),
            };
          },
        };
      }

      if (table === "organizations") {
        return {
          select: (columns: string) => {
            testState.organizationSelect(columns);
            return {
              eq: (column: string, value: string) => ({
                single: () => {
                  testState.organizationSelect({ column, value });
                  return Promise.resolve({
                    data: {
                      name: "Учебный центр",
                      director_name: null,
                      director_position: null,
                    },
                    error: null,
                  });
                },
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected Supabase table: ${table}`);
    },
  },
}));

import { EnrollDialog } from "@/components/organization/dialogs/EnrollDialog";
import { useEnrollmentActions } from "@/hooks/useEnrollmentActions";

const courses = [
  {
    id: "published-course",
    title: "Опубликованный курс",
    description: null,
    is_published: true,
    created_at: "2026-08-25T00:00:00.000Z",
    lessonsCount: 3,
    studentsCount: 0,
    category_id: null,
  },
  {
    id: "draft-course",
    title: "Черновик курса",
    description: null,
    is_published: false,
    created_at: "2026-08-25T00:00:00.000Z",
    lessonsCount: 2,
    studentsCount: 0,
    category_id: null,
  },
];

function EnrollmentHarness({ onRefresh }: { onRefresh: () => void }) {
  const actions = useEnrollmentActions(
    "organization-1",
    "Учебный центр",
    onRefresh,
    vi.fn(),
  );

  const startEnrollment = () => {
    actions.setSelectedStudentIds(new Set(["student-1", "student-2"]));
    actions.setShowEnrollDialog(true);
  };

  return (
    <>
      <button type="button" onClick={startEnrollment}>
        Начать зачисление
      </button>
      <EnrollDialog
        open={actions.showEnrollDialog}
        onOpenChange={actions.setShowEnrollDialog}
        selectedCount={actions.selectedStudentIds.size}
        courses={courses}
        categories={[]}
        getCategoryById={() => undefined}
        isEnrolling={actions.isEnrolling}
        onEnroll={async (courseId) => {
          actions.setEnrollCourseId(courseId);
          await actions.bulkEnroll(
            courseId,
            Array.from(actions.selectedStudentIds),
            courses,
          );
        }}
      />
    </>
  );
}

function openAndSelectPublishedCourse() {
  fireEvent.click(screen.getByRole("button", { name: "Начать зачисление" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Опубликованный курс")).toBeInTheDocument();
  expect(screen.queryByText("Черновик курса")).not.toBeInTheDocument();

  const submit = screen.getByRole("button", { name: "Зачислить на курс" });
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByText("Опубликованный курс"));
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
}

describe("EnrollDialog enrollment integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.existingEnrollmentsResult = { data: [], error: null };
    testState.insertResult = {
      data: [
        { id: "enrollment-1", user_id: "student-1", course_id: "published-course" },
        { id: "enrollment-2", user_id: "student-2", course_id: "published-course" },
      ],
      error: null,
    };
    testState.readbackResult = {
      data: [
        { id: "enrollment-1", user_id: "student-1", course_id: "published-course" },
        { id: "enrollment-2", user_id: "student-2", course_id: "published-course" },
      ],
      error: null,
    };
    testState.enrollmentSelectQueryCount = 0;
    testState.fetchStudentsByUserIds.mockImplementation(
      async (_organizationId: string, userIds: string[]) => ({
        profiles: [],
        enrollments: [],
        students: userIds.map((userId) => ({
          user_id: userId,
          name: userId === "student-1" ? "Иван Иванов" : "Мария Петрова",
        })),
      }),
    );
  });

  it("selects only a published course, inserts every selected student, then closes and refreshes", async () => {
    const onRefresh = vi.fn();
    render(<EnrollmentHarness onRefresh={onRefresh} />);

    openAndSelectPublishedCourse();

    await waitFor(() => expect(testState.enrollmentInsert).toHaveBeenCalledTimes(1));
    expect(testState.enrollmentInsert).toHaveBeenCalledWith([
      {
        user_id: "student-1",
        course_id: "published-course",
        status: "active",
        progress: 0,
      },
      {
        user_id: "student-2",
        course_id: "published-course",
        status: "active",
        progress: 0,
      },
    ]);
    expect(testState.enrollmentInsertReturningSelect).toHaveBeenCalledWith("id, user_id, course_id");
    expect(testState.enrollmentSelect).toHaveBeenCalledWith("id, user_id, course_id");
    expect(testState.enrollmentSelect).toHaveBeenCalledWith({
      column: "course_id",
      value: "published-course",
      inColumn: "user_id",
      values: ["student-1", "student-2"],
    });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(testState.toastSuccess).toHaveBeenCalledWith("Зачислено 2 учеников");
    expect(testState.toastError).not.toHaveBeenCalled();
  });

  it("fails closed when the enrollment insert fails", async () => {
    const onRefresh = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    testState.insertResult = { data: [], error: new Error("database unavailable") };

    render(<EnrollmentHarness onRefresh={onRefresh} />);
    openAndSelectPublishedCourse();

    await waitFor(() => expect(testState.toastError).toHaveBeenCalledWith("Ошибка зачисления"));
    expect(testState.enrollmentInsert).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(testState.toastSuccess).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("does not report success when INSERT has no error but returns no persisted rows", async () => {
    const onRefresh = vi.fn();
    testState.insertResult = { data: [], error: null };

    render(<EnrollmentHarness onRefresh={onRefresh} />);
    openAndSelectPublishedCourse();

    await waitFor(() => expect(testState.enrollmentInsert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(testState.toastError).toHaveBeenCalled());
    expect(testState.enrollmentInsertReturningSelect).toHaveBeenCalledWith("id, user_id, course_id");
    expect(testState.toastSuccess).not.toHaveBeenCalled();
    expect(testState.organizationSelect).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not report success when the fresh read-back misses a requested enrollment", async () => {
    const onRefresh = vi.fn();
    testState.readbackResult = {
      data: [
        { id: "enrollment-1", user_id: "student-1", course_id: "published-course" },
      ],
      error: null,
    };

    render(<EnrollmentHarness onRefresh={onRefresh} />);
    openAndSelectPublishedCourse();

    await waitFor(() => expect(testState.enrollmentInsert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(testState.toastError).toHaveBeenCalled());
    expect(testState.toastSuccess).not.toHaveBeenCalled();
    expect(testState.organizationSelect).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
