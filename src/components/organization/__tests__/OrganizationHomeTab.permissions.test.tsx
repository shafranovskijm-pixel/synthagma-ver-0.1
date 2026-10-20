import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const setActiveTab = vi.fn();
const setShowAddStudentDialog = vi.fn();
let granted = new Set<string>();
let visibleTabs = new Set<string>();
let limits = { canCreateCourse: true, canAddStudent: true };
let plan = "start", isPostpaid = false, subscriptionLoading = false;
let organizationId: string | null = "org-1";
let organizationLoading = false, subscriptionReady = true;
let subscriptionError: string | null = null;

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    branding: { brandingSettings: { customName: "Тестовая организация" } },
    organizationName: "Тестовая организация",
    organizationId,
    subscriptionLimits: {
      plan, isPostpaid, loading: subscriptionLoading, error: subscriptionError,
      accessReady: subscriptionReady && !subscriptionLoading && !subscriptionError,
      limits: { emailCampaignsEnabled: true },
      ...limits,
    },
    tabNavigation: { setActiveTab },
    studentManagement: { setShowAddStudentDialog },
    courses: [],
    isLoadingCourses: organizationLoading,
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
  organizationId = "org-1"; organizationLoading = false; subscriptionReady = true; subscriptionError = null;
});

describe("OrganizationHomeTab permission-aware actions", () => {
  it("does not advertise Start from the initial null-context free fallback", () => {
    organizationId = null; organizationLoading = true; subscriptionReady = false; plan = "free";
    granted = new Set(["sales.read", "chats.read"]); visibleTabs = new Set(["mailing", "chats"]);
    renderHome();
    expect(screen.getByRole("heading", { name: "Кабинет загружается…" })).toBeInTheDocument();
    expect(screen.getByText(/Доступ к email-рассылкам проверяется/)).toBeInTheDocument();
    expect(screen.queryByText("Рассылки — от Старт")).not.toBeInTheDocument();
  });
  it.each(["unverified", "error"])("keeps unconfirmed mailing neutral while %s", mode => {
    subscriptionReady = false; plan = "free";
    if (mode === "error") subscriptionError = "unconfirmed";
    granted = new Set(["sales.read", "chats.read"]); visibleTabs = new Set(["mailing", "chats"]);
    renderHome();
    expect(screen.getByText(/Условия доступа к email-рассылкам не подтверждены/)).toBeInTheDocument();
    expect(screen.queryByText("Рассылки — от Старт")).not.toBeInTheDocument();
  });
  it("uses a neutral missing-organization heading after resolution completes", () => {
    organizationId = null; subscriptionReady = false;
    renderHome();
    expect(screen.getByRole("heading", { name: "Кабинет организации" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Тестовая организация" })).not.toBeInTheDocument();
  });
  it("moves from initial context to confirmed postpaid communications without an upgrade badge", () => {
    organizationId = null; organizationLoading = true; subscriptionReady = false; plan = "free";
    granted = new Set(["sales.read", "chats.read"]); visibleTabs = new Set(["mailing", "chats"]);
    const view = renderHome();
    organizationId = "org-1"; subscriptionLoading = true;
    view.rerender(<MemoryRouter><LocationProbe /><OrganizationHomeTab /></MemoryRouter>);
    expect(screen.queryByText("Рассылки — от Старт")).not.toBeInTheDocument();
    subscriptionLoading = false; subscriptionReady = true; isPostpaid = true;
    view.rerender(<MemoryRouter><LocationProbe /><OrganizationHomeTab /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Открыть коммуникации" })).toBeInTheDocument();
    expect(screen.queryByText("Рассылки — от Старт")).not.toBeInTheDocument();
  });
  it("retains the Start explanation for a genuinely confirmed free plan", () => {
    plan = "free";
    granted = new Set(["sales.read", "chats.read"]); visibleTabs = new Set(["mailing", "chats"]);
    renderHome();
    expect(screen.getByText("Рассылки — от Старт")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть чаты" }));
    expect(setActiveTab).toHaveBeenCalledWith("chats");
  });
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
