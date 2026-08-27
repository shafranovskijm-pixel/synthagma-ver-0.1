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

  it("recovers a retry after enrollment persisted but request status failed", async () => {
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
          description: expect.stringContaining("Зачисление уже подтверждено"),
        }),
      );
    });
    expect(testState.toastSuccess).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Одобрить/ })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /Одобрить/ }));

    await waitFor(() => {
      expect(testState.toastSuccess).toHaveBeenCalledWith(
        "Заявка одобрена: Билык А. Ю.",
      );
    });

    expect(testState.ensureEnrollmentVerified).toHaveBeenCalledTimes(2);
    expect(onRefreshStudents).toHaveBeenCalledTimes(2);
  });

  it("keeps the exact approval order and fail-closed read-backs", () => {
    const source = fs.readFileSync(
      resolve(
        process.cwd(),
        "src/components/organization/EnrollmentRequestsTab.tsx",
      ),
      "utf8",
    );

    const requestPreflight = source.indexOf(
      '.select("id, status, course_id, user_id")',
    );
    const enrollmentEnsure = source.indexOf(
      "await ensureEnrollmentVerified",
      requestPreflight,
    );
    const groupReadback = source.indexOf(
      '.select("user_id, student_group_id")',
      enrollmentEnsure,
    );
    const pendingTransition = source.indexOf(
      '.eq("status", "pending")',
      groupReadback,
    );
    const transitionReadback = source.indexOf(
      '.select("id, status, course_id, user_id")',
      pendingTransition,
    );
    const notificationGuard = source.indexOf(
      "if (requestTransitioned)",
      transitionReadback,
    );

    expect(requestPreflight).toBeGreaterThan(-1);
    expect(enrollmentEnsure).toBeGreaterThan(requestPreflight);
    expect(groupReadback).toBeGreaterThan(enrollmentEnsure);
    expect(pendingTransition).toBeGreaterThan(groupReadback);
    expect(transitionReadback).toBeGreaterThan(pendingTransition);
    expect(notificationGuard).toBeGreaterThan(transitionReadback);
    expect(source).toContain(
      "База не подтвердила назначение ученика в выбранную группу.",
    );
    expect(source).toContain("База не подтвердила одобрение заявки.");
  });
});
