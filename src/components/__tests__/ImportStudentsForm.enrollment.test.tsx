import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ safeInvoke: vi.fn(), enroll: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.safeInvoke }));
vi.mock("@/api/enrollments", () => ({ insertEnrollmentsVerified: mocks.enroll }));
vi.mock("@/api/studentImportPreflight", () => ({
  assertStudentImportBackendRevision: async () => {},
  checkStudentImportRows: async (_org: string, rows: any[]) => rows.map(row => ({ rowIndex: row.rowIndex, blocked: [], warnings: [] })),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError, warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: [{ is_unlimited: true }], error: null }),
    from: (table: string) => {
      if (table === "student_groups") return { select: () => ({ eq: async () => ({ data: [] }) }) };
      if (table === "enrollments") return { select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) };
      throw new Error(`Unexpected table ${table}`);
    },
  },
}));

import ImportStudentsForm from "../ImportStudentsForm";

async function importPosition() {
  const { container } = render(<ImportStudentsForm organizationId="org-1" courses={[{ id: "course-1", title: "Курс" }]} companies={[]} onSuccess={vi.fn()} />);
  const file = new File([], "students.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => "ФИО;Логин;Должность;Курс\nИванов;qa-student;Водитель;Курс" });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await screen.findByText("Водитель");
  fireEvent.click(screen.getByRole("button", { name: "Импортировать (1)" }));
  await screen.findByRole("button", { name: "Готово" });
}

describe("student position import confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeInvoke.mockResolvedValue({ data: { success: true, import_preflight_confirmed: true, user_id: "student-1", is_existing: true, details_confirmed: true }, error: null });
    mocks.enroll.mockResolvedValue([]);
  });

  it("shows a partial result against an older Edge that ignores position and does not proceed with enrollment", async () => {
    await importPosition();
    expect(screen.getByText(/сервер не подтвердил должность/)).toBeInTheDocument();
    expect(screen.getByText("0 успешно")).toBeInTheDocument();
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.safeInvoke).toHaveBeenCalledWith("register-student", expect.objectContaining({ body: expect.objectContaining({ job_position: "Водитель", custom_login: "qa-student" }) }));
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith("Импортировано 1 учеников");
  });

  it("reports a confirmed position and completes course enrollment", async () => {
    mocks.safeInvoke.mockResolvedValueOnce({ data: { success: true, import_preflight_confirmed: true, user_id: "student-1", is_existing: true, details_confirmed: true, job_position_confirmed: true }, error: null });
    await importPosition();
    expect(screen.getByText("1 успешно")).toBeInTheDocument();
    await waitFor(() => expect(mocks.enroll).toHaveBeenCalledWith([expect.objectContaining({ user_id: "student-1", course_id: "course-1" })]));
  });

  it("retains the credentials and server explanation when persistence is partial", async () => {
    mocks.safeInvoke.mockResolvedValueOnce({ data: { partial_success: true, user_id: "student-1", login: "qa-created", password: "qa-test-password", error: "Ученик сохранён, но должность не подтверждена.", job_position_confirmed: false }, error: null });
    await importPosition();
    expect(screen.getByText("qa-created")).toBeInTheDocument();
    expect(screen.getByText("qa-test-password")).toBeInTheDocument();
    expect(screen.getByText(/должность не подтверждена/)).toBeInTheDocument();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
});
