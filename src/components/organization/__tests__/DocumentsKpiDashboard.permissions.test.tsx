import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsKpiDashboard } from "../DocumentsKpiDashboard";
import type { DocumentsKpi } from "@/hooks/useDocumentsKpi";

const mocks = vi.hoisted(() => ({ useKpi: vi.fn(), success: vi.fn(), createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }));
vi.mock("@/hooks/useDocumentsKpi", () => ({ useDocumentsKpi: mocks.useKpi }));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));
vi.mock("recharts", async importOriginal => ({
  ...await importOriginal<typeof import("recharts")>(),
  ResponsiveContainer: () => null,
}));

function kpi(proposals: Pick<DocumentsKpi, "proposals_total" | "proposals_accepted" | "proposal_to_contract_conversion">): DocumentsKpi {
  return {
    signatures_total: 0, signatures_signed: 0, signatures_pending: 0, signatures_expired: 0,
    signatures_rejected: 0, signing_conversion: 0, education_docs_total: 0, education_docs_this_month: 0,
    duplicates_count: 0, cancelled_count: 0, expiring_soon: 0, expired_count: 0,
    contracts_total: 0, contracts_signed: 0, contracts_pending: 0,
    pd_requests_open: 0, pd_requests_overdue: 0, incoming_total: 0, incoming_this_month: 0,
    monthly_signatures: [], monthly_education_docs: [], ...proposals,
  };
}

function renderProposals(total: number | null, accepted: number | null, conversion: number | null) {
  mocks.useKpi.mockReturnValue({
    kpi: kpi({ proposals_total: total, proposals_accepted: accepted, proposal_to_contract_conversion: conversion }),
    loading: false, refresh: vi.fn(),
  });
  const onNavigate = vi.fn();
  render(<DocumentsKpiDashboard organizationId="staff-school" onNavigate={onNavigate} />);
  return { onNavigate };
}

function proposalCard() {
  return screen.getByText("Коммерческие предложения").parentElement!.parentElement!;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: mocks.createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: mocks.revokeObjectURL });
  mocks.createObjectURL.mockReturnValue("blob:test-kpi");
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("sales-restricted document KPI", () => {
  it("shows no access without navigation or conversion badge when sales metrics are null", () => {
    const { onNavigate } = renderProposals(null, null, null);
    const card = proposalCard();
    expect(within(card).getByText("Нет доступа")).toBeInTheDocument();
    expect(card).not.toHaveAttribute("role", "button");
    expect(card).not.toHaveAttribute("tabindex");
    expect(within(card).queryByText(/%/)).not.toBeInTheDocument();
    expect(within(card).queryByText("0")).not.toBeInTheDocument();
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("keeps a real zero visible and navigable for an authorized employee", () => {
    const { onNavigate } = renderProposals(0, 0, 0);
    const card = proposalCard();
    expect(within(card).getByText("0")).toBeInTheDocument();
    expect(within(card).queryByText("Нет доступа")).not.toBeInTheDocument();
    expect(card).toHaveAttribute("role", "button");
    fireEvent.click(card);
    expect(onNavigate).toHaveBeenCalledWith("counterparties");
  });

  it("preserves the actual total and conversion badge", () => {
    const { onNavigate } = renderProposals(8, 2, 25);
    const card = proposalCard();
    expect(within(card).getByText("8")).toBeInTheDocument();
    expect(within(card).getByText("25%")).toBeInTheDocument();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onNavigate).toHaveBeenCalledWith("counterparties");
  });

  it.each([
    { total: null, accepted: null, conversion: null, expected: ["Нет доступа", "Нет доступа", "Нет доступа"] },
    { total: 0, accepted: 0, conversion: 0, expected: ["0", "0", "0"] },
    { total: 8, accepted: 2, conversion: 25, expected: ["8", "2", "25"] },
  ])("exports the distinction between unavailable, zero and actual figures ($expected)", async ({ total, accepted, conversion, expected }) => {
    renderProposals(total, accepted, conversion);
    fireEvent.click(screen.getByRole("button", { name: "Экспорт CSV" }));
    const blob = mocks.createObjectURL.mock.calls[0][0] as Blob;
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(csv).toContain(`"КП — всего";"${expected[0]}"`);
    expect(csv).toContain(`"КП — принято";"${expected[1]}"`);
    expect(csv).toContain(`"Конверсия КП → договор, %";"${expected[2]}"`);
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:test-kpi");
  });
});
