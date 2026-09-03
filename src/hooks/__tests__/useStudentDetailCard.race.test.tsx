import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type QueryResponse = { data: any; error: any };

const queryState = vi.hoisted(() => ({
  coreResponses: new Map<string, Promise<QueryResponse>>(),
  tokenResponses: new Map<string, Promise<QueryResponse>>(),
  filters: [] as Array<{ table: string; values: Record<string, unknown> }>,
  rpcCalls: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const studentId = () => String(
        filters.user_id
        ?? filters.student_user_id
        ?? filters["enrollments.user_id"]
        ?? "",
      );
      const response = (): Promise<QueryResponse> => {
        queryState.filters.push({ table, values: { ...filters } });
        const id = studentId();
        if (table === "student_consents") {
          return queryState.coreResponses.get(id)
            ?? Promise.resolve({ data: [], error: null });
        }
        if (table === "student_login_tokens") {
          return queryState.tokenResponses.get(id)
            ?? Promise.resolve({ data: null, error: null });
        }
        if (table === "consent_documents") {
          return Promise.resolve({ data: [{ id: `generated-${id}` }], error: null });
        }
        if (table === "video_identifications") {
          return Promise.resolve({ data: [{ id: `verification-${id}`, user_id: id }], error: null });
        }
        if (table === "student_documents") {
          return Promise.resolve({ data: [{ id: `document-${id}`, enrollment_id: `enrollment-${id}` }], error: null });
        }
        if (table === "student_identity_documents") {
          return Promise.resolve({ data: [{ id: `identity-${id}`, user_id: id, type: "passport" }], error: null });
        }
        if (table === "student_frdo_data") {
          return Promise.resolve({ data: { user_id: id, first_name: `FRDO ${id}` }, error: null });
        }
        if (table === "pep_agreements") {
          return Promise.resolve({ data: [{ id: `pep-${id}` }], error: null });
        }
        if (table === "profiles") {
          return Promise.resolve({
            data: {
              phone: `phone-${id}`,
              region: `region-${id}`,
              job_position: `job-${id}`,
              blocked_at: null,
              blocked_reason: null,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      };

      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        is: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => response(),
        then: (resolve: (value: QueryResponse) => unknown, reject: (reason: unknown) => unknown) => (
          response().then(resolve, reject)
        ),
      };
      return builder;
    },
    rpc: (_name: string, args: { p_user_id: string }) => {
      queryState.rpcCalls.push(args.p_user_id);
      return Promise.resolve({ data: `password-${args.p_user_id}`, error: null });
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const student = (id: string) => ({
  id,
  user_id: id,
  name: `Student ${id}`,
  email: `${id}@example.test`,
  login: id,
  generated_password: null,
});

describe("useStudentDetailCardLogic identity races", () => {
  beforeEach(() => {
    queryState.coreResponses.clear();
    queryState.tokenResponses.clear();
    queryState.filters.length = 0;
    queryState.rpcCalls.length = 0;
    vi.mocked(toast.error).mockClear();
  });

  it("fails closed on a required query error and recovers only after retry", async () => {
    queryState.coreResponses.set(
      "student-a",
      Promise.resolve({ data: null, error: { message: "database unavailable" } }),
    );

    const { result } = renderHook(() => useStudentDetailCardLogic({
      isOpen: true,
      student: student("student-a") as any,
      organizationId: "org-1",
      enrollments: [],
    }));

    await waitFor(() => {
      expect(result.current.dataLoadError).toMatch(/не удалось подтвердить/i);
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.consents).toEqual([]);
    expect(result.current.documents).toEqual([]);
    expect(result.current.getMissingDocuments()).toEqual([]);
    expect(result.current.decryptedPassword).toBeNull();
    expect(queryState.rpcCalls).toEqual([]);

    await act(async () => {
      await result.current.handleSendDocumentsReminder();
    });
    expect(toast.error).toHaveBeenCalledWith("Сначала повторите загрузку личного дела ученика");

    queryState.coreResponses.set(
      "student-a",
      Promise.resolve({ data: [{ id: "consent-student-a" }], error: null }),
    );
    await act(async () => {
      await result.current.retryLoadStudentData();
    });

    await waitFor(() => {
      expect(result.current.dataLoadError).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.consents.map((item: any) => item.id)).toEqual(["consent-student-a"]);
      expect(result.current.identityDocs.map((item: any) => item.id)).toEqual(["identity-student-a"]);
      expect(result.current.decryptedPassword).toBe("password-student-a");
    });
  });

  it("never exposes student A data, password or token after switching to B", async () => {
    const coreA = deferred<QueryResponse>();
    const coreB = deferred<QueryResponse>();
    const tokenA = deferred<QueryResponse>();
    const tokenB = deferred<QueryResponse>();
    queryState.coreResponses.set("student-a", coreA.promise);
    queryState.coreResponses.set("student-b", coreB.promise);
    queryState.tokenResponses.set("student-a", tokenA.promise);
    queryState.tokenResponses.set("student-b", tokenB.promise);

    const { result, rerender } = renderHook(
      ({ selectedStudent }) => useStudentDetailCardLogic({
        isOpen: true,
        student: selectedStudent as any,
        organizationId: "org-1",
        enrollments: [],
      }),
      { initialProps: { selectedStudent: student("student-a") } },
    );

    rerender({ selectedStudent: student("student-b") });

    // The render for B is fail-closed even before B's requests resolve.
    expect(result.current.consents).toEqual([]);
    expect(result.current.documents).toEqual([]);
    expect(result.current.decryptedPassword).toBeNull();
    expect(result.current.autoLoginToken).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      coreB.resolve({ data: [{ id: "consent-student-b" }], error: null });
      tokenB.resolve({ data: { token: "token-student-b" }, error: null });
      await Promise.all([coreB.promise, tokenB.promise]);
    });

    await waitFor(() => {
      expect(result.current.consents.map((item: any) => item.id))
        .toEqual(["consent-student-b"]);
      expect(result.current.documents.map((item: any) => item.id))
        .toEqual(["document-student-b"]);
      expect(result.current.phone).toBe("phone-student-b");
      expect(result.current.decryptedPassword).toBe("password-student-b");
      expect(result.current.autoLoginToken).toBe("token-student-b");
    });

    await act(async () => {
      coreA.resolve({ data: [{ id: "consent-student-a" }], error: null });
      tokenA.resolve({ data: { token: "token-student-a" }, error: null });
      await Promise.all([coreA.promise, tokenA.promise]);
    });

    expect(result.current.consents.map((item: any) => item.id))
      .toEqual(["consent-student-b"]);
    expect(result.current.documents.map((item: any) => item.id))
      .toEqual(["document-student-b"]);
    expect(result.current.phone).toBe("phone-student-b");
    expect(result.current.decryptedPassword).toBe("password-student-b");
    expect(result.current.autoLoginToken).toBe("token-student-b");
    expect(queryState.rpcCalls).toEqual(["student-b"]);

    expect(queryState.filters).toContainEqual({
      table: "video_identifications",
      values: { user_id: "student-b", organization_id: "org-1" },
    });
    expect(queryState.filters).toContainEqual({
      table: "student_documents",
      values: {
        "enrollments.user_id": "student-b",
        "enrollments.courses.organization_id": "org-1",
      },
    });
    expect(queryState.filters).toContainEqual({
      table: "profiles",
      values: { user_id: "student-b", organization_id: "org-1" },
    });
  });
});
