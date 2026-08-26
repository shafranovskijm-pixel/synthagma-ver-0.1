import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeInvoke: vi.fn(),
  maybeSingle: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.safeInvoke }));
vi.mock("@/utils/credentials", () => ({
  generateStrongPassword: () => "StrongPass123",
  isValidEmail: () => true,
}));
vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "enrollments") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: mocks.maybeSingle }),
          }),
        }),
      };
    },
  },
}));

import { useStudentManagement } from "@/hooks/useStudentManagement";

describe("useStudentManagement enrollment release compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeInvoke.mockResolvedValue({
      data: {
        success: true,
        user_id: "student-1",
        is_existing: true,
        message: "Ученик зачислен на курс",
      },
      error: null,
    });
  });

  it("accepts an older Edge response only after a fresh enrollment read-back", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "enrollment-1", user_id: "student-1", course_id: "course-1" },
      error: null,
    });
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useStudentManagement({
      organizationId: "org-1",
      onRefresh,
    }));

    let created = false;
    await act(async () => {
      created = await result.current.createStudent({
        name: "Белык А. Ю.",
        courseIds: ["course-1"],
      });
    });

    expect(created).toBe(true);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Ученик зачислен на курс");
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("rejects success when the database does not prove enrollment", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useStudentManagement({
      organizationId: "org-1",
      onRefresh,
    }));

    let created = true;
    await act(async () => {
      created = await result.current.createStudent({
        name: "Белык А. Ю.",
        courseIds: ["course-1"],
      });
    });

    expect(created).toBe(false);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Ученик создан, но база не подтвердила зачисление на все выбранные курсы. Проверьте его карточку.",
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
