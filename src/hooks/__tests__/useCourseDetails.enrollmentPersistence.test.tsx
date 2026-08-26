import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  enrollmentSelect: vi.fn(),
  existingCourseEq: vi.fn(),
  existingUsersIn: vi.fn(),
  enrollmentInsert: vi.fn(),
  insertedRowsSelect: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useInfiniteQuery: () => ({
    data: { pages: [] }, error: null, hasNextPage: false,
    isFetchingNextPage: false, isFetchNextPageError: false,
    isLoading: false, isLoadingError: false,
    fetchNextPage: vi.fn(), refetch: vi.fn(),
  }),
  useQuery: () => ({
    data: undefined, error: null, isError: false, isLoading: false, refetch: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: mocks.toastInfo },
}));

import { useCourseDetails } from "@/hooks/useCourseDetails";

const course = {
  id: "course-1",
  title: "Курс",
  description: null,
  is_published: true,
  created_at: "2026-08-26T00:00:00.000Z",
};

describe("useCourseDetails enrollment persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.existingUsersIn.mockResolvedValue({ data: [], error: null });
    mocks.existingCourseEq.mockReturnValue({ in: mocks.existingUsersIn });
    mocks.enrollmentSelect.mockReturnValue({ eq: mocks.existingCourseEq });

    const emptyInsertResult = Promise.resolve({ data: [], error: null }) as Promise<{
      data: unknown[];
      error: null;
    }> & { select: typeof mocks.insertedRowsSelect };
    emptyInsertResult.select = mocks.insertedRowsSelect;
    mocks.insertedRowsSelect.mockResolvedValue({ data: [], error: null });
    mocks.enrollmentInsert.mockReturnValue(emptyInsertResult);

    mocks.from.mockImplementation((table: string) => {
      if (table !== "enrollments") throw new Error(`Unexpected table: ${table}`);
      return { select: mocks.enrollmentSelect, insert: mocks.enrollmentInsert };
    });
  });

  it("does not announce enrollment when the insert returns no persisted rows", async () => {
    const onEnrollmentChanged = vi.fn();
    const { result } = renderHook(() => useCourseDetails(
      course,
      [],
      "org-1",
      undefined,
      onEnrollmentChanged,
    ));

    act(() => result.current.toggleStudentToEnroll("student-1"));
    await act(async () => { await result.current.handleEnrollSelected(); });

    expect(mocks.enrollmentInsert).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: "student-1", course_id: "course-1" }),
    ]);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(onEnrollmentChanged).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith(
      "База не подтвердила зачисление. Список обновлён — повторите операцию.",
    );
  });
});
