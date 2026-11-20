import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RtnUpdatesHomeCard } from "./RtnUpdatesHomeCard";
import { RtnApiError } from "@/api/rostechnadzor";
import type { RtnUpdateSummary } from "@/types/rtn-updates";
const api = vi.hoisted(() => ({ getRtnUpdateSummary: vi.fn() }));
vi.mock("@/api/rtn-updates", () => api);
const org = "11111111-1111-4111-8111-111111111111", other = "33333333-3333-4333-8333-333333333333", id = "22222222-2222-4222-8222-222222222222";
const summary = (): RtnUpdateSummary => ({ event_count: 1, count_is_lower_bound: false, count_semantics: "known_events_not_unread", latest_event: { id, sequence: 2, kind: "news", topic: "news", previous_event_id: null, bank_id: null, source_revision_id: null, release_id: null, canonical_url: "https://www.gosnadzor.ru/news/64/12345/", title: "Последняя публикация", own_summary: "Краткое пояснение", source_excerpt: "", published_at: "2026-11-20T10:00:00Z", effective_from: null, observed_at: "2026-11-20T10:00:00Z", historical: false, notifiable: true }, source_health: { code: "official-news-rss", feed_url: "https://www.gosnadzor.ru/news/rss/", status: "never_checked", coverage_kind: "unknown", last_checked_at: null, last_success_at: null, coverage_from: null, coverage_until: null, error_code: null, complete_archive: false } });
const props = () => ({ organizationId: org, actorId: "actor-a", canReadCourses: true });
const wrap = (p = props()) => <MemoryRouter><RtnUpdatesHomeCard {...p} /></MemoryRouter>;
beforeEach(() => { vi.resetAllMocks(); api.getRtnUpdateSummary.mockResolvedValue(summary()); });
afterEach(cleanup);
describe("compact RTN home summary", () => {
  it("requires course permission, a real organization and an actor before reading", () => {
    const p = props(); const view = render(wrap({ ...p, canReadCourses: false }));
    view.rerender(wrap({ ...p, organizationId: "not-an-organization" }));
    view.rerender(<MemoryRouter><RtnUpdatesHomeCard {...p} organizationId={null} /></MemoryRouter>);
    view.rerender(<MemoryRouter><RtnUpdatesHomeCard {...p} actorId={null} /></MemoryRouter>);
    expect(api.getRtnUpdateSummary).not.toHaveBeenCalled();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("links the one canonical event with a known-event count rather than unread count", async () => {
    render(wrap());
    expect(await screen.findByText("Сохранённых изменений: 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Посмотреть изменение" })).toHaveAttribute("href", `/organization?tab=courses&courseWorkspace=rtn&rtnView=changes&rtnEventId=${id}`);
    expect(screen.getByText(/не количество непрочитанных/)).toBeInTheDocument();
    expect(api.getRtnUpdateSummary).toHaveBeenCalledWith(org);
  });
  it("marks a capped count as a lower bound", async () => {
    api.getRtnUpdateSummary.mockResolvedValue({ ...summary(), event_count: 1000, count_is_lower_bound: true });
    render(wrap()); expect(await screen.findByText("Сохранённых изменений: 1000+")).toBeInTheDocument();
  });
  it("does not turn a failed summary into zero changes", async () => {
    api.getRtnUpdateSummary.mockRejectedValue(new Error("Нет доступа"));
    render(wrap());
    expect(await screen.findByText("Не удалось подтвердить изменения Ростехнадзора.")).toBeInTheDocument();
    expect(screen.queryByText(/Сохранённых изменений:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("does not promote a module when the server denies its summary", async () => {
    api.getRtnUpdateSummary.mockRejectedValue(new RtnApiError("forbidden", "Нет доступа"));
    render(wrap());
    await waitFor(() => expect(api.getRtnUpdateSummary).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("keeps a confirmed zero count distinct from unknown news coverage", async () => {
    api.getRtnUpdateSummary.mockResolvedValue({ ...summary(), event_count: 0, latest_event: null });
    render(wrap());
    expect(await screen.findByText("Сохранённых изменений: 0")).toBeInTheDocument();
    expect(screen.getByText("Проверка новостей ещё не подтверждена.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть источники" })).toHaveAttribute("href", "/organization?tab=courses&courseWorkspace=rtn&rtnView=sources");
    expect(screen.queryByText("Изменений не обнаружено")).not.toBeInTheDocument();
  });
  it("keeps a blocked source honest and reachable when no events have been saved", async () => {
    const data = summary();
    api.getRtnUpdateSummary.mockResolvedValue({ ...data, event_count: 0, latest_event: null, source_health: { ...data.source_health, status: "blocked", last_checked_at: "2026-11-20T13:00:00Z", error_code: "RTN_NEWS_HTTP_403" } });
    render(wrap());
    expect(await screen.findByText("Сохранённых изменений: 0")).toBeInTheDocument();
    expect(screen.getByText("Проверка новостей недоступна. Отсутствие новых записей не подтверждено.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть источники" })).toHaveAttribute("href", "/organization?tab=courses&courseWorkspace=rtn&rtnView=sources");
    expect(screen.queryByRole("link", { name: "Посмотреть изменение" })).not.toBeInTheDocument();
    expect(screen.queryByText("Изменений не обнаружено")).not.toBeInTheDocument();
    expect(api.getRtnUpdateSummary).toHaveBeenCalledTimes(1);
  });
  it("does not display a previous actor response after switching actor in the same organization", async () => {
    let finish!: (value: RtnUpdateSummary) => void;
    api.getRtnUpdateSummary.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ...summary(), latest_event: { ...summary().latest_event!, title: "Новый актор" } });
    const view = render(wrap()); view.rerender(wrap({ ...props(), actorId: "actor-b" }));
    await screen.findByText("Новый актор"); finish(summary());
    await waitFor(() => expect(screen.queryByText("Последняя публикация")).not.toBeInTheDocument());
  });
  it("immediately hides an authorized card on permission or organization change", async () => {
    const view = render(wrap()); await screen.findByText("Последняя публикация");
    view.rerender(wrap({ ...props(), canReadCourses: false }));
    expect(screen.queryByText("Последняя публикация")).not.toBeInTheDocument();
    api.getRtnUpdateSummary.mockReturnValue(new Promise(() => {}));
    view.rerender(wrap({ ...props(), organizationId: other }));
    expect(screen.queryByText("Последняя публикация")).not.toBeInTheDocument();
  });
});
