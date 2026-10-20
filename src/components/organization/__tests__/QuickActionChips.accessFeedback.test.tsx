import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LimitCheckResult } from "@/utils/limitToast";

const state = vi.hoisted(() => ({
  loading: false,
  result: { allowed: true, message: "" } as LimitCheckResult,
  check: vi.fn(), retry: vi.fn(), setTab: vi.fn(), feedback: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: state.feedback } }));
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({
  organizationId: "sgt", subscriptionLimits: { plan: "maximum", isPostpaid: true, loading: state.loading, refetch: state.retry, limits: { reportsEnabled: true } },
  checkLimit: state.check, tabNavigation: { activeTab: "courses", setActiveTab: state.setTab },
}) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useOrgSidebarPinned", () => ({ useRecentActions: () => ({ recent: [], track: vi.fn() }) }));
import { QuickActionChips } from "../QuickActionChips";

beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.result = { allowed: true, message: "" };
  state.check.mockImplementation(() => state.result);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = () => render(<MemoryRouter><QuickActionChips /></MemoryRouter>);

describe("create-course action while postpaid access is being checked", () => {
  it("disables the real header action while verification is pending", () => {
    state.loading = true;
    state.result = { allowed: false, reason: "checking", message: "Проверяем ограничения организации…" };
    show();
    const create = screen.getByRole("button", { name: "Создать курс" });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("aria-busy", "true");
    fireEvent.click(create);
    expect(state.check).not.toHaveBeenCalled();
    expect(state.setTab).not.toHaveBeenCalled();
    expect(state.feedback).not.toHaveBeenCalled();
  });
  it("keeps a checking denial safe if verification restarts at click time", () => {
    state.result = { allowed: false, reason: "checking", message: "Проверяем ограничения организации…" };
    show();
    fireEvent.click(screen.getByRole("button", { name: "Создать курс" }));
    expect(state.setTab).not.toHaveBeenCalled();
    expect(state.feedback).toHaveBeenCalledWith(state.result.message, { duration: 6000 });
  });
  it("offers the existing verification retry instead of a tariff purchase on failure", () => {
    state.result = { allowed: false, reason: "verification_error", message: "Не удалось проверить ограничения организации." };
    show();
    fireEvent.click(screen.getByRole("button", { name: "Создать курс" }));
    expect(state.setTab).not.toHaveBeenCalled();
    const action = state.feedback.mock.calls[0][1].action;
    expect(action.label).toBe("Повторить проверку");
    action.onClick();
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
  it("retains the upgrade action for a verified finite quota", () => {
    state.result = { allowed: false, reason: "quota", message: "Лимит тарифа: 3 курса." };
    show();
    fireEvent.click(screen.getByRole("button", { name: "Создать курс" }));
    expect(state.setTab).not.toHaveBeenCalled();
    expect(state.feedback.mock.calls[0][1].action.label).toBe("Перейти на тариф");
  });
  it("opens the existing creation flow once access is confirmed", async () => {
    vi.useFakeTimers();
    const event = vi.fn();
    window.addEventListener("org-create-course", event);
    try {
      show();
      expect(screen.getByRole("button", { name: "Создать курс" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Создать курс" }));
      expect(state.setTab).toHaveBeenCalledExactlyOnceWith("courses");
      await act(async () => { vi.advanceTimersByTime(100); });
      expect(event).toHaveBeenCalledTimes(1);
      expect(state.feedback).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("org-create-course", event);
    }
  });
});
