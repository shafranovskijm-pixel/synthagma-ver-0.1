import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "00000000-0000-4000-8000-000000000001" as string | null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.id ? { id: auth.id } : null }) }));
// Storage/UUID recovery helpers stay real; no remote endpoint or URL is contacted.
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn(() => { throw new Error("Unexpected network call in card test"); }) }));
vi.mock("@/utils/proxyFetch", () => ({ proxiedAssetUrl: (url: string) => url }));
vi.mock("@/lib/group-docs/enrollmentOrderIssue", async (original) => {
  const actual = await original<typeof import("@/lib/group-docs/enrollmentOrderIssue")>();
  return { ...actual,
    beginEnrollmentOrder: vi.fn(actual.beginEnrollmentOrder), acknowledgeEnrollmentOrder: vi.fn(actual.acknowledgeEnrollmentOrder),
    previewEnrollmentOrder: vi.fn(), listEnrollmentOrders: vi.fn(), finalizeEnrollmentOrder: vi.fn(),
    readEnrollmentOrder: vi.fn(), resumeEnrollmentOrder: vi.fn(), downloadEnrollmentOrder: vi.fn(),
  };
});

import { GoreltechEnrollmentOrderCard } from "@/components/organization/group-folder/GoreltechEnrollmentOrderCard";
import {
  acknowledgeEnrollmentOrder, beginEnrollmentOrder, downloadEnrollmentOrder, enrollmentOrderStorageKey,
  finalizeEnrollmentOrder, listEnrollmentOrders, previewEnrollmentOrder, readEnrollmentOrder,
  readPendingEnrollmentOrder, resumeEnrollmentOrder,
  type EnrollmentOrderOperation, type EnrollmentOrderPreview, type OrderScope,
} from "@/lib/group-docs/enrollmentOrderIssue";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const GROUP = "00000000-0000-4000-8000-000000000002";
const ORG = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const OPERATION = "00000000-0000-4000-8000-000000000003";
const OTHER = "00000000-0000-4000-8000-000000000099";
const SCOPE = { actorId: ACTOR, organizationId: ORG, groupId: GROUP };
const KEY = enrollmentOrderStorageKey(SCOPE);
const props = { organizationId: ORG, groupId: GROUP };
const remoteApis = [previewEnrollmentOrder, listEnrollmentOrders, finalizeEnrollmentOrder, readEnrollmentOrder, resumeEnrollmentOrder, downloadEnrollmentOrder];
const lockRequest = vi.fn();

function preview(scope: OrderScope = SCOPE): EnrollmentOrderPreview {
  return {
    snapshotHash: "A".repeat(64), canFinalize: true, issues: [],
    documentSummary: { groupNumber: "1-ПК-26", programTitle: "Подтверждённая программа из курса", programHours: "72", startDate: "01.09.2026", endDate: "30.09.2026" },
    snapshot: {
      organization: { id: scope.organizationId, name: "Тестовый ГОРЭЛТЕХ" },
      group: { id: scope.groupId, organization_id: scope.organizationId, course_id: OTHER, group_number: null, program_title: null, program_hours: null, start_date: "2026-09-01", end_date: "2026-09-30" },
      profiles: [{ user_id: OTHER, full_name: `Тестовый ученик ${scope.groupId}` }],
    },
  };
}
function operation(status: "reserved" | "completed" = "completed", scope: OrderScope = SCOPE): EnrollmentOrderOperation {
  return { ...scope, operationId: OPERATION, status, snapshot: preview(scope).snapshot, snapshotHash: "A".repeat(64),
    documentNumber: "УЦ-7/2026", documentDate: "2026-09-04", signatory: { position: "Руководитель", name: "Тестовый Подписант Иванович" },
    templateSha256: "1A5E190569CE7CB152B39C644B3C7200DB88053F5BC9FD4E1F8D9FDE08BAB54C",
    filePath: status === "completed" ? `${scope.organizationId}/enrollment-orders/${scope.groupId}/${OPERATION}/${"B".repeat(64)}.docx` : null,
    docxSha256: status === "completed" ? "B".repeat(64) : null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function mount() {
  const view = render(<GoreltechEnrollmentOrderCard {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Оформить отдельный приказ" }));
  return view;
}
async function loadPreview() {
  fireEvent.click(screen.getByRole("button", { name: "Проверить состав и реквизиты" }));
  await screen.findByLabelText("Дата приказа");
  await waitFor(() => expect(screen.getByRole("button", { name: "Проверить состав и реквизиты" })).toBeEnabled());
}
function fillConfirmation() {
  fireEvent.change(screen.getByLabelText("Дата приказа"), { target: { value: "2026-09-04" } });
  fireEvent.change(screen.getByLabelText("Должность подписанта"), { target: { value: "Руководитель" } });
  fireEvent.change(screen.getByLabelText("ФИО подписанта"), { target: { value: "Тестовый Подписант Иванович" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Проверил состав, дату и подписанта/ }));
}
function issueButton() { return screen.getByRole("button", { name: "Оформить приказ и закрепить номер" }); }

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); auth.id = ACTOR;
  vi.mocked(previewEnrollmentOrder).mockReset().mockImplementation(async (scope) => preview(scope));
  vi.mocked(listEnrollmentOrders).mockReset().mockResolvedValue([]);
  vi.mocked(finalizeEnrollmentOrder).mockReset().mockResolvedValue(operation());
  vi.mocked(readEnrollmentOrder).mockReset().mockResolvedValue(null);
  vi.mocked(resumeEnrollmentOrder).mockReset().mockResolvedValue(operation());
  vi.mocked(downloadEnrollmentOrder).mockReset().mockResolvedValue(undefined);
  lockRequest.mockReset().mockImplementation(async (name, options, callback) => {
    expect(options).toEqual({ ifAvailable: true });
    return callback({ name, mode: "exclusive" });
  });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: lockRequest } });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(OPERATION);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("GoreltechEnrollmentOrderCard explicit, scoped preparation", () => {
  it("does not request API on mount or expansion and leaves existing document flow outside the card", () => {
    const view = render(<GoreltechEnrollmentOrderCard {...props} />);
    remoteApis.forEach((api) => expect(api).not.toHaveBeenCalled());
    expect(screen.getByText(/Итоговые оценки, удостоверения и ФРДО для него не нужны/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Оформить отдельный приказ" }));
    remoteApis.forEach((api) => expect(api).not.toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Проверить состав и реквизиты" })).toBeEnabled();
    expect(beginEnrollmentOrder).not.toHaveBeenCalled(); view.unmount();
  });
  it("requires login without requesting data or creating an operation", () => {
    auth.id = null; mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Войдите в кабинет организации");
    remoteApis.forEach((api) => expect(api).not.toHaveBeenCalled());
    expect(localStorage.length).toBe(0);
  });
  it("shows exact canonical documentSummary and starts date/signatory/confirmation blank", async () => {
    mount(); await loadPreview();
    expect(previewEnrollmentOrder).toHaveBeenCalledExactlyOnceWith(SCOPE);
    expect(screen.getByText("Тестовый ГОРЭЛТЕХ · 1-ПК-26")).toBeInTheDocument();
    expect(screen.getByText("Подтверждённая программа из курса · 72 ч. · 01.09.2026 — 30.09.2026")).toBeInTheDocument();
    expect(screen.queryByText("Программа не указана")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Дата приказа")).toHaveValue("");
    expect(screen.getByLabelText("Должность подписанта")).toHaveValue("");
    expect(screen.getByLabelText("ФИО подписанта")).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(issueButton()).toBeDisabled();
    fillConfirmation(); expect(issueButton()).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Должность подписанта"), { target: { value: "Начальник" } });
    expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(issueButton()).toBeDisabled();
    expect(finalizeEnrollmentOrder).not.toHaveBeenCalled();
  });
  it("blocks incomplete enrollment prerequisites while leaving the archive accessible", async () => {
    const incomplete = preview(); incomplete.canFinalize = false; incomplete.issues = [{ message: "Нет зачисления на курс" }];
    vi.mocked(previewEnrollmentOrder).mockResolvedValue(incomplete); mount(); await loadPreview();
    expect(screen.getByText("Нет зачисления на курс")).toBeInTheDocument();
    expect(screen.getByLabelText("Дата приказа")).toBeDisabled(); expect(issueButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Открыть оформленные приказы" })).toBeEnabled();
  });
  it("opens/downloads shared completed archive independently when preview is forbidden for read-only staff", async () => {
    vi.mocked(previewEnrollmentOrder).mockRejectedValue(new Error("403: недостаточно прав для оформления"));
    const otherCreator = operation("completed", { ...SCOPE, actorId: OTHER });
    vi.mocked(listEnrollmentOrders).mockResolvedValue([otherCreator]); mount();
    fireEvent.click(screen.getByRole("button", { name: "Проверить состав и реквизиты" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Открыть оформленные приказы" }));
    const section = await screen.findByRole("region", { name: "Оформленные приказы о зачислении" });
    fireEvent.click(within(section).getByRole("button", { name: "Скачать приказ № УЦ-7/2026" }));
    await waitFor(() => expect(downloadEnrollmentOrder).toHaveBeenCalledExactlyOnceWith(SCOPE, OPERATION));
    expect(listEnrollmentOrders).toHaveBeenCalledExactlyOnceWith(SCOPE);
    expect(finalizeEnrollmentOrder).not.toHaveBeenCalled(); expect(beginEnrollmentOrder).not.toHaveBeenCalled();
  });
  it("finalize failure → unknown status → fresh preview/reconfirmation retries the SAME UUID, never a new number intent", async () => {
    vi.mocked(finalizeEnrollmentOrder).mockRejectedValueOnce(new Error("Ответ потерян")).mockResolvedValueOnce(operation());
    mount(); await loadPreview(); fillConfirmation(); fireEvent.click(issueButton());
    await screen.findByRole("alert"); expect(localStorage.getItem(KEY)).toBe(OPERATION);
    expect(beginEnrollmentOrder).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Проверить состояние приказа" }));
    await screen.findByText(/Сервер пока не подтвердил эту операцию/);
    expect(readEnrollmentOrder).toHaveBeenCalledExactlyOnceWith(SCOPE, OPERATION);
    await loadPreview();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    const retry = screen.getByRole("button", { name: "Повторить с тем же идентификатором" }); expect(retry).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(retry);
    await screen.findByText(/Приказ № УЦ-7\/2026 оформлен, готов к подписи/);
    expect(finalizeEnrollmentOrder).toHaveBeenCalledTimes(2);
    for (const [scope, id, confirmation] of vi.mocked(finalizeEnrollmentOrder).mock.calls) {
      expect(scope).toEqual(SCOPE); expect(id).toBe(OPERATION);
      expect(confirmation).toEqual({ expectedSnapshotHash: "A".repeat(64), documentDate: "2026-09-04", signatory: { position: "Руководитель", name: "Тестовый Подписант Иванович" } });
    }
    expect(beginEnrollmentOrder).toHaveBeenCalledTimes(1); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(readPendingEnrollmentOrder(SCOPE)).toBeNull();
    expect(localStorage.getItem(`${KEY}:ack:${OPERATION}`)).toBe(OPERATION);
    expect(JSON.stringify({ ...localStorage })).not.toContain("Тестовый Подписант");
  });
  it("existing reserved operation resumes its frozen data without fresh numbering or finalize", async () => {
    localStorage.setItem(KEY, OPERATION); vi.mocked(readEnrollmentOrder).mockResolvedValue(operation("reserved"));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Проверить состояние приказа" }));
    const resume = await screen.findByRole("button", { name: "Завершить этот приказ без нового номера" });
    expect(screen.getByText(/Сохранено: № УЦ-7\/2026/)).toHaveTextContent("Тестовый Подписант Иванович");
    fireEvent.click(resume); await screen.findByText(/Приказ № УЦ-7\/2026 оформлен, готов к подписи/);
    expect(resumeEnrollmentOrder).toHaveBeenCalledExactlyOnceWith(SCOPE, OPERATION);
    expect(finalizeEnrollmentOrder).not.toHaveBeenCalled(); expect(beginEnrollmentOrder).not.toHaveBeenCalled();
    expect(previewEnrollmentOrder).not.toHaveBeenCalled(); expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
  it("double click sends only one mutation and one ifAvailable lock request, without queued work", async () => {
    const result = deferred<EnrollmentOrderOperation>(); vi.mocked(finalizeEnrollmentOrder).mockReturnValue(result.promise);
    mount(); await loadPreview(); fillConfirmation(); const button = issueButton();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(finalizeEnrollmentOrder).toHaveBeenCalledTimes(1));
    expect(lockRequest).toHaveBeenCalledExactlyOnceWith(KEY, { ifAvailable: true }, expect.any(Function));
    expect(beginEnrollmentOrder).toHaveBeenCalledTimes(1); expect(screen.getByLabelText("ФИО подписанта")).toBeDisabled();
    await act(async () => { result.resolve(operation()); await result.promise; });
    expect(finalizeEnrollmentOrder).toHaveBeenCalledTimes(1);
  });
  it("unavailable cross-tab lock fails immediately and never queues or creates an operation", async () => {
    lockRequest.mockImplementationOnce(async (_key, options, callback) => { expect(options).toEqual({ ifAvailable: true }); return callback(null); });
    mount(); await loadPreview(); fillConfirmation(); fireEvent.click(issueButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Приказ уже оформляется в другой вкладке");
    expect(lockRequest).toHaveBeenCalledTimes(1); expect(finalizeEnrollmentOrder).not.toHaveBeenCalled();
    expect(beginEnrollmentOrder).not.toHaveBeenCalled(); expect(localStorage.getItem(KEY)).toBeNull();
  });
  it("changed stored operation index after preview invalidates confirmation under the lock", async () => {
    mount(); await loadPreview(); fillConfirmation();
    // Simulate another tab's committed storage write before its storage event is delivered.
    localStorage.setItem(KEY, OTHER); fireEvent.click(issueButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("В другой вкладке изменилось состояние приказа");
    expect(screen.queryByLabelText("Дата приказа")).not.toBeInTheDocument();
    expect(finalizeEnrollmentOrder).not.toHaveBeenCalled(); expect(beginEnrollmentOrder).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe(OTHER);
  });
  it("a relevant storage event clears the displayed preview and explicit confirmation", async () => {
    mount(); await loadPreview(); fillConfirmation(); localStorage.setItem(KEY, OTHER);
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: OTHER })); });
    expect(screen.queryByLabelText("Дата приказа")).not.toBeInTheDocument();
    expect(screen.getByText(`Идентификатор: ${OTHER}`)).toBeInTheDocument();
    expect(finalizeEnrollmentOrder).not.toHaveBeenCalled();
  });
  it.each(["actor", "group"])("%s remount clears typed PII, preview and confirmation with no implicit API request", async (kind) => {
    const view = mount(); await loadPreview(); fillConfirmation();
    if (kind === "actor") auth.id = OTHER;
    view.rerender(<GoreltechEnrollmentOrderCard {...props} groupId={kind === "group" ? OTHER : GROUP} />);
    expect(screen.queryByLabelText("ФИО подписанта")).not.toBeInTheDocument();
    expect(screen.queryByText(`Тестовый ученик ${GROUP}`)).not.toBeInTheDocument();
    expect(previewEnrollmentOrder).toHaveBeenCalledTimes(1);
    await loadPreview();
    expect(screen.getByLabelText("ФИО подписанта")).toHaveValue(""); expect(screen.getByLabelText("Дата приказа")).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(previewEnrollmentOrder).toHaveBeenLastCalledWith({ ...SCOPE, actorId: kind === "actor" ? OTHER : ACTOR, groupId: kind === "group" ? OTHER : GROUP });
    expect(localStorage.length).toBe(0);
  });
  it("a late previous-group preview cannot populate the new group card", async () => {
    const pending = deferred<EnrollmentOrderPreview>(); vi.mocked(previewEnrollmentOrder).mockReturnValueOnce(pending.promise);
    const view = mount(); fireEvent.click(screen.getByRole("button", { name: "Проверить состав и реквизиты" }));
    view.rerender(<GoreltechEnrollmentOrderCard {...props} groupId={OTHER} />);
    await loadPreview(); expect(screen.getByText(`Тестовый ученик ${OTHER}`)).toBeInTheDocument();
    await act(async () => { pending.resolve(preview()); await pending.promise; });
    expect(screen.queryByText(`Тестовый ученик ${GROUP}`)).not.toBeInTheDocument();
    expect(screen.getByText(`Тестовый ученик ${OTHER}`)).toBeInTheDocument();
    expect(screen.getByLabelText("ФИО подписанта")).toHaveValue("");
  });
  it("a late save result acknowledges only its old scope and does not show success or PII in the new card", async () => {
    const pending = deferred<EnrollmentOrderOperation>(); vi.mocked(finalizeEnrollmentOrder).mockReturnValueOnce(pending.promise);
    const view = mount(); await loadPreview(); fillConfirmation(); fireEvent.click(issueButton());
    await waitFor(() => expect(finalizeEnrollmentOrder).toHaveBeenCalledTimes(1));
    view.rerender(<GoreltechEnrollmentOrderCard {...props} groupId={OTHER} />);
    await act(async () => { pending.resolve(operation()); await pending.promise; });
    expect(acknowledgeEnrollmentOrder).toHaveBeenCalledExactlyOnceWith(SCOPE, OPERATION);
    expect(screen.queryByText(/Приказ № УЦ-7\/2026 оформлен/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Оформленные приказы о зачислении" })).not.toBeInTheDocument();
    expect(screen.queryByText("Тестовый Подписант Иванович")).not.toBeInTheDocument();
    expect(readPendingEnrollmentOrder({ ...SCOPE, groupId: OTHER })).toBeNull();
  });
  it("without Web Locks, preview/archive remain available but both issue and resume stay disabled", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    localStorage.setItem(KEY, OPERATION); vi.mocked(readEnrollmentOrder).mockResolvedValue(operation("reserved"));
    mount(); expect(screen.getByRole("alert")).toHaveTextContent("не поддерживает защиту");
    fireEvent.click(screen.getByRole("button", { name: "Проверить состояние приказа" }));
    const resume = await screen.findByRole("button", { name: "Завершить этот приказ без нового номера" }); expect(resume).toBeDisabled();
    await loadPreview(); expect(issueButton()).toBeDisabled();
    fireEvent.click(resume); fireEvent.click(issueButton());
    expect(resumeEnrollmentOrder).not.toHaveBeenCalled(); expect(finalizeEnrollmentOrder).not.toHaveBeenCalled(); expect(beginEnrollmentOrder).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Открыть оформленные приказы" })).toBeEnabled();
  });
});
