import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RtnEditorialPanel } from "./RtnEditorialPanel";
import type { EditorialWorkspace } from "@/api/rtn-editorial";

const auth = vi.hoisted(() => ({ current: { user: { id: "admin-a" } as { id: string } | null, userRole: "admin" as string | null, authError: null as string | null } }));
const api = vi.hoisted(() => ({ getRtnEditorial: vi.fn(), publishRtnModule: vi.fn(), reviewRtnModule: vi.fn(), rtnEditorialWorker: vi.fn(), openRtnPaidRollout: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.current }));
vi.mock("@/api/rtn-editorial", () => api);

const data: EditorialWorkspace = {
  sources: [{ id: "source-a", code: "A.1", title: "Официальный перечень А.1" }],
  banks: [
    { id: "parent-bank", source_id: "source-a", code: "A.1", title: "Исходный банк А.1", parent_bank_id: null },
    { id: "child-bank", source_id: "source-a", code: "A.1-116", title: "Дочерний учебный модуль", parent_bank_id: "parent-bank" },
  ],
  source_revisions: [{ id: "source-revision", source_id: "source-a", sha256: "a".repeat(64), captured_at: "2026-11-14T09:00:00Z", normalization_required: true }],
  bank_revisions: [
    { id: "parent-revision", bank_id: "parent-bank", source_revision_id: "source-revision", question_count: 211, created_at: "2026-11-14T09:00:00Z" },
    { id: "child-revision", bank_id: "child-bank", source_revision_id: "source-revision", question_count: 10, created_at: "2026-11-14T09:00:00Z" },
  ],
  key_sets: [{ id: "key-a", bank_id: "child-bank", bank_revision_id: "child-revision", question_count: 10, material_count: 3, reviewed_at: "2026-11-14T10:00:00Z" }],
  releases: [],
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: false }, mutations: { retry: false } } });
  return { ...render(<RtnEditorialPanel organizationId="org-a" />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }), client };
}
function openPanel() { fireEvent.click(screen.getByRole("button", { name: /Редакции и предметная проверка/ })); }
beforeEach(() => {
  vi.resetAllMocks();
  auth.current = { user: { id: "admin-a" }, userRole: "admin", authError: null };
  api.getRtnEditorial.mockResolvedValue(data);
});
afterEach(cleanup);

describe("actual-admin RTN editorial controls", () => {
  it("does not enable general rollout until server integration gates and both live receipts are present", async () => {
    api.getRtnEditorial.mockResolvedValue({ ...data, rollout: { stage: "pilot", revision: 2, quota_integration_ready: true, privacy_integration_ready: false } });
    mount(); openPanel();
    const enable = await screen.findByRole("button", { name: "Включить для организаций с действующим доступом" });
    fireEvent.change(screen.getByLabelText("Подтверждение проверки QA"), { target: { value: "outputs/actual-qa-receipt.json" } });
    fireEvent.change(screen.getByLabelText("Подтверждение проверки Техносервиса"), { target: { value: "outputs/actual-tech-receipt.json" } });
    fireEvent.change(screen.getByLabelText("Основание включения"), { target: { value: "Подтверждённая живая приёмка" } });
    expect(enable).toBeDisabled();
    expect(api.openRtnPaidRollout).not.toHaveBeenCalled();
  });

  it("retries an uncertain rollout with the exact original CAS request and receipts", async () => {
    const ready = { ...data, rollout: { stage: "pilot" as const, revision: 7, quota_integration_ready: true, privacy_integration_ready: true } };
    api.getRtnEditorial.mockResolvedValue(ready);
    api.openRtnPaidRollout.mockRejectedValueOnce(new Error("Ответ потерян после сохранения")).mockResolvedValueOnce({ stage: "paid", revision: 8 });
    mount(); openPanel();
    const enable = await screen.findByRole("button", { name: "Включить для организаций с действующим доступом" });
    expect(enable).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Подтверждение проверки QA"), { target: { value: "outputs/actual-qa-receipt.json" } });
    fireEvent.change(screen.getByLabelText("Подтверждение проверки Техносервиса"), { target: { value: "outputs/actual-tech-receipt.json" } });
    fireEvent.change(screen.getByLabelText("Основание включения"), { target: { value: "Подтверждённая живая приёмка" } });
    fireEvent.click(enable);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ответ потерян после сохранения");
    expect(screen.getByLabelText("Подтверждение проверки QA")).toBeDisabled();
    fireEvent.click(enable);
    await waitFor(() => expect(api.openRtnPaidRollout).toHaveBeenCalledTimes(2));
    expect(api.openRtnPaidRollout.mock.calls[1]).toEqual(api.openRtnPaidRollout.mock.calls[0]);
    expect(api.openRtnPaidRollout.mock.calls[0][0]).toMatchObject({ expectedRevision: 7, evidence: { qa_acceptance_receipt: "outputs/actual-qa-receipt.json", technoservice_acceptance_receipt: "outputs/actual-tech-receipt.json" } });
  });

  it("makes no editorial request and exposes no control to an organization actor", () => {
    auth.current = { user: { id: "org-owner" }, userRole: "organization", authError: null };
    const mounted = mount();
    expect(mounted.container).toBeEmptyDOMElement();
    expect(api.getRtnEditorial).not.toHaveBeenCalled();
    expect(api.rtnEditorialWorker).not.toHaveBeenCalled();
  });

  it("waits for an actual administrator to explicitly open the editor before reading metadata", async () => {
    mount();
    expect(api.getRtnEditorial).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Проверенный пакет JSON" })).not.toBeInTheDocument();
    openPanel();
    expect(await screen.findByRole("textbox", { name: "Проверенный пакет JSON" })).toBeInTheDocument();
    expect(api.getRtnEditorial).toHaveBeenCalledTimes(1);
  });

  it("resets the JSON, source selection, date and release note when the same actor switches organization", async () => {
    const mounted = mount(); openPanel();
    const json = await screen.findByRole("textbox", { name: "Проверенный пакет JSON" });
    fireEvent.change(json, { target: { value: '{"do_not_reuse":"org-a"}' } });
    fireEvent.change(screen.getByLabelText("Исходная редакция"), { target: { value: "source-revision" } });
    fireEvent.change(screen.getByLabelText("Применять с"), { target: { value: "2026-11-16" } });
    fireEvent.change(screen.getByLabelText("Основание выпуска"), { target: { value: "Только для прежнего контекста" } });
    mounted.rerender(<RtnEditorialPanel organizationId="org-b" />);
    expect(screen.getByRole("button", { name: /Редакции и предметная проверка/ })).toHaveAttribute("aria-expanded", "false");
    openPanel();
    expect(await screen.findByRole("textbox", { name: "Проверенный пакет JSON" })).toHaveValue("");
    expect(screen.getByLabelText("Исходная редакция")).toHaveValue("");
    expect(screen.getByLabelText("Применять с")).toHaveValue("");
    expect(screen.getByLabelText("Основание выпуска")).toHaveValue("");
    expect(api.reviewRtnModule).not.toHaveBeenCalled();
  });

  it("does not expose a previous administrator's cached metadata after an actor change", async () => {
    let finish: (value: EditorialWorkspace) => void = () => {};
    const mounted = mount(); openPanel();
    await screen.findByRole("option", { name: /Официальный перечень А.1/ });
    api.getRtnEditorial.mockReturnValue(new Promise<EditorialWorkspace>(resolve => { finish = resolve; }));
    auth.current = { user: { id: "admin-b" }, userRole: "admin", authError: null };
    mounted.rerender(<RtnEditorialPanel organizationId="org-a" />);
    openPanel();
    expect(screen.queryByRole("option", { name: /Официальный перечень А.1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Проверенный пакет JSON" })).not.toBeInTheDocument();
    finish({ ...data, sources: [{ id: "source-a", code: "A.1", title: "Новая серверная выборка" }] });
    expect(await screen.findByRole("option", { name: /Новая серверная выборка/ })).toBeInTheDocument();
    expect(api.getRtnEditorial).toHaveBeenCalledTimes(2);
  });

  it("keeps source bootstrap available after a partial first registration", async () => {
    api.rtnEditorialWorker.mockResolvedValue({ status: "queued" });
    mount(); openPanel();
    const bootstrap = await screen.findByRole("button", { name: "Проверить подключение источников" });
    expect(bootstrap).toBeEnabled();
    fireEvent.click(bootstrap);
    await waitFor(() => expect(api.rtnEditorialWorker).toHaveBeenCalledWith({ operation: "bootstrap" }));
    expect(await screen.findByText(/Официальные источники зарегистрированы/)).toBeInTheDocument();
  });

  it("allows review from original parent revisions and excludes previously derived child modules", async () => {
    mount(); openPanel();
    await screen.findByRole("textbox", { name: "Проверенный пакет JSON" });
    fireEvent.change(screen.getByLabelText("Этап"), { target: { value: "review" } });
    const selector = screen.getByLabelText("Исходная редакция");
    expect(within(selector).getByRole("option", { name: /Исходный банк А.1/ })).toBeInTheDocument();
    expect(within(selector).queryByRole("option", { name: /Дочерний учебный модуль/ })).not.toBeInTheDocument();
  });

  it("removes editorial controls immediately when the actual session loses admin status", async () => {
    const mounted = mount(); openPanel();
    await screen.findByRole("textbox", { name: "Проверенный пакет JSON" });
    auth.current = { user: { id: "admin-a" }, userRole: "organization", authError: null };
    mounted.rerender(<RtnEditorialPanel organizationId="org-a" />);
    expect(mounted.container).toBeEmptyDOMElement();
    expect(api.rtnEditorialWorker).not.toHaveBeenCalled();
  });

  it("offers an explicit retry after an initial failed metadata read", async () => {
    api.getRtnEditorial.mockRejectedValueOnce(new Error("Сервер временно недоступен")).mockResolvedValueOnce(data);
    mount(); openPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Сервер временно недоступен");
    expect(screen.queryByRole("textbox", { name: "Проверенный пакет JSON" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку редакций" }));
    expect(await screen.findByRole("textbox", { name: "Проверенный пакет JSON" })).toBeInTheDocument();
  });

  it("hides cached editorial actions after a failed permission refresh", async () => {
    mount(); openPanel();
    await screen.findByRole("textbox", { name: "Проверенный пакет JSON" });
    api.getRtnEditorial.mockRejectedValue(new Error("Нужны права администратора платформы."));
    fireEvent.click(screen.getByRole("button", { name: "Обновить данные" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Нужны права администратора");
    expect(screen.queryByRole("button", { name: "Сохранить формулировки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Выпустить проверенную учебную редакцию" })).not.toBeInTheDocument();
  });

  it("disables mutations during refresh and rejects a selected key published by another administrator", async () => {
    let finish: (value: EditorialWorkspace) => void = () => {};
    mount(); openPanel();
    await screen.findByRole("textbox", { name: "Проверенный пакет JSON" });
    fireEvent.change(screen.getByLabelText("Проверенный набор"), { target: { value: "key-a" } });
    fireEvent.change(screen.getByLabelText("Применять с"), { target: { value: "2026-11-16" } });
    fireEvent.change(screen.getByLabelText("Основание выпуска"), { target: { value: "Проверенный выпуск учебного модуля" } });
    api.getRtnEditorial.mockReturnValue(new Promise<EditorialWorkspace>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Обновить данные" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Выпустить проверенную учебную редакцию" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Проверить подключение источников" })).toBeDisabled();
    finish({ ...data, releases: [{ id: "other-admin-release", key_set_id: "key-a", effective_from: "2026-11-16" }] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Выпустить проверенную учебную редакцию" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Выпустить проверенную учебную редакцию" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("этот набор уже выпущен или недоступен");
    expect(api.publishRtnModule).not.toHaveBeenCalled();
  });

  it("clears release fields after a confirmed publication so a second release needs a new deliberate choice", async () => {
    api.publishRtnModule.mockResolvedValue({ release_id: "new-release" });
    mount(); openPanel();
    await screen.findByRole("textbox", { name: "Проверенный пакет JSON" });
    fireEvent.change(screen.getByLabelText("Проверенный набор"), { target: { value: "key-a" } });
    fireEvent.change(screen.getByLabelText("Применять с"), { target: { value: "2026-11-16" } });
    fireEvent.change(screen.getByLabelText("Основание выпуска"), { target: { value: "Проверенный выпуск учебного модуля" } });
    fireEvent.click(screen.getByRole("button", { name: "Выпустить проверенную учебную редакцию" }));
    expect(await screen.findByText(/Учебная редакция выпущена: new-release/)).toBeInTheDocument();
    expect(api.publishRtnModule).toHaveBeenCalledWith("key-a", "2026-11-16", "Проверенный выпуск учебного модуля");
    expect(screen.getByLabelText("Проверенный набор")).toHaveValue("");
    expect(screen.getByLabelText("Применять с")).toHaveValue("");
    expect(screen.getByLabelText("Основание выпуска")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Выпустить проверенную учебную редакцию" })).toBeDisabled();
  });
});
