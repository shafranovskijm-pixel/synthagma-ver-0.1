import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

let activeTab = "journals";
let permissionLoading = false;
const retryFeatureAccess = vi.fn();
let featureAccess: { ready: boolean; loading: boolean; error: string | null; refetch: typeof retryFeatureAccess } | undefined;
let granted = new Set<string>();
let organizationId: string | null = "org-1";
let crmAccess = { enabled: true, loading: false, error: null as string | null, mailingEnabled: true, refresh: vi.fn() };

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId,
    crmAccess,
    featureAccess,
    isEnabled: () => true,
    tabNavigation: { activeTab, setActiveTab: vi.fn() },
  }),
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: permissionLoading,
    can: (permission: string) => granted.has(permission),
  }),
}));

vi.mock("@/components/organization/JournalsManager", () => ({
  JournalsManager: () => <div data-testid="journals-manager">Journals</div>,
}));

vi.mock("@/components/organization/FRDOManager", () => ({
  FRDOManager: () => <div data-testid="frdo-manager">FRDO</div>,
}));

vi.mock("@/components/organization/tabs/ContractEditorTab", () => ({
  ContractEditorTab: () => <div data-testid="contract-editor">Contract editor</div>,
}));

vi.mock("@/components/organization/tabs/StatsCards", () => ({
  StatsCards: () => <div data-testid="stats-cards">Stats</div>,
}));

vi.mock("@/pages/MailingApp", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="mailing-app" data-embedded={String(embedded)}>Mailing</div>
  ),
}));

vi.mock("@/components/organization/sales/OrgCrmBetaWorkspace", () => ({
  OrgCrmBetaWorkspace: (props: { organizationId: string; canWrite: boolean; canOpenDocuments: boolean; canOpenMailing: boolean }) => (
    <div data-testid="crm-workspace" data-org={props.organizationId} data-write={String(props.canWrite)}
      data-documents={String(props.canOpenDocuments)} data-mailing={String(props.canOpenMailing)}>CRM beta</div>
  ),
}));

import { TabContentRenderer } from "@/components/organization/tabs/TabContentRenderer";

function renderRenderer() {
  return render(
    <MemoryRouter initialEntries={[`/organization?tab=${activeTab}`]}>
      <TabContentRenderer />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  activeTab = "journals";
  permissionLoading = false; featureAccess = undefined; retryFeatureAccess.mockClear();
  granted = new Set();
  organizationId = "org-1";
  crmAccess = { enabled: true, loading: false, error: null, mailingEnabled: true, refresh: vi.fn() };
});

describe("TabContentRenderer document workspace permissions", () => {
  it("blocks a direct CRM URL without sales.read", () => {
    activeTab = "sales";
    renderRenderer();
    expect(screen.getByTestId("crm-workspace-permission-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("crm-workspace")).not.toBeInTheDocument();
  });

  it.each(["permission loading", "plan loading", "organization unresolved"])("never mounts CRM while %s", state => {
    activeTab = "sales";
    granted.add("sales.read");
    if (state === "permission loading") permissionLoading = true;
    if (state === "plan loading") crmAccess.loading = true;
    if (state === "organization unresolved") organizationId = null;
    renderRenderer();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("crm-workspace")).not.toBeInTheDocument();
  });

  it("passes read-only staff scope and separately restricted document links", () => {
    activeTab = "sales";
    granted.add("sales.read");
    renderRenderer();
    expect(screen.getByTestId("crm-workspace")).toHaveAttribute("data-org", "org-1");
    expect(screen.getByTestId("crm-workspace")).toHaveAttribute("data-write", "false");
    expect(screen.getByTestId("crm-workspace")).toHaveAttribute("data-documents", "false");
    expect(screen.getByTestId("crm-workspace")).toHaveAttribute("data-mailing", "true");
    expect(screen.queryByTestId("stats-cards")).not.toBeInTheDocument();
  });

  it("passes write and document permissions without inventing a mailing entitlement", () => {
    activeTab = "sales";
    granted = new Set(["sales.read", "sales.write", "documents.read"]);
    crmAccess.mailingEnabled = false;
    renderRenderer();
    expect(screen.getByTestId("crm-workspace")).toHaveAttribute("data-write", "true");
    expect(screen.getByTestId("crm-workspace")).toHaveAttribute("data-documents", "true");
    expect(screen.getByTestId("crm-workspace")).toHaveAttribute("data-mailing", "false");
  });

  it("distinguishes a tariff error from an excluded plan", () => {
    activeTab = "sales";
    granted.add("sales.read");
    crmAccess.error = "Не удалось проверить доступность CRM";
    renderRenderer();
    expect(screen.getByTestId("crm-workspace-plan-error")).toHaveTextContent(crmAccess.error);
    expect(screen.queryByTestId("crm-workspace-plan-required")).not.toBeInTheDocument();
    expect(screen.queryByTestId("crm-workspace")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить проверку" }));
    expect(crmAccess.refresh).toHaveBeenCalledOnce();
  });

  it("keeps an excluded plan locked even with sales.read and sales.write", () => {
    activeTab = "sales";
    granted = new Set(["sales.read", "sales.write"]);
    crmAccess.enabled = false;
    renderRenderer();
    expect(screen.getByTestId("crm-workspace-plan-required")).toBeInTheDocument();
    expect(screen.queryByTestId("crm-workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Посмотреть тариф" })).not.toBeInTheDocument();
  });
  it("blocks a direct Journals URL without journals.read", () => {
    renderRenderer();

    expect(screen.getByTestId("document-workspace-permission-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("journals-manager")).not.toBeInTheDocument();
  });

  it("renders Journals after journals.read is granted", () => {
    granted.add("journals.read");
    renderRenderer();

    expect(screen.getByTestId("journals-manager")).toBeInTheDocument();
    expect(screen.queryByTestId("document-workspace-permission-denied")).not.toBeInTheDocument();
  });

  it("blocks a direct FRDO URL without frdo.read", () => {
    activeTab = "frdo";
    renderRenderer();

    expect(screen.getByTestId("document-workspace-permission-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("frdo-manager")).not.toBeInTheDocument();
  });

  it("blocks a direct contract editor URL without settings.write", () => {
    activeTab = "contract-editor";
    renderRenderer();

    expect(screen.getByTestId("document-workspace-permission-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("contract-editor")).not.toBeInTheDocument();
  });

  it("renders the contract editor after settings.write is granted", () => {
    activeTab = "contract-editor";
    granted.add("settings.write");
    renderRenderer();

    expect(screen.getByTestId("contract-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("document-workspace-permission-denied")).not.toBeInTheDocument();
  });

  it("embeds mailing without rendering the generic stats summary", () => {
    activeTab = "mailing";
    renderRenderer();

    expect(screen.getByTestId("mailing-app")).toHaveAttribute("data-embedded", "true");
    expect(screen.queryByTestId("stats-cards")).not.toBeInTheDocument();
  });
});

function FeatureLocationProbe() { const location = useLocation(); return <output data-testid="feature-current-location">{location.pathname + location.search}</output>; }
describe("direct feature URL retains its location during verification", () => {
  it("keeps the requested journals URL and blocks workspace data until verified, including an error with stale data", () => {
    activeTab = "journals"; granted.add("journals.read");
    featureAccess = { ready: false, loading: true, error: null, refetch: retryFeatureAccess };
    const tree = () => <MemoryRouter initialEntries={["/organization?tab=journals&groupId=selected-group"]}><FeatureLocationProbe /><TabContentRenderer /></MemoryRouter>;
    const view = render(tree());
    const expectLocation = () => expect(screen.getByTestId("feature-current-location")).toHaveTextContent("/organization?tab=journals&groupId=selected-group");
    expectLocation(); expect(screen.getByTestId("feature-workspace-checking")).toBeInTheDocument();
    expect(screen.queryByTestId("journals-manager")).not.toBeInTheDocument();
    featureAccess = { ...featureAccess, ready: true, loading: false }; view.rerender(tree());
    expectLocation(); expect(screen.getByTestId("journals-manager")).toBeInTheDocument();
    featureAccess = { ...featureAccess, ready: false, error: "Не удалось проверить доступность функций" }; view.rerender(tree());
    expectLocation(); expect(screen.getByTestId("feature-workspace-access-error")).toBeInTheDocument();
    expect(screen.queryByTestId("journals-manager")).not.toBeInTheDocument();
    expect(screen.queryByTestId("feature-workspace-unavailable")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить проверку" })); expect(retryFeatureAccess).toHaveBeenCalledOnce();
    featureAccess = { ...featureAccess, ready: true, error: null }; view.rerender(tree());
    expectLocation(); expect(screen.getByTestId("journals-manager")).toBeInTheDocument();
  });
});
