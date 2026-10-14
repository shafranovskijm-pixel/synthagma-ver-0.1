import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyDetailDialog } from "../dialogs/CompanyDetailDialog";

const state = vi.hoisted(() => ({ loading: false, canReadCrm: true, panel: vi.fn() }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({
  can: (permission: string) => permission !== "sales.read" || state.canReadCrm, loading: state.loading,
}) }));
vi.mock("../sales/OrgCrmCardSection", () => ({ OrgCrmCardSection: (props: unknown) => {
  state.panel(props); return <div data-testid="company-crm-context" />;
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn() }));
vi.mock("../DocumentDropZone", () => ({ DocumentDropZone: () => null }));

const company = { id: "company-a", name: "Учебный заказчик", inn: null, kpp: null, ogrn: null, address: null, director: null, email: null, created_at: "2026-10-12" };
const props = { organizationId: "org-a", open: true, onOpenChange: vi.fn(), company, documents: [],
  isLoadingDocuments: false, isUploadingDocument: null, isDeletingDocument: null,
  onEdit: vi.fn(), onDelete: vi.fn(), onViewStudents: vi.fn(), onBulkAssign: vi.fn(), onOpenLinks: vi.fn(), onBulkEnroll: vi.fn(),
  onOpenContractGenerator: vi.fn(), onOpenInvoiceGenerator: vi.fn(), onOpenActGenerator: vi.fn(),
  onUploadDocument: vi.fn(), onViewDocument: vi.fn(), onDownloadDocument: vi.fn(), onDeleteDocument: vi.fn(), onTogglePaid: vi.fn(),
};
function Navigation() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output data-testid="company-location">{location.search}</output><button data-testid="browser-back" onClick={() => navigate(-1)}>Browser Back</button></>;
}
const mount = (url = "/organization?tab=organizations&companyId=company-a") => render(
  <MemoryRouter initialEntries={[url]}><Navigation /><CompanyDetailDialog {...props} /></MemoryRouter>,
);
const selectTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
beforeEach(() => { state.loading = false; state.canReadCrm = true; state.panel.mockClear(); });
afterEach(cleanup);

describe("company CRM section navigation", () => {
  it("uses the company ID and selected organization in a reloadable CRM deep link", () => {
    mount("/organization?tab=organizations&companyId=company-a&companySection=crm");
    expect(screen.getByRole("tab", { name: "CRM · Бета" })).toHaveAttribute("data-state", "active");
    expect(state.panel).toHaveBeenLastCalledWith({ organizationId: "org-a", entityType: "company", entityId: "company-a", entityName: "Учебный заказчик" });
  });
  it("pushes section changes and restores CRM with Back while retaining company context", () => {
    mount();
    selectTab("CRM · Бета");
    expect(screen.getByTestId("company-location")).toHaveTextContent("companySection=crm");
    selectTab("Действия");
    expect(screen.getByRole("tab", { name: "Действия" })).toHaveAttribute("data-state", "active");
    fireEvent.click(screen.getByTestId("browser-back"));
    expect(screen.getByRole("tab", { name: "CRM · Бета" })).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("company-location")).toHaveTextContent("companyId=company-a");
    fireEvent.click(screen.getByTestId("browser-back"));
    expect(screen.getByRole("tab", { name: "Документы" })).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("company-location")).not.toHaveTextContent("companySection");
  });
  it.each(["loading", "missing"])("does not offer the CRM tab when permission is %s; old tabs remain", mode => {
    state.loading = mode === "loading"; state.canReadCrm = mode !== "missing";
    mount();
    expect(screen.queryByRole("tab", { name: "CRM · Бета" })).not.toBeInTheDocument();
    for (const name of ["Документы", "Заявки", "Доступ", "Действия"]) expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    expect(state.panel).not.toHaveBeenCalled();
  });
});
