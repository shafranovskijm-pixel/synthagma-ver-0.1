import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let activeTab = "journals";
let permissionLoading = false;
let granted = new Set<string>();

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "org-1",
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
  permissionLoading = false;
  granted = new Set();
});

describe("TabContentRenderer document workspace permissions", () => {
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
});
