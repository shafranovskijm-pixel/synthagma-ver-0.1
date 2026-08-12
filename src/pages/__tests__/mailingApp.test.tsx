import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import MailingApp from "@/pages/MailingApp";

// Regression: MailingApp must read the organization from the same verified
// OrgDashboardProvider flow used by /organization, not from its own query.
const orgState = { organizationId: "org-1" as string | null, isLoadingCourses: false };
vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => orgState,
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

const renderAt = (search: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/mailing/app${search}`]}>
        <MailingApp />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("MailingApp shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.organizationId = "org-1";
    orgState.isLoadingCourses = false;
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
    expect(await screen.findByText(/Организация не найдена/)).toBeInTheDocument();
    expect(screen.queryByText("overview-tab")).not.toBeInTheDocument();
  });

  it("shows a loading state while the organization is still resolving", () => {
    orgState.organizationId = null;
    orgState.isLoadingCourses = true;
    renderAt("");
    expect(screen.getByText(/Загрузка кабинета/)).toBeInTheDocument();
    expect(screen.queryByText(/Организация не найдена/)).not.toBeInTheDocument();
  });
});
