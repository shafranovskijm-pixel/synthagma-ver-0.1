import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { observeOfflineAccess, setOfflineAuthActor } from "@/utils/courseCache";
const load = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: { id: "actor-a" }, userRole: "organization", loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/api/studentLearningResults", () => ({ fetchStudentLearningResults: load }));
vi.mock("../LearningOutcomeCard", () => ({ LearningOutcomeCard: () => <div data-testid="canonical-learning-outcome" /> }));
import { LearningResultsTab } from "../LearningResultsTab";

const course = (name: string) => ({ enrollment_id: name, course_id: name, course_title: name, progress: 100, status: "completed", completed_at: null, time_spent: 60, manual_credited_at: null, tests: [] });
describe("student learning result card", () => {
  beforeEach(() => { load.mockReset(); auth.user = { id: "actor-a" }; auth.userRole = "organization"; auth.loading = false; setOfflineAuthActor(null); setOfflineAuthActor("actor-a"); });
  afterEach(() => { cleanup(); setOfflineAuthActor(null); });
  it("shows all courses including not started tests and offline credits without invented scores", async () => {
    load.mockResolvedValue([{ ...course("Охрана труда"), tests: [
      { lesson_id: "test1", lesson_title: "Входной тест", percent: null, passing_score: 70, passed: null, attempts_used: 0, manual_credited_at: null, completed_at: null },
      { lesson_id: "test2", lesson_title: "Итоговый тест", percent: null, passing_score: 80, passed: true, attempts_used: 0, manual_credited_at: "2026-10-01T10:00:00Z", completed_at: null },
    ] }, course("Промышленная безопасность")]);
    render(<LearningResultsTab organizationId="org" userId="s1" />);
    expect(await screen.findByText("Охрана труда")).toBeInTheDocument();
    expect(screen.getByText("Промышленная безопасность")).toBeInTheDocument();
    expect(screen.getByText("Не начат")).toBeInTheDocument();
    expect(screen.getByText("Зачтено организацией")).toBeInTheDocument();
    expect(screen.queryByText("0/0 · 0%")).not.toBeInTheDocument();
  });
  it("discards a late response for the previous learner", async () => {
    let oldResolve!: (rows: unknown[]) => void;
    load.mockImplementation((_org, user) => user === "s1" ? new Promise(resolve => { oldResolve = resolve; }) : Promise.resolve([course("Новый ученик")]));
    const view = render(<LearningResultsTab organizationId="org" userId="s1" />);
    view.rerender(<LearningResultsTab organizationId="org" userId="s2" />);
    expect(await screen.findByText("Новый ученик")).toBeInTheDocument();
    await act(async () => oldResolve([course("Старый ученик")]));
    expect(screen.queryByText("Старый ученик")).not.toBeInTheDocument();
  });
  it("shows a retryable error rather than a false empty record", async () => {
    load.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    render(<LearningResultsTab organizationId="org" userId="s1" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Ученик не зачислен на курсы.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(screen.getByText("Ученик не зачислен на курсы.")).toBeInTheDocument());
  });
  it("drops a late response after the same learner route goes A → B → A", async () => {
    let finish!: (rows: unknown[]) => void;
    load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce([course("Промежуточный ученик")]).mockResolvedValueOnce([course("Актуальные результаты")]);
    const view = render(<LearningResultsTab organizationId="org" userId="s1" />);
    view.rerender(<LearningResultsTab organizationId="org" userId="s2" />);
    expect(await screen.findByText("Промежуточный ученик")).toBeInTheDocument();
    view.rerender(<LearningResultsTab organizationId="org" userId="s1" />);
    expect(await screen.findByText("Актуальные результаты")).toBeInTheDocument();
    await act(async () => finish([course("Устаревший приватный результат")]));
    expect(screen.queryByText("Устаревший приватный результат")).not.toBeInTheDocument();
  });
  it("masks the previous actor immediately and ignores an old actor A → B → A response", async () => {
    let finish!: (rows: unknown[]) => void;
    load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce([course("Результат для B")]).mockResolvedValueOnce([course("Новый результат для A")]);
    const view = render(<LearningResultsTab organizationId="org" userId="s1" />);
    act(() => { auth.user = { id: "actor-b" }; setOfflineAuthActor("actor-b"); view.rerender(<LearningResultsTab organizationId="org" userId="s1" />); });
    expect(await screen.findByText("Результат для B")).toBeInTheDocument();
    act(() => { auth.user = { id: "actor-a" }; setOfflineAuthActor("actor-a"); view.rerender(<LearningResultsTab organizationId="org" userId="s1" />); });
    expect(screen.queryByText("Результат для B")).not.toBeInTheDocument();
    expect(await screen.findByText("Новый результат для A")).toBeInTheDocument();
    await act(async () => finish([course("Старый результат для A")]));
    expect(screen.queryByText("Старый результат для A")).not.toBeInTheDocument();
  });
  it("clears rendered results on a same-target 403 and on an observed authority revision", async () => {
    load.mockResolvedValueOnce([course("Приватный результат")]).mockRejectedValueOnce({ status: 403 })
      .mockResolvedValueOnce([course("Подтверждён заново")]);
    const view = render(<LearningResultsTab organizationId="org" userId="s1" />);
    expect(await screen.findByText("Приватный результат")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Обновить" }));
    expect(screen.queryByText("Приватный результат")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось подтвердить доступ");
    expect(screen.queryByTestId("canonical-learning-outcome")).not.toBeInTheDocument();
    act(() => { observeOfflineAccess("actor-a", "authority-changed"); view.rerender(<LearningResultsTab organizationId="org" userId="s1" />); });
    expect(await screen.findByText("Подтверждён заново")).toBeInTheDocument();
  });
});
