import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompaniesManager } from "../CompaniesManager";

const state = vi.hoisted(() => ({ permissionsLoading: false, canRead: true, openCalls: vi.fn() }));
const company = { id: "company-a", name: "Заказчик", created_at: "2026-10-12" };
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({
  can: () => state.canRead, loading: state.permissionsLoading,
}) }));
vi.mock("@/hooks/useCompaniesManager", () => ({ useCompaniesManager: () => ({
  companies: [company], filteredCompanies: [company], searchQuery: "", setSearchQuery: vi.fn(), loading: false,
  setShowCreateDialog: vi.fn(), globalDocStats: { contracts: 0, paidAmount: 0, unpaidAmount: 0 },
}) }));
vi.mock("@/hooks/useCompanyDetailManager", async () => {
  const { useCallback, useState } = await import("react");
  return { useCompanyDetailManager: () => {
    const [showCompanyDetail, setShowCompanyDetail] = useState(false);
    const [selectedCompanyForDetail, setSelected] = useState<unknown>(null);
    const openCompanyDetail = useCallback((value: unknown) => { state.openCalls(value); setSelected(value); setShowCompanyDetail(true); }, []);
    return { showCompanyDetail, setShowCompanyDetail, selectedCompanyForDetail, openCompanyDetail, companyDocuments: [] };
  } };
});
vi.mock("@/hooks/useCompanyStudentsManager", () => ({ useCompanyStudentsManager: () => ({}) }));
vi.mock("@/hooks/useCompanyLinksAndGenerators", () => ({ useCompanyLinksAndGenerators: () => ({ viewMode: "grid" }) }));
vi.mock("../dialogs", () => ({
  CompanyDetailDialog: ({ open, company: selected, organizationId, onOpenChange }: any) => open ? <div data-testid="open-company-card">{organizationId}/{selected.id}<button onClick={() => onOpenChange(false)}>Закрыть карточку</button></div> : null,
  CreateCompanyDialog: () => null, EditCompanyFormDialog: () => null, DeleteCompanyDialog: () => null,
  ViewStudentsDialog: () => null, BulkAssignStudentsDialog: () => null, CompanyLinksDialog: () => null, BulkEnrollDialog: () => null,
}));
vi.mock("../ContractGenerator", () => ({ ContractGenerator: () => null }));
vi.mock("../InvoiceGenerator", () => ({ InvoiceGenerator: () => null }));
vi.mock("../ActGenerator", () => ({ ActGenerator: () => null }));
vi.mock("../ReconciliationActDialog", () => ({ ReconciliationActDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
function Navigation() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output data-testid="company-route">{location.search}</output><button onClick={() => navigate(-1)}>Browser Back</button></>;
}
const ui = (url: string) => <MemoryRouter initialEntries={[url]}><Navigation /><CompaniesManager organizationId="org-a" /></MemoryRouter>;
beforeEach(() => { state.permissionsLoading = false; state.canRead = true; state.openCalls.mockClear(); });
afterEach(cleanup);

describe("linked company URL boundary", () => {
  it("opens a confirmed company from CRM URL, clears its section on close and restores both with Back", async () => {
    render(ui("/organization?tab=organizations&companyId=company-a&companySection=crm"));
    expect(await screen.findByTestId("open-company-card")).toHaveTextContent("org-a/company-a");
    fireEvent.click(screen.getByRole("button", { name: "Закрыть карточку" }));
    expect(screen.queryByTestId("open-company-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("company-route")).not.toHaveTextContent("companyId");
    expect(screen.getByTestId("company-route")).not.toHaveTextContent("companySection");
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    expect(await screen.findByTestId("open-company-card")).toHaveTextContent("org-a/company-a");
    expect(screen.getByTestId("company-route")).toHaveTextContent("companySection=crm");
  });
  it("does not open an arbitrary company ID absent from the organization's list", () => {
    render(ui("/organization?tab=organizations&companyId=foreign-company"));
    expect(state.openCalls).not.toHaveBeenCalled(); expect(screen.queryByTestId("open-company-card")).not.toBeInTheDocument();
  });
  it.each(["loading", "denied"])("does not open the card while companies.read is %s", mode => {
    state.permissionsLoading = mode === "loading"; state.canRead = mode !== "denied";
    render(ui("/organization?tab=organizations&companyId=company-a&companySection=crm"));
    expect(state.openCalls).not.toHaveBeenCalled(); expect(screen.queryByTestId("open-company-card")).not.toBeInTheDocument();
  });
  it("closes an already open card immediately when companies.read is lost", async () => {
    const url = "/organization?tab=organizations&companyId=company-a";
    const view = render(ui(url));
    await screen.findByTestId("open-company-card");
    state.canRead = false; view.rerender(ui(url));
    await waitFor(() => expect(screen.queryByTestId("open-company-card")).not.toBeInTheDocument());
  });
});
