import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), from: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke }, from: mocks.from },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success, warning: mocks.warning } }));
vi.mock("@/utils/credentials", () => ({ generateStrongPassword: () => "StrongPass123", isValidEmail: () => true }));

// Do not mock safeInvoke or its detector: prove the hook sends one real wrapper request.
import { useStudentManagement } from "@/hooks/useStudentManagement";

const student = { user_id: "student-1", is_existing: false, login: "student_12345", password: "StrongPass123" };
const input = { name: "Новый Ученик", groupId: "group-1" };

describe("registration transport safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.from.mockImplementation(() => { throw new Error("Unexpected database read"); });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each(["returned", "thrown"] as const)("makes one invoke after a %s lost response, retaining an unknown warning even after list refresh", async delivery => {
    const error = new TypeError("Failed to fetch");
    if (delivery === "returned") mocks.invoke.mockResolvedValue({ data: null, error });
    else mocks.invoke.mockRejectedValue(error);
    const onRefresh = vi.fn(() => []);
    const { result } = renderHook(() => useStudentManagement({ organizationId: "org-1", onRefresh }));
    act(() => result.current.setShowAddStudentDialog(true));
    let created = true;
    await act(async () => { created = await result.current.createStudent(input); });
    expect(created).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("register-student", expect.objectContaining({
      body: expect.objectContaining({ full_name: input.name, student_group_id: input.groupId, email: null, custom_login: null }),
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.showAddStudentDialog).toBe(true);
    expect(result.current.isCreatingStudent).toBe(false);
    expect(result.current.creationWarning).toContain("Результат создания ученика не подтверждён");
    expect(result.current.creationWarning).toContain("Отсутствие ученика в списке ещё не означает, что запрос завершился");
    expect(mocks.warning).toHaveBeenCalledWith(result.current.creationWarning, { duration: 30000 });
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 409])("keeps a confirmed HTTP %i rejection as an ordinary server error without a possibly-created claim", async status => {
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: "Регистрация отклонена" }), { status })) });
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useStudentManagement({ organizationId: "org-1", onRefresh }));
    act(() => result.current.setShowAddStudentDialog(true));
    await act(async () => { expect(await result.current.createStudent(input)).toBe(false); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledWith("Регистрация отклонена");
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(result.current.creationWarning).toBeNull();
    expect(result.current.showAddStudentDialog).toBe(true);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it.each(["GROUP_PREFLIGHT_FAILED", "GROUP_COURSE_PREFLIGHT_FAILED"])("shows a confirmed pre-write %s rejection without a possibly-created warning or automatic retry", async code => {
    const message = "Не удалось проверить выбранную группу.";
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: message, code }), { status: 500 })) });
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useStudentManagement({ organizationId: "org-1", onRefresh }));
    act(() => result.current.setShowAddStudentDialog(true));
    await act(async () => { expect(await result.current.createStudent(input)).toBe(false); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledWith(message);
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result.current.creationWarning).toBeNull();
    expect(result.current.showAddStudentDialog).toBe(true);
    expect(result.current.isCreatingStudent).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();

    // The user can explicitly retry after the confirmed no-write failure.
    mocks.invoke.mockResolvedValueOnce({ data: student, error: null });
    await act(async () => { expect(await result.current.createStudent({ name: input.name })).toBe(true); });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it.each([
    [500, { error: "GROUP_PREFLIGHT_FAILED" }],
    [500, { error: "Неизвестная ошибка", code: "UNKNOWN_PREFLIGHT_FAILED" }],
    [500, { error: "Неизвестная ошибка", code: ["GROUP_PREFLIGHT_FAILED"] }],
    [500, { error: "Неизвестная ошибка", code: " GROUP_PREFLIGHT_FAILED " }],
    [408, { error: "Ответ не подтверждён", code: "GROUP_PREFLIGHT_FAILED" }],
    [502, { error: "Ответ не подтверждён", code: "GROUP_COURSE_PREFLIGHT_FAILED" }],
  ] as const)("keeps an ambiguous HTTP %i response unknown unless its exact machine code and status prove a pre-write failure: %j", async (status, body) => {
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })) });
    const { result } = renderHook(() => useStudentManagement({ organizationId: "org-1", onRefresh: vi.fn() }));
    await act(async () => { expect(await result.current.createStudent(input)).toBe(false); });
    expect(result.current.creationWarning).toContain("Результат создания ученика не подтверждён");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([408, 500, 502, 504])("does not treat HTTP %i as proof that no write occurred", async status => {
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: "Ответ не подтверждён" }), { status })) });
    const { result } = renderHook(() => useStudentManagement({ organizationId: "org-1", onRefresh: vi.fn() }));
    await act(async () => { expect(await result.current.createStudent(input)).toBe(false); });
    expect(result.current.creationWarning).toContain("Результат создания ученика не подтверждён");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not turn a missing acknowledgment into success when neither course nor group was selected", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useStudentManagement({ organizationId: "org-1", onRefresh: vi.fn() }));
    await act(async () => { expect(await result.current.createStudent({ name: input.name })).toBe(false); });
    expect(result.current.creationWarning).toContain("Результат создания ученика не подтверждён");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("rejects a second concurrent callback, then releases the guard after confirmed creation", async () => {
    let resolve!: (value: { data: typeof student; error: null }) => void;
    mocks.invoke.mockReturnValueOnce(new Promise(value => { resolve = value; })).mockResolvedValue({ data: student, error: null });
    const { result } = renderHook(() => useStudentManagement({ organizationId: "org-1", onRefresh: vi.fn() }));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.createStudent({ name: input.name });
      second = result.current.createStudent({ name: input.name });
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(await second).toBe(false);
    await act(async () => { resolve({ data: student, error: null }); expect(await first).toBe(true); });
    expect(result.current.isCreatingStudent).toBe(false);
    await act(async () => { expect(await result.current.createStudent({ name: "Другой Ученик" })).toBe(true); });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it("does not acquire the guard on validation failure and keeps confirmed group creation working", async () => {
    mocks.invoke.mockResolvedValue({ data: student, error: null });
    mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: table === "profiles"
        ? { user_id: student.user_id, organization_id: "org-1", student_group_id: input.groupId }
        : { id: input.groupId, organization_id: "org-1", course_id: null }, error: null,
    }) }) }) }) }));
    const { result } = renderHook(() => useStudentManagement({ organizationId: "org-1", onRefresh: vi.fn() }));
    await act(async () => { expect(await result.current.createStudent({ name: "" })).toBe(false); });
    expect(mocks.invoke).not.toHaveBeenCalled();
    await act(async () => { expect(await result.current.createStudent(input)).toBe(true); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining("Ученик создан и добавлен в группу"));
    expect(result.current.creationWarning).toBeNull();
  });
});
