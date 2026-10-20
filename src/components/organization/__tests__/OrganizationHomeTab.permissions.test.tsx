import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const setActiveTab = vi.fn();
const setShowAddStudentDialog = vi.fn();
let granted = new Set<string>();
let visibleTabs = new Set<string>();
let limits = { canCreateCourse: true, canAddStudent: true };
let plan = "start", isPostpaid = false, subscriptionLoading = false;

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    branding: { brandingSettings: { customName: "Тестовая организация" } },
    organizationName: "Тестовая организация",
    organizationId: "org-1",
    subscriptionLimits: {
      plan, isPostpaid, loading: subscriptionLoading,
      limits: { emailCampaignsEnabled: true },
      ...limits,
    },
    tabNavigation: { setActiveTab },
    studentManagement: { setShowAddStudentDialog },
    courses: [],
    isLoadingCourses: false,
    stats: {},
    hasSummaryData: true,
    isSummaryLoading: false,
    summaryErrorKind: null,
    retrySummary: vi.fn(),
  }),
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: false,
    can: (permission: string) => granted.has(permission),
    canSeeOrgTab: (tab: string) => visibleTabs.has(tab),
  }),
}));

vi.mock("@/components/organization/QuickStartCard", () => ({ QuickStartCard: () => null }));
vi.mock("@/components/organization/tabs/StatsCards", () => ({ StatsCards: () => null }));

import { OrganizationHomeTab } from "@/components/organization/tabs/OrganizationHomeTab";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/organization"]}>
      <LocationProbe />
      <OrganizationHomeTab />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setActiveTab.mockReset();
  setShowAddStudentDialog.mockReset();
  granted = new Set();
  visibleTabs = new Set();
  limits = { canCreateCourse: true, canAddStudent: true };
  plan = "start"; isPostpaid = false; subscriptionLoading = false;
});

describe("OrganizationHomeTab permission-aware actions", () => {
  it("keeps the mailing workspace available under confirmed free-legacy postpayment", () => {
    plan = "free"; isPostpaid = true;
    granted.add("sales.read"); visibleTabs.add("mailing");
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Открыть коммуникации" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/organization?tab=mailing&mailingTab=overview");
  });
  it("does not advertise a tariff requirement while mailing access is still pending", () => {
    isPostpaid = true; subscriptionLoading = true;
    granted = new Set(["sales.read", "chats.read"]); visibleTabs = new Set(["mailing", "chats"]);
    renderHome();
    expect(screen.getByText(/Доступ к email-рассылкам проверяется/)).toBeInTheDocument();
    expect(screen.queryByText("Рассылки — от Старт")).not.toBeInTheDocument();
  });
  it("shows only readable workspaces and hides write CTAs without write permissions", () => {
    granted.add("courses.read");
    visibleTabs.add("courses");
    renderHome();

    expect(screen.getByRole("heading", { name: "Курсы" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ученики и группы" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать курс" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить ученика" })).not.toBeInTheDocument();
  });

  it("hides create actions when the tariff limit is exhausted", () => {
    granted = new Set(["courses.read", "courses.write", "students.read", "students.write"]);
    visibleTabs = new Set(["courses", "students"]);
    limits = { canCreateCourse: false, canAddStudent: false };
    renderHome();

    expect(screen.queryByRole("button", { name: "Создать курс" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить ученика" })).not.toBeInTheDocument();
  });

  it("opens the add-student dialog directly from the primary CTA", async () => {
    granted = new Set(["students.read", "students.write"]);
    visibleTabs = new Set(["students"]);
    renderHome();

    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));

    expect(setActiveTab).toHaveBeenCalledWith("students");
    await waitFor(() => expect(setShowAddStudentDialog).toHaveBeenCalledWith(true));
  });

  it("opens mailing directly when mailing is readable but chats are not", () => {
    granted.add("sales.read");
    visibleTabs.add("mailing");
    renderHome();

    fireEvent.click(screen.getByRole("button", { name: /Открыть коммуникации/ }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/organization?tab=mailing&mailingTab=overview",
    );
  });
});
