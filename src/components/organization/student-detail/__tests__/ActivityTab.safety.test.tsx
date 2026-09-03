import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityTab } from "@/components/organization/student-detail/ActivityTab";

type QueryResponse = { data: any; error: any };
type QueryOperation = { method: string; args: unknown[] };
type QueryContext = { table: string; filters: Record<string, unknown>; operations: QueryOperation[] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const queryState = vi.hoisted(() => ({
  calls: [] as QueryContext[],
  responder: null as null | ((context: QueryContext) => Promise<QueryResponse>),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const operations: QueryOperation[] = [];
      const respond = () => {
        const context = { table, filters: { ...filters }, operations: [...operations] };
        queryState.calls.push(context);
        return queryState.responder?.(context) ?? Promise.resolve({ data: [], error: null });
      };
      const builder: any = {
        select: (...args: unknown[]) => {
          operations.push({ method: "select", args });
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          operations.push({ method: "eq", args: [column, value] });
          return builder;
        },
        in: (column: string, value: unknown) => {
          filters[column] = value;
          operations.push({ method: "in", args: [column, value] });
          return builder;
        },
        order: (...args: unknown[]) => {
          operations.push({ method: "order", args });
          return builder;
        },
        limit: (...args: unknown[]) => {
          operations.push({ method: "limit", args });
          return builder;
        },
        then: (resolve: (value: QueryResponse) => unknown, reject: (reason: unknown) => unknown) => (
          respond().then(resolve, reject)
        ),
      };
      return builder;
    },
  },
}));

vi.mock("@/components/organization/student-detail/TestAttemptDetail", () => ({
  TestAttemptDetail: ({ attempt }: any) => <div>{attempt.lesson_title}</div>,
}));

describe("ActivityTab fail-closed loading", () => {
  beforeEach(() => {
    queryState.calls.length = 0;
    queryState.responder = null;
  });

  it("does not show an empty activity state after a query error and recovers on retry", async () => {
    let accessCalls = 0;
    queryState.responder = async ({ table }) => {
      if (table === "student_login_history") return {
        data: [{ id: "login-1", logged_in_at: "2026-09-03T10:00:00Z", ip_address: "192.0.2.1", user_agent: "Chrome" }],
        error: null,
      };
      if (table === "course_access_log") {
        accessCalls += 1;
        return accessCalls === 1
          ? { data: null, error: { message: "database unavailable" } }
          : {
            data: [{ id: "access-1", course_id: "course-1", accessed_at: "2026-09-03T10:00:00Z", user_agent: "Chrome" }],
            error: null,
          };
      }
      if (table === "courses") return { data: [{ id: "course-1", title: "Пожарная безопасность" }], error: null };
      return { data: [], error: null };
    };

    render(<ActivityTab userId="student-1" organizationId="org-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить заходы на курсы");
    expect(screen.queryByText("Нет записей о заходах на курсы")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Заходы на курсы (!)" })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Входы на платформу (1)" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("192.0.2.1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Заходы на курсы (!)" }), { button: 0, ctrlKey: false });

    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("Пожарная безопасность")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["response", "rejection"])("keeps course activity available after a login %s failure and retries without changing tabs", async (failure) => {
    let loginCalls = 0;
    queryState.responder = async ({ table }) => {
      if (table === "student_login_history") {
        loginCalls += 1;
        if (loginCalls === 1) {
          if (failure === "rejection") throw new Error("network unavailable");
          return { data: null, error: { message: "history unavailable" } };
        }
        return {
          data: [{ id: "login-1", logged_in_at: "2026-09-03T10:00:00Z", ip_address: "192.0.2.2", user_agent: "Chrome" }],
          error: null,
        };
      }
      if (table === "course_access_log") return {
        data: [{ id: "access-1", course_id: "course-1", accessed_at: "2026-09-03T10:00:00Z", user_agent: "Chrome" }],
        error: null,
      };
      if (table === "courses") return { data: [{ id: "course-1", title: "Пожарная безопасность" }], error: null };
      return { data: [], error: null };
    };

    render(<ActivityTab userId="student-1" organizationId="org-1" />);

    expect(await screen.findByText("Пожарная безопасность")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Входы на платформу (!)" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить входы на платформу");
    expect(screen.queryByText("Нет записей о входах")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("192.0.2.2")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Входы на платформу (1)" })).toHaveAttribute("data-state", "active");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps login history available when course titles cannot be loaded", async () => {
    queryState.responder = async ({ table }) => {
      if (table === "student_login_history") return {
        data: [{ id: "login-1", logged_in_at: "2026-09-03T10:00:00Z", ip_address: "192.0.2.3", user_agent: "Chrome" }],
        error: null,
      };
      if (table === "course_access_log") return {
        data: [{ id: "access-1", course_id: "course-1", accessed_at: "2026-09-03T10:00:00Z", user_agent: "Chrome" }],
        error: null,
      };
      if (table === "courses") return { data: null, error: { message: "titles unavailable" } };
      return { data: [], error: null };
    };

    render(<ActivityTab userId="student-1" organizationId="org-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить заходы на курсы");
    expect(screen.queryByText("Неизвестный курс")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Входы на платформу (1)" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("192.0.2.3")).toBeInTheDocument();
  });

  it("does not show a false empty testing state after a test query error", async () => {
    queryState.responder = async ({ table }) => table === "test_attempts"
      ? { data: null, error: { message: "database unavailable" } }
      : { data: [], error: null };

    render(
      <ActivityTab
        userId="student-1"
        organizationId="org-1"
        defaultSubTab="tests"
        onlySubTab
      />,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Нет записей о тестировании")).not.toBeInTheDocument();
    expect(queryState.calls.map((call) => call.table)).toEqual(["test_attempts"]);
  });

  it("fails closed when test enrichment cannot be confirmed", async () => {
    queryState.responder = async ({ table }) => {
      if (table === "test_attempts") {
        return {
          data: [{ id: "attempt-1", lesson_id: "lesson-1", score: 1, max_score: 1, completed_at: "2026-09-03T10:00:00Z" }],
          error: null,
        };
      }
      if (table === "lessons") return { data: null, error: { message: "lessons unavailable" } };
      if (table === "test_questions") return { data: [], error: null };
      return { data: [], error: null };
    };

    render(
      <ActivityTab
        userId="student-1"
        organizationId="org-1"
        defaultSubTab="tests"
        onlySubTab
      />,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Нет записей о тестировании")).not.toBeInTheDocument();
  });

  it("filters test attempts by organization through both inner joins before the latest-100 limit", async () => {
    const attempt = {
      score: 1, max_score: 1, completed_at: "2026-09-03T10:00:00Z", answers: {}, shown_question_ids: null,
    };
    const attempts = [
      ...Array.from({ length: 100 }, (_, index) => ({
        ...attempt, id: `other-${index}`, lesson_id: "other-lesson", organizationId: "org-other",
      })),
      { ...attempt, id: "own-attempt", lesson_id: "own-lesson", organizationId: "org-1" },
    ];
    queryState.responder = async ({ table, operations }) => {
      if (table === "test_attempts") {
        let rows = attempts;
        const selection = String(operations.find((operation) => operation.method === "select")?.args[0]);
        // Model server filtering followed by limiting: missing either inner join must fail this regression.
        for (const operation of operations) {
          if (operation.method === "eq" && operation.args[0] === "lessons.courses.organization_id"
            && selection.includes("lessons!inner(courses!inner(organization_id))")) {
            rows = rows.filter((row) => row.organizationId === operation.args[1]);
          }
          if (operation.method === "limit") rows = rows.slice(0, Number(operation.args[0]));
        }
        return { data: rows, error: null };
      }
      if (table === "lessons") return {
        data: [{ id: "own-lesson", title: "Результат своей организации", course_id: "own-course", test_passing_score: 60 }],
        error: null,
      };
      if (table === "courses") return { data: [{ id: "own-course", title: "Охрана труда" }], error: null };
      return { data: [], error: null };
    };

    render(<ActivityTab userId="student-1" organizationId="org-1" defaultSubTab="tests" onlySubTab />);

    expect(await screen.findByText("Результат своей организации")).toBeInTheDocument();
    const attemptsQuery = queryState.calls.find((call) => call.table === "test_attempts")!;
    expect(attemptsQuery.filters).toEqual({ "user_id": "student-1", "lessons.courses.organization_id": "org-1" });
    expect(attemptsQuery.operations.map((operation) => operation.method)).toEqual(["select", "eq", "eq", "order", "limit"]);
    expect(attemptsQuery.operations.at(-1)).toEqual({ method: "limit", args: [100] });
    expect(queryState.calls.find((call) => call.table === "lessons")?.filters.id).toEqual(["own-lesson"]);
  });

  it("ignores a slow previous organization response for the same student", async () => {
    const slowLogin = deferred<QueryResponse>();
    const slowAccess = deferred<QueryResponse>();
    queryState.responder = ({ table, filters }) => {
      if (filters.organization_id === "org-a") {
        return table === "student_login_history" ? slowLogin.promise : slowAccess.promise;
      }
      if (table === "student_login_history") return Promise.resolve({ data: [], error: null });
      if (table === "course_access_log") {
        return Promise.resolve({
          data: [{ id: "access-b", course_id: "course-b", accessed_at: "2026-09-03T10:00:00Z", user_agent: "Chrome" }],
          error: null,
        });
      }
      if (table === "courses") return Promise.resolve({ data: [{ id: "course-b", title: "Курс B" }], error: null });
      return Promise.resolve({ data: [], error: null });
    };

    const view = render(<ActivityTab userId="student-1" organizationId="org-a" />);
    view.rerender(<ActivityTab userId="student-1" organizationId="org-b" />);

    expect(await screen.findByText("Курс B")).toBeInTheDocument();

    await act(async () => {
      slowLogin.resolve({ data: null, error: { message: "old scope login failure" } });
      slowAccess.resolve({ data: null, error: { message: "old scope access failure" } });
      await Promise.all([slowLogin.promise, slowAccess.promise]);
    });

    await waitFor(() => expect(screen.getByText("Курс B")).toBeInTheDocument());
    expect(screen.queryByText("Курс A")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
