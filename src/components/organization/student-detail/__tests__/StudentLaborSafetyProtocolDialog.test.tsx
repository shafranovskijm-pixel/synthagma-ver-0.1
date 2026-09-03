import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), success: vi.fn() }));
vi.mock("@/api/studentLaborSafetyProtocol", () => ({
  fetchStudentLaborSafetyProtocol: (...args: unknown[]) => state.fetch(...args),
  saveStudentLaborSafetyProtocol: (...args: unknown[]) => state.save(...args),
}));
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => state.success(...args) } }));
vi.mock("@/components/ui/SigmaSpinner", () => ({ SigmaSpinner: () => <span /> }));

import { StudentLaborSafetyProtocolDialog } from "../StudentLaborSafetyProtocolDialog";

const protocol = {
  id: "p1", organization_id: "org-1", enrollment_id: "enr-1", protocol_number: "ОТ-7",
  source_enrollment_id: "enr-1", source_user_id: "student-1", source_course_id: "course-1",
  learner_name_snapshot: "Тестовый ученик", course_title_snapshot: "Программа А",
  knowledge_check_date: "2026-09-01", is_passed: false, version: 3,
  created_by: "u1", updated_by: "u1", created_at: "2026-09-04", updated_at: "2026-09-04",
};
const props = () => ({
  organizationId: "org-1", enrollmentId: "enr-1", courseTitle: "Программа А",
  canEdit: true, onClose: vi.fn(), onSaved: vi.fn(),
});

describe("StudentLaborSafetyProtocolDialog", () => {
  beforeEach(() => {
    state.fetch.mockReset().mockResolvedValue(null);
    state.save.mockReset().mockResolvedValue(protocol);
    state.success.mockReset();
  });

  it("starts blank, copies a legacy number only explicitly, and never invents date/result", async () => {
    render(<StudentLaborSafetyProtocolDialog {...props()} legacyProtocolNumber="П-OLD" />);
    expect(await screen.findByLabelText("Номер протокола *")).toHaveValue("");
    expect(screen.getByLabelText("Дата проверки знаний по протоколу *")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Сдал" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Не сдал" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Использовать этот номер" }));
    expect(screen.getByLabelText("Номер протокола *")).toHaveValue("П-OLD");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить протокол" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("выберите результат");
    expect(state.save).not.toHaveBeenCalled();
  });

  it("loads an explicit failed result and sends its exact version on update", async () => {
    const events = props();
    state.fetch.mockResolvedValue(protocol);
    render(<StudentLaborSafetyProtocolDialog {...events} />);
    expect(await screen.findByLabelText("Номер протокола *")).toHaveValue("ОТ-7");
    expect(screen.getByRole("radio", { name: "Не сдал" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить протокол" }));
    await waitFor(() => expect(events.onSaved).toHaveBeenCalledWith(protocol));
    expect(state.save).toHaveBeenCalledWith({
      organizationId: "org-1", enrollmentId: "enr-1", protocolNumber: "ОТ-7",
      knowledgeCheckDate: "2026-09-01", isPassed: false, expectedVersion: 3,
    });
    expect(events.onClose).toHaveBeenCalledOnce();
  });

  it("does not emit success after an uncertain save and requires a fresh read", async () => {
    const events = props();
    state.fetch.mockResolvedValue(protocol);
    state.save.mockRejectedValue(new Error("Повторное чтение не подтвердило сохранение"));
    render(<StudentLaborSafetyProtocolDialog {...events} />);
    await screen.findByLabelText("Номер протокола *");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить протокол" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Повторное чтение");
    expect(events.onSaved).not.toHaveBeenCalled();
    expect(events.onClose).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Сохранить протокол" })).toBeDisabled();
    state.fetch.mockResolvedValue({ ...protocol, version: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Обновить данные протокола" }));
    await screen.findByLabelText("Номер протокола *");
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Сохранить протокол" })).toBeEnabled();
  });

  it("shows missing-migration errors without offering an unsafe save", async () => {
    state.fetch.mockRejectedValue(new Error("Сохранение недоступно: обновление базы ещё не установлено"));
    render(<StudentLaborSafetyProtocolDialog {...props()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("обновление базы ещё не установлено");
    expect(screen.getByRole("button", { name: "Сохранить протокол" })).toBeDisabled();
    expect(screen.queryByLabelText("Номер протокола *")).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("does not offer editable fields without labor-safety write access", async () => {
    state.fetch.mockResolvedValue(protocol);
    render(<StudentLaborSafetyProtocolDialog {...props()} canEdit={false} />);
    expect(await screen.findByLabelText("Номер протокола *")).toBeDisabled();
    expect(screen.getByLabelText("Дата проверки знаний по протоколу *")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить протокол" })).toBeDisabled();
  });
});
