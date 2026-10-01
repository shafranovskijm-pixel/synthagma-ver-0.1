import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ check: vi.fn(), register: vi.fn(), enroll: vi.fn(), probe: vi.fn(), groupInsert: vi.fn() }));
vi.mock("@/api/studentImportPreflight", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/studentImportPreflight")>(),
  checkStudentImportRows: mocks.check,
}));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.register }));
vi.mock("@/api/enrollments", () => ({ insertEnrollmentsVerified: mocks.enroll }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [{ is_unlimited: true }], error: null }),
  functions: { invoke: mocks.probe },
  from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }), insert: mocks.groupInsert }),
} }));
import ImportStudentsForm from "../ImportStudentsForm";
async function selectFile(csv = "ФИО;Логин\nИван Иванов;qa") {
  const { container } = render(<ImportStudentsForm organizationId="org" courses={[]} companies={[]} onSuccess={vi.fn()} />);
  const file = new File([], "students.csv");
  Object.defineProperty(file,"text",{ value: async () => csv });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await screen.findByText("Проверка перед импортом");
  await waitFor(() => expect(mocks.check).toHaveBeenCalled());
  return screen.getByRole("button", { name: `Импортировать (${csv.split("\n").length - 1})` });
}
function registrationProbe(revision?: string) {
  const response = new Response('{"error":"invalid request"}', { status: 400,
    headers: revision ? { "X-Sintagma-Register-Student-Revision": revision } : {},
  });
  return { data: null, error: new FunctionsHttpError(response), response };
}
describe("import review gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.check.mockResolvedValue([{ rowIndex: 1, blocked: [], warnings: [] }]);
    mocks.register.mockResolvedValue({ data: { success: true, import_preflight_confirmed: true, user_id: "student" }, error: null });
    mocks.probe.mockResolvedValue(registrationProbe("student-import-v6"));
  });
  it("shows login conflict before writes and disables importing only blocked rows", async () => {
    mocks.check.mockResolvedValue([{ rowIndex: 1, blocked: ["Логин уже занят"], warnings: [] }]);
    const button = await selectFile();
    await screen.findByText("Не импортируется: Логин уже занят");
    expect(button).toBeDisabled(); expect(mocks.register).not.toHaveBeenCalled();
  });
  it("requires review of names/password warnings before registration", async () => {
    mocks.check.mockResolvedValue([{ rowIndex: 1, blocked: [], warnings: ["ФИО повторяется"] }]);
    const button = await selectFile();
    await screen.findByText("ФИО повторяется"); expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Я проверил совпадения/ }));
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button); await screen.findByRole("button", { name: "Готово" });
    expect(mocks.register).toHaveBeenCalledWith("register-student", expect.objectContaining({ body: expect.objectContaining({ reject_existing_login: true }) }));
  });
  it("refuses to import if database preflight fails", async () => {
    mocks.check.mockRejectedValue(new Error("Проверка недоступна"));
    const button = await selectFile(); await screen.findByText("Проверка недоступна");
    expect(button).toBeDisabled(); expect(mocks.register).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Повторить проверку" })).toBeEnabled();
  });
  it("rechecks before writing and skips a login that was occupied after preview", async () => {
    mocks.check.mockResolvedValueOnce([{ rowIndex: 1, blocked: [], warnings: [] }])
      .mockResolvedValueOnce([{ rowIndex: 1, blocked: ["Логин уже занят"], warnings: [] }]);
    const button = await selectFile(); await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button); await screen.findByRole("button", { name: "Готово" });
    expect(mocks.register).not.toHaveBeenCalled(); expect(screen.getByText("Логин уже занят")).toBeInTheDocument();
  });
  it.each(["student-import-v5", undefined])("blocks all writes when registration revision is %s", async revision => {
    mocks.probe.mockResolvedValue(registrationProbe(revision));
    const button = await selectFile("ФИО;Логин;Группа\nИван Иванов;qa;Новая группа");
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText(/сервер ещё не подтвердил защиту от дублей/);
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.groupInsert).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.check).toHaveBeenCalledTimes(1); // preview only; writes never begin
  });
  it("checks v6 once before registering all rows in an import", async () => {
    mocks.check.mockResolvedValue([{ rowIndex: 1, blocked: [], warnings: [] }, { rowIndex: 2, blocked: [], warnings: [] }]);
    const button = await selectFile("ФИО;Логин\nИван Иванов;qa-one\nПётр Петров;qa-two");
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Готово" });
    expect(mocks.probe).toHaveBeenCalledExactlyOnceWith("register-student", { method: "GET", timeout: 10000 });
    expect(mocks.register).toHaveBeenCalledTimes(2);
    expect(mocks.probe.mock.invocationCallOrder[0]).toBeLessThan(mocks.register.mock.invocationCallOrder[0]);
    expect(screen.getByText("2 успешно")).toBeInTheDocument();
  });
});
