import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const setActiveTab = vi.fn();
let activeTab = "courses";
let organizationId = "org-1";
let plan = "free";
let emailCampaignsEnabled = false;
let salesCrmEnabled = false;
let deniedPermissions = new Set<string>();

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId,
    courses: [],
    branding: { brandingSettings: { logoUrl: null } },
    subscriptionLimits: {
      plan,
      limits: { emailCampaignsEnabled, salesCrmEnabled, reportsEnabled: true },
    },
    tabNavigation: { activeTab, setActiveTab },
    checkLimit: () => ({ allowed: true, message: "" }),
    studentManagement: { setShowAddStudentDialog: vi.fn() },
    setShowImportDialog: vi.fn(),
    registrationLinks: { setShowCreateLinkDialog: vi.fn() },
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: () => Promise.resolve({ count: 0, data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    can: (permission: string) => !deniedPermissions.has(permission),
  }),
}));

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
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setActiveTab.mockClear();
  activeTab = "courses";
  organizationId = "org-1";
  plan = "free";
  emailCampaignsEnabled = false;
  salesCrmEnabled = false;
  deniedPermissions = new Set();
});

describe("QuickActionChips — контекстные действия", () => {
  it("не дублирует действия стартового экрана и остаётся доступным на мобильной ширине", () => {
    activeTab = "home";
    const { rerender } = renderAt(<QuickActionChips />);
    expect(screen.queryByText("Быстрые действия:")).not.toBeInTheDocument();

    activeTab = "courses";
    rerender(
      <MemoryRouter initialEntries={["/organization?tab=courses"]}>
        <QuickActionChips />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("quick-chip-create-course").parentElement).not.toHaveClass("hidden");
  });

  it("в курсах показывает только действия курса и убирает «Тариф и документы»", () => {
    renderAt(<QuickActionChips />);
    expect(screen.getByTestId("quick-chip-create-course")).toBeInTheDocument();
    expect(screen.getByTestId("quick-chip-marketplace")).toHaveAttribute(
      "href",
      "/organization?tab=services",
    );
    expect(screen.queryByText("Тариф и документы")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-chip-add-student")).not.toBeInTheDocument();
  });

  it("не показывает рассылки на Бесплатном тарифе", () => {
    activeTab = "chats";
    emailCampaignsEnabled = true;
    renderAt(<QuickActionChips />);
    expect(screen.queryByTestId("quick-chip-mailing")).not.toBeInTheDocument();
  });

  it("показывает реальную ссылку на рассылки со Старт-тарифа", async () => {
    activeTab = "chats";
    plan = "start";
    emailCampaignsEnabled = true;
    renderAt(<QuickActionChips />);

    const chip = screen.getByTestId("quick-chip-mailing");
    expect(chip.tagName).toBe("A");
    expect(chip).toHaveAttribute("href", "/mailing/app?tab=overview");
    fireEvent.click(chip);
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe("/mailing/app?tab=overview"),
    );
  });

  it("не показывает рассылки сотруднику без sales.read", () => {
    activeTab = "chats";
    plan = "start";
    emailCampaignsEnabled = true;
    deniedPermissions = new Set(["sales.read"]);
    renderAt(<QuickActionChips />);

    expect(screen.queryByTestId("quick-chip-mailing")).not.toBeInTheDocument();
  });

  it("сохраняет историю под ключом текущей организации", () => {
    renderAt(<QuickActionChips />);
    fireEvent.click(screen.getByTestId("quick-chip-marketplace"));

    expect(localStorage.getItem("org-recent-actions")).toBeNull();
    expect(localStorage.getItem("org-recent-actions:org-1")).toContain("marketplace");
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
