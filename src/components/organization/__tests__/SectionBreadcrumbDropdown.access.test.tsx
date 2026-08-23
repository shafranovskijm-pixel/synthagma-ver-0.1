import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let allowedTabs = new Set<string>();
let menuSettings: Record<string, boolean> = {};
let salesCrmEnabled = false;
const setActiveTab = vi.fn();

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    tabNavigation: { setActiveTab },
    dashboardSettings: { menuSettings },
    subscriptionLimits: { limits: { salesCrmEnabled } },
    isEnabled: () => true,
  }),
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: false,
    canSeeOrgTab: (tab: string) => allowedTabs.has(tab),
  }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

import { SectionBreadcrumbDropdown } from "@/components/organization/SectionBreadcrumbDropdown";

beforeEach(() => {
  setActiveTab.mockClear();
  allowedTabs = new Set(["students", "organizations", "sales", "chats", "documents", "frdo"]);
  menuSettings = {
    showStudents: true,
    showCompanies: true,
    showSales: true,
    showDocuments: true,
    showFrdo: true,
  };
  salesCrmEnabled = false;
});

describe("SectionBreadcrumbDropdown access", () => {
  it("does not expose tariff- or permission-blocked destinations", () => {
    allowedTabs.delete("organizations");
    render(<SectionBreadcrumbDropdown section="clients" label="Клиенты" activeTab="students" />);

    expect(screen.getByRole("button", { name: "Ученики" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Клиенты-компании" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Продажи" })).not.toBeInTheDocument();
  });

  it("honours document menu settings and keeps an allowed destination working", () => {
    menuSettings.showDocuments = false;
    render(<SectionBreadcrumbDropdown section="tools" label="Инструменты" activeTab="frdo" />);

    expect(screen.queryByRole("button", { name: "Документы учеников" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ФИС ФРДО" }));
    expect(setActiveTab).toHaveBeenCalledWith("frdo");
  });
});
