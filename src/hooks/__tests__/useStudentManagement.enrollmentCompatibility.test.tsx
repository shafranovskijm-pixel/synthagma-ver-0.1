import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeInvoke: vi.fn(),
  maybeSingle: vi.fn(),
  remainingResult: {
    data: [] as Array<{
      id: string;
      user_id: string;
      course_id: string;
      status: string | null;
      expires_at: string | null;
    }>,
    error: null as unknown,
  },
  ensureEnrollmentVerified: vi.fn(),
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
vi.mock("@/api/enrollments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/enrollments")>();
  return {
    ...actual,
    ensureEnrollmentVerified: mocks.ensureEnrollmentVerified,
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "enrollments") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: mocks.maybeSingle }),
            in: () => Promise.resolve(mocks.remainingResult),
          }),
        }),
      };
    },
  },
}));

import { useStudentManagement } from "@/hooks/useStudentManagement";

const activeCourse = (courseId: string) => ({
  id: `enrollment-${courseId}`,
  user_id: "student-1",
  course_id: courseId,
  status: "active",
  expires_at: null,
});

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
    mocks.maybeSingle.mockResolvedValue({
      data: activeCourse("course-1"),
      error: null,
    });
    mocks.remainingResult = { data: [], error: null };
    mocks.ensureEnrollmentVerified.mockResolvedValue(activeCourse("course-2"));
  });

  it("accepts an older Edge response only after a fresh active enrollment read-back", async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useStudentManagement({
      organizationId: "org-1",
      onRefresh,
    }));

    let created = false;
    await act(async () => {
      created = await result.current.createStudent({
        name: "Билык А. Ю.",
        courseIds: ["course-1"],
      });
    });

    expect(created).toBe(true);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.safeInvoke).toHaveBeenCalledWith(
      "register-student",
      expect.objectContaining({
        body: expect.objectContaining({
          enrollment_request_source: "organization_add_student",
        }),
      }),
    );
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
        name: "Билык А. Ю.",
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

  it("rejects a first-course success when learner access has expired", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        ...activeCourse("course-1"),
        expires_at: "2020-01-01T00:00:00.000Z",
      },
      error: null,
    });
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useStudentManagement({
      organizationId: "org-1",
      onRefresh,
    }));

    let created = true;
    await act(async () => {
      created = await result.current.createStudent({
        name: "Билык А. Ю.",
        courseIds: ["course-1"],
      });
    });

    expect(created).toBe(false);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Срок доступа ученика к курсу истёк. Измените срок доступа в карточке ученика.",
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not report multi-course success when a remaining course expired", async () => {
    mocks.remainingResult = {
      data: [{
        ...activeCourse("course-2"),
        expires_at: "2020-01-01T00:00:00.000Z",
      }],
      error: null,
    };
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useStudentManagement({
      organizationId: "org-1",
      onRefresh,
    }));

    let created = true;
    await act(async () => {
      created = await result.current.createStudent({
        name: "Билык А. Ю.",
        courseIds: ["course-1", "course-2"],
      });
    });

    expect(created).toBe(false);
    expect(mocks.ensureEnrollmentVerified).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Срок доступа ученика к курсу истёк. Измените срок доступа в карточке ученика.",
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps an active remaining enrollment without inserting a duplicate", async () => {
    mocks.remainingResult = { data: [activeCourse("course-2")], error: null };
    const { result } = renderHook(() => useStudentManagement({
      organizationId: "org-1",
      onRefresh: vi.fn(),
    }));

    let created = false;
    await act(async () => {
      created = await result.current.createStudent({
        name: "Билык А. Ю.",
        courseIds: ["course-1", "course-2"],
      });
    });

    expect(created).toBe(true);
    expect(mocks.ensureEnrollmentVerified).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("inserts and verifies a missing remaining enrollment", async () => {
    mocks.remainingResult = { data: [], error: null };
    const { result } = renderHook(() => useStudentManagement({
      organizationId: "org-1",
      onRefresh: vi.fn(),
    }));

    let created = false;
    await act(async () => {
      created = await result.current.createStudent({
        name: "Билык А. Ю.",
        courseIds: ["course-1", "course-2"],
      });
    });

    expect(created).toBe(true);
    expect(mocks.ensureEnrollmentVerified).toHaveBeenCalledWith({
      user_id: "student-1",
      course_id: "course-2",
      status: "active",
      progress: 0,
    });
  });

  it("surfaces a persisted-profile partial success without a success toast, mail, or client read-back", async () => {
    const partialMessage = "Ученик сохранён, но зачисление на курс не подтверждено.";
    mocks.safeInvoke.mockResolvedValueOnce({
      data: {
        success: false,
        partial_success: true,
        profile_persisted: true,
        enrollment_confirmed: false,
        user_id: "student-1",
        is_existing: false,
        login: "student_12345",
        password: "StrongPass123",
        code: "STUDENT_CREATED_ENROLLMENT_FAILED",
        message: partialMessage,
      },
      error: null,
    });
    mocks.maybeSingle.mockRejectedValue(new Error("partial success must not trigger a read-back"));
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useStudentManagement({
      organizationId: "org-1",
      onRefresh,
    }));

    let created = true;
    await act(async () => {
      created = await result.current.createStudent({
        name: "Билык А. Ю.",
        email: "bilyk@example.test",
        courseIds: ["course-1"],
      });
    });

    expect(created).toBe(false);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.toastWarning).toHaveBeenCalledWith(expect.stringContaining(partialMessage));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.safeInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.safeInvoke).toHaveBeenCalledWith("register-student", expect.any(Object));
  });
});
