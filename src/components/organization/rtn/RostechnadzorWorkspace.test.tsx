import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RostechnadzorWorkspace } from "./RostechnadzorWorkspace";
import type { RtnBank, RtnWorkspace } from "@/types/rostechnadzor";

const api = vi.hoisted(() => ({ getRtnWorkspace: vi.fn(), checkRtnSource: vi.fn(), assignRtnTraining: vi.fn(), saveRtnSettings: vi.fn() }));
vi.mock("@/api/rostechnadzor", () => api);

const bank: RtnBank = {
  id: "bank-a", code: "А.1", title: "Основы промышленной безопасности", domain: "Промышленная безопасность",
  source_id: "source-a", source_revision_id: "source-rev-a", source_url: "https://www.gosnadzor.ru/industrial/",
  approved_on: "2026-08-10", effective_from: "2026-09-01", question_count: 211,
  release_id: "release-a", key_status: "released", available_for_training: true, can_manual_check: true,
  last_checked_at: null, last_success_at: null, check_status: null,
};

function workspace(overrides: Partial<RtnWorkspace> = {}): RtnWorkspace {
  return {
    access: { allowed: true, reason: "included", can_manage: true, can_assign: true, can_view_results: true, pilot: true },
    banks: [bank], settings: { notify_updates: true, show_archived_releases: false }, checks: [], assignments: [], results: [],
    students: [{ id: "profile-a", user_id: "auth-a", full_name: "Тестовый ученик", group_id: "group-a" }],
    groups: [{ id: "group-a", name: "Тестовая группа" }], ...overrides,
  };
}

function mount(organizationId = "org-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...render(<RostechnadzorWorkspace organizationId={organizationId} actorId="actor-a" />, { wrapper }), client };
}

beforeEach(() => { vi.resetAllMocks(); api.getRtnWorkspace.mockResolvedValue(workspace()); });
afterEach(cleanup);

describe("RTN organization workspace", () => {
  it("fails closed on an unknown connection state and retries without claiming a tariff restriction", async () => {
    api.getRtnWorkspace.mockRejectedValueOnce(new Error("Не удалось связаться с сервером"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось связаться");
    expect(screen.queryByText(bank.title, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText(/недоступно на.*тариф/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByRole("heading", { name: `А.1. ${bank.title}` })).toBeInTheDocument();
  });

  it("does not expose cached tenant rows while a different tenant is loading or denied", async () => {
    let answer: (value: RtnWorkspace) => void = () => {};
    const denied = new Promise<RtnWorkspace>(resolve => { answer = resolve; });
    api.getRtnWorkspace.mockImplementation((org: string) => org === "org-a" ? Promise.resolve(workspace()) : denied);
    const mounted = mount();
    await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    mounted.rerender(<RostechnadzorWorkspace organizationId="org-b" actorId="actor-a" />);
    expect(screen.queryByText(bank.title, { exact: false })).not.toBeInTheDocument();
    answer(workspace({ access: { allowed: false, reason: "active_platform_access_required", can_manage: false, can_assign: false, can_view_results: false, pilot: false } }));
    expect(await screen.findByText(/действующий оплаченный доступ/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Назначить обучение" })).not.toBeInTheDocument();
  });

  it("never assigns an official question bank with unreviewed keys", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, key_status: "unreviewed", available_for_training: true }] }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Назначить обучение" }));
    const panel = screen.getByRole("region", { name: "Назначение обучения" });
    fireEvent.click(within(panel).getByLabelText("Тестовый ученик"));
    expect(within(panel).getByRole("button", { name: "Назначить выбранным (1)" })).toBeDisabled();
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
    expect(within(panel).getByText(/Непроверенный банк не назначается/)).toBeInTheDocument();
  });

  it("does not reuse owner permissions or private rows after a same-organization actor switch", async () => {
    let complete: (value: RtnWorkspace) => void = () => {};
    api.getRtnWorkspace.mockResolvedValueOnce(workspace());
    const mounted = mount();
    await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    const next = new Promise<RtnWorkspace>(resolve => { complete = resolve; });
    api.getRtnWorkspace.mockReturnValue(next);
    mounted.rerender(<RostechnadzorWorkspace organizationId="org-a" actorId="actor-b" />);
    expect(screen.queryByRole("button", { name: "Назначить обучение" })).not.toBeInTheDocument();
    expect(screen.queryByText(bank.title, { exact: false })).not.toBeInTheDocument();
    complete(workspace({ access: { allowed: true, reason: "included", can_manage: false, can_assign: false, can_view_results: false, pilot: false }, students: [], results: [] }));
    await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    const card = screen.getByRole("heading", { name: `А.1. ${bank.title}` }).closest("article")!;
    expect(within(card).getByRole("button", { name: "Назначить обучение" })).toBeDisabled();
    expect(api.getRtnWorkspace).toHaveBeenCalledTimes(2);
  });

  it("uses canonical additional group membership when selecting learners", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ students: [{ id: "profile-a", user_id: "auth-a", full_name: "Тестовый ученик", group_id: "unrelated-legacy-group", group_ids: ["group-a"] }] }));
    mount();
    await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    fireEvent.click(screen.getAllByRole("button", { name: "Назначить обучение" })[0]);
    const panel = screen.getByRole("region", { name: "Назначение обучения" });
    fireEvent.change(within(panel).getByRole("combobox", { name: "Группа учеников" }), { target: { value: "group-a" } });
    expect(within(panel).getByLabelText("Тестовый ученик")).toBeInTheDocument();
  });

  it("uses the separate server assignment permission even for a course manager", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ access: { allowed: true, reason: "included", can_manage: true, can_assign: false, can_view_results: false, pilot: true } }));
    mount();
    await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    const assignButtons = screen.getAllByRole("button", { name: "Назначить обучение" });
    fireEvent.click(assignButtons.find(button => !button.hasAttribute("disabled"))!);
    const panel = screen.getByRole("region", { name: "Назначение обучения" });
    expect(within(panel).getByRole("combobox", { name: "Программа" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "Назначить выбранным (0)" })).toBeDisabled();
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

  it("assigns a released bank using profile identifiers and preserves the server result", async () => {
    api.assignRtnTraining.mockResolvedValue({ assignments: [{ id: "assignment-a" }], replayed: false });
    mount();
    await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    fireEvent.click(screen.getAllByRole("button", { name: "Назначить обучение" })[0]);
    const panel = screen.getByRole("region", { name: "Назначение обучения" });
    fireEvent.click(within(panel).getByLabelText("Тестовый ученик"));
    fireEvent.click(within(panel).getByRole("button", { name: "Назначить выбранным (1)" }));
    await waitFor(() => expect(api.assignRtnTraining).toHaveBeenCalledWith({ organizationId: "org-a", bankId: "bank-a", studentIds: ["profile-a"], groupId: null }));
    expect(await within(panel).findByText(/Назначение сохранено/)).toBeInTheDocument();
  });

  it("allows source checks with course-management rights without exposing student results", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({
      access: { allowed: true, reason: "included", can_manage: true, can_assign: false, can_view_results: false, pilot: true },
      results: [{ attempt_id: "hidden-attempt", bank_id: "bank-a", student_id: "profile-a", student_name: "Закрытое имя", release_id: "release-a", score: 80 }],
    }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Обновления" }));
    expect(screen.getByRole("button", { name: "Проверить обновления сейчас" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Результаты" }));
    expect(screen.queryByText("Закрытое имя")).not.toBeInTheDocument();
    expect(screen.getByText(/Для просмотра результатов нужны права/)).toBeInTheDocument();
  });

  it("shows queued checks truthfully and accepts completion only for the returned run", async () => {
    let current = workspace();
    api.getRtnWorkspace.mockImplementation(() => Promise.resolve(current));
    api.checkRtnSource.mockResolvedValue({ run_id: "run-new", status: "queued" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Обновления" }));
    fireEvent.click(screen.getByRole("button", { name: "Проверить обновления сейчас" }));
    expect(await screen.findByText("В очереди")).toBeInTheDocument();
    expect(screen.queryByText("Изменений не обнаружено")).not.toBeInTheDocument();
    current = workspace({ checks: [{ id: "run-old", source_id: "source-a", status: "unchanged" }] });
    fireEvent.click(screen.getByRole("button", { name: "Обновить состояние" }));
    await waitFor(() => expect(api.getRtnWorkspace.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(screen.getByText("В очереди")).toBeInTheDocument();
    current = workspace({ checks: [{ id: "run-new", source_id: "source-a", status: "error", error: "upstream unavailable" }] });
    fireEvent.click(screen.getByRole("button", { name: "Обновить состояние" }));
    expect(await screen.findByText("Не удалось проверить источник")).toBeInTheDocument();
    expect(screen.getByText("Последняя успешная проверка: Не подтверждено")).toBeInTheDocument();
    expect(api.checkRtnSource).toHaveBeenCalledTimes(1);
  });

  it("does not leave an old successful label as the result of a failed manual request", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, check_status: "unchanged", last_success_at: "2026-11-13T09:00:00Z" }] }));
    api.checkRtnSource.mockRejectedValue(new Error("Не удалось связаться с сервером"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Обновления" }));
    expect(screen.getByText("Изменений не обнаружено")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Проверить обновления сейчас" }));
    expect(await screen.findByText("Не удалось проверить источник")).toBeInTheDocument();
    expect(screen.queryByText("Изменений не обнаружено")).not.toBeInTheDocument();
  });

  it("shows server-confirmed current, archived and scheduled release metadata when history is enabled", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({
      settings: { notify_updates: true, show_archived_releases: true },
      archived_releases: [
        { bank_id: "bank-a", bank_code: "А.1", release_id: "old-release", key_set_id: "key-old", bank_revision_id: "rev-old", source_revision_id: "source-old", question_count: 10, effective_from: "2026-09-01", published_at: "2026-08-30T09:00:00Z", is_current: false, state: "archived", source_url: bank.source_url!, document_url: "https://www.gosnadzor.ru/old.pdf" },
        { bank_id: "bank-a", bank_code: "А.1", release_id: "future-release", key_set_id: "key-future", bank_revision_id: "rev-future", source_revision_id: "source-future", question_count: 15, effective_from: "2026-12-01", published_at: "2026-11-14T09:00:00Z", is_current: false, state: "scheduled", source_url: bank.source_url!, document_url: "https://www.gosnadzor.ru/future.pdf" },
      ],
    }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Посмотреть состав" }));
    const history = screen.getByRole("region", { name: "История редакций" });
    expect(within(history).getByText("Архивная · 10 вопросов")).toBeInTheDocument();
    expect(within(history).getByText("Запланирована · 15 вопросов")).toBeInTheDocument();
    expect(within(history).getByText("Редакция: old-release")).toBeInTheDocument();
    expect(within(history).queryByText("key-old")).not.toBeInTheDocument();
  });

  it("does not claim settings were saved after a server rejection", async () => {
    api.saveRtnSettings.mockRejectedValue(new Error("Недостаточно прав"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Настройки" }));
    fireEvent.click(screen.getByLabelText("Подсвечивать новые редакции"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить настройки" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Недостаточно прав");
    expect(screen.queryByText("Настройки сохранены")).not.toBeInTheDocument();
  });

  it("renders historical results with the pinned release and exact score without recalculation", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ results: [{ attempt_id: "old-attempt", bank_id: "bank-a", student_id: "profile-a", release_id: "old-release", score: 80, correct: 8, total: 10, passed: true, submitted_at: "2026-10-12T09:00:00Z" }] }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Результаты" }));
    expect(screen.getByText("Результат: 80% · 8 из 10 · Зачтено")).toBeInTheDocument();
    expect(screen.getByText(/Редакция: old-release/)).toBeInTheDocument();
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });
});
