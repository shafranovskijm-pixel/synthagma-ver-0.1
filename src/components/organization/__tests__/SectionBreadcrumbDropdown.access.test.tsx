import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let allowedTabs = new Set<string>();
let menuSettings: Record<string, boolean> = {};
let salesCrmEnabled = false;
let permissionsLoading = false;
const setActiveTab = vi.fn();

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    tabNavigation: { setActiveTab },
    dashboardSettings: { menuSettings },
    subscriptionLimits: { limits: { salesCrmEnabled } },
    crmAccess: { enabled: salesCrmEnabled, loading: false, error: null },
    isEnabled: () => true,
  }),
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: permissionsLoading,
    can: (permission: string) => permission === "sales.read" && allowedTabs.has("sales"),
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
  allowedTabs = new Set(["students", "organizations", "sales", "mailing", "chats", "documents", "frdo"]);
  menuSettings = {
    showStudents: true,
    showCompanies: true,
    showSales: true,
    showDocuments: true,
    showFrdo: true,
  };
  salesCrmEnabled = true;
  permissionsLoading = false;
});

describe("SectionBreadcrumbDropdown access", () => {
  it("exposes CRM beta with its existing permission and never shows the legacy Sales label", () => {
    allowedTabs.delete("organizations");
    render(<SectionBreadcrumbDropdown section="clients" label="Клиенты" activeTab="students" />);

    expect(screen.getByRole("button", { name: "Ученики" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Клиенты-компании" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Продажи" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CRM · Бета" }));
    expect(setActiveTab).toHaveBeenCalledWith("sales");
  });

  it.each(["loading", "permission", "plan"])("hides CRM destination when %s blocks it", mode => {
    if (mode === "loading") permissionsLoading = true;
    if (mode === "permission") allowedTabs.delete("sales");
    if (mode === "plan") salesCrmEnabled = false;
    render(<SectionBreadcrumbDropdown section="clients" label="Клиенты" activeTab="students" />);
    expect(screen.queryByRole("button", { name: "CRM · Бета" })).not.toBeInTheDocument();
  });

  it("honours document menu settings and keeps an allowed destination working", () => {
    menuSettings.showDocuments = false;
    render(<SectionBreadcrumbDropdown section="tools" label="Инструменты" activeTab="frdo" />);

    expect(screen.queryByRole("button", { name: "Документы учеников" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ФИС ФРДО" }));
    expect(setActiveTab).toHaveBeenCalledWith("frdo");
  });

  it("shows mailing only when the staff permission mapping allows it", () => {
    const allowedView = render(
      <SectionBreadcrumbDropdown section="clients" label="Клиенты" activeTab="mailing" />,
    );
    expect(screen.getByRole("button", { name: "Рассылки" })).toBeInTheDocument();

    allowedView.unmount();
    allowedTabs.delete("mailing");
    render(<SectionBreadcrumbDropdown section="clients" label="Клиенты" activeTab="students" />);
    expect(screen.queryByRole("button", { name: "Рассылки" })).not.toBeInTheDocument();
  });
});
