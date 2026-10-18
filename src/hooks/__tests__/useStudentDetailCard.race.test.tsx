import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { DocumentsTab } from "@/components/organization/student-detail/DocumentsTab";

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

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
  actorId: "actor-a" as string | null,
  authLoading: false,
  permissionsLoading: false,
  permissionsError: null as string | null,
  canWriteFrdo: true,
  coreResponses: new Map<string, Promise<QueryResponse>>(),
  tokenResponses: new Map<string, Promise<QueryResponse>>(),
  filters: [] as Array<{ table: string; values: Record<string, unknown> }>,
  rpcCalls: [] as string[],
  frdoResponses: new Map<string, Promise<QueryResponse>>(),
  frdoWrites: [] as Array<{ payload: Record<string, unknown>; options: unknown }>,
  frdoWriteResponses: new Map<string, Promise<QueryResponse>>(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: queryState.actorId ? { id: queryState.actorId } : null, userRole: "organization", loading: queryState.authLoading }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ loading: queryState.permissionsLoading, error: queryState.permissionsError, can: (permission: string) => permission !== "frdo.write" || queryState.canWriteFrdo }) }));

vi.mock("@/utils/safeInvoke", () => ({
  safeInvoke: async (_name: string, { body }: any) => {
    const response = await (queryState.tokenResponses.get(body.user_id) ?? Promise.resolve({ data: null, error: null }));
    return { data: { token: response.data?.token ?? null, user_id: body.user_id, organization_id: body.organization_id }, error: response.error };
  },
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
          return Promise.resolve({ data: [{ id: `identity-${id}`, user_id: id, type: "passport", name: "Synthetic passport", file_url: null, created_at: "2026-10-19T00:00:00Z" }], error: null });
        }
        if (table === "student_frdo_data") {
          return queryState.frdoResponses.get(id) ?? Promise.resolve({ data: { user_id: id, organization_id: filters.organization_id, first_name: `FRDO ${id}` }, error: null });
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
              department: `department-${id}`,
              blocked_at: null,
              blocked_reason: null,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      };

      const builder: any = {
        upsert: (payload: Record<string, unknown>, options: unknown) => {
          queryState.frdoWrites.push({ payload, options });
          return queryState.frdoWriteResponses.get(String(payload.user_id)) ?? Promise.resolve({ data: null, error: null });
        },
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
    queryState.actorId = "actor-a"; queryState.canWriteFrdo = true;
    queryState.authLoading = false; queryState.permissionsLoading = false; queryState.permissionsError = null;
    queryState.coreResponses.clear();
    queryState.tokenResponses.clear();
    queryState.filters.length = 0;
    queryState.rpcCalls.length = 0;
    queryState.frdoResponses.clear(); queryState.frdoWrites.length = 0; queryState.frdoWriteResponses.clear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
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
    }), { wrapper });

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
      { initialProps: { selectedStudent: student("student-a") }, wrapper },
    );

    rerender({ selectedStudent: student("student-b") });

    // The render for B is fail-closed even before B's requests resolve.
    expect(result.current.consents).toEqual([]);
    expect(result.current.documents).toEqual([]);
    expect(result.current.decryptedPassword).toBeNull();
    expect(result.current.autoLoginToken).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.department).toBe("");

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
      expect(result.current.department).toBe("department-student-b");
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
    expect(result.current.department).toBe("department-student-b");
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
  it("keeps a dispatched A write scoped to A and prevents its continuation from changing B data or saving state", async () => {
    const writeA = deferred<QueryResponse>(), writeB = deferred<QueryResponse>();
    queryState.frdoWriteResponses.set("student-a", writeA.promise); queryState.frdoWriteResponses.set("student-b", writeB.promise);
    const { result, rerender } = renderHook(({ selected }) => useStudentDetailCardLogic({ isOpen: true, student: student(selected) as any, organizationId: "org-1" }),
      { initialProps: { selected: "student-a" }, wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let saveA!: Promise<boolean>; act(() => { saveA = result.current.saveFrdoField("first_name", "QA old A"); });
    rerender({ selected: "student-b" }); await waitFor(() => expect(result.current.frdoData.first_name).toBe("FRDO student-b"));
    let saveB!: Promise<boolean>; act(() => { saveB = result.current.saveFrdoField("snils", "112-233-445 95"); });
    await act(async () => { writeA.resolve({ data: null, error: null }); expect(await saveA).toBe(false); });
    expect(result.current.frdoData.first_name).toBe("FRDO student-b"); expect(result.current.savingFrdoField).toBe("snils");
    expect(toast.success).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled();
    expect(queryState.frdoWrites[0]).toEqual({ payload: { user_id: "student-a", organization_id: "org-1", first_name: "QA old A" }, options: { onConflict: "user_id,organization_id" } });
    await act(async () => { writeB.resolve({ data: null, error: null }); expect(await saveB).toBe(true); });
    expect(result.current.frdoData).toMatchObject({ user_id: "student-b", organization_id: "org-1", first_name: "FRDO student-b", snils: "112-233-445 95" });
    expect(result.current.savingFrdoField).toBeNull(); expect(toast.success).toHaveBeenCalledTimes(1);
  });
  it("does not display a late A error in B after an already-dispatched save", async () => {
    const write = deferred<QueryResponse>(); queryState.frdoWriteResponses.set("student-a", write.promise);
    const { result, rerender } = renderHook(({ selected }) => useStudentDetailCardLogic({ isOpen: true, student: student(selected) as any, organizationId: "org-1" }),
      { initialProps: { selected: "student-a" }, wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let save!: Promise<boolean>; act(() => { save = result.current.saveFrdoField("first_name", "QA A"); });
    rerender({ selected: "student-b" }); await waitFor(() => expect(result.current.frdoData.first_name).toBe("FRDO student-b"));
    await act(async () => { write.resolve({ data: null, error: { message: "Late old request failure" } }); expect(await save).toBe(false); });
    expect(toast.error).not.toHaveBeenCalled(); expect(result.current.frdoData.first_name).toBe("FRDO student-b");
  });
  it("invalidates an old save even after an A to B to A route round trip", async () => {
    const write = deferred<QueryResponse>(); queryState.frdoWriteResponses.set("student-a", write.promise);
    const { result, rerender } = renderHook(({ selected }) => useStudentDetailCardLogic({ isOpen: true, student: student(selected) as any, organizationId: "org-1" }),
      { initialProps: { selected: "student-a" }, wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false)); let save!: Promise<boolean>;
    act(() => { save = result.current.saveFrdoField("first_name", "QA stale round trip"); });
    rerender({ selected: "student-b" }); await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ selected: "student-a" }); await waitFor(() => expect(result.current.frdoData.first_name).toBe("FRDO student-a"));
    await act(async () => { write.resolve({ data: null, error: null }); expect(await save).toBe(false); });
    expect(result.current.frdoData.first_name).toBe("FRDO student-a"); expect(toast.success).not.toHaveBeenCalled();
  });
  it("rejects stale FRDO load identity and never exposes its fields as a successful fresh row", async () => {
    queryState.frdoResponses.set("student-a", Promise.resolve({ data: { user_id: "student-b", organization_id: "org-2", first_name: "QA foreign" }, error: null }));
    const { result } = renderHook(() => useStudentDetailCardLogic({ isOpen: true, student: student("student-a") as any, organizationId: "org-1" }), { wrapper });
    await waitFor(() => expect(result.current.dataLoadError).toMatch(/не удалось подтвердить/i));
    expect(result.current.frdoData).toEqual({}); expect(result.current.isLoading).toBe(false);
    expect(await result.current.saveFrdoField("first_name", "QA write")).toBe(false); expect(queryState.frdoWrites).toEqual([]);
  });
  it("ignores a late FRDO load after the student changes and refuses writes before a current load completes", async () => {
    const load = deferred<QueryResponse>(); queryState.frdoResponses.set("student-a", load.promise);
    const { result, rerender } = renderHook(({ selected }) => useStudentDetailCardLogic({ isOpen: true, student: student(selected) as any, organizationId: "org-1" }),
      { initialProps: { selected: "student-a" }, wrapper });
    expect(await result.current.saveFrdoField("first_name", "QA premature")).toBe(false); expect(queryState.frdoWrites).toEqual([]);
    rerender({ selected: "student-b" }); await waitFor(() => expect(result.current.frdoData.first_name).toBe("FRDO student-b"));
    await act(async () => { load.resolve({ data: { user_id: "student-a", organization_id: "org-1", first_name: "QA late A" }, error: null }); });
    expect(result.current.frdoData.first_name).toBe("FRDO student-b");
  });
  it("keeps partial-upsert semantics and source identity when a fresh scoped read found no FRDO row", async () => {
    queryState.frdoResponses.set("student-a", Promise.resolve({ data: null, error: null }));
    const { result } = renderHook(() => useStudentDetailCardLogic({ isOpen: true, student: student("student-a") as any, organizationId: "org-1" }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { expect(await result.current.saveFrdoField("first_name", "QA created")).toBe(true); });
    expect(queryState.frdoWrites).toEqual([{ payload: { user_id: "student-a", organization_id: "org-1", first_name: "QA created" }, options: { onConflict: "user_id,organization_id" } }]);
    expect(result.current.frdoData).toEqual({ user_id: "student-a", organization_id: "org-1", first_name: "QA created" });
  });
  it("does not copy an old-organization save into the same student's newly loaded organization", async () => {
    const write = deferred<QueryResponse>(); queryState.frdoWriteResponses.set("student-a", write.promise);
    const { result, rerender } = renderHook(({ org }) => useStudentDetailCardLogic({ isOpen: true, student: student("student-a") as any, organizationId: org }),
      { initialProps: { org: "org-1" }, wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false)); let save!: Promise<boolean>;
    act(() => { save = result.current.saveFrdoField("first_name", "QA old organization"); });
    rerender({ org: "org-2" }); await waitFor(() => expect(result.current.frdoData.organization_id).toBe("org-2"));
    await act(async () => { write.resolve({ data: null, error: null }); expect(await save).toBe(false); });
    expect(result.current.frdoData).toMatchObject({ user_id: "student-a", organization_id: "org-2", first_name: "FRDO student-a" });
    expect(queryState.frdoWrites[0].payload.organization_id).toBe("org-1"); expect(toast.success).not.toHaveBeenCalled();
  });
  it("invalidates a pending FRDO read through an actor A to B to A round trip", async () => {
    const oldLoad = deferred<QueryResponse>(); queryState.frdoResponses.set("student-a", oldLoad.promise);
    const { result, rerender } = renderHook(() => useStudentDetailCardLogic({ isOpen: true, student: student("student-a") as any, organizationId: "org-1" }), { wrapper });
    queryState.frdoResponses.set("student-a", Promise.resolve({ data: { user_id: "student-a", organization_id: "org-1", first_name: "QA actor B read" }, error: null }));
    queryState.actorId = "actor-b"; rerender();
    expect(result.current.frdoData).toEqual({});
    await waitFor(() => expect(result.current.frdoData.first_name).toBe("QA actor B read"));
    queryState.frdoResponses.set("student-a", Promise.resolve({ data: { user_id: "student-a", organization_id: "org-1", first_name: "QA fresh actor A read" }, error: null }));
    queryState.actorId = "actor-a"; rerender();
    await waitFor(() => expect(result.current.frdoData.first_name).toBe("QA fresh actor A read"));
    await act(async () => { oldLoad.resolve({ data: { user_id: "student-a", organization_id: "org-1", first_name: "QA stale actor A read" }, error: null }); });
    expect(result.current.frdoData.first_name).toBe("QA fresh actor A read"); expect(toast.success).not.toHaveBeenCalled();
  });
  it("invalidates actor A's dispatched save through B and a fresh A context without clearing the current save", async () => {
    const oldWrite = deferred<QueryResponse>(), currentWrite = deferred<QueryResponse>();
    queryState.frdoWriteResponses.set("student-a", oldWrite.promise);
    const { result, rerender } = renderHook(() => useStudentDetailCardLogic({ isOpen: true, student: student("student-a") as any, organizationId: "org-1" }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false)); let oldSave!: Promise<boolean>;
    act(() => { oldSave = result.current.saveFrdoField("first_name", "QA old actor write"); });
    queryState.actorId = "actor-b"; rerender(); expect(result.current.frdoData).toEqual({});
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    queryState.actorId = "actor-a"; rerender(); await waitFor(() => expect(result.current.isLoading).toBe(false));
    queryState.frdoWriteResponses.set("student-a", currentWrite.promise); let freshSave!: Promise<boolean>;
    act(() => { freshSave = result.current.saveFrdoField("snils", "112-233-445 95"); });
    await act(async () => { oldWrite.resolve({ data: null, error: null }); expect(await oldSave).toBe(false); });
    expect(result.current.frdoData.first_name).toBe("FRDO student-a"); expect(result.current.savingFrdoField).toBe("snils"); expect(toast.success).not.toHaveBeenCalled();
    await act(async () => { currentWrite.resolve({ data: null, error: null }); expect(await freshSave).toBe(true); });
    expect(result.current.frdoData.snils).toBe("112-233-445 95"); expect(result.current.savingFrdoField).toBeNull(); expect(toast.success).toHaveBeenCalledTimes(1);
  });
  it("invalidates an old FRDO save when write permission is revoked and restored for the same actor", async () => {
    const write = deferred<QueryResponse>(); queryState.frdoWriteResponses.set("student-a", write.promise);
    const { result, rerender } = renderHook(() => useStudentDetailCardLogic({ isOpen: true, student: student("student-a") as any, organizationId: "org-1" }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false)); const staleSave = result.current.saveFrdoField; let pending!: Promise<boolean>;
    act(() => { pending = staleSave("first_name", "QA before revocation"); });
    queryState.canWriteFrdo = false; rerender(); await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(await staleSave("first_name", "QA unauthorized")).toBe(false);
    expect(await result.current.saveFrdoField("first_name", "QA unauthorized")).toBe(false); expect(queryState.frdoWrites).toHaveLength(1);
    queryState.canWriteFrdo = true; rerender(); await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { write.resolve({ data: null, error: null }); expect(await pending).toBe(false); });
    expect(result.current.frdoData.first_name).toBe("FRDO student-a"); expect(toast.success).not.toHaveBeenCalled();
  });
  it.each(["auth", "permissions"])("clears the old actor's local form during %s loading and accepts a fresh scoped empty row only after confirmation", async loading => {
    function Panel() {
      const h = useStudentDetailCardLogic({ isOpen: true, student: student("student-a") as any, organizationId: "org-1" });
      return <DocumentsTab h={h} organizationId="org-1" studentUserId="student-a" actorUserId={queryState.actorId} />;
    }
    const view = render(<Panel />, { wrapper });
    await waitFor(() => expect(screen.getByPlaceholderText("Иван")).toHaveValue("FRDO student-a"));
    queryState.actorId = "actor-b";
    if (loading === "auth") queryState.authLoading = true; else queryState.permissionsLoading = true;
    view.rerender(<Panel />);
    expect(screen.queryByPlaceholderText("Иван")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Загрузка личных документов");
    expect(screen.queryByDisplayValue("FRDO student-a")).not.toBeInTheDocument();
    queryState.frdoResponses.set("student-a", Promise.resolve({ data: null, error: null }));
    queryState.authLoading = false; queryState.permissionsLoading = false; view.rerender(<Panel />);
    await waitFor(() => expect(screen.getByPlaceholderText("Иван")).toHaveValue(""));
    expect(screen.queryByDisplayValue("FRDO student-a")).not.toBeInTheDocument(); expect(queryState.frdoWrites).toHaveLength(0);
  });
});
