import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cancel: vi.fn(), success: vi.fn(), changed: vi.fn(), allowed: true }));
vi.mock("sonner", () => ({ toast: { success: state.success } }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ loading: false, can: () => state.allowed }) }));
vi.mock("@/api/courseAssignmentCancellation", async (original) => ({
  ...await original<typeof import("@/api/courseAssignmentCancellation")>(), cancelCourseAssignment: state.cancel,
}));
import { CancelCourseAssignmentButton } from "@/components/organization/CancelCourseAssignmentButton";

const props = { enrollmentId: "enrollment-1", organizationId: "org-1", courseTitle: "Тестовый курс", onCancelled: state.changed };
beforeEach(() => { vi.clearAllMocks(); state.allowed = true; state.cancel.mockResolvedValue({ cancelled: true }); });

describe("course assignment cancellation dialog", () => {
  it("requires confirmation and refreshes the parent only after confirmed cancellation", async () => {
    render(<CancelCourseAssignmentButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Отменить назначение" }));
    expect(state.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить отмену" }));
    await waitFor(() => expect(state.changed).toHaveBeenCalledTimes(1));
    expect(state.cancel).toHaveBeenCalledWith({ enrollmentId: "enrollment-1", organizationId: "org-1" });
    expect(state.success).toHaveBeenCalledWith("Назначение курса отменено");
  });
  it("retains the dialog and does not claim cancellation when the server rejects historical data", async () => {
    state.cancel.mockRejectedValue({ message: "assignment_has_dependent_records" });
    render(<CancelCourseAssignmentButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Отменить назначение" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить отмену" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("документы"));
    expect(state.changed).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
  });
  it.each([{ progress: 1 }, { timeSpent: 1 }, { status: "completed" }, { hasTestAttempts: true }])(
    "explains and blocks an already-started course: %j", async (history) => {
      render(<CancelCourseAssignmentButton {...props} {...history} />);
      fireEvent.click(screen.getByRole("button", { name: "Отменить назначение" }));
      expect(screen.getByRole("button", { name: "Подтвердить отмену" })).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent("Обучение уже начато");
      expect(state.cancel).not.toHaveBeenCalled();
    },
  );
  it("prevents duplicate submissions while a cancellation is pending", async () => {
    let resolve!: () => void;
    state.cancel.mockReturnValue(new Promise<void>(done => { resolve = done; }));
    render(<CancelCourseAssignmentButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Отменить назначение" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить отмену" }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена назначения..." }));
    expect(state.cancel).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(state.changed).toHaveBeenCalledTimes(1));
  });
  it("hides the action without students.write permission", () => {
    state.allowed = false;
    render(<CancelCourseAssignmentButton {...props} />);
    expect(screen.queryByRole("button", { name: "Отменить назначение" })).toBeNull();
  });
});
