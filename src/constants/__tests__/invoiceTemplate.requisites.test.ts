import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPERATOR_REQUISITES } from "@/constants/operatorDetails";

const { loadRequisites } = vi.hoisted(() => ({ loadRequisites: vi.fn() }));
vi.mock("@/hooks/useOperatorRequisites", () => ({ loadOperatorRequisites: loadRequisites }));
import { generateInvoiceHtml, generateInvoiceHtmlSync, type InvoiceData, type PostpaidInvoiceCalculation } from "@/constants/invoiceTemplate";

const invoice: InvoiceData = {
  invoiceNumber: "TEST-OPERATOR-BANK", invoiceDate: "2026-10-12",
  buyerName: "Тестовый покупатель", buyerInn: "1234567890",
  planName: "Тестовый тариф", periodMonths: 1, amount: 100,
};

describe("subscription invoice bank cannot bypass the operator validator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the confirmed default account and preserves buyer data", () => {
    const html = generateInvoiceHtmlSync(invoice);
    expect(html).toContain(DEFAULT_OPERATOR_REQUISITES.bankAccount);
    expect(html).toContain(invoice.buyerInn);
    expect(html).not.toContain("40914810200040551529");
  });

  it("rejects an old account passed directly to the synchronous renderer", () => {
    expect(() => generateInvoiceHtmlSync(invoice, { ...DEFAULT_OPERATOR_REQUISITES, bankAccount: "40914810200040551529" })).toThrow("Старый расчётный счёт 409");
  });

  it("rejects an old account passed as an asynchronous override", async () => {
    await expect(generateInvoiceHtml(invoice, { ...DEFAULT_OPERATOR_REQUISITES, bankAccount: "40914810200040551529" })).rejects.toThrow("Старый расчётный счёт 409");
    expect(loadRequisites).not.toHaveBeenCalled();
  });

  it("propagates validation failure from the central loader instead of emitting an invoice", async () => {
    loadRequisites.mockRejectedValue(new Error("Старый расчётный счёт 409… отключён"));
    await expect(generateInvoiceHtml(invoice)).rejects.toThrow("Старый расчётный счёт 409");
  });
});

describe('postpaid invoice calculation', () => {
  const calculation: PostpaidInvoiceCalculation = {
    period_start:'2026-10-01',period_end:'2026-11-01',access_period_start:'2026-10-01',access_period_end:'2026-11-01',
    courses_count:16,learners_count:80,features:{crm:true},access_days:31,month_days:31,
    contract_reference:'Договор 59-09/26 <script>alert(1)</script>',terms_version:'59-09-26-v1',monthly_amount:6990,amount:6990,
  };
  it('shows the past service dates, reviewed counts and the contract calculation without an advance charge',()=>{
    const html=generateInvoiceHtmlSync({...invoice,amount:6990,planName:'Стандарт',postpaid:calculation});
    expect(html).toContain('постоплата за 01.10.2026 — 31.10.2026');
    expect(html).toContain('Использованных курсов: 16. Уникальных обучавшихся: 80.');
    expect(html).toContain('CRM и продажи');expect(html).toContain('5 рабочих дней');expect(html).toContain('НПД');
    expect(html).not.toContain('<script>alert');expect(html).toContain('&lt;script&gt;');
  });
  it('renders early termination by calendar days without altering the monthly tariff',()=>{
    const p={...calculation,access_period_end:'2026-10-11',access_days:10,amount:2254.84};
    const html=generateInvoiceHtmlSync({...invoice,amount:p.amount,postpaid:p});
    expect(html).toContain('01.10.2026 — 10.10.2026');expect(html).toContain('× 10 / 31 дней');
  });
  it('refuses a calculation that differs from the invoice or contains malformed dates',()=>{
    expect(()=>generateInvoiceHtmlSync({...invoice,amount:4490,postpaid:calculation})).toThrow('не соответствует');
    expect(()=>generateInvoiceHtmlSync({...invoice,amount:6990,postpaid:{...calculation,period_start:'2026-02-31'}})).toThrow('дата');
  });
});
