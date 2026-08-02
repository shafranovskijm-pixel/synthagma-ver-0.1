import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const openCompanyDetail = vi.fn();
const setShowCreateDialog = vi.fn();

const company = { id: "c1", name: "ООО Ромашка", inn: "7701234567", studentsCount: 3 };

vi.mock("@/hooks/useCompaniesManager", () => ({
  useCompaniesManager: () => ({
    companies: [company],
    filteredCompanies: [company],
    searchQuery: "",
    setSearchQuery: vi.fn(),
    loading: false,
    showCreateDialog: false,
    setShowCreateDialog,
    globalDocStats: { contracts: 0, paidAmount: 0, unpaidAmount: 0 },
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useCompanyDetailManager", () => ({
  useCompanyDetailManager: () => ({ openCompanyDetail }),
}));
vi.mock("@/hooks/useCompanyStudentsManager", () => ({
  useCompanyStudentsManager: () => ({}),
}));
vi.mock("@/hooks/useCompanyLinksAndGenerators", () => ({
  useCompanyLinksAndGenerators: () => ({ viewMode: "grid", setViewMode: vi.fn() }),
}));

vi.mock("../dialogs", () => ({
  CompanyDetailDialog: () => null,
  CreateCompanyDialog: () => null,
  EditCompanyFormDialog: () => null,
  DeleteCompanyDialog: () => null,
  ViewStudentsDialog: () => null,
  BulkAssignStudentsDialog: () => null,
  CompanyLinksDialog: () => null,
  BulkEnrollDialog: () => null,
}));
vi.mock("../ContractGenerator", () => ({ ContractGenerator: () => null }));
vi.mock("../InvoiceGenerator", () => ({ InvoiceGenerator: () => null }));
vi.mock("../ActGenerator", () => ({ ActGenerator: () => null }));
vi.mock("../ReconciliationActDialog", () => ({ ReconciliationActDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CompaniesManager } from "../CompaniesManager";

const renderManager = () =>
  render(
    <MemoryRouter>
      <CompaniesManager organizationId="org1" />
    </MemoryRouter>
  );

describe("CompaniesManager company card", () => {
  beforeEach(() => {
    openCompanyDetail.mockClear();
    setShowCreateDialog.mockClear();
  });

  it("не рендерит дублирующую кнопку «Добавить компанию» (она живёт в шапке дашборда)", () => {
    renderManager();
    expect(screen.queryByRole("button", { name: /Добавить компанию/i })).toBeNull();
  });

  it("открывает детали компании по клику на карточку", () => {
    renderManager();
    fireEvent.click(screen.getByTestId("company-card-c1"));
    expect(openCompanyDetail).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });

  it("открывает детали компании по Enter (карточка доступна с клавиатуры)", () => {
    renderManager();
    const card = screen.getByTestId("company-card-c1");
    expect(card.tagName).not.toBe("BUTTON");
    expect(card).toHaveAttribute("role", "button");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(openCompanyDetail).toHaveBeenCalledTimes(1);
  });

  it("открывает диалог создания по глобальному событию org-add-company", () => {
    renderManager();
    window.dispatchEvent(new Event("org-add-company"));
    expect(setShowCreateDialog).toHaveBeenCalledWith(true);
  });
});
