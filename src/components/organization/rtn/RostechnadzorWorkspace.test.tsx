import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RostechnadzorWorkspace } from "./RostechnadzorWorkspace";
import type { RtnBank, RtnWorkspace } from "@/types/rostechnadzor";

const api = vi.hoisted(() => ({ getRtnWorkspace: vi.fn(), checkRtnSource: vi.fn(), assignRtnTraining: vi.fn(), saveRtnSettings: vi.fn() }));
vi.mock("@/api/rostechnadzor", () => api);
const updatesApi = vi.hoisted(() => ({ getRtnUpdates: vi.fn(), getRtnUpdate: vi.fn() }));
vi.mock("@/api/rtn-updates", () => updatesApi);
const personalApi = vi.hoisted(() => ({ getMyRtnSubscription: vi.fn(), saveMyRtnSubscription: vi.fn(), notifyRtnPersonalRefresh: vi.fn() }));
vi.mock("@/api/rtn-personal-notifications", () => personalApi);
const newsApi = vi.hoisted(() => ({ getRtnNewsCheckState: vi.fn(), checkRtnNewsNow: vi.fn() }));
vi.mock("@/api/rtn-news-check", () => newsApi);

const bank: RtnBank = {
  id: "bank-a", code: "А.1", title: "Основы промышленной безопасности", domain: "Промышленная безопасность",
  source_id: "source-a", source_revision_id: "source-rev-a", bank_revision_id: "bank-rev-a", source_url: "https://www.gosnadzor.ru/industrial/",
  approved_on: "2026-08-10", effective_from: "2026-09-01", question_count: 211,
  release_id: "release-a", key_status: "released", available_for_training: true, can_manual_check: true,
  normative_status: "current", normative_cutoff_at: "2026-11-21T00:00:00+03:00",
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

function mount(organizationId = "org-a", props: Partial<React.ComponentProps<typeof RostechnadzorWorkspace>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...render(<RostechnadzorWorkspace organizationId={organizationId} actorId="actor-a" {...props} />, { wrapper }), client };
}

beforeEach(() => { vi.resetAllMocks(); api.getRtnWorkspace.mockResolvedValue(workspace()); updatesApi.getRtnUpdates.mockResolvedValue({ events: [], has_more: false, next_before_sequence: null, source_health: { status: "never_checked", last_success_at: null, coverage_kind: "unknown" } }); });
beforeEach(() => { newsApi.getRtnNewsCheckState.mockResolvedValue({ check: null, can_request: true, next_due_at: "2026-11-20T12:00:00Z", source_health: { code: "official-news-rss", feed_url: "https://www.gosnadzor.ru/news/rss/", status: "never_checked", coverage_kind: "unknown", last_checked_at: null, last_success_at: null, coverage_from: null, coverage_until: null, error_code: null, complete_archive: false } }); });
afterEach(cleanup);

describe("RTN organization workspace", () => {
  it("loads news source status only inside authorized Sources and retains the real session actor", async () => {
    const org = "11111111-1111-4111-8111-111111111111";
    mount(org, { actorId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
    await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    expect(newsApi.getRtnNewsCheckState).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Источники" }), { button: 0, ctrlKey: false });
    await screen.findByRole("region", { name: "Новости официального сайта" });
    expect(newsApi.getRtnNewsCheckState).toHaveBeenCalledTimes(1);
    expect(newsApi.getRtnNewsCheckState).toHaveBeenCalledWith(org, expect.any(AbortSignal));
    expect(newsApi.checkRtnNewsNow).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Изменения" }), { button: 0, ctrlKey: false });
    await screen.findByRole("heading", { name: "Изменения Ростехнадзора" });
    expect(screen.queryByRole("region", { name: "Новости официального сайта" })).not.toBeInTheDocument();
    expect(newsApi.getRtnNewsCheckState).toHaveBeenCalledTimes(1);
  });
  it("does not mount news source controls when workspace authorization is denied", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ access: { allowed: false, reason: "permission_denied", can_manage: false, can_assign: false, can_view_results: false, pilot: false } }));
    mount("11111111-1111-4111-8111-111111111111", { actorId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", navigation: { view: "sources", bankId: null, eventId: null, invalidTarget: false } });
    await screen.findByText(/нужны права на курсы/);
    expect(newsApi.getRtnNewsCheckState).not.toHaveBeenCalled();
    expect(newsApi.checkRtnNewsNow).not.toHaveBeenCalled();
  });
  it("offers only own preferences in Sources to an authorized reader without organization-management rights", async () => {
    const org = "11111111-1111-4111-8111-111111111111", actor = "22222222-2222-4222-8222-222222222222";
    api.getRtnWorkspace.mockResolvedValue(workspace({ access: { allowed: true, reason: "included", can_manage: false, can_assign: false, can_view_results: false, pilot: false } }));
    personalApi.getMyRtnSubscription.mockResolvedValue({ options: { topics: ["general"], kinds: ["news"] }, subscription: { enabled: false, effective_enabled: false, needs_reconfiguration: false, topics: [], kinds: [], generation: 0 } });
    mount(org, { actorId: actor, navigation: { view: "sources", bankId: null, eventId: null, invalidTarget: false } });
    const own = await screen.findByRole("checkbox", { name: "Получать уведомления в колокольчике" });
    expect(own).not.toBeDisabled(); expect(own).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Подсвечивать новые редакции" })).toBeDisabled();
    expect(personalApi.getMyRtnSubscription).toHaveBeenCalledWith({ organizationId: org, actorId: actor });
    expect(personalApi.saveMyRtnSubscription).not.toHaveBeenCalled();
  });
  it("loads shared changes only after the authorized Changes tab is opened", async () => {
    mount("11111111-1111-4111-8111-111111111111");
    await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    expect(updatesApi.getRtnUpdates).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Источники" }), { button: 0, ctrlKey: false });
    await screen.findByRole("region", { name: "Проверка источников" });
    expect(updatesApi.getRtnUpdates).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Изменения" }), { button: 0, ctrlKey: false });
    await screen.findByText(/пока нет сохранённых изменений/);
    expect(updatesApi.getRtnUpdates).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Состояние программ" })).toBeInTheDocument();
  });
  it("does not load shared changes when the workspace server denies access", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ access: { allowed: false, reason: "permission_denied", can_manage: false, can_assign: false, can_view_results: false, pilot: false } }));
    mount("11111111-1111-4111-8111-111111111111", { navigation: { view: "changes", bankId: null, eventId: null, invalidTarget: false } });
    await screen.findByText(/нужны права на курсы/);
    expect(updatesApi.getRtnUpdates).not.toHaveBeenCalled();
    expect(updatesApi.getRtnUpdate).not.toHaveBeenCalled();
  });
  it("prevents a released but no longer normatively current bank from being assigned", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, available_for_training: true, normative_status: "review_required" }] }));
    mount();
    expect(await screen.findByText("Нужна повторная нормативная проверка")).toBeInTheDocument();
    const card = screen.getByRole("heading", { name: `А.1. ${bank.title}` }).closest("article")!;
    expect(within(card).queryByRole("button", { name: "Назначить обучение" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Назначить обучение" }));
    const panel = screen.getByRole("region", { name: "Назначение обучения" });
    expect(within(panel).getByRole("combobox", { name: "Программа" }).querySelector('option[value="bank-a"]')).toBeDisabled();
    fireEvent.change(within(panel).getByRole("combobox", { name: "Программа" }), { target: { value: "bank-a" } });
    fireEvent.click(within(panel).getByLabelText("Тестовый ученик"));
    expect(within(panel).getByRole("button", { name: "Назначить выбранным (1)" })).toBeDisabled();
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

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
    const card = screen.getByRole("heading", { name: `А.1. ${bank.title}` }).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Назначить обучение" }));
    const panel = screen.getByRole("region", { name: "Назначение обучения" });
    fireEvent.click(within(panel).getByLabelText("Тестовый ученик"));
    fireEvent.click(within(panel).getByRole("button", { name: "Назначить выбранным (1)" }));
    await waitFor(() => expect(api.assignRtnTraining).toHaveBeenCalledWith({ organizationId: "org-a", bankId: "bank-a", studentIds: ["profile-a"], groupId: null }));
    expect(await within(panel).findByText(/Назначение сохранено/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Посмотреть назначения и результаты" }));
    expect(screen.getByRole("region", { name: "Результаты обучения" })).toBeInTheDocument();
  });

  it("allows source checks with course-management rights without exposing student results", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({
      access: { allowed: true, reason: "included", can_manage: true, can_assign: false, can_view_results: false, pilot: true },
      results: [{ attempt_id: "hidden-attempt", bank_id: "bank-a", student_id: "profile-a", student_name: "Закрытое имя", release_id: "release-a", score: 80 }],
    }));
    mount();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Источники" }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("button", { name: "Проверить обновления сейчас" })).toBeEnabled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Подготовка" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "Результаты" }));
    expect(screen.queryByText("Закрытое имя")).not.toBeInTheDocument();
    expect(screen.getByText(/Для просмотра результатов нужны права/)).toBeInTheDocument();
  });

  it("shows queued checks truthfully and accepts completion only for the returned run", async () => {
    let current = workspace();
    api.getRtnWorkspace.mockImplementation(() => Promise.resolve(current));
    api.checkRtnSource.mockResolvedValue({ run_id: "run-new", status: "queued" });
    mount();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Источники" }), { button: 0, ctrlKey: false });
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
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Источники" }), { button: 0, ctrlKey: false });
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
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Источники" }), { button: 0, ctrlKey: false });
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

describe("RTN workspace navigation and sections", () => {
  it("places the short navigation before filters, actions and programme cards", async () => {
    mount();
    const heading = await screen.findByRole("heading", { name: `А.1. ${bank.title}` });
    const tabs = screen.getByRole("tablist", { name: "Разделы Ростехнадзора" });
    expect(within(tabs).getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Подготовка", "Изменения", "Источники"]);
    expect(tabs.compareDocumentPosition(screen.getByRole("textbox", { name: "Поиск программы" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabs.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the canonical Sources view without displaying training as the active section", async () => {
    mount("org-a", { navigation: { view: "sources", bankId: null, eventId: null, invalidTarget: false } });
    expect(await screen.findByRole("region", { name: "Проверка источников" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Источники" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("textbox", { name: "Поиск программы" })).not.toBeInTheDocument();
    expect(screen.getByText("Источник ещё не проверен")).toBeInTheDocument();
    expect(screen.queryByText("Изменений не обнаружено")).not.toBeInTheDocument();
    expect(api.getRtnWorkspace).toHaveBeenCalledWith("org-a");
  });

  it("delegates a controlled section change to its route owner rather than overriding browser state", async () => {
    const navigate = vi.fn();
    const mounted = mount("org-a", { navigation: { view: "sources", bankId: null, eventId: null, invalidTarget: false }, onNavigate: navigate });
    await screen.findByRole("region", { name: "Проверка источников" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Изменения" }), { button: 0, ctrlKey: false });
    expect(navigate).toHaveBeenCalledWith({ view: "changes" });
    expect(screen.getByRole("tab", { name: "Источники" })).toHaveAttribute("aria-selected", "true");
    mounted.rerender(<RostechnadzorWorkspace organizationId="org-a" actorId="actor-a" navigation={{ view: "changes", bankId: null, eventId: null, invalidTarget: false }} onNavigate={navigate} />);
    expect(screen.getByRole("region", { name: "Изменения вопросов" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Изменения" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens only a linked programme that exists in the current authorized response and clears its target on close", async () => {
    const navigate = vi.fn();
    mount("org-a", { navigation: { view: "training", bankId: bank.id, eventId: null, invalidTarget: false }, onNavigate: navigate });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: `А.1 ${bank.title}` })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ view: "training" }));
    expect(api.getRtnWorkspace).toHaveBeenCalledTimes(1);
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

  it("does not fetch or expose a foreign programme supplied in a link", async () => {
    mount("org-a", { navigation: { view: "training", bankId: "foreign-bank", eventId: null, invalidTarget: false } });
    expect(await screen.findByText(/Программа из ссылки недоступна/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.getRtnWorkspace).toHaveBeenCalledTimes(1);
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

  it("does not invent a news event or claim a source unchanged for an unsupported event target", async () => {
    mount("11111111-1111-4111-8111-111111111111", { navigation: { view: "changes", bankId: null, eventId: "event-not-loaded", invalidTarget: false } });
    expect(await screen.findByText(/Ссылка на изменение некорректна/)).toBeInTheDocument();
    expect(screen.getByText(/В данных программ пока нет отмеченных изменений/)).toBeInTheDocument();
    expect(screen.queryByText("Изменений не обнаружено")).not.toBeInTheDocument();
    expect(api.checkRtnSource).not.toHaveBeenCalled();
    expect(updatesApi.getRtnUpdate).not.toHaveBeenCalled();
  });

  it("shows a real pending-source change and preserves the programme destination", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, pending_source_revision_id: "revision-new" }] }));
    const navigate = vi.fn();
    mount("org-a", { navigation: { view: "changes", bankId: null, eventId: null, invalidTarget: false }, onNavigate: navigate });
    const region = await screen.findByRole("region", { name: "Изменения вопросов" });
    expect(within(region).getByText(bank.title)).toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: "Посмотреть программу" }));
    expect(navigate).toHaveBeenCalledWith({ view: "training", bankId: bank.id });
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

  it("keeps organizational highlight preferences distinct from personal subscriptions", async () => {
    mount("org-a", { navigation: { view: "sources", bankId: null, eventId: null, invalidTarget: false } });
    expect(await screen.findByRole("heading", { name: "Настройки отображения" })).toBeInTheDocument();
    expect(screen.getByText(/Они не включают личные уведомления/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Получать.*колокольчик/)).not.toBeInTheDocument();
  });

  it.each([true, false])("shows server-scoped assignment rows only with result permission=%s", async canViewResults => {
    api.getRtnWorkspace.mockResolvedValue(workspace({
      access: { allowed: true, reason: "included", can_manage: true, can_assign: true, can_view_results: canViewResults, pilot: true },
      assignments: [{ id: "assignment-one", bank_id: bank.id, student_id: "profile-a", student_name: "Назначенный ученик", assigned_at: "2026-11-20T04:00:00Z" }],
    }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Результаты" }));
    if (canViewResults) {
      const assignments = screen.getByRole("region", { name: "Назначения программ" });
      expect(within(assignments).getByText("Назначенный ученик")).toBeInTheDocument();
      expect(within(assignments).getByText(`А.1 ${bank.title}`)).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("region", { name: "Назначения программ" })).not.toBeInTheDocument();
      expect(screen.queryByText("Назначенный ученик")).not.toBeInTheDocument();
    }
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

  it("keeps a historical changed-source fact neutral when no revision is pending", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, check_status: "changed", pending_source_revision_id: null }] }));
    const mounted = mount("org-a", { navigation: { view: "changes", bankId: null, eventId: null, invalidTarget: false } });
    const region = await screen.findByRole("region", { name: "Изменения вопросов" });
    expect(within(region).getByText("Проверка обнаружила изменение. Состояние редакции показано в программе.")).toBeInTheDocument();
    expect(within(region).queryByText(/редакция проходит предметную проверку/)).not.toBeInTheDocument();
    mounted.rerender(<RostechnadzorWorkspace organizationId="org-a" actorId="actor-a" navigation={{ view: "sources", bankId: null, eventId: null, invalidTarget: false }} />);
    expect(screen.getByText("Проверка обнаружила изменение источника")).toBeInTheDocument();
    expect(screen.queryByText("Найдено изменение — редакция проходит проверку")).not.toBeInTheDocument();
  });

  it("groups a shared source after preserving the second bank pending revision and its exact destination", async () => {
    const second = { ...bank, id: "bank-b", code: "Б.1", title: "Второе направление", pending_source_revision_id: "pending-second" };
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, check_status: "changed", pending_source_revision_id: null }, second] }));
    const navigate = vi.fn();
    mount("org-a", { navigation: { view: "changes", bankId: null, eventId: null, invalidTarget: false }, onNavigate: navigate });
    const region = await screen.findByRole("region", { name: "Изменения вопросов" });
    expect(within(region).getAllByRole("heading", { name: "Изменение источника вопросов" })).toHaveLength(1);
    expect(within(region).getByText(bank.title)).toBeInTheDocument();
    const pendingRow = within(region).getByText(second.title).closest("div")!;
    expect(within(pendingRow).getByText(/Новая редакция проходит предметную проверку/)).toBeInTheDocument();
    fireEvent.click(within(pendingRow).getByRole("button", { name: "Посмотреть программу" }));
    expect(navigate).toHaveBeenCalledWith({ view: "training", bankId: second.id });
  });

  it("distinguishes an unknown question count from a confirmed zero in cards and programme details", async () => {
    const missing = { ...bank, question_count: undefined as unknown as number };
    const zero = { ...bank, id: "bank-zero", code: "А.0", title: "Пустая подтверждённая редакция", question_count: 0 };
    const invalid = { ...bank, id: "bank-invalid", code: "А.X", title: "Количество на проверке", question_count: -1 };
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [missing, zero, invalid] }));
    mount();
    const missingCard = (await screen.findByRole("heading", { name: `А.1. ${bank.title}` })).closest("article")!;
    const zeroCard = screen.getByRole("heading", { name: `А.0. ${zero.title}` }).closest("article")!;
    const invalidCard = screen.getByRole("heading", { name: `А.X. ${invalid.title}` }).closest("article")!;
    expect(within(missingCard).getByText(/Количество вопросов не подтверждено/)).toBeInTheDocument();
    expect(within(missingCard).queryByText(/^0 вопросов/)).not.toBeInTheDocument();
    expect(within(zeroCard).getByText(/^0 вопросов/)).toBeInTheDocument();
    expect(within(invalidCard).getByText(/Количество вопросов не подтверждено/)).toBeInTheDocument();
    fireEvent.click(within(missingCard).getByRole("button", { name: "Посмотреть состав" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Вопросов в программе").nextElementSibling).toHaveTextContent("Не подтверждено");
  });

  it("metadata truth: does not treat the SQL fallback zero without revisions after a failed check as a confirmed count or date", async () => {
    const empty = { ...bank, source_revision_id: null, bank_revision_id: null, release_id: null, approved_on: null, effective_from: null,
      question_count: 0, key_status: "unreviewed" as const, available_for_training: false, check_status: "error" as const };
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [empty], checks: [{ id: "failed-check", source_id: bank.source_id, status: "error", error: "OFFICIAL_HTTP_403" }] }));
    mount();
    const card = (await screen.findByRole("heading", { name: `А.1. ${bank.title}` })).closest("article")!;
    expect(within(card).getByText(/Количество вопросов не подтверждено/)).toHaveTextContent("Дата применения не подтверждена");
    expect(within(card).queryByText(/^0 вопросов/)).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Назначить обучение" })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Посмотреть состав" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Вопросов в программе").nextElementSibling).toHaveTextContent("Не подтверждено");
    expect(within(dialog).getByText("Дата применения").nextElementSibling).toHaveTextContent("Не подтверждена");
    expect(within(dialog).getByRole("button", { name: "Назначить обучение" })).toBeDisabled();
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

  it.each([0, 211])("metadata truth: a fetched source without a normalized bank revision does not confirm its %s question count", async question_count => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, bank_revision_id: null, release_id: null, question_count, key_status: "unreviewed", available_for_training: false }] }));
    mount();
    const card = (await screen.findByRole("heading", { name: `А.1. ${bank.title}` })).closest("article")!;
    expect(within(card).getByText(/Количество вопросов не подтверждено/)).toHaveTextContent("Применяется с 01.09.2026");
    expect(within(card).queryByText(new RegExp(`^${question_count} вопросов`))).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Назначить обучение" })).not.toBeInTheDocument();
  });

  it("metadata truth: a later failed source check preserves the confirmed revision count and application date", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, check_status: "error", last_success_at: "2026-11-19T10:00:00Z" }] }));
    mount();
    const card = (await screen.findByRole("heading", { name: `А.1. ${bank.title}` })).closest("article")!;
    expect(within(card).getByText(/^211 вопросов/)).toHaveTextContent("Применяется с 01.09.2026");
    expect(within(card).getByRole("button", { name: "Назначить обучение" })).toBeEnabled();
  });

  it("metadata truth: preserves an explicit real zero with a normalized revision without inferring training availability", async () => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, question_count: 0, available_for_training: false }] }));
    mount();
    const card = (await screen.findByRole("heading", { name: `А.1. ${bank.title}` })).closest("article")!;
    expect(within(card).getByText(/^0 вопросов/)).toBeInTheDocument();
    expect(within(card).queryByText(/Количество вопросов не подтверждено/)).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Назначить обучение" })).not.toBeInTheDocument();
  });

  it.each([null, "not-a-date", "2026-02-30", "2026-09-01T00:00:00Z"])("metadata truth: reports unconfirmed application date %s independently from server-authorized availability", async effective_from => {
    api.getRtnWorkspace.mockResolvedValue(workspace({ banks: [{ ...bank, effective_from }] }));
    mount();
    const card = (await screen.findByRole("heading", { name: `А.1. ${bank.title}` })).closest("article")!;
    expect(within(card).getByText(/Дата применения не подтверждена/)).toHaveTextContent("211 вопросов");
    expect(within(card).queryByText(/Применяется с/)).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Назначить обучение" })).toBeEnabled();
    fireEvent.click(within(card).getByRole("button", { name: "Посмотреть состав" }));
    expect(within(screen.getByRole("dialog")).getByText("Дата применения").nextElementSibling).toHaveTextContent("Не подтверждена");
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

});
