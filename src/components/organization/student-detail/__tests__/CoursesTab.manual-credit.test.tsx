import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoursesTab } from "@/components/organization/student-detail/CoursesTab";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), success: vi.fn(), error: vi.fn(), updated: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({
    order: async () => ({ data: [] }), single: async () => ({ data: {} }),
  }) }) }),
} }));

const enrollment = {
  id: "enrollment-1", course_id: "course-1", course_title: "Курс",
  progress: 0, status: "active", started_at: "2026-09-01T00:00:00Z", time_spent: 0,
};
const h = { formatDuration: () => "0 мин", formatDate: () => "01.09.2026", onStudentUpdated: mocks.updated };

beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { creditedAt: "2026-09-07T04:00:00Z" }, error: null }); });

describe("organization offline credit", () => {
  it.each(["active", "completed"])("credits an %s enrollment through the scoped atomic RPC", async (status) => {
    render(<CoursesTab enrollments={[{ ...enrollment, status }]} h={h} organizationId="org-1" studentUserId="student-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Зачесть курс очно" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("manual_complete_course", {
      p_enrollment_id: "enrollment-1", p_organization_id: "org-1",
    }));
    await waitFor(() => expect(mocks.updated).toHaveBeenCalledTimes(1));
    expect(mocks.success).toHaveBeenCalledWith("Курс и тесты зачтены организацией");
  });
  it("does not report completion or refresh on a rejected write", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    render(<CoursesTab enrollments={[enrollment]} h={h} organizationId="org-1" studentUserId="student-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Зачесть курс очно" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Ошибка: forbidden"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.updated).not.toHaveBeenCalled();
  });
});
