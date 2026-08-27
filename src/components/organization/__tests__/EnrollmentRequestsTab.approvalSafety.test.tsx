import fs from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  ensureEnrollmentVerified: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  requestUpdateResults: [] as Array<{ data: unknown; error: unknown }>,
}));

vi.mock("@/api/enrollments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/enrollments")>();
  return {
    ...actual,
    ensureEnrollmentVerified: testState.ensureEnrollmentVerified,
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: testState.toastError,
    success: testState.toastSuccess,
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const request = {
    id: "request-1",
    course_id: "course-1",
    user_id: "student-1",
    status: "pending",
    created_at: "2026-08-28T00:00:00.000Z",
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-1" } } }),
      },
      from: (table: string) => {
        if (table === "registration_links") {
          return {
            select: () => ({
              eq: () => ({
                not: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          };
        }

        if (table === "enrollment_requests") {
          return {
            select: (columns: string) => {
              const chain: any = {
                eq: () => chain,
                order: () => Promise.resolve({ data: [request], error: null }),
                maybeSingle: () => Promise.resolve({
                  data: columns.includes("status") ? request : null,
                  error: null,
                }),
              };
              return chain;
            },
            update: () => {
              const chain: any = {
                eq: () => chain,
                select: () => ({
                  maybeSingle: () => Promise.resolve(
                    testState.requestUpdateResults.shift() ?? {
                      data: null,
                      error: new Error("missing mocked request update"),
                    },
                  ),
                }),
              };
              return chain;
            },
          };
        }

        if (table === "profiles") {
          return {
            select: () => ({
              in: () => Promise.resolve({
                data: [{
                  user_id: "student-1",
                  full_name: "Билык А. Ю.",
                  email: "bilyk@example.test",
                }],
                error: null,
              }),
            }),
          };
        }

        if (table === "courses") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          };
        }

        if (table === "chat_messages" || table === "org_general_messages") {
          return {
            insert: () => Promise.resolve({ data: null, error: null }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
});

import { EnrollmentRequestsTab } from "@/components/organization/EnrollmentRequestsTab";

describe("EnrollmentRequestsTab approval safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.ensureEnrollmentVerified.mockResolvedValue({
      id: "enrollment-1",
      user_id: "student-1",
      course_id: "course-1",
      status: "active",
      expires_at: null,
    });
    testState.requestUpdateResults = [
      { data: null, error: new Error("request update unavailable") },
      {
        data: {
          id: "request-1",
          course_id: "course-1",
          user_id: "student-1",
          status: "approved",
        },
        error: null,
      },
    ];
  });

  it("retries only after a failed request transition and never creates a premature enrollment", async () => {
    const onRefreshStudents = vi.fn();
    render(
      <EnrollmentRequestsTab
        courseId="course-1"
        onRefreshStudents={onRefreshStudents}
      />,
    );

    const approveButton = await screen.findByRole("button", { name: /Одобрить/ });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(testState.toastError).toHaveBeenCalledWith(
        "Ошибка одобрения заявки",
        expect.objectContaining({
          description: expect.stringContaining("request update unavailable"),
        }),
      );
    });
    expect(testState.toastSuccess).not.toHaveBeenCalled();
    expect(testState.ensureEnrollmentVerified).not.toHaveBeenCalled();
    expect(onRefreshStudents).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Одобрить/ })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /Одобрить/ }));

    await waitFor(() => {
      expect(testState.toastSuccess).toHaveBeenCalledWith(
        "Заявка одобрена: Билык А. Ю.",
      );
    });

    expect(testState.ensureEnrollmentVerified).toHaveBeenCalledTimes(1);
    expect(onRefreshStudents).toHaveBeenCalledTimes(1);
  });

  it("rolls a claimed approval back to pending when enrollment is not confirmed", async () => {
    const onRefreshStudents = vi.fn();
    testState.ensureEnrollmentVerified.mockRejectedValueOnce(
      new Error("enrollment insert failed"),
    );
    testState.requestUpdateResults = [
      {
        data: {
          id: "request-1",
          course_id: "course-1",
          user_id: "student-1",
          status: "approved",
        },
        error: null,
      },
      {
        data: {
          id: "request-1",
          course_id: "course-1",
          user_id: "student-1",
          status: "pending",
        },
        error: null,
      },
    ];

    render(
      <EnrollmentRequestsTab
        courseId="course-1"
        onRefreshStudents={onRefreshStudents}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Одобрить/ }));

    await waitFor(() => {
      expect(testState.toastError).toHaveBeenCalledWith(
        "Ошибка одобрения заявки",
        expect.objectContaining({
          description: expect.stringContaining("enrollment insert failed"),
        }),
      );
    });

    expect(testState.ensureEnrollmentVerified).toHaveBeenCalledTimes(1);
    expect(testState.requestUpdateResults).toHaveLength(0);
    expect(testState.toastSuccess).not.toHaveBeenCalled();
    expect(onRefreshStudents).not.toHaveBeenCalled();
  });

  it("keeps request transitions ahead of side effects with exact fail-closed read-backs", () => {
    const source = fs.readFileSync(
      resolve(
        process.cwd(),
        "src/components/organization/EnrollmentRequestsTab.tsx",
      ),
      "utf8",
    );

    const handleApprove = source.indexOf("const handleApprove");
    const requestPreflight = source.indexOf(
      '.select("id, status, course_id, user_id")',
      handleApprove,
    );
    const pendingTransition = source.indexOf(
      '.eq("status", "pending")',
      requestPreflight,
    );
    const transitionReadback = source.indexOf(
      '.select("id, status, course_id, user_id")',
      pendingTransition,
    );
    const enrollmentEnsure = source.indexOf(
      "await ensureEnrollmentVerified",
      transitionReadback,
    );
    const groupReadback = source.indexOf(
      '.select("user_id, student_group_id")',
      enrollmentEnsure,
    );
    const notificationBlock = source.indexOf(
      "// Notifications are best-effort",
      groupReadback,
    );

    expect(handleApprove).toBeGreaterThan(-1);
    expect(requestPreflight).toBeGreaterThan(handleApprove);
    expect(pendingTransition).toBeGreaterThan(requestPreflight);
    expect(transitionReadback).toBeGreaterThan(pendingTransition);
    expect(enrollmentEnsure).toBeGreaterThan(transitionReadback);
    expect(groupReadback).toBeGreaterThan(enrollmentEnsure);
    expect(notificationBlock).toBeGreaterThan(groupReadback);
    expect(source).toContain(
      "База не подтвердила назначение ученика в выбранную группу.",
    );
    expect(source).toContain("База не подтвердила одобрение заявки.");

    const handleReject = source.indexOf("const handleReject");
    const rejectTransition = source.indexOf(
      'status: "rejected"',
      handleReject,
    );
    const rejectPendingGuard = source.indexOf(
      '.eq("status", "pending")',
      rejectTransition,
    );
    const rejectReadback = source.indexOf(
      '.select("id, status, course_id, user_id")',
      rejectPendingGuard,
    );
    const rejectApprovedGuard = source.indexOf(
      'requestReadback.status === "approved"',
      rejectReadback,
    );

    expect(handleReject).toBeGreaterThan(notificationBlock);
    expect(rejectTransition).toBeGreaterThan(handleReject);
    expect(rejectPendingGuard).toBeGreaterThan(rejectTransition);
    expect(rejectReadback).toBeGreaterThan(rejectPendingGuard);
    expect(rejectApprovedGuard).toBeGreaterThan(rejectReadback);
  });
});
