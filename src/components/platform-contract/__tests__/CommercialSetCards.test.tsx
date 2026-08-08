import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommercialSetCards } from "@/components/platform-contract/CommercialSetCards";
import { ACT_LOCKED_REASON, type PlatformCommercialSet } from "@/lib/platform-commerce";

const ORG_ID = "11111111-2222-4333-8444-555555555555";

const contract = {
  id: "c1",
  organization_id: ORG_ID,
  name: "Проект договора на платформу СИНТАГМА",
  contract_number: null,
  contract_date: "2026-08-08",
  status: "draft",
  counterparty_type: "legal",
  variables: {
    document_family: "platform_subscription",
    plan: "standard",
    periodMonths: 12,
    date: "2026-08-08",
    requisites: { name: 'ООО "А&Б" <b>', inn: "7712345678" },
  },
  variables_snapshot: {},
  body_html: null,
  template_version: 2,
};

const invoice = {
  id: "i1",
  organization_id: ORG_ID,
  invoice_number: "СЧ-2026/0808-STD12-ABCDEF",
  invoice_date: "2026-08-08",
  plan: "standard",
  amount: 100000,
  period_months: 12,
  status: "pending",
  paid_at: null,
};

describe("CommercialSetCards", () => {
  it("показывает проект без номера и блокировку акта до оплаты", () => {
    const set: PlatformCommercialSet = { contract: contract as any, invoice: invoice as any, paidInvoice: null, act: null };
    render(<MemoryRouter><CommercialSetCards set={set} /></MemoryRouter>);
    expect(screen.getByText(/СЧ-2026\/0808-STD12-ABCDEF/)).toBeTruthy();
    expect(screen.getByText(ACT_LOCKED_REASON)).toBeTruthy();
    expect(document.body.textContent).not.toContain("basic");
  });

  it("открывает акт после подтверждённой оплаты", () => {
    const paid = { ...invoice, status: "paid", paid_at: "2026-08-09T10:00:00Z" };
    const set: PlatformCommercialSet = { contract: contract as any, invoice: paid as any, paidInvoice: paid as any, act: null };
    render(<MemoryRouter><CommercialSetCards set={set} onOpenAct={() => {}} /></MemoryRouter>);
    expect(screen.queryByText(ACT_LOCKED_REASON)).toBeNull();
  });

  it("показывает подсказку при пустом комплекте", () => {
    render(
      <MemoryRouter><CommercialSetCards
        set={{ contract: null, invoice: null, paidInvoice: null, act: null }}
        emptyHint="Комплект ещё не сформирован"
      /></MemoryRouter>,
    );
    expect(screen.getByText("Комплект ещё не сформирован")).toBeTruthy();
  });
});
