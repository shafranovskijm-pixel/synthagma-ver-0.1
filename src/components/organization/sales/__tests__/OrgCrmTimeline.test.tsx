import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrgCrmTimeline, type CrmTimelineEvent } from "../OrgCrmTimeline";

afterEach(cleanup);
const event = (id: string, source: CrmTimelineEvent["source"], title: string, occurred_at: string): CrmTimelineEvent => ({ id, source, title, occurred_at, kind: "saved", description: null });
const base = { events: [] as CrmTimelineEvent[], total: 0, truncated: false, restricted_sources: [], unavailable_sources: [] };

describe("CRM context chronology", () => {
  it("labels login history separately from CRM notes", () => {
    render(<MemoryRouter><OrgCrmTimeline timeline={{ ...base, events: [event("login", "activity", "Вход в кабинет ученика", "2026-10-12T09:00:00Z"), event("note", "crm", "Заметка менеджера", "2026-10-12T08:00:00Z")], total: 2 }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Активность ученика (1)" }));
    expect(screen.getByText("Вход в кабинет ученика")).toBeInTheDocument();
    expect(screen.queryByText("Заметка менеджера")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CRM (1)" }));
    expect(screen.getByText("Заметка менеджера")).toBeInTheDocument();
    expect(screen.queryByText("Вход в кабинет ученика")).not.toBeInTheDocument();
  });

  it("orders persisted events by their own dates, retains source labels and filters without inventing events", () => {
    const events = [event("crm-created", "crm", "Создана сделка", "2026-10-11T10:00:00Z"), event("enrolled", "learning", "Зачисление на курс", "2026-10-12T08:00:00Z"), event("document", "documents", "Загружен договор", "2026-10-12T09:00:00Z")];
    render(<MemoryRouter><OrgCrmTimeline timeline={{ ...base, events, total: 3 }} sourceLinks={{ learning: "/organization?tab=student-details&studentId=student-a&studentSection=courses" }} /></MemoryRouter>);
    const items = screen.getAllByRole("listitem");
    expect(items.map(item => item.getAttribute("data-source"))).toEqual(["documents", "learning", "crm"]);
    expect(within(items[0]).getByText("Загружен договор")).toBeInTheDocument();
    expect(screen.queryByText(/подписан|оплачен|отправлен/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Открыть раздел «Документы»" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть раздел «Обучение»" })).toHaveAttribute("href", "/organization?tab=student-details&studentId=student-a&studentSection=courses");
    fireEvent.click(screen.getByRole("button", { name: "CRM (1)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Загружен договор")).not.toBeInTheDocument();
  });

  it("discloses missing permissions, unavailable sources and partial history separately", () => {
    const retry = vi.fn();
    render(<MemoryRouter><OrgCrmTimeline timeline={{ ...base, events: [event("note", "crm", "Заметка менеджера", "2026-10-12T08:00:00Z")], total: 501, truncated: true, restricted_sources: ["documents"], unavailable_sources: ["learning"] }} onRetry={retry} /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("Показано 1 из 501");
    expect(screen.getByText(/Источники без доступа/)).toHaveTextContent("Документы");
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить источники: Обучение");
    expect(screen.getByText("Заметка менеджера")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку истории" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("reports an empty selected source without claiming the entire history is empty", () => {
    render(<MemoryRouter><OrgCrmTimeline timeline={{ ...base, events: [event("note", "crm", "Заметка", "2026-10-12T08:00:00Z")], total: 1 }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Документы (0)" }));
    expect(screen.getByText("В загруженной истории нет событий выбранного источника.")).toBeInTheDocument();
    expect(screen.queryByText("Доступных сохранённых событий пока нет.")).not.toBeInTheDocument();
  });
});
