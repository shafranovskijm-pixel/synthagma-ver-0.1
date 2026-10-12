import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPERATOR_REQUISITES } from "@/constants/operatorDetails";

const { loadRequisites } = vi.hoisted(() => ({ loadRequisites: vi.fn() }));
vi.mock("@/hooks/useOperatorRequisites", () => ({ loadOperatorRequisites: loadRequisites }));
import { generateInvoiceHtml, generateInvoiceHtmlSync, type InvoiceData } from "@/constants/invoiceTemplate";

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
