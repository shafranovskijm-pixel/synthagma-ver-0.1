import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getDeletionStatus: vi.fn(), resumeAccountDeletion: vi.fn(), clearDeletedAccountSession: vi.fn() }));
vi.mock("../accountDeletion", () => ({ getDeletionStatus: api.getDeletionStatus, resumeAccountDeletion: api.resumeAccountDeletion }));
vi.mock("../clearDeletedAccountSession", () => ({ clearDeletedAccountSession: api.clearDeletedAccountSession }));
import AccountDeletionStatus from "@/pages/AccountDeletionStatus";
import { savePendingDeletion } from "../pendingDeletion";

function Destination() { const location = useLocation(); return <p>{location.pathname}{location.search}</p>; }
function show() {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/account/deletion-status"]}><Routes><Route path="/account/deletion-status" element={<AccountDeletionStatus />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter></QueryClientProvider>);
}
describe("account deletion recovery page", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); api.clearDeletedAccountSession.mockResolvedValue(true); });

  it("does not claim a deletion or send a mutation without a saved operation", () => {
    show(); expect(screen.getByText(/нет сохранённой операции/)).toBeInTheDocument();
    expect(api.getDeletionStatus).not.toHaveBeenCalled(); expect(api.resumeAccountDeletion).not.toHaveBeenCalled();
  });

  it("only reads status on load and resumes an already-confirmed operation after an explicit click", async () => {
    savePendingDeletion({ accountId: "user-1", requestId: "request-1", statusToken: "secret-not-in-url" });
    api.getDeletionStatus.mockResolvedValue({ status: "cleanup_pending", requestId: "request-1", message: "Обработка не завершена" });
    const receipt = { status: "deleted", requestId: "request-1", completedAt: "2026-10-07T07:00:00Z" };
    api.resumeAccountDeletion.mockResolvedValue(receipt);
    show(); await screen.findByText("Обработка не завершена");
    expect(api.resumeAccountDeletion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить обработку" }));
    await waitFor(() => expect(api.clearDeletedAccountSession).toHaveBeenCalledWith("user-1", "request-1", expect.any(QueryClient)));
    expect(await screen.findByText("/account/deletion-complete")).toBeInTheDocument();
    expect(screen.queryByText(/secret-not-in-url/)).not.toBeInTheDocument();
  });

  it("reports a planned operation as not deleted and never resumes it automatically", async () => {
    savePendingDeletion({ accountId: "user-1", requestId: "request-1", statusToken: "secret" });
    api.getDeletionStatus.mockResolvedValue({ status: "planned", requestId: "request-1" });
    show(); expect(await screen.findByText(/Сервер пока не начал удаление/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Продолжить обработку" })).not.toBeInTheDocument();
    expect(api.resumeAccountDeletion).not.toHaveBeenCalled(); expect(api.clearDeletedAccountSession).not.toHaveBeenCalled();
  });
});
