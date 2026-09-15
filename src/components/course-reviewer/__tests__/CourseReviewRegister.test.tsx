import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), userId: "reviewer-a" }));
vi.mock("@/api/courseReviewRegister", () => ({ fetchCourseReviewRegister: mocks.fetch }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
import { CourseReviewRegister } from "@/components/course-reviewer/CourseReviewRegister";

const courseId = "7630559a-6caf-42e7-97f9-1cd0e4598c39";
const empty = { course_id: courseId, recorded_at: "2026-09-15T00:00:00Z", enrollment_count: 0, records: [] };
const populated = { ...empty, enrollment_count: 1, records: [{
  record_no: 1, status: "active", progress: 25, started_at: "2026-09-15T00:00:00Z", completed_at: null,
  tests: [{ lesson_title: "Промежуточный тест", score: 4, max_score: 5, completed_at: "2026-09-15T01:00:00Z" }],
  assignments: [{ lesson_title: "Письменная работа 1", status: "revision", score: null, submitted_at: "2026-09-15T01:00:00Z", reviewed_at: null }],
}] };

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const element = () => <QueryClientProvider client={client}><CourseReviewRegister courseId={courseId} /></QueryClientProvider>;
  const view = render(element());
  return { ...view, changeUser: (id: string) => { mocks.userId = id; view.rerender(element()); } };
}

describe("read-only course register", () => {
  beforeEach(() => { mocks.fetch.mockReset(); mocks.userId = "reviewer-a"; });
  afterEach(() => { cleanup(); });
  it("renders the real empty table without sample learners", async () => {
    mocks.fetch.mockResolvedValue(empty);
    mount();
    expect(await screen.findByText("На курс пока никто не зачислен. Результаты обучения отсутствуют.")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("renders stored results and status without assigning a fictitious pass", async () => {
    mocks.fetch.mockResolvedValue(populated);
    mount();
    expect(await screen.findByText(/Промежуточный тест: 4 из 5/)).toBeInTheDocument();
    expect(screen.getByText(/Письменная работа 1: На доработке/)).toBeInTheDocument();
    expect(screen.getByText(/Прогресс: 25%/)).toBeInTheDocument();
    expect(screen.queryByText(/успешно освоил|итоговая аттестация пройдена/i)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows a read error instead of zero learners", async () => {
    mocks.fetch.mockRejectedValue(new Error("denied"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Число слушателей и результаты не подтверждены");
    expect(screen.queryByText(/На курс пока никто/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("does not reuse the previous user's cached records after a session change", async () => {
    mocks.fetch.mockResolvedValueOnce(populated).mockImplementation(() => new Promise(() => {}));
    const view = mount();
    await screen.findByText(/Промежуточный тест: 4 из 5/);
    view.changeUser("reviewer-b");
    expect(await screen.findByRole("status")).toHaveTextContent("Загружаем данные учёта");
    expect(screen.queryByText(/Промежуточный тест: 4 из 5/)).toBeNull();
  });
});
