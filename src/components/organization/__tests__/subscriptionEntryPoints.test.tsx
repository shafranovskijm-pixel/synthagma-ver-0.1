import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/**
 * Regression на РЕАЛЬНЫЕ компоненты кабинета организации (не dev harness).
 * Живой тест показал: обработчик на <button> терялся, URL не менялся.
 * Поэтому проверяем именно нативный URL-переход (anchor + href) и location.search.
 */

const setActiveTab = vi.fn();

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "org-1",
    courses: [],
    branding: { brandingSettings: { logoUrl: null } },
    subscriptionLimits: { plan: "free" },
    tabNavigation: { setActiveTab },
    studentManagement: { setShowAddStudentDialog: vi.fn() },
    setShowImportDialog: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: () => Promise.resolve({ count: 0, data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});

import { QuickActionChips } from "@/components/organization/QuickActionChips";
import { QuickStartCard } from "@/components/organization/QuickStartCard";

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname + loc.search}</span>;
}

function renderAt(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/organization?cb=123"]}>
      <LocationProbe />
      <Routes>
        <Route path="/organization" element={<>{ui}</>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setActiveTab.mockClear();
});

describe("QuickActionChips — «Тариф и документы»", () => {
  it("рендерится как реальная ссылка с href на вкладку тарифа", () => {
    renderAt(<QuickActionChips />);
    const chip = screen.getByTestId("quick-chip-send-proposal");
    expect(chip.tagName).toBe("A");
    expect(chip.getAttribute("href")).toBe("/organization?tab=subscription");
    expect(chip.textContent).toContain("Тариф и документы");
  });

  it("клик реально меняет location.search на tab=subscription", async () => {
    renderAt(<QuickActionChips />);
    fireEvent.click(screen.getByTestId("quick-chip-send-proposal"));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe("/organization?tab=subscription"),
    );
  });
});

describe("QuickStartCard — «Открыть тариф»", () => {
  it("рендерится как ссылка и клик ведёт на вкладку тарифа, не открывая создание курса", async () => {
    renderAt(<QuickStartCard />);
    const link = await screen.findByTestId("quickstart-plan");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/organization?tab=subscription");

    const courseEvents: Event[] = [];
    const onCourse = (e: Event) => courseEvents.push(e);
    window.addEventListener("org-create-course", onCourse);
    fireEvent.click(link);
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe("/organization?tab=subscription"),
    );
    window.removeEventListener("org-create-course", onCourse);
    expect(courseEvents).toHaveLength(0);
    expect(setActiveTab).not.toHaveBeenCalled();
  });
});
