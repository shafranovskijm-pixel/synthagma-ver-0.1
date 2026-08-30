import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import MailingApp from "@/pages/MailingApp";

// Regression: MailingApp must read the organization from the same verified
// OrgDashboardProvider flow used by /organization, not from its own query.
const orgState = { organizationId: "org-1" as string | null, isLoadingCourses: false };
const subscriptionState = {
  plan: "start",
  limits: { emailCampaignsEnabled: true },
  loading: false,
};
const permissionState = {
  loading: false,
  canRead: true,
  canWrite: true,
};
vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({ ...orgState, subscriptionLimits: subscriptionState }),
}));
vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: permissionState.loading,
    can: (permission: string) => permission === "sales.read" ? permissionState.canRead : permissionState.canWrite,
  }),
}));

vi.mock("@/components/admin/broadcast/CampaignsManager", () => ({
  CampaignsManager: () => <div>campaigns-manager</div>,
}));
vi.mock("@/components/shared/sales/EmailTemplatesManager", () => ({
  EmailTemplatesManager: () => <div>templates-manager</div>,
}));
vi.mock("@/components/organization/sales/OrgSmtpSettings", () => ({
  OrgSmtpSettings: () => <div>smtp-settings</div>,
}));
vi.mock("@/components/mailing/MailingOverviewTab", () => ({
  MailingOverviewTab: () => <div>overview-tab</div>,
}));
vi.mock("@/components/mailing/MailingContactsTab", () => ({
  MailingContactsTab: () => <div>contacts-tab</div>,
}));
vi.mock("@/components/mailing/MailingReportsTab", () => ({
  MailingReportsTab: () => <div>reports-tab</div>,
}));
vi.mock("@/components/mailing/MailingDeliverabilityTab", () => ({
  MailingDeliverabilityTab: () => <div>deliverability-tab</div>,
}));
vi.mock("@/components/mailing/MailingRepliesTab", () => ({
  MailingRepliesTab: () => <div>replies-tab</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

const renderAt = (search: string, embedded = false) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`${embedded ? "/organization" : "/mailing/app"}${search}`]}>
        <LocationProbe />
        <MailingApp embedded={embedded} />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("MailingApp shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.organizationId = "org-1";
    orgState.isLoadingCourses = false;
    subscriptionState.plan = "start";
    subscriptionState.limits.emailCampaignsEnabled = true;
    subscriptionState.loading = false;
    permissionState.loading = false;
    permissionState.canRead = true;
    permissionState.canWrite = true;
  });

  it("renders the full left menu", async () => {
    renderAt("");
    for (const label of [
      "Обзор",
      "Рассылки",
      "База",
      "Шаблоны",
      "Отправители",
      "Отчёты",
      "Ответы",
      "Доставляемость",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(await screen.findByText("overview-tab")).toBeInTheDocument();
  });

  it("reuses the existing CampaignsManager for the campaigns tab", async () => {
    renderAt("?tab=campaigns");
    expect(await screen.findByText("campaigns-manager")).toBeInTheDocument();
  });

  it("opens the centralized campaign replies tab", async () => {
    renderAt("?tab=replies");
    expect(await screen.findByText("replies-tab")).toBeInTheDocument();
  });

  it("renders a mailing subtab inside the organization shell without the standalone header", async () => {
    renderAt("?tab=mailing&mailingTab=reports", true);

    expect(await screen.findByText("reports-tab")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "В кабинет организации" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Рассылки СИНТАГМА" })).not.toBeInTheDocument();
  });

  it("changes only mailingTab while preserving the organization workspace tab", async () => {
    renderAt("?tab=mailing&mailingTab=overview", true);

    fireEvent.click(screen.getByRole("button", { name: "Отчёты" }));
    expect(await screen.findByText("reports-tab")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/organization?tab=mailing&mailingTab=reports",
    );
  });

  it("falls back to overview for an unknown tab", async () => {
    renderAt("?tab=bogus");
    expect(await screen.findByText("overview-tab")).toBeInTheDocument();
  });

  it("renders Обзор for a valid organization membership from OrgDashboardProvider", async () => {
    orgState.organizationId = "org-1";
    renderAt("");
    expect(await screen.findByText("overview-tab")).toBeInTheDocument();
    expect(screen.queryByText(/Организация не найдена/)).not.toBeInTheDocument();
  });

  it("shows a safe empty state when there is no organization membership", async () => {
    orgState.organizationId = null;
    renderAt("");
    expect(await screen.findByTestId("mailing-organization-missing")).toBeInTheDocument();
    expect(screen.queryByText("overview-tab")).not.toBeInTheDocument();
  });

  it("shows a loading state while the organization is still resolving", () => {
    orgState.organizationId = null;
    orgState.isLoadingCourses = true;
    renderAt("");
    expect(screen.getByText(/Проверяем доступ к рассылкам/)).toBeInTheDocument();
    expect(screen.queryByText(/Организация не найдена/)).not.toBeInTheDocument();
  });

  it("locks the mailing app for the Free plan even if a custom flag is enabled", async () => {
    subscriptionState.plan = "free";
    subscriptionState.limits.emailCampaignsEnabled = true;
    renderAt("");

    expect(await screen.findByTestId("mailing-plan-locked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти к тарифам" })).toHaveAttribute(
      "href",
      "/organization?tab=subscription",
    );
    expect(screen.queryByText("overview-tab")).not.toBeInTheDocument();
  });

  it("locks a paid plan when email campaigns are disabled", async () => {
    subscriptionState.plan = "start";
    subscriptionState.limits.emailCampaignsEnabled = false;
    renderAt("");

    expect(await screen.findByTestId("mailing-plan-locked")).toBeInTheDocument();
    expect(screen.queryByText("overview-tab")).not.toBeInTheDocument();
  });

  it("requires sales.read before mounting mailing data components", async () => {
    permissionState.canRead = false;
    permissionState.canWrite = false;
    renderAt("");

    expect(await screen.findByTestId("mailing-permission-denied")).toBeInTheDocument();
    expect(screen.queryByText("overview-tab")).not.toBeInTheDocument();
  });

  it("allows sales.read in read-only mode and disables workspace actions", async () => {
    permissionState.canRead = true;
    permissionState.canWrite = false;
    renderAt("");

    expect(await screen.findByText("overview-tab")).toBeInTheDocument();
    expect(screen.getByTestId("mailing-readonly-notice")).toBeInTheDocument();
    expect(screen.getByTestId("mailing-workspace")).toBeDisabled();
  });

  it.each(["start", "standard", "professional", "maximum"])(
    "allows %s with the feature flag and sales.write to use the workspace",
    async (plan) => {
      subscriptionState.plan = plan;
      renderAt("");

      expect(await screen.findByText("overview-tab")).toBeInTheDocument();
      expect(screen.queryByTestId("mailing-readonly-notice")).not.toBeInTheDocument();
      expect(screen.getByTestId("mailing-workspace")).not.toBeDisabled();
    },
  );
});
