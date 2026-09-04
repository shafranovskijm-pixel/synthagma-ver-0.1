import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupDocumentRow } from "@/hooks/useGroupDocuments";
import type { ReconciledGroupDocuments } from "@/lib/group-docs/packageReconciliation";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), receipt: vi.fn(), reconcile: vi.fn(), refresh: vi.fn(), saveGenerated: vi.fn(), remove: vi.fn(),
  success: vi.fn(), warning: vi.fn(), error: vi.fn(), onDataChanged: vi.fn(),
}));
// Keep the real completion card mounted; only supply its external auth context.
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "00000000-0000-4000-8000-000000000001" }, loading: false,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useGroupDocuments", () => ({ useGroupDocuments: () => ({
  documents: [], loading: false, refresh: mocks.refresh, saveGenerated: mocks.saveGenerated, remove: mocks.remove,
}) }));
vi.mock("@/hooks/useGroupFactualData", async () => {
  const { emptyFactualData } = await import("@/lib/group-docs/factualData");
  return { useGroupFactualData: () => ({ factual: emptyFactualData(), loading: false }) };
});
vi.mock("@/lib/group-docs/docxJournal", () => ({ generateClassJournalDocx: mocks.generate, readClassJournalOperation: mocks.receipt }));
vi.mock("@/lib/group-docs/packageReconciliation", () => ({ reconcileGroupDocumentPackage: mocks.reconcile }));
vi.mock("@/lib/group-docs/generate", () => ({
  generatePackage: () => [], generateDocument: vi.fn(), downloadHtml: vi.fn(), groupDocumentDate: () => "2026-09-04",
}));
vi.mock("@/utils/storageHelpers", () => ({ downloadPrivateFile: vi.fn() }));
vi.mock("../GenerateContractDialog", () => ({ GenerateContractDialog: () => null }));
vi.mock("../GenerateDocxContractDialog", () => ({ GenerateDocxContractDialog: () => null }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: vi.fn() } }));

import { GroupDocumentsFolder } from "../GroupDocumentsFolder";
import { SAMPLE_CONTEXT } from "@/lib/group-docs/sampleContext";
import { GORELTECH_ORGANIZATION_ID } from "@/lib/group-docs/clientProfile";
import { clearAcknowledgedPackageOperation, packageOperationAcknowledgmentKey, packageOperationStorageKey, readStoredPackageOperation, persistPackageOperation } from "@/lib/group-docs/packageOperationStorage";

let groupA = "group-a";
let groupB = "group-b";
let testScope = 0;
const saveReply = { version: 1, batchId: "batch-1", dryRun: false, warnings: [], operationId: null as string | null };
const acknowledgment = (call = 0) => ({ ...saveReply, operationId: mocks.generate.mock.calls[call][0].operationId as string });
const storageKey = () => packageOperationStorageKey({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA });
const pendingStoredOperation = () => readStoredPackageOperation({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA });
function folder(groupId = groupA) {
  const ctx = structuredClone(SAMPLE_CONTEXT);
  ctx.organization.id = GORELTECH_ORGANIZATION_ID;
  ctx.group.instructor_name = "Ляпко Дарья Константиновна";
  return <GroupDocumentsFolder organizationId={GORELTECH_ORGANIZATION_ID} groupId={groupId}
    groupName={groupId} students={ctx.students} ctx={ctx} onDataChanged={mocks.onDataChanged} />;
}
function row(groupId = groupA): GroupDocumentRow {
  return {
    id: `document-${groupId}`, organization_id: GORELTECH_ORGANIZATION_ID, group_id: groupId,
    doc_type: "class_journal", name: `Подтверждённый журнал ${groupId}`, document_number: null,
    document_date: "2026-09-04", variables: {}, html: null, file_path: `${groupId}/journal.docx`,
    status: "active", created_at: "2026-09-04T00:00:00Z", layout_format: "docx_ooxml",
    package_batch_id: "batch-7", package_version: 7, is_current: true,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function confirmSignatories() {
  fireEvent.click(screen.getByRole("button", { name: "Подписанты документов" }));
  fireEvent.click(await screen.findByRole("button", { name: "Подтвердить подписантов" }));
}
function rebuild() { return screen.getByRole("button", { name: "Пересобрать 9 Word-документов" }); }
function reread() { return screen.getByRole("button", { name: "Проверить операцию и перечитать список" }); }
function dryRun() { return screen.getByRole("button", { name: "Проверить 9 Word-документов без сохранения" }); }

describe("GroupDocumentsFolder unknown package outcome", () => {
  beforeEach(() => {
    // A real unresolved gate intentionally survives component cleanup. Each
    // scenario uses its own tenant/group scope rather than resetting that guard.
    testScope += 1;
    groupA = `group-a-${testScope}`;
    groupB = `group-b-${testScope}`;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    mocks.generate.mockReset().mockImplementation(async (params: { operationId?: string; dryRun?: boolean }) => ({ ...saveReply, operationId: params.operationId ?? null, dryRun: params.dryRun === true }));
    mocks.receipt.mockReset().mockResolvedValue(null);
    mocks.reconcile.mockReset().mockResolvedValue({ documents: [], currentVersion: null });
    mocks.refresh.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(true);
  });
  afterEach(cleanup);

  it("closes the ref gate synchronously before a second click can start another save", async () => {
    const pending = deferred<typeof saveReply>();
    mocks.generate.mockReturnValueOnce(pending.promise);
    render(folder());
    await confirmSignatories();
    const button = rebuild();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA, dryRun: false,
    }));
    await act(async () => { pending.resolve(acknowledgment()); await pending.promise; });
    await waitFor(() => expect(button).toBeEnabled());
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("does not treat a void legacy refresh as confirmation after a failed mutation", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Ответ потерян"));
    mocks.reconcile.mockRejectedValueOnce(new Error("Перечитывание не подтверждено"));
    render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    expect(await screen.findByRole("alert")).toHaveTextContent("Сохранение пакета не подтверждено");
    expect(rebuild()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Пакет компании (Word клиента)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Пакет физлица" })).toBeDisabled();
    fireEvent.click(rebuild());
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    fireEvent.click(reread());
    await screen.findByText("Перечитывание не подтверждено");
    expect(rebuild()).toBeDisabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("unlocks only for the exact terminal receipt and distinguishes its historical version from the list", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Ответ потерян"));
    mocks.receipt.mockImplementation(async ({ operationId }: { operationId: string }) => ({ ...saveReply, operationId }));
    mocks.reconcile.mockResolvedValueOnce({ documents: [row()], currentVersion: 7 });
    render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    const button = reread();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(rebuild()).toBeEnabled());
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA });
    expect(screen.getByRole("status")).toHaveTextContent("Сервер подтвердил сохранённую партию операции: версия 1");
    expect(screen.getByRole("status")).toHaveTextContent("Текущая версия по перечитанному списку: 7");
    expect(screen.getByText(row().name)).toBeInTheDocument();
    expect(screen.getByText("Файлов: 1")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    const firstOperationId = mocks.generate.mock.calls[0][0].operationId;
    expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA, operationId: firstOperationId });
    expect(pendingStoredOperation()).toBeNull();
    expect(localStorage.getItem(storageKey())).toBe(firstOperationId);
    fireEvent.click(rebuild());
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
    expect(mocks.generate.mock.calls[1][0].operationId).not.toBe(firstOperationId);
  });

  it.each([0, 7])("keeps an unknown request locked when the visible list reports version %i without a receipt", async version => {
    mocks.generate.mockRejectedValueOnce(new Error("Ответ потерян"));
    mocks.reconcile.mockResolvedValue({ documents: version ? [row()] : [], currentVersion: version || null });
    render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    fireEvent.click(reread());
    await waitFor(() => expect(reread()).toBeEnabled());
    expect(rebuild()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Сервер ещё не подтвердил завершение этой операции");
    expect(screen.getByRole("status")).toHaveTextContent("Сам список не подтверждает завершение или откат");
    expect(localStorage.getItem(storageKey())).toBe(mocks.generate.mock.calls[0][0].operationId);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("a failed dry-run does not create a mutation lock or an automatic retry", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Проверка недоступна"));
    render(folder());
    await confirmSignatories();
    fireEvent.click(dryRun());
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Ошибка генерации: Проверка недоступна"));
    expect(rebuild()).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ dryRun: true }));
    expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty("operationId");
    expect(localStorage.getItem(storageKey())).toBeNull();
  });

  it("allows dry-run while write outcome is unknown but it cannot unlock another save", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Ответ потерян"))
      .mockResolvedValueOnce({ ...saveReply, dryRun: true });
    render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    expect(dryRun()).toBeEnabled();
    fireEvent.click(dryRun());
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(dryRun()).toBeEnabled());
    expect(rebuild()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Сохранение пакета не подтверждено");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.generate.mock.calls[1][0]).not.toHaveProperty("operationId");
    expect(localStorage.getItem(storageKey())).toBe(mocks.generate.mock.calls[0][0].operationId);
  });

  it("does not paint or unlock group B from a late reconciliation of group A", async () => {
    const pendingRead = deferred<ReconciledGroupDocuments>();
    mocks.generate.mockRejectedValue(new Error("Ответ потерян"));
    mocks.reconcile.mockReturnValueOnce(pendingRead.promise);
    const view = render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    fireEvent.click(reread());
    view.rerender(folder(groupB));
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    await act(async () => { pendingRead.resolve({ documents: [row()], currentVersion: 7 }); await pendingRead.promise; });
    expect(rebuild()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Сохранение пакета не подтверждено");
    expect(screen.queryByText(row().name)).not.toBeInTheDocument();
    expect(screen.queryByText(/Текущая версия пакета: 7/)).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("an old group's save response cannot clear the new group's unknown outcome", async () => {
    const oldSave = deferred<typeof saveReply>();
    mocks.generate.mockReturnValueOnce(oldSave.promise).mockRejectedValueOnce(new Error("Ошибка группы Б"));
    const view = render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    view.rerender(folder(groupB));
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    await act(async () => { oldSave.resolve(acknowledgment()); await oldSave.promise; });
    expect(rebuild()).toBeDisabled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.onDataChanged).not.toHaveBeenCalled();
  });

  it("preserves a pending gate across A → B → A and accepts only its late exact acknowledgment", async () => {
    const oldSave = deferred<typeof saveReply>();
    mocks.generate.mockReturnValueOnce(oldSave.promise);
    const view = render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    view.rerender(folder(groupB));
    view.rerender(folder(groupA));
    expect(screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Проверить операцию и перечитать список" })).not.toBeInTheDocument();
    await act(async () => { oldSave.resolve(acknowledgment()); await oldSave.promise; });
    await waitFor(() => expect(screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(pendingStoredOperation()).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps a pending save locked after tab unmount/remount and applies its late exact acknowledgment", async () => {
    const oldSave = deferred<typeof saveReply>();
    mocks.generate.mockReturnValueOnce(oldSave.promise);
    const firstVisit = render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    firstVisit.unmount();
    render(folder());
    const blockedRebuild = screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" });
    expect(blockedRebuild).toBeDisabled();
    expect(screen.getByRole("button", { name: "Подписанты документов" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Проверить операцию и перечитать список" })).not.toBeInTheDocument();
    fireEvent.click(blockedRebuild);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await act(async () => { oldSave.resolve(acknowledgment()); await oldSave.promise; });
    await waitFor(() => expect(blockedRebuild).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(pendingStoredOperation()).toBeNull();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await confirmSignatories();
    fireEvent.click(rebuild());
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
  });

  it("retains an already unknown result while the tab is closed, but not after confirmed recovery", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Ответ потерян"));
    const firstVisit = render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    firstVisit.unmount();
    // Let idle-entry cleanup run: unknown outcomes must not be discarded.
    await act(async () => { await Promise.resolve(); });
    const secondVisit = render(folder());
    expect(screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" })).toBeDisabled();
    expect(reread()).toBeEnabled();
    mocks.receipt.mockImplementation(async ({ operationId }: { operationId: string }) => ({ ...saveReply, operationId }));
    fireEvent.click(reread());
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    secondVisit.unmount();
    await act(async () => { await Promise.resolve(); });
    render(folder());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Список документов перечитан/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" })).toBeEnabled();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("explicitly retries the same durable operation ID without creating a new intent", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Потерян ответ"));
    render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    const operationId = mocks.generate.mock.calls[0][0].operationId;
    expect(localStorage.getItem(storageKey())).toBe(operationId);
    expect(screen.getByRole("alert")).toHaveTextContent("текущие изменения формы не гарантируются");
    fireEvent.click(reread());
    await waitFor(() => expect(reread()).toBeEnabled());
    expect(rebuild()).toBeDisabled();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    const retry = screen.getByRole("button", { name: "Повторить сохранение без дубликата" });
    act(() => { fireEvent.click(retry); fireEvent.click(retry); });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
    expect(mocks.generate.mock.calls[1][0].operationId).toBe(operationId);
    await waitFor(() => expect(pendingStoredOperation()).toBeNull());
    expect(localStorage.getItem(storageKey())).toBe(operationId);
    expect(mocks.success).not.toHaveBeenCalledWith(expect.stringContaining("(текущая)"));
  });

  it("restores a persisted operation before any mutation on first mount", async () => {
    const operationId = "11111111-1111-4111-8111-111111111111";
    localStorage.setItem(storageKey(), operationId);
    render(folder());
    expect(screen.getByRole("alert")).toHaveTextContent("Сохранение пакета не подтверждено");
    expect(screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" })).toBeDisabled();
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(reread());
    await waitFor(() => expect(reread()).toBeEnabled());
    expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA, operationId });
    expect(localStorage.getItem(storageKey())).toBe(operationId);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("restores the same contract selection on retry after a full remount", async () => {
    const operationId = "11111111-1111-4111-8111-111111111121";
    const contractIds = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];
    persistPackageOperation({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA }, operationId, contractIds, "data");
    render(folder());
    await confirmSignatories();
    fireEvent.click(screen.getByRole("button", { name: "Повторить сохранение без дубликата" }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ operationId, contractIds, fillMode: "data" }));
  });

  it("allows read-only reconciliation but never retries a legacy operation with an unknown contract selection", async () => {
    const operationId = "11111111-1111-4111-8111-111111111131";
    localStorage.setItem(storageKey(), operationId);
    render(folder());
    await confirmSignatories();
    fireEvent.click(screen.getByRole("button", { name: "Повторить сохранение без дубликата" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Исходный выбор договоров")));
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(reread());
    await waitFor(() => expect(mocks.receipt).toHaveBeenCalledWith({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA, operationId }));
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not clear storage or unlock a different-operation receipt", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Ответ потерян"));
    mocks.receipt.mockResolvedValueOnce({ ...saveReply, operationId: "22222222-2222-4222-8222-222222222222" });
    render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await screen.findByRole("alert");
    const originalId = localStorage.getItem(storageKey());
    fireEvent.click(reread());
    await screen.findByText(/Сервер вернул подтверждение другой операции/);
    expect(rebuild()).toBeDisabled();
    expect(localStorage.getItem(storageKey())).toBe(originalId);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps actor-denied recovery visible and does not fall back to a new operation", async () => {
    localStorage.setItem(storageKey(), "33333333-3333-4333-8333-333333333333");
    mocks.receipt.mockRejectedValueOnce(new Error("403: операция создана другим пользователем"));
    render(folder());
    fireEvent.click(reread());
    await screen.findByText("403: операция создана другим пользователем");
    expect(localStorage.getItem(storageKey())).toBe("33333333-3333-4333-8333-333333333333");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("does not send a save when durable storage cannot confirm the UUID", async () => {
    render(folder());
    await confirmSignatories();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    fireEvent.click(rebuild());
    expect(await screen.findByRole("alert")).toHaveTextContent("Запрос сохранения не отправлен");
    expect(rebuild()).toBeDisabled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Повторить сохранение без дубликата" })).toBeDisabled();
  });

  it("fails closed for a corrupt storage ID while retaining the read-only dry-run", async () => {
    localStorage.setItem(storageKey(), "not-an-operation-id");
    render(folder());
    expect(screen.getByRole("alert")).toHaveTextContent("идентификатор операции повреждён");
    expect(screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" })).toBeDisabled();
    expect(reread()).toBeDisabled();
    await confirmSignatories();
    fireEvent.click(dryRun());
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.generate.mock.calls[0][0]).toEqual(expect.objectContaining({ dryRun: true }));
    expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty("operationId");
    expect(localStorage.getItem(storageKey())).toBe("not-an-operation-id");
  });

  it("adopts another tab's pending ID but never treats a storage removal event as a receipt", async () => {
    render(folder());
    await confirmSignatories();
    const operationId = "44444444-4444-4444-8444-444444444444";
    act(() => {
      localStorage.setItem(storageKey(), operationId);
      window.dispatchEvent(new StorageEvent("storage", { key: storageKey(), newValue: operationId }));
    });
    expect(rebuild()).toBeDisabled();
    act(() => {
      localStorage.removeItem(storageKey());
      window.dispatchEvent(new StorageEvent("storage", { key: storageKey(), oldValue: operationId, newValue: null }));
    });
    expect(rebuild()).toBeDisabled();
    fireEvent.click(reread());
    await waitFor(() => expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA, operationId }));
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("applies a late exact recovery receipt after full unmount without painting an old list", async () => {
    const operationId = "55555555-5555-4555-8555-555555555555";
    localStorage.setItem(storageKey(), operationId);
    const receipt = deferred<typeof saveReply>();
    mocks.receipt.mockReturnValueOnce(receipt.promise);
    const firstVisit = render(folder());
    fireEvent.click(reread());
    firstVisit.unmount();
    render(folder());
    expect(screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" })).toBeDisabled();
    await act(async () => { receipt.resolve({ ...saveReply, operationId }); await receipt.promise; });
    await waitFor(() => expect(screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" })).toBeEnabled());
    expect(pendingStoredOperation()).toBeNull();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("never clears a newer durable ID with the late acknowledgment of an older operation", async () => {
    const oldSave = deferred<typeof saveReply>();
    mocks.generate.mockReturnValueOnce(oldSave.promise);
    render(folder());
    await confirmSignatories();
    fireEvent.click(rebuild());
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    const newerId = "66666666-6666-4666-8666-666666666666";
    act(() => {
      localStorage.setItem(storageKey(), newerId);
      window.dispatchEvent(new StorageEvent("storage", { key: storageKey(), newValue: newerId }));
    });
    await act(async () => { oldSave.resolve(acknowledgment()); await oldSave.promise; });
    await screen.findByRole("alert");
    expect(rebuild()).toBeDisabled();
    expect(localStorage.getItem(storageKey())).toBe(newerId);
    expect(mocks.success).not.toHaveBeenCalled();
    fireEvent.click(reread());
    await waitFor(() => expect(mocks.receipt).toHaveBeenCalledWith({ organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA, operationId: newerId }));
  });

  it("reacts to the exact UUID ACK key from another tab without deleting the shared index", async () => {
    const operationId = "77777777-7777-4777-8777-777777777777";
    const scope = { organizationId: GORELTECH_ORGANIZATION_ID, groupId: groupA };
    localStorage.setItem(storageKey(), operationId);
    render(folder());
    const button = screen.getByRole("button", { name: "Проверить подписантов и пересобрать 9 Word-документов" });
    expect(button).toBeDisabled();
    act(() => {
      expect(clearAcknowledgedPackageOperation(scope, operationId)).toBe(true);
      window.dispatchEvent(new StorageEvent("storage", {
        key: packageOperationAcknowledgmentKey(scope, operationId), newValue: operationId,
      }));
    });
    expect(button).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(localStorage.getItem(storageKey())).toBe(operationId);
    expect(pendingStoredOperation()).toBeNull();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.receipt).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
