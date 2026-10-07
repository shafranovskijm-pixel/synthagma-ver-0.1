import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const load = vi.hoisted(() => vi.fn());
vi.mock("@/api/studentLearningResults", () => ({ fetchStudentLearningResults: load }));
import { LearningResultsTab } from "../LearningResultsTab";

const course = (name: string) => ({ enrollment_id: name, course_id: name, course_title: name, progress: 100, status: "completed", completed_at: null, time_spent: 60, manual_credited_at: null, tests: [] });
describe("student learning result card", () => {
  beforeEach(() => load.mockReset());
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
});
