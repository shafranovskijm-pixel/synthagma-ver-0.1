import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: any[] | null; error: Error | null };

const testState = vi.hoisted(() => ({
  rpcResults: new Map<string, QueryResult>(),
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  accessResult: { data: [] as any[], error: null as Error | null },
  accessIds: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      testState.rpcCalls.push({ name, args });
      return Promise.resolve(
        testState.rpcResults.get(`${String(args.p_search ?? "")}:${String(args.p_offset ?? 0)}`)
          ?? testState.rpcResults.get(String(args.p_search ?? ""))
          ?? { data: [], error: null },
      );
    },
    from: (table: string) => {
      if (table !== "enrollments") throw new Error(`Unexpected table: ${table}`);
      const query = {
        select: () => query,
        in: (_column: string, ids: string[]) => {
          testState.accessIds = ids;
          return Promise.resolve(testState.accessResult);
        },
      };
      return query;
    },
  },
}));

import { fetchOrganizationStudentEnrollments } from "@/api/students";

function rpcStudent(userId: string, login: string, enrollments: any[]) {
  return {
    id: `profile-${userId}`,
    user_id: userId,
    full_name: "Билык Анастасия Юрьевна",
    email: `${login}@example.test`,
    login,
    company_id: null,
    student_group_id: null,
    last_visit_at: null,
    archived_at: null,
    progress: 50,
    status: "active",
    last_activity: null,
    enrollments,
    has_passport: false,
    has_snils: false,
    has_education: false,
    frdo_complete: false,
    frdo_has_data: false,
    total_count: 1,
    active_count: 1,
    archived_count: 0,
  };
}

const enrollment = {
  id: "enrollment-1",
  course_id: "course-fire",
  course_title: "Специалист по пожарной профилактике",
  progress: 50,
  status: "active",
  started_at: "2026-08-26T00:00:00.000Z",
  completed_at: null,
  time_spent: 120,
};

describe("fetchOrganizationStudentEnrollments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.rpcResults.clear();
    testState.rpcCalls.length = 0;
    testState.accessResult = { data: [], error: null };
    testState.accessIds = [];
  });

  it("uses the org-scoped RPC with login and merges access metadata", async () => {
    testState.rpcResults.set("student_49064", {
      data: [rpcStudent("student-1", "student_49064", [enrollment])],
      error: null,
    });
    testState.accessResult = {
      data: [{ id: "enrollment-1", access_days: 30, expires_at: "2026-09-25T00:00:00.000Z" }],
      error: null,
    };

    await expect(fetchOrganizationStudentEnrollments({
      organizationId: "org-vcot",
      userId: "student-1",
      login: "student_49064",
      email: "student@example.test",
      fullName: "Билык Анастасия Юрьевна",
    })).resolves.toEqual([{
      ...enrollment,
      access_days: 30,
      expires_at: "2026-09-25T00:00:00.000Z",
    }]);

    expect(testState.rpcCalls).toEqual([{
      name: "get_organization_students_page",
      args: expect.objectContaining({
        p_organization_id: "org-vcot",
        p_limit: 100,
        p_offset: 0,
        p_search: "student_49064",
        p_archive_mode: "active",
      }),
    }]);
    expect(testState.accessIds).toEqual(["enrollment-1"]);
  });

  it("requires exact user_id and falls back from login to email without a full-org scan", async () => {
    testState.rpcResults.set("shared-login", {
      data: [rpcStudent("another-user", "shared-login", [])],
      error: null,
    });
    testState.rpcResults.set("target@example.test", {
      data: [rpcStudent("student-1", "target", [])],
      error: null,
    });

    await expect(fetchOrganizationStudentEnrollments({
      organizationId: "org-vcot",
      userId: "student-1",
      login: "shared-login",
      email: "target@example.test",
      fullName: "Билык Анастасия Юрьевна",
    })).resolves.toEqual([]);

    expect(testState.rpcCalls.map(call => call.args.p_search)).toEqual([
      "shared-login",
      "target@example.test",
    ]);
    expect(testState.rpcCalls.every(call => call.args.p_limit === 100 && call.args.p_offset === 0)).toBe(true);
  });

  it("continues through filtered pages until the exact user_id is found", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...rpcStudent(`other-${index}`, "shared_login", []),
      total_count: 101,
    }));
    testState.rpcResults.set("shared_login:0", { data: firstPage, error: null });
    testState.rpcResults.set("shared_login:100", {
      data: [{ ...rpcStudent("student-1", "shared_login", []), total_count: 101 }],
      error: null,
    });

    await expect(fetchOrganizationStudentEnrollments({
      organizationId: "org-vcot",
      userId: "student-1",
      login: "shared_login",
    })).resolves.toEqual([]);

    expect(testState.rpcCalls.map(call => call.args.p_offset)).toEqual([0, 100]);
  });

  it("rejects a non-array enrollment payload instead of converting it to zero", async () => {
    testState.rpcResults.set("student_49064", {
      data: [{ ...rpcStudent("student-1", "student_49064", []), enrollments: {} }],
      error: null,
    });

    await expect(fetchOrganizationStudentEnrollments({
      organizationId: "org-vcot",
      userId: "student-1",
      login: "student_49064",
    })).rejects.toThrow("список зачислений не подтверждён");
  });

  it("propagates an RPC error instead of returning zero courses", async () => {
    const databaseError = new Error("database unavailable");
    testState.rpcResults.set("student_49064", { data: null, error: databaseError });

    await expect(fetchOrganizationStudentEnrollments({
      organizationId: "org-vcot",
      userId: "student-1",
      login: "student_49064",
    })).rejects.toBe(databaseError);
    expect(testState.accessIds).toEqual([]);
  });

  it("rejects incomplete access metadata instead of showing unlimited access", async () => {
    testState.rpcResults.set("student_49064", {
      data: [rpcStudent("student-1", "student_49064", [enrollment])],
      error: null,
    });
    testState.accessResult = { data: [], error: null };

    await expect(fetchOrganizationStudentEnrollments({
      organizationId: "org-vcot",
      userId: "student-1",
      login: "student_49064",
    })).rejects.toThrow("Не удалось подтвердить параметры доступа");
  });
});
