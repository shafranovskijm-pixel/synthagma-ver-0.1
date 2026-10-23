import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), enroll: vi.fn() }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.invoke }));
vi.mock("@/api/enrollments", () => ({ insertEnrollmentsVerified: mocks.enroll }));
vi.mock("@/api/studentImportPreflight", () => ({ assertStudentImportBackendRevision: async () => {}, checkStudentImportRows: async (_org: string, rows: any[]) => rows.map(r => ({ rowIndex: r.rowIndex, blocked: [], warnings: [] })) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => <select aria-label="Курс по умолчанию" value={value} onChange={e => onValueChange(e.target.value)}><option value="">Не назначать</option>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>, SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  if (table === "student_groups") return { select: () => ({ eq: async () => ({ data: [] }) }) };
  if (table === "enrollments") return { select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) };
  throw new Error(`Unexpected table ${table}`);
} } }));
import ImportStudentsForm from "../ImportStudentsForm";
async function showImport(fileCourse: string) {
  const { container } = render(<ImportStudentsForm organizationId="org-1" courses={[{ id: "default", title: "Другой курс" }, { id: "wanted", title: "Выбранный курс" }]} companies={[]} onSuccess={vi.fn()} />);
  const file = new File([], "students.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => `ФИО;Логин;Курс\nУченик;qa-only;${fileCourse}` });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await screen.findByText("Ученик");
  fireEvent.change(screen.getByRole("combobox", { name: "Курс по умолчанию" }), { target: { value: "default" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Импортировать (1)" })).not.toBeDisabled());
}
async function submit() { fireEvent.click(screen.getByRole("button", { name: "Импортировать (1)" })); await screen.findByRole("button", { name: "Готово" }); }
describe("explicit imported course assignments", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockResolvedValue({ data: { success: true, import_preflight_confirmed: true, user_id: "learner", is_existing: true }, error: null }); mocks.enroll.mockResolvedValue([]); });
  it("does not replace a named unknown file course with the unrelated default", async () => {
    await showImport("Опечатанный курс");
    expect(screen.getByText("Опечатанный курс — не найден, не назначается")).toBeInTheDocument();
    await submit();
    expect(mocks.invoke).toHaveBeenCalledWith("register-student", expect.objectContaining({ body: expect.objectContaining({ course_id: null }) }));
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("assigns only the recognized file course even when another default is selected", async () => {
    await showImport("Выбранный курс");
    expect(within(screen.getByRole("table")).getByText("Выбранный курс")).toBeInTheDocument();
    await submit();
    expect(mocks.invoke).toHaveBeenCalledWith("register-student", expect.objectContaining({ body: expect.objectContaining({ course_id: "wanted" }) }));
    expect(mocks.enroll).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ user_id: "learner", course_id: "wanted" })]);
  });
  it("uses the explicitly selected default only for an empty file course", async () => {
    await showImport("");
    expect(within(screen.getByRole("table")).getByText("Другой курс (по умолчанию)")).toBeInTheDocument();
    await submit();
    expect(mocks.invoke).toHaveBeenCalledWith("register-student", expect.objectContaining({ body: expect.objectContaining({ course_id: "default" }) }));
    expect(mocks.enroll).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ user_id: "learner", course_id: "default" })]);
  });
});
