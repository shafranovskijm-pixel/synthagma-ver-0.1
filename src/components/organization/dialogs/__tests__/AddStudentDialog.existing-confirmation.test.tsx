import type { ReactNode } from "react";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
import { AddStudentDialog } from "../AddStudentDialog";
const courses = Array.from({ length: 6 }, (_, i) => ({ id: `course-${i + 1}`, title: `Учебный курс ${i + 1}`, is_published: true }));
const props = { onOpenChange: vi.fn(), courses, companies: [], groups: [], isCreating: false };
const existing = { user_id: "existing-pupil", full_name: "Импортированный ученик", login: "Sgt_100", courses: [{ id: "old", title: "Ранее назначенный курс" }] };
function fill() { fireEvent.change(screen.getByPlaceholderText("Иванов Иван Иванович"), { target: { value: "Ученик" } }); fireEvent.change(screen.getByPlaceholderText("student_12345"), { target: { value: "sgt_100" } }); fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 6" })); }
async function stage() { fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" })); return await screen.findByRole("region", { name: "Подтверждение существующего ученика" }); }
describe("manual existing pupil confirmation before writes", () => {
 it("does not submit until explicit confirmation and then adds only the current selection to the existing identity", async () => {
  const onSubmit = vi.fn(), check = vi.fn().mockResolvedValue(existing);
  render(<AddStudentDialog {...props} open contextKey="org" onSubmit={onSubmit} onCheckExisting={check} />); fill();
  const region = await stage(); expect(within(region).getByText("Ранее назначенный курс")).toBeInTheDocument(); expect(region).toHaveTextContent("ранее назначенные курсы сохранятся"); expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.click(within(region).getByRole("button", { name: "Подтвердить добавление к существующему" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ login: "Sgt_100", courseIds: ["course-6"] })));
  expect(check).toHaveBeenCalledTimes(2);
 });
 it("cancels without calling registration or changing any assignment", async () => {
  const onSubmit = vi.fn(); render(<AddStudentDialog {...props} open onSubmit={onSubmit} onCheckExisting={vi.fn().mockResolvedValue(existing)} />); fill(); const region = await stage();
  fireEvent.click(within(region).getByRole("button", { name: "Отмена" })); expect(onSubmit).not.toHaveBeenCalled(); expect(screen.queryByRole("region", { name: "Подтверждение существующего ученика" })).not.toBeInTheDocument();
 });
 it("opens the existing card without calling registration", async () => {
  const onSubmit = vi.fn(), open = vi.fn(); render(<AddStudentDialog {...props} open onSubmit={onSubmit} onOpenExisting={open} onCheckExisting={vi.fn().mockResolvedValue(existing)} />); fill(); const region = await stage();
  fireEvent.click(within(region).getByRole("button", { name: "Открыть карточку ученика" })); expect(open).toHaveBeenCalledExactlyOnceWith("existing-pupil"); expect(onSubmit).not.toHaveBeenCalled();
 });
 it("a lookup failure cannot proceed as a supposedly new pupil", async () => {
  const onSubmit = vi.fn(); render(<AddStudentDialog {...props} open onSubmit={onSubmit} onCheckExisting={vi.fn().mockRejectedValue(new Error("Не удалось проверить ученика"))} />); fill();
  fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" })); expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось проверить ученика"); expect(onSubmit).not.toHaveBeenCalled();
 });
 it("a successful no-match lookup keeps ordinary creation to one click", async () => {
  const onSubmit = vi.fn(); render(<AddStudentDialog {...props} open onSubmit={onSubmit} onCheckExisting={vi.fn().mockResolvedValue(null)} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ login: "sgt_100", courseIds: ["course-6"] })));
 });
 it("invalidates an old confirmation when input changes", async () => {
  const onSubmit = vi.fn(); render(<AddStudentDialog {...props} open onSubmit={onSubmit} onCheckExisting={vi.fn().mockResolvedValue(existing)} />); fill(); await stage();
  fireEvent.change(screen.getByPlaceholderText("student_12345"), { target: { value: "different" } }); expect(screen.queryByRole("region", { name: "Подтверждение существующего ученика" })).not.toBeInTheDocument(); expect(onSubmit).not.toHaveBeenCalled();
 });
 it("invalidates another organization and discards a late lookup response", async () => {
  let resolve!: (value: any) => void; const check = vi.fn(() => new Promise<any>(r => { resolve = r; })), onSubmit = vi.fn();
  const { rerender } = render(<AddStudentDialog {...props} open contextKey="old" onSubmit={onSubmit} onCheckExisting={check} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));
  rerender(<AddStudentDialog {...props} open contextKey="new" onSubmit={onSubmit} onCheckExisting={check} />); resolve(existing);
  await waitFor(() => expect(screen.getByRole("button", { name: "Добавить ученика" })).not.toBeDisabled()); expect(screen.queryByText(/Импортированный ученик/)).not.toBeInTheDocument(); expect(onSubmit).not.toHaveBeenCalled();
 });
 it("requires a new explicit confirmation if retained assignments change during the check", async () => {
  const newer = { ...existing, courses: [...existing.courses, { id: "old2", title: "Ещё прежний курс" }] }, onSubmit = vi.fn(); const check = vi.fn().mockResolvedValue(newer).mockResolvedValueOnce(existing);
  render(<AddStudentDialog {...props} open onSubmit={onSubmit} onCheckExisting={check} />); fill(); const region = await stage(); fireEvent.click(within(region).getByRole("button", { name: "Подтвердить добавление к существующему" }));
  expect(await screen.findByText("Ещё прежний курс")).toBeInTheDocument(); expect(onSubmit).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Подтвердить добавление к существующему" })); await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
 });
 it("keeps an unpublished selected course visible and blocks submission until explicitly removed", async () => {
  const onSubmit = vi.fn(); const { rerender } = render(<AddStudentDialog {...props} open onSubmit={onSubmit} />); fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 6" }));
  rerender(<AddStudentDialog {...props} courses={courses.map(c => c.id === "course-6" ? { ...c, is_published: false } : c)} open onSubmit={onSubmit} />);
  expect(within(screen.getByRole("region", { name: "Выбранные курсы" })).getByText(/Учебный курс 6 — больше недоступен/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" })); expect(await screen.findByRole("alert")).toHaveTextContent("больше недоступен"); expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Убрать курс: Учебный курс 6" })); fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" })); await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ courseIds: [] })));
 });
});
