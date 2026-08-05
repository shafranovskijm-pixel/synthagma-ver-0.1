import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import MailingApp from "@/pages/MailingApp";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "org-1" }, error: null }) }),
      }),
    }),
  },
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

const renderAt = (search: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/mailing/app${search}`]}>
        <MailingApp />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("MailingApp shell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the full left menu", async () => {
    renderAt("");
    for (const label of [
      "Обзор",
      "Рассылки",
      "База",
      "Шаблоны",
      "Отправители",
      "Отчёты",
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

  it("falls back to overview for an unknown tab", async () => {
    renderAt("?tab=bogus");
    expect(await screen.findByText("overview-tab")).toBeInTheDocument();
  });
});
