import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getDeletionPreview: vi.fn(), confirmAccountDeletion: vi.fn() }));
vi.mock("../accountDeletion", async importOriginal => ({ ...(await importOriginal<typeof import("../accountDeletion")>()), ...api }));
import { AccountDeletionError, type DeletionPreview } from "../accountDeletion";
import { AccountDeletionPanel } from "../AccountDeletionPanel";

const preview: DeletionPreview = { revision: "account-deletion-v2", consentVersion: "full-personal-data-v1", warning: "Будут удалены аккаунт и перечисленные личные данные.", canDelete: true, planToken: "plan", requestId: "request-1", statusToken: "opaque-capability", expiresAt: "2099-01-01T00:00:00Z", categories: [{ key: "profile", label: "Личный профиль", count: 1, action: "delete" }], blockers: [] };
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
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Удаление необратимо")).toBeVisible();
    expect(dialog.getByText(preview.warning)).toBeVisible();
    expect(dialog.getByText(/Вы потеряете доступ к аккаунту/)).toHaveTextContent("Восстановить их после завершения операции нельзя.");
    expect(dialog.getByText("До подтверждения скачайте нужные вам документы и учебные материалы.")).toBeVisible();
    expect(dialog.getByRole("list", { name: "Последствия для данных" })).toHaveTextContent("Личный профиль: 1Будет удалено");
    expect(dialog.getByRole("checkbox", { name: /Я понимаю, что удаление аккаунта/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Удалить мой аккаунт" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "my-password" } });
    expect(screen.getByRole("button", { name: "Удалить мой аккаунт" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Удалить мой аккаунт" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(receipt));
    expect(api.confirmAccountDeletion).toHaveBeenCalledWith("plan", "my-password", { requestId: "request-1", statusToken: "opaque-capability" }, "full-personal-data-v1");
  });

  it("requires the password even after acknowledgement and disables confirmation when acknowledgement is withdrawn", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить удаление" }));
    const button = screen.getByRole("button", { name: "Удалить мой аккаунт" });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(api.confirmAccountDeletion).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "my-password" } });
    expect(button).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeDisabled();
  });

  it("shows retained and anonymized categories inside the final dialog without promising their deletion", async () => {
    api.getDeletionPreview.mockResolvedValue({ ...preview, categories: [
      ...preview.categories,
      { key: "history", label: "История обучения", count: 3, action: "anonymize" },
      { key: "records", label: "Сохраняемые записи", count: 2, action: "retain" },
    ] });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить удаление" }));
    const dialog = within(screen.getByRole("dialog"));
    const rows = within(dialog.getByRole("list", { name: "Последствия для данных" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Личный профиль: 1Будет удалено");
    expect(rows[1]).toHaveTextContent("История обучения: 3Будет обезличено, записи останутся");
    expect(rows[2]).toHaveTextContent("Сохраняемые записи: 2Будет сохранено");
    expect(dialog.getByText(/Часть данных останется в системе/)).toBeVisible();
    expect(dialog.getByRole("checkbox")).toHaveAccessibleName(/данных, отмеченных «Будет удалено»/);
    expect(api.confirmAccountDeletion).not.toHaveBeenCalled();
  });

  it("requires new acknowledgement and a password when the dialog is reopened", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить удаление" }));
    fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "my-password" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить удаление" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByLabelText("Текущий пароль")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Удалить мой аккаунт" })).toBeDisabled();
    expect(api.confirmAccountDeletion).not.toHaveBeenCalled();
  });

  it("does not offer confirmation without a list of consequences", async () => {
    api.getDeletionPreview.mockResolvedValue({ ...preview, categories: [] });
    show();
    expect(await screen.findByRole("button", { name: "Продолжить удаление" })).toBeDisabled();
    expect(screen.getByText(/Сервер не указал последствия для данных/)).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.confirmAccountDeletion).not.toHaveBeenCalled();
  });

  it("does not offer confirmation without the current server warning", async () => {
    api.getDeletionPreview.mockResolvedValue({ ...preview, warning: "" });
    show();
    expect(await screen.findByRole("button", { name: "Продолжить удаление" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.confirmAccountDeletion).not.toHaveBeenCalled();
  });

  it("shows exact blockers without linking to an untrusted external destination", async () => {
    api.getDeletionPreview.mockResolvedValue({ ...preview, canDelete: false, planToken: null, expiresAt: null,
      categories: [{ key: "org", label: "Организация", count: 1, action: "block" }],
      blockers: [{ code: "OWNER", message: "Сначала передайте владение организацией", actionHref: "//attacker.example" }] });
    show();
    expect(await screen.findByText("Сначала передайте владение организацией")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить удаление" })).toBeDisabled();
    expect(screen.getByText("Требует решения до удаления")).toBeVisible();
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

  it("requires a fresh preview and acknowledgement after a pre-mutation consent refusal", async () => {
    api.confirmAccountDeletion.mockRejectedValue(new AccountDeletionError("CONSENT_REQUIRED", "Подтвердите новые условия удаления"));
    const onDeleted = show(); await confirm();
    expect(await screen.findByText("Подтвердите новые условия удаления")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Продолжить удаление" })).not.toBeInTheDocument();
    expect(localStorage.getItem("sintagma-account-deletion-pending-v1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Обновить проверку" }));
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить удаление" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByLabelText("Текущий пароль")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Удалить мой аккаунт" })).toBeDisabled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(api.confirmAccountDeletion).toHaveBeenCalledTimes(1);
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
