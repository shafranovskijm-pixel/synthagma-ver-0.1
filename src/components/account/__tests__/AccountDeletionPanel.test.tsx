import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getDeletionPreview: vi.fn(), confirmAccountDeletion: vi.fn() }));
vi.mock("../accountDeletion", async importOriginal => ({ ...(await importOriginal<typeof import("../accountDeletion")>()), ...api }));
import { AccountDeletionError, type DeletionPreview } from "../accountDeletion";
import { AccountDeletionPanel } from "../AccountDeletionPanel";

const preview: DeletionPreview = { revision: "account-deletion-v1", canDelete: true, planToken: "plan", requestId: "request-1", statusToken: "opaque-capability", expiresAt: "2099-01-01T00:00:00Z", categories: [{ key: "profile", label: "Личный профиль", count: 1, action: "delete" }], blockers: [] };
const receipt = { status: "deleted", requestId: "request-1", completedAt: "2026-10-07T07:00:00Z" };
function show(onDeleted = vi.fn()) { render(<MemoryRouter><AccountDeletionPanel accountId="user-1" accountLabel="qa@example.test" onDeleted={onDeleted} /></MemoryRouter>); return onDeleted; }
async function confirm() {
  fireEvent.click(await screen.findByRole("button", { name: "Продолжить удаление" }));
  fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "my-password" } });
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Удалить мой аккаунт" })); });
}

describe("account deletion confirmation", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); api.getDeletionPreview.mockResolvedValue(preview); });

  it("requires password and acknowledgement and reports only a server-confirmed deletion", async () => {
    api.confirmAccountDeletion.mockResolvedValue(receipt);
    const onDeleted = show();
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить удаление" }));
    expect(api.confirmAccountDeletion).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Удалить мой аккаунт" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "my-password" } });
    expect(screen.getByRole("button", { name: "Удалить мой аккаунт" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Удалить мой аккаунт" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(receipt));
    expect(api.confirmAccountDeletion).toHaveBeenCalledWith("plan", "my-password", { requestId: "request-1", statusToken: "opaque-capability" });
  });

  it("shows exact blockers without linking to an untrusted external destination", async () => {
    api.getDeletionPreview.mockResolvedValue({ ...preview, canDelete: false, planToken: null, expiresAt: null, blockers: [{ code: "OWNER", message: "Сначала передайте владение организацией", actionHref: "//attacker.example" }] });
    show();
    expect(await screen.findByText("Сначала передайте владение организацией")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить удаление" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Перейти к решению" })).not.toBeInTheDocument();
    expect(api.confirmAccountDeletion).not.toHaveBeenCalled();
  });

  it("keeps the confirmation open and clears the password after reauthentication refusal", async () => {
    api.confirmAccountDeletion.mockRejectedValue(new AccountDeletionError("REAUTH_FAILED", "Неверный пароль"));
    const onDeleted = show(); await confirm();
    expect(await screen.findByText("Неверный пароль")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Текущий пароль")).toHaveValue("");
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it.each(["cleanup", "network"])("does not claim success or offer another destructive attempt on %s uncertainty", async mode => {
    if (mode === "cleanup") api.confirmAccountDeletion.mockResolvedValue({ status: "cleanup_pending", requestId: "request-1", message: "Обработка ещё не завершена" });
    else api.confirmAccountDeletion.mockRejectedValue(new AccountDeletionError("CONNECTION_ERROR", "Ответ сервера не получен", "unknown"));
    const onDeleted = show(); await confirm();
    expect(await screen.findByText("Удаление ещё не подтверждено")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Продолжить удаление" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Обновить проверку" })).not.toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(api.confirmAccountDeletion).toHaveBeenCalledTimes(1);
  });

  it("disables an expired plan before asking for a password", async () => {
    api.getDeletionPreview.mockResolvedValue({ ...preview, expiresAt: "2020-01-01T00:00:00Z" });
    show();
    expect(await screen.findByRole("button", { name: "Продолжить удаление" })).toBeDisabled();
    expect(screen.getByText(/Срок этой проверки истёк/)).toBeInTheDocument();
    expect(api.confirmAccountDeletion).not.toHaveBeenCalled();
  });

  it("ignores an old account's late preview after switching accounts", async () => {
    let resolveOld!: (value: DeletionPreview) => void;
    api.getDeletionPreview.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const { rerender } = render(<MemoryRouter><AccountDeletionPanel key="old" accountId="old" accountLabel="old@example.test" onDeleted={vi.fn()} /></MemoryRouter>);
    api.getDeletionPreview.mockResolvedValueOnce({ ...preview, canDelete: false, planToken: null, blockers: [{ code: "OWNER", message: "Новая учётная запись владеет организацией" }] });
    rerender(<MemoryRouter><AccountDeletionPanel key="new" accountId="new" accountLabel="new@example.test" onDeleted={vi.fn()} /></MemoryRouter>);
    await screen.findByText("Новая учётная запись владеет организацией");
    await act(async () => resolveOld(preview));
    expect(screen.getByRole("button", { name: "Продолжить удаление" })).toBeDisabled();
    expect(screen.getByText("Новая учётная запись владеет организацией")).toBeInTheDocument();
  });

  it("sends a pending confirmation once even on repeated clicks", async () => {
    let resolve!: (value: typeof receipt) => void;
    api.confirmAccountDeletion.mockReturnValue(new Promise(r => { resolve = r; }));
    const onDeleted = show(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Удалить мой аккаунт" }));
    expect(api.confirmAccountDeletion).toHaveBeenCalledTimes(1);
    await act(async () => resolve(receipt));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("still triggers owner cleanup if deletion completes after navigating away", async () => {
    let resolve!: (value: typeof receipt) => void;
    api.confirmAccountDeletion.mockReturnValue(new Promise(r => { resolve = r; }));
    const onDeleted = vi.fn();
    const { unmount } = render(<MemoryRouter><AccountDeletionPanel accountId="user-1" accountLabel="qa@example.test" onDeleted={onDeleted} /></MemoryRouter>);
    await confirm(); unmount();
    await act(async () => resolve(receipt));
    expect(onDeleted).toHaveBeenCalledWith(receipt);
    expect(JSON.parse(localStorage.getItem("sintagma-account-deletion-pending-v1") || "null")).toEqual({ accountId: "user-1", requestId: "request-1", statusToken: "opaque-capability" });
  });
});
