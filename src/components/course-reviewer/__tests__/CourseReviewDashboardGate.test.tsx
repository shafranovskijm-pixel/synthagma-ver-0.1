import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseReviewDashboardGate } from "../CourseReviewDashboardGate";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "5061292a-7614-489e-b908-3a7160103809" }, userRole: "student", loading: false, signOut: vi.fn() },
  rpc: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/ui/SigmaLogo", () => ({ SigmaLogo: () => <span>СИНТАГМА</span> }));
vi.mock("@/components/ui/SigmaSpinner", () => ({ SigmaSpinner: () => <span>Загрузка</span> }));
const course = { course_id: "7630559a-6caf-42e7-97f9-1cd0e4598c39", title: "Программа ЦСЗ", duration: "162 академических часа", grant_expires_at: "infinity" };
function mount() { return render(<MemoryRouter><CourseReviewDashboardGate><div>Обычный учебный кабинет</div></CourseReviewDashboardGate></MemoryRouter>); }
beforeEach(() => { mocks.rpc.mockReset(); mocks.auth.user.id = "5061292a-7614-489e-b908-3a7160103809"; mocks.auth.userRole = "student"; mocks.rpc.mockResolvedValue({ data: [], error: null }); });
afterEach(() => cleanup());

describe("reviewer dashboard entry", () => {
  it("shows only assigned review cards and library without mounting the learner dashboard", async () => {
    mocks.rpc.mockResolvedValue({ data: [course], error: null }); mount();
    expect(await screen.findByRole("link", { name: "Открыть курс" })).toHaveAttribute("href", `/review/course/${course.course_id}`);
    expect(screen.getByRole("link", { name: "Библиотека" })).toHaveAttribute("href", `/review/course/${course.course_id}#course-library`);
    expect(screen.queryByText("Обычный учебный кабинет")).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_course_reviews");
  });
  it("keeps the ordinary learner dashboard without making any reviewer RPC", async () => {
    mocks.auth.user.id = "00000000-0000-4000-8000-000000000001";
    mocks.rpc.mockRejectedValue(new Error("not available"));
    mount(); expect(screen.getByText("Обычный учебный кабинет")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Открыть курс" })).not.toBeInTheDocument();
  });
  it("rejects an expired grant even if a stale response contains it", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...course, grant_expires_at: "2000-01-01T00:00:00Z" }], error: null }); mount();
    expect(await screen.findByText("Доступ для проверки отсутствует")).toBeInTheDocument();
    expect(screen.queryByText("Обычный учебный кабинет")).not.toBeInTheDocument();
    expect(screen.queryByText("Программа ЦСЗ")).not.toBeInTheDocument();
  });
  it("does not query own grants while staff views a learner", async () => {
    mocks.auth.userRole = "organization"; mocks.auth.user.id = "00000000-0000-4000-8000-000000000002"; mount();
    expect(screen.getByText("Обычный учебный кабинет")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not expose enrollment cards while reviewer access cannot be determined", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } }); mount();
    expect(await screen.findByText("Не удалось загрузить доступные курсы")).toBeInTheDocument();
    expect(screen.queryByText("Обычный учебный кабинет")).not.toBeInTheDocument();
  });
  it("rejects unexpected answer-key fields instead of rendering them", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...course, correct_answer: 1 }], error: null }); mount();
    await waitFor(() => expect(screen.getByText("Не удалось загрузить доступные курсы")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Открыть курс" })).not.toBeInTheDocument();
  });
});
