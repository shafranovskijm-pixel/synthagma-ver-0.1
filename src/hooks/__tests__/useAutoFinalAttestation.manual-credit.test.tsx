import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoFinalAttestation, resolveFinalTestOutcome } from "@/hooks/useAutoFinalAttestation";
import { AutoFinalAttestationJournal } from "@/components/organization/AutoFinalAttestationJournal";

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, { data: any[] | null; error?: unknown }>, error: vi.fn(), filters: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/utils/xlsxHelper", () => ({ getXLSX: vi.fn() }));
vi.mock("@/components/ui/calendar", () => ({ Calendar: () => <div>Календарь</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const chain: any = {};
  for (const method of ["select", "eq", "in", "is", "order"]) chain[method] = (...args: unknown[]) => { mocks.filters(table, method, ...args); return chain; };
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(mocks.tables[table] ?? { data: [] }).then(resolve, reject);
  return chain;
} } }));

const now = new Date().toISOString();
const credit = { enrollment_id: "enrollment-1", credited_at: now, credited_by: "teacher-1" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables = {
    courses: { data: [{ id: "course-1", title: "Курс" }] },
    enrollments: { data: [{ id: "enrollment-1", user_id: "student-1", course_id: "course-1", status: "completed", progress: 100, started_at: now, completed_at: now, time_spent: 0 }] },
    profiles: { data: [{ user_id: "student-1", full_name: "Иван Иванов", email: "student@example.test" }] },
    lessons: { data: [{ id: "test-1", course_id: "course-1", type: "test", order_index: 0, test_passing_score: 90 }] },
    test_attempts: { data: [] }, course_manual_credits: { data: [credit] },
  };
});

describe("final attestation course credits", () => {
  it("renders a manually passed final test with no online attempt as credited, without a fabricated score or waiting state", async () => {
    render(<AutoFinalAttestationJournal organizationId="org-1" onClose={() => undefined} />);
    expect(await screen.findByText("Зачтено организацией")).toBeInTheDocument();
    expect(screen.getByText("Очный зачёт")).toBeInTheDocument();
    expect(screen.queryByText("Ожидается")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Просмотр ответов")).not.toBeInTheDocument();
    expect(mocks.filters).toHaveBeenCalledWith("course_manual_credits", "in", "enrollment_id", ["enrollment-1"]);
    expect(mocks.filters).toHaveBeenCalledWith("course_manual_credits", "is", "revoked_at", null);
  });
  it("retains actual failed attempt details while manual credit determines attestation and date", async () => {
    mocks.tables.test_attempts = { data: [{ id: "attempt-1", user_id: "student-1", lesson_id: "test-1", score: 2, max_score: 10, passed: false, passing_score: 70, completed_at: "2026-01-01T00:00:00Z" }] };
    const { result } = renderHook(() => useAutoFinalAttestation("org-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records[0]).toMatchObject({ final_test_passed: true, final_test_date: now, final_test_score: 2, test_attempt_id: "attempt-1", manual_credited_by: "teacher-1" });
    expect(result.current.stats.avgScore).toBe(20);
  });
  it("uses saved online pass and threshold after the editor raises the lesson threshold", () => {
    expect(resolveFinalTestOutcome({ score: 8, max_score: 10, passed: true, passing_score: 70, completed_at: now }, 90).passed).toBe(true);
    expect(resolveFinalTestOutcome({ score: 8, max_score: 10, passed: false, passing_score: 90, completed_at: now }, 50).passed).toBe(false);
    expect(resolveFinalTestOutcome({ score: 8, max_score: 10, completed_at: now }, 90).passed).toBe(false);
  });
  it("does not silently report a learner as uncredited when the credit read fails", async () => {
    mocks.tables.course_manual_credits = { data: null, error: new Error("permission denied") };
    const { result } = renderHook(() => useAutoFinalAttestation("org-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records).toEqual([]);
    expect(mocks.error).toHaveBeenCalledWith("Ошибка загрузки данных");
  });
});
