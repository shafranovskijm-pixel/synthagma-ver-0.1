import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommercialSetCards } from "@/components/platform-contract/CommercialSetCards";
import { generatePlatformContractHtml } from "@/lib/platform-contract";
import type { PlatformCommercialSet } from "@/lib/platform-commerce";

const invoiceSpy = vi.fn(async () => "<html><body>счёт</body></html>");
const printSpy = vi.fn();

vi.mock("@/constants/invoiceTemplate", () => ({
  generateInvoiceHtml: (...args: any[]) => invoiceSpy(...(args as [])),
}));
vi.mock("@/utils/printHtmlToPdf", () => ({
  printHtmlContent: (...args: any[]) => printSpy(...(args as [])),
}));

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
    periodMonths: 1,
    date: "2026-08-08",
    requisites: { name: 'ООО "ИЦ "ГОРЭЛТЕХ"', inn: "7812345678", kpp: "781201001", legal_address: "СПб" },
  },
  variables_snapshot: {},
  body_html: null,
  template_version: 2,
} as any;

const invoice = {
  id: "inv-1",
  organization_id: ORG_ID,
  invoice_number: "СЧ-2026/0808-STD1-ESP8VN",
  invoice_date: "2026-08-08",
  plan: "standard",
  amount: 6990,
  period_months: 1,
  status: "pending",
  paid_at: null,
} as any;

const renderSet = (set: PlatformCommercialSet) =>
  render(
    <MemoryRouter>
      <CommercialSetCards set={set} />
    </MemoryRouter>,
  );

describe("дата проекта договора", () => {
  it("не содержит двойной точки после «г.»", () => {
    const html = generatePlatformContractHtml({
      plan: "standard",
      periodMonths: 1,
      customer: { name: "ООО Тест", inn: "7712345678" },
      date: "2026-08-08",
      projectId: "c1",
    } as any);
    expect(html).toContain("08 августа 2026 г.");
    expect(html).not.toContain("г..");
  });
});

describe("действия по счёту в CommercialSetCards", () => {
  beforeEach(() => {
    invoiceSpy.mockClear();
    printSpy.mockClear();
  });

  it("нет действий, когда счёта нет (кнопки disabled)", () => {
    renderSet({ contract, invoice: null, paidInvoice: null, act: null });
    expect(screen.getByTitle("Счёт ещё не сформирован")).toBeTruthy();
    expect(document.querySelector('a[href="/invoice/inv-1"]')).toBeNull();
  });

  it("ведёт на существующий маршрут /invoice/:id тем же id", () => {
    renderSet({ contract, invoice, paidInvoice: null, act: null });
    const link = document.querySelector('a[href="/invoice/inv-1"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("Открыть счёт");
  });

  it("PDF использует snapshot тарифа/срока/суммы и не создаёт дубликат", async () => {
    renderSet({ contract, invoice, paidInvoice: null, act: null });
    const btn = screen.getByText("Скачать счёт PDF").closest("button")!;
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(invoiceSpy).toHaveBeenCalledTimes(1);
    const data = invoiceSpy.mock.calls[0][0] as any;
    expect(data.amount).toBe(6990);
    expect(data.periodMonths).toBe(1);
    expect(data.planName).toBe("Стандарт");
    expect(data.invoiceNumber).toBe("СЧ-2026/0808-STD1-ESP8VN");
    expect(data.buyerInn).toBe("7812345678");
  });
});
