import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RtnUpdatesFeed } from "./RtnUpdatesFeed";
import type { RtnNewsSourceHealth, RtnUpdateEvent, RtnUpdatePage } from "@/types/rtn-updates";

const api = vi.hoisted(() => ({ getRtnUpdates: vi.fn(), getRtnUpdate: vi.fn() }));
vi.mock("@/api/rtn-updates", () => api);
const org = "11111111-1111-4111-8111-111111111111", other = "33333333-3333-4333-8333-333333333333";
const id = "22222222-2222-4222-8222-222222222222", bankId = "44444444-4444-4444-8444-444444444444";
const health = (): RtnNewsSourceHealth => ({ code: "official-news-rss", feed_url: "https://www.gosnadzor.ru/news/rss/", status: "never_checked", coverage_kind: "unknown", last_checked_at: null, last_success_at: null, coverage_from: null, coverage_until: null, error_code: null, complete_archive: false });
const event = (delta: Partial<RtnUpdateEvent> = {}): RtnUpdateEvent => ({ id, sequence: 50, kind: "news", topic: "industrial-safety", previous_event_id: null, bank_id: null, source_revision_id: null, release_id: null, canonical_url: "https://www.gosnadzor.ru/news/64/12345/", title: "Новая публикация", source_excerpt: "Чужой редакционный текст", own_summary: "Краткое пояснение СИНТАГМЫ", published_at: "2026-11-19T10:00:00Z", effective_from: null, observed_at: "2026-11-20T10:00:00Z", historical: false, notifiable: true, ...delta });
const page = (delta: Partial<RtnUpdatePage> = {}): RtnUpdatePage => ({ events: [event()], has_more: false, next_before_sequence: null, source_health: health(), ...delta });
const props = () => ({ organizationId: org, actorId: "actor-a", onSelectEvent: vi.fn(), onOpenBank: vi.fn() });
beforeEach(() => { vi.resetAllMocks(); api.getRtnUpdates.mockResolvedValue(page()); api.getRtnUpdate.mockResolvedValue({ event: event(), source_health: health() }); });
afterEach(cleanup);

describe("RTN shared changes feed", () => {
  it("keeps an empty known feed distinct from an unchecked source", async () => {
    api.getRtnUpdates.mockResolvedValue(page({ events: [] }));
    render(<RtnUpdatesFeed {...props()} />);
    expect(await screen.findByText(/пока нет сохранённых изменений/)).toBeInTheDocument();
    expect(screen.getByText("Проверка новостей ещё не подтверждена.")).toBeInTheDocument();
    expect(screen.queryByText("Изменений не обнаружено")).not.toBeInTheDocument();
    expect(api.getRtnUpdates).toHaveBeenCalledWith(org, { kind: undefined, limit: 20, beforeSequence: undefined });
  });
  it("uses one server questions-union filter and a separate news filter", async () => {
    render(<RtnUpdatesFeed {...props()} />);
    await screen.findByText("Новая публикация");
    expect(screen.getByRole("group", { name: "Фильтр изменений" })).toBeInTheDocument();
    api.getRtnUpdates.mockResolvedValue(page({ events: [event({ kind: "source_change", title: "Изменились вопросы", published_at: null, bank_id: bankId })] }));
    fireEvent.click(screen.getByRole("button", { name: "Вопросы" }));
    await screen.findByText("Изменились вопросы");
    expect(api.getRtnUpdates.mock.calls[1]).toEqual([org, { kind: "questions", limit: 20, beforeSequence: undefined }]);
    api.getRtnUpdates.mockResolvedValue(page());
    fireEvent.click(screen.getByRole("button", { name: "Новости" }));
    await screen.findByText("Новая публикация");
    expect(api.getRtnUpdates).toHaveBeenCalledTimes(3);
    expect(api.getRtnUpdates.mock.calls[2][1].kind).toBe("news");
    expect(screen.getByRole("button", { name: "Новости" })).toHaveAttribute("aria-pressed", "true");
  });
  it("paginates by the exact server cursor with bounded pages", async () => {
    api.getRtnUpdates.mockResolvedValueOnce(page({ has_more: true, next_before_sequence: 50 })).mockResolvedValueOnce(page({ events: [event({ id: other, sequence: 49, title: "Предыдущая публикация" })] }));
    render(<RtnUpdatesFeed {...props()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Показать ещё" }));
    await screen.findByText("Предыдущая публикация");
    expect(screen.getByText("Новая публикация")).toBeInTheDocument();
    expect(api.getRtnUpdates.mock.calls[1]).toEqual([org, { kind: undefined, limit: 20, beforeSequence: 50 }]);
    expect(screen.queryByRole("button", { name: "Показать ещё" })).not.toBeInTheDocument();
  });
  it("opens a canonical event identity without substituting a bank or marking it read", async () => {
    const p = props(); render(<RtnUpdatesFeed {...p} />);
    const link = await screen.findByRole("link", { name: "Подробнее об изменении" });
    expect(link).toHaveAttribute("href", `/organization?tab=courses&courseWorkspace=rtn&rtnView=changes&rtnEventId=${id}`);
    fireEvent.click(link);
    expect(p.onSelectEvent).toHaveBeenCalledWith(id);
    expect(p.onOpenBank).not.toHaveBeenCalled();
    expect(api.getRtnUpdate).not.toHaveBeenCalled();
  });
  it("loads an exact linked event and retains its precise programme destination", async () => {
    const p = props(); api.getRtnUpdate.mockResolvedValue({ event: event({ kind: "bank_release", bank_id: bankId, published_at: "2026-11-19T10:00:00Z", effective_from: "2026-11-21" }), source_health: health() });
    render(<RtnUpdatesFeed {...p} eventId={id} />);
    const detail = await screen.findByRole("article", { name: "Карточка изменения" });
    expect(api.getRtnUpdate).toHaveBeenCalledWith(org, id);
    expect(api.getRtnUpdates).not.toHaveBeenCalled();
    expect(within(detail).getByText("Редакция выпущена")).toBeInTheDocument();
    expect(within(detail).getByText("Применяется для новых попыток с")).toBeInTheDocument();
    expect(within(detail).getByText("21.11.2026")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Посмотреть программу" }));
    expect(p.onOpenBank).toHaveBeenCalledWith(bankId);
    fireEvent.click(screen.getByRole("button", { name: "Все изменения" }));
    expect(p.onSelectEvent).toHaveBeenCalledWith(null);
  });
  it("rejects a malformed linked identity before any lookup", () => {
    render(<RtnUpdatesFeed {...props()} eventId="not-an-event" />);
    expect(screen.getByText(/Ссылка на изменение некорректна/)).toBeInTheDocument();
    expect(api.getRtnUpdate).not.toHaveBeenCalled(); expect(api.getRtnUpdates).not.toHaveBeenCalled();
  });
  it("does not replace a denied exact event with a different recent event", async () => {
    api.getRtnUpdate.mockRejectedValue(new Error("Нет доступа к этим изменениям."));
    render(<RtnUpdatesFeed {...props()} eventId={id} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет доступа");
    expect(api.getRtnUpdates).not.toHaveBeenCalled();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
  it("discards an old exact-event response when the linked event changes", async () => {
    let finish!: (value: { event: RtnUpdateEvent; source_health: RtnNewsSourceHealth }) => void;
    api.getRtnUpdate.mockImplementation((_org, target) => target === id ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ event: event({ id: other, title: "Другой точный ответ" }), source_health: health() }));
    const p = props(); const view = render(<RtnUpdatesFeed {...p} eventId={id} />);
    view.rerender(<RtnUpdatesFeed {...p} eventId={other} />);
    await screen.findByText("Другой точный ответ"); finish({ event: event(), source_health: health() });
    await waitFor(() => expect(screen.queryByText("Новая публикация")).not.toBeInTheDocument());
    expect(api.getRtnUpdates).not.toHaveBeenCalled();
  });
  it("hides a stale tenant response after scope changes", async () => {
    let finish!: (value: RtnUpdatePage) => void;
    api.getRtnUpdates.mockImplementation((scope: string) => scope === org ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(page({ events: [event({ title: "Другая организация" })] })));
    const p = props(); const view = render(<RtnUpdatesFeed {...p} />);
    view.rerender(<RtnUpdatesFeed {...p} organizationId={other} />);
    await screen.findByText("Другая организация");
    finish(page());
    await waitFor(() => expect(screen.queryByText("Новая публикация")).not.toBeInTheDocument());
  });
  it("hides an old filter response that completes after a new filter", async () => {
    let finish!: (value: RtnUpdatePage) => void;
    api.getRtnUpdates.mockImplementation((_scope, filter) => filter.kind === "news" ? Promise.resolve(page({ events: [event({ title: "Только новости" })] })) : new Promise(resolve => { finish = resolve; }));
    render(<RtnUpdatesFeed {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Новости" }));
    await screen.findByText("Только новости"); finish(page());
    await waitFor(() => expect(screen.queryByText("Новая публикация")).not.toBeInTheDocument());
  });
  it("clears prior authorized rows if a later page fails and retries the first page", async () => {
    api.getRtnUpdates.mockResolvedValueOnce(page({ has_more: true, next_before_sequence: 50 })).mockRejectedValueOnce(new Error("Нет доступа к этим изменениям."));
    render(<RtnUpdatesFeed {...props()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Показать ещё" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Новая публикация")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку изменений" }));
    await screen.findByText("Новая публикация");
    expect(api.getRtnUpdates.mock.calls[2][1].beforeSequence).toBeUndefined();
  });
  it("presents a news date and own summary without inventing a legal effective date or republishing the excerpt", async () => {
    render(<RtnUpdatesFeed {...props()} />);
    await screen.findByText("Краткое пояснение СИНТАГМЫ");
    expect(screen.getByText("Опубликовано на сайте")).toBeInTheDocument();
    expect(screen.getByText(/Новость не определяет дату вступления требований/)).toBeInTheDocument();
    expect(screen.queryByText("Чужой редакционный текст")).not.toBeInTheDocument();
    expect(screen.queryByText("Применяется для новых попыток с")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Официальный источник" })).toHaveAttribute("rel", "noopener noreferrer");
  });
  it("keeps failed source health distinct from a successful empty news check", async () => {
    api.getRtnUpdates.mockResolvedValue(page({ events: [], source_health: { ...health(), status: "error", error_code: "FETCH_TIMEOUT" } }));
    render(<RtnUpdatesFeed {...props()} />);
    expect(await screen.findByText(/Не удалось проверить новости/)).toBeInTheDocument();
    expect(screen.queryByText(/Последняя успешная проверка новостей/)).not.toBeInTheDocument();
  });
});
