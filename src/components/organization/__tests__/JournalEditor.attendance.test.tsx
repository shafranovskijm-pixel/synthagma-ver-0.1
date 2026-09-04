import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "date-fns";

const state = vi.hoisted(() => ({
  value: "", loading: false, saving: false, writeBlocked: false, loadError: null as string | null, attendance: true,
  hasJournals: true, createOpen: false, deleteOpen: false,
  reloadJournal: vi.fn(), createJournal: vi.fn(), deleteJournal: vi.fn(),
  updateEntry: vi.fn(), setShowCreateDialog: vi.fn(), setShowDeleteDialog: vi.fn(), setWeekStart: vi.fn(),
}));
const entryDate = new Date(2026, 8, 4);
const student = { id: "profile-1", user_id: "user-1", full_name: "Тестовая Елизавета Олеговна", email: "test@example.test" };
const journal = { id: "journal-1", organization_id: "org-1", title: "Посещаемость", course_id: "course-1" };
const props = { organizationId: "org-1", journalType: "attendance", journalTitle: "Посещаемость", onClose: vi.fn() };
const cellLabel = (status: string) => `${student.full_name}, 04.09.2026: ${status}`;

vi.mock("@/hooks/useJournalEditor", () => ({ useJournalEditor: () => ({
  loading: state.loading, saving: state.saving, writeBlocked: state.writeBlocked, loadError: state.loadError, reloadJournal: state.reloadJournal,
  students: [student], courses: [], selectedCourse: "course-1", setSelectedCourse: vi.fn(),
  journalInstance: journal, dates: [entryDate], weekStart: entryDate, setWeekStart: state.setWeekStart,
  showCreateDialog: state.createOpen, setShowCreateDialog: state.setShowCreateDialog, showDeleteDialog: state.deleteOpen, setShowDeleteDialog: state.setShowDeleteDialog,
  newJournalTitle: "Посещаемость", setNewJournalTitle: vi.fn(), existingJournals: state.hasJournals ? [journal] : [], selectedJournalId: journal.id, setSelectedJournalId: vi.fn(),
  createJournal: state.createJournal, updateEntry: state.updateEntry, getEntryValue: () => state.value, deleteJournal: state.deleteJournal, isAttendanceJournal: state.attendance, addDays,
}) }));

import { JournalEditor } from "@/components/organization/JournalEditor";

describe("JournalEditor attendance cells", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.value = ""; state.loading = false; state.saving = false; state.writeBlocked = false; state.loadError = null; state.attendance = true;
    state.hasJournals = true; state.createOpen = false; state.deleteOpen = false;
  });

  it.each([
    ["present", "Присутствует", "lucide-check", "text-green-500"],
    ["absent", "Отсутствует", "lucide-x", "text-red-500"],
    ["late", "Опоздание", "lucide-minus", "text-amber-500"],
    ["excused", "Ув. причина", "lucide-check", "text-blue-500"],
  ])("shows %s with its actual icon and a student/date/status accessible name", (value, label, icon, color) => {
    state.value = value;
    render(<JournalEditor {...props} />);
    const cell = screen.getByRole("button", { name: cellLabel(label) });
    expect(cell.querySelector(`svg.${icon}`)).not.toBeNull();
    expect(cell.querySelectorAll("svg")).toHaveLength(1);
    expect(cell).toHaveClass(color);
    expect(cell).toBeEnabled();
    if (value === "absent" || value === "late") expect(cell.querySelector("svg.lucide-check")).toBeNull();
  });

  it("keeps unknown stored values as escaped text, not attendance or HTML", () => {
    state.value = '<img src=x onerror="alert(1)">legacy';
    render(<JournalEditor {...props} />);
    const cell = screen.getByRole("button", { name: cellLabel(`Неизвестное значение: ${state.value}`) });
    expect(cell).toHaveTextContent(state.value);
    expect(cell.querySelector("img")).toBeNull();
    expect(cell.querySelector("svg")).toBeNull();
    expect(cell).not.toHaveClass("text-green-500");
  });

  it("distinguishes an empty entry from an unknown or present value", () => {
    render(<JournalEditor {...props} />);
    const cell = screen.getByRole("button", { name: cellLabel("Не отмечено") });
    expect(cell).toHaveTextContent("—");
    expect(cell.querySelector("svg")).toBeNull();
  });

  it.each([
    ["Присутствует", "present"], ["Отсутствует", "absent"], ["Опоздание", "late"], ["Ув. причина", "excused"], ["Очистить", ""],
  ])("opens the real popover and writes %s using the existing updateEntry contract", async (label, value) => {
    render(<JournalEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: cellLabel("Не отмечено") }));
    fireEvent.click(await screen.findByRole("button", { name: label }));
    expect(state.updateEntry).toHaveBeenCalledTimes(1);
    expect(state.updateEntry).toHaveBeenCalledWith(student.user_id, entryDate, value);
  });

  it.each(["loading", "saving", "writeBlocked"] as const)("disables the entry trigger and already open choices while %s", async flag => {
    const view = render(<JournalEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: cellLabel("Не отмечено") }));
    await screen.findByRole("button", { name: "Отсутствует" });
    state[flag] = true;
    view.rerender(<JournalEditor {...props} />);
    expect(screen.getByRole("button", { name: cellLabel("Не отмечено") })).toBeDisabled();
    for (const label of ["Присутствует", "Отсутствует", "Опоздание", "Ув. причина", "Очистить"]) {
      const choice = screen.getByRole("button", { name: label });
      expect(choice).toBeDisabled();
      fireEvent.click(choice);
    }
    expect(state.updateEntry).not.toHaveBeenCalled();
    state[flag] = false;
    view.rerender(<JournalEditor {...props} />);
    expect(screen.getByRole("button", { name: cellLabel("Не отмечено") })).toBeEnabled();
  });

  it.each(["saving", "writeBlocked"] as const)("preserves grade entry and blocks every choice during %s", async flag => {
    state.attendance = false;
    state.value = "4";
    const view = render(<JournalEditor {...props} journalType="grades" />);
    const cell = screen.getByRole("button", { name: cellLabel("4") });
    expect(cell).toHaveTextContent("4");
    fireEvent.click(cell);
    for (const label of ["5", "4", "3", "2", "н/а", "зачёт", "незачёт", "×"]) expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    expect(state.updateEntry).toHaveBeenCalledWith(student.user_id, entryDate, "5");
    state[flag] = true;
    view.rerender(<JournalEditor {...props} journalType="grades" />);
    for (const label of ["5", "4", "3", "2", "н/а", "зачёт", "незачёт", "×"]) expect(screen.getByRole("button", { name: label })).toBeDisabled();
    expect(screen.getByRole("button", { name: cellLabel("4") })).toBeDisabled();
  });

  it("offers reload while writes are blocked, without blocking viewing or leaving the journal", () => {
    state.writeBlocked = true;
    state.loadError = "Не удалось подтвердить данные журнала.";
    const view = render(<JournalEditor {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent(state.loadError);
    const reload = screen.getByRole("button", { name: "Перезагрузить журнал" });
    expect(reload).toBeEnabled();
    fireEvent.click(reload);
    expect(state.reloadJournal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: cellLabel("Не отмечено") })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Новый журнал" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Удалить журнал" })).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeEnabled();
    expect(screen.getByRole("button", { name: "← Пред." })).toBeEnabled();
    expect(screen.getByRole("button", { name: "След. →" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть журнал" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    state.loading = true;
    view.rerender(<JournalEditor {...props} />);
    expect(screen.getByRole("button", { name: "Перезагрузить журнал" })).toBeDisabled();
    state.loading = false; state.saving = true;
    view.rerender(<JournalEditor {...props} />);
    expect(screen.getByRole("button", { name: "Перезагрузить журнал" })).toBeDisabled();
    state.saving = false;
    view.rerender(<JournalEditor {...props} />);
    expect(screen.getByRole("button", { name: "Перезагрузить журнал" })).toBeEnabled();
    expect(state.updateEntry).not.toHaveBeenCalled();
  });

  it("keeps the exit visible during an initial reload with no loaded journals", () => {
    state.hasJournals = false; state.loading = true; state.writeBlocked = true; state.loadError = "Ошибка загрузки";
    render(<JournalEditor {...props} />);
    expect(screen.getByRole("button", { name: "Закрыть журнал" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Перезагрузить журнал" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Новый журнал" })).toBeDisabled();
  });

  it.each(["create", "delete"] as const)("disables the already open %s confirmation while writes are blocked", target => {
    state.createOpen = target === "create"; state.deleteOpen = target === "delete"; state.writeBlocked = true;
    render(<JournalEditor {...props} />);
    const action = screen.getByRole("button", { name: target === "create" ? "Создать" : "Удалить" });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    if (target === "create") {
      expect(screen.getByPlaceholderText("Название")).toBeDisabled();
      expect(screen.getByRole("combobox")).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Отмена" })).toBeEnabled();
    expect(state.createJournal).not.toHaveBeenCalled();
    expect(state.deleteJournal).not.toHaveBeenCalled();
  });

  it("preserves the existing new-journal and week-navigation actions", () => {
    render(<JournalEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Новый журнал" }));
    expect(state.setShowCreateDialog).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "← Пред." }));
    expect(state.setWeekStart).toHaveBeenCalledWith(addDays(entryDate, -7));
    fireEvent.click(screen.getByRole("button", { name: "След. →" }));
    expect(state.setWeekStart).toHaveBeenCalledWith(addDays(entryDate, 7));
  });
});
