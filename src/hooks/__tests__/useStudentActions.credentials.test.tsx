import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.invoke }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/utils/logStudentDeletion", () => ({ logStudentDeletion: vi.fn() }));
vi.mock("@/utils/credentials", () => ({ generateLogin: () => "generated_login", generateSimplePassword: () => "new_password" }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, info: vi.fn() } }));
import { useStudentActions } from "../useStudentActions";
import type { Student } from "@/types/shared";

const student = { user_id: "learner", name: "Иван", login: "learner_login", generated_password: "cached_password", email: "cached@example.org" } as Student;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
});
describe("learner credentials caller contract", () => {
  it("sends only learner identity and the current organization, including after switching workspace", async () => {
    const { result, rerender } = renderHook(({ org }) => useStudentActions(org, "School", vi.fn(), vi.fn()), { initialProps: { org: "school-a" } });
    await act(async () => { await result.current.sendCredentialsEmail(student); });
    expect(mocks.invoke).toHaveBeenLastCalledWith("send-credentials", { body: { user_id: "learner", organization_id: "school-a" } });
    rerender({ org: "school-b" });
    await act(async () => { await result.current.sendCredentialsEmail(student); });
    expect(mocks.invoke).toHaveBeenLastCalledWith("send-credentials", { body: { user_id: "learner", organization_id: "school-b" } });
  });
  it("does not forward locally cached passwords in bulk email requests", async () => {
    const { result } = renderHook(() => useStudentActions("school", "School", vi.fn(), vi.fn()));
    await act(async () => { await result.current.bulkSendCredentials([student]); });
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("send-credentials", { body: { user_id: "learner", organization_id: "school" } });
  });
  it("creates credentials before asking the server to send the persisted values", async () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useStudentActions("school", "School", refresh, vi.fn()));
    await act(async () => { await result.current.bulkCreateCredentials([{ ...student, login: null, generated_password: null }], true); });
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "update-student-credentials", { body: {
      user_id: "learner", organization_id: "school", new_login: "generated_login", new_password: "new_password",
    } });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "send-credentials", { body: { user_id: "learner", organization_id: "school" } });
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("displays a server partial-change message without announcing successful credential creation", async () => {
    const refresh = vi.fn();
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("Вход в аккаунт обновлён, но сохранение данных ученика подтверждено не полностью.") });
    const { result } = renderHook(() => useStudentActions("school", "School", refresh, vi.fn()));
    let output: unknown;
    await act(async () => { output = await result.current.createCredentials({ ...student, login: null, generated_password: null }); });
    expect(output).toBeNull();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("подтверждено не полностью"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
