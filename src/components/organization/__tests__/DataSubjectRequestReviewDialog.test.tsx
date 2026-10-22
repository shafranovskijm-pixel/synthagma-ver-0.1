import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { DataSubjectRequestReviewDialog } from "../DataSubjectRequestReviewDialog";
import type { DataSubjectRequest } from "@/hooks/useDataSubjectRequests";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useDataSubjectRequests", () => ({ DSR_TYPE_LABELS: { access: "Получить копию данных" } }));
const request: DataSubjectRequest = { id: "r", user_id: "u", organization_id: "o", request_type: "access", status: "pending", description: "Нужна копия", contact_email: "synthetic@example.test", attachment_urls: null, response: null, due_date: null, resolved_at: null, resolved_by: null, created_at: "2026-10-22", updated_at: "2026-10-22", deadline_revision: 0, deadline_details: null };
describe("UC023 operator decision workflow", () => {
  it("requires actual trigger facts and sends facts for server calculation, never an invented due_date", async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(<Dialog open><DataSubjectRequestReviewDialog request={request} saving={false} onClose={vi.fn()} onSave={save} /></Dialog>);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" })); expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Фактическая дата события"), { target: { value: "2026-10-22" } });
    fireEvent.change(screen.getByLabelText("Часовой пояс оператора (IANA)"), { target: { value: "Asia/Vladivostok" } });
    fireEvent.change(screen.getByLabelText("Основание этой записи в истории"), { target: { value: "Получение требования подтверждено входящим журналом" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toBe("review"); expect(save.mock.calls[0][1]).toMatchObject({ basis: "access", facts_confirmed: true, trigger_on: "2026-10-22", calendar_id: "rf-five-day-2026" });
    expect(save.mock.calls[0][1]).not.toHaveProperty("due_date");
  });
  it("preserves an old closed request as historical evidence and offers no mutation action", () => {
    render(<Dialog open><DataSubjectRequestReviewDialog request={{ ...request, status: "resolved", due_date: "2026-09-01", response: "Ответ сохранён ранее" }} saving={false} onClose={vi.fn()} onSave={vi.fn()} /></Dialog>);
    expect(screen.getByText(/Исторический срок/)).toBeInTheDocument();
    expect(screen.getByText("Ответ сохранён ранее")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
  });
});
