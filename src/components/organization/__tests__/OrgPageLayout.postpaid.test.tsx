import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  organizationId: "org-a",
  isPostpaid: false,
  readBillingDate: vi.fn(),
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: state.organizationId,
    organizationName: "Учебный центр",
    branding: { brandingSettings: {} },
    subscriptionLimits: { plan: "maximum", isPostpaid: state.isPostpaid },
    user: { email: "qa@example.test" },
    handleLogout: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let organizationId: string;
      const query = {
        select: () => query,
        eq: (_key: string, value: string) => { organizationId = value; return query; },
        single: () => state.readBillingDate(organizationId),
      };
      return query;
    },
  },
}));
vi.mock("@/components/organization/OrgDashboardFooter", () => ({ OrgDashboardFooter: () => null }));
vi.mock("@/components/organization/OrgSidebar", () => ({ OrgSidebar: () => null }));
vi.mock("@/components/organization/OrgNotifications", () => ({ OrgNotifications: () => null }));
vi.mock("@/components/ui/SigmaLogo", () => ({ SigmaLogo: () => null }));
vi.mock("@/constants/admin-themes", () => ({ getStoredThemeId: () => null, getThemeById: () => null }));
vi.mock("@/components/ui/ThemeAnimations", () => ({ ThemeAnimations: () => null, getStoredAnimationLevel: () => "none" }));
vi.mock("@/components/ui/AtmosphericBleed", () => ({ AtmosphericBleed: () => null }));
vi.mock("@/components/shared/HelpCenterDialog", () => ({ HelpCenterDialog: () => null, useHelpCenterDialog: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/hooks/useOrgTheme", () => ({ useOrgTheme: () => undefined }));

import OrgPageLayout from "@/components/organization/OrgPageLayout";
import { TooltipProvider } from "@/components/ui/tooltip";

type BillingResponse = { data: { paid_until: string | null } | null };
function pendingBillingDate() {
  let resolve!: (value: BillingResponse) => void;
  const promise = new Promise<BillingResponse>(done => { resolve = done; });
  return { promise, resolve };
}
const expired = { data: { paid_until: "2020-01-01T00:00:00Z" } };
const noDate = { data: { paid_until: null } };

function layout() {
  return <MemoryRouter><TooltipProvider><OrgPageLayout title="Документы" icon={BookOpen}><p>Документы организации</p></OrgPageLayout></TooltipProvider></MemoryRouter>;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.organizationId = "org-a";
  state.isPostpaid = false;
  state.readBillingDate.mockResolvedValue(expired);
});
afterEach(cleanup);

describe("organization page billing badge", () => {
  it("shows confirmed postpayment without a prepaid expiry or an unnecessary date request", () => {
    state.isPostpaid = true;
    render(layout());
    expect(screen.getByRole("button", { name: "Постоплата" })).toBeInTheDocument();
    expect(screen.queryByText(/0 дн\./)).not.toBeInTheDocument();
    expect(screen.queryByText("Максимальный")).not.toBeInTheDocument();
    expect(state.readBillingDate).not.toHaveBeenCalled();
    expect(screen.getByText("Документы организации")).toBeInTheDocument();
  });

  it("keeps the existing expiry display for prepaid organizations", async () => {
    render(layout());
    await waitFor(() => expect(screen.getByRole("button", { name: /Максимальный — 0 дн\./ })).toBeInTheDocument());
    expect(state.readBillingDate).toHaveBeenCalledWith("org-a");
  });

  it("ignores an old prepaid response after postpayment is confirmed", async () => {
    const oldDate = pendingBillingDate();
    state.readBillingDate.mockReturnValueOnce(oldDate.promise);
    const view = render(layout());
    state.isPostpaid = true;
    view.rerender(layout());
    await act(async () => { oldDate.resolve(expired); });
    expect(screen.getByRole("button", { name: "Постоплата" })).toBeInTheDocument();
    expect(screen.queryByText(/0 дн\./)).not.toBeInTheDocument();
  });

  it("does not carry a known expiry into an organization without a prepaid date", async () => {
    const newDate = pendingBillingDate();
    state.readBillingDate.mockImplementation((id: string) => id === "org-a" ? Promise.resolve(expired) : newDate.promise);
    const view = render(layout());
    await waitFor(() => expect(screen.getByText(/0 дн\./)).toBeInTheDocument());
    state.organizationId = "org-b";
    view.rerender(layout());
    expect(screen.queryByText(/0 дн\./)).not.toBeInTheDocument();
    await act(async () => { newDate.resolve(noDate); });
    expect(screen.getByRole("button", { name: "Максимальный" })).toBeInTheDocument();
  });

  it("ignores a late expiry from the previous organization", async () => {
    const oldDate = pendingBillingDate();
    state.readBillingDate.mockImplementation((id: string) => id === "org-a" ? oldDate.promise : Promise.resolve(noDate));
    const view = render(layout());
    state.organizationId = "org-b";
    view.rerender(layout());
    await act(async () => { oldDate.resolve(expired); });
    expect(screen.queryByText(/0 дн\./)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Максимальный" })).toBeInTheDocument();
  });
});
