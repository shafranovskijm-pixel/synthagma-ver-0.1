import { describe, it, expect } from "vitest";
import {
  canIssueAct,
  contractNumberForStatus,
  createPlatformCommercialSet,
  customerFromOrganization,
  ensurePlatformContractProject,
  ensurePlatformInvoice,
  isInvoicePaid,
  missingRequisites,
  platformInvoiceNumber,
  buildDraftForRequest,
} from "@/lib/platform-commerce";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";

const ORG = {
  name: 'ООО "Тест"',
  inn: "7712345678",
  kpp: "771201001",
  legal_address: "г. Москва, ул. Тестовая, 1",
  director_name: "Иванов И.И.",
  director_position: "Генеральный директор",
  email: "a@b.ru",
};

function makeClient(state: { contracts: any[]; invoices: any[]; acts?: any[] }) {
  const calls = { contractInserts: 0, contractUpdates: 0, invoiceInserts: 0 };
  const client = {
    calls,
    from(table: string) {
      const rows = table === "org_contracts" ? state.contracts : table === "subscription_invoices" ? state.invoices : state.acts || [];
      const q: any = {
        _filters: {} as Record<string, any>,
        select() { return q; },
        eq(col: string, val: any) { q._filters[col] = val; return q; },
        order() { return q; },
        limit() {
          const data = rows.filter((r) => Object.entries(q._filters).every(([k, v]) => r[k] === v));
          return Promise.resolve({ data, error: null });
        },
        insert(payload: any) {
          const row = { id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), status: table === "subscription_invoices" ? "pending" : payload.status, paid_at: null, ...payload };
          rows.push(row);
          if (table === "org_contracts") calls.contractInserts++; else calls.invoiceInserts++;
          return {
            select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
          };
        },
        update(payload: any) {
          calls.contractUpdates++;
          return {
            eq: (_c: string, id: string) => ({
              select: () => ({
                single: () => {
                  const idx = rows.findIndex((r) => r.id === id);
                  rows[idx] = { ...rows[idx], ...payload };
                  return Promise.resolve({ data: rows[idx], error: null });
                },
              }),
            }),
          };
        },
      };
      return q;
    },
  };
  return client as any;
}

describe("реквизиты", () => {
  it("не подставляет выдуманные значения и перечисляет пропуски", () => {
    expect(missingRequisites(ORG)).toEqual([]);
    const missing = missingRequisites({ name: "ООО", inn: " " });
    expect(missing.map((m) => m.key)).toEqual(["inn", "legal_address", "director_name", "director_position"]);
  });

  it("маппит организацию в заказчика", () => {
    const c = customerFromOrganization(ORG);
    expect(c.name).toBe('ООО "Тест"');
    expect(c.address).toBe(ORG.legal_address);
    expect(c.signatoryPosition).toBe("Генеральный директор");
    expect(customerFromOrganization({ legal_address: "", actual_address: "Факт" }).address).toBe("Факт");
  });
});

describe("номер счёта", () => {
  it("детерминирован для одинакового запроса и различается между организациями", () => {
    const a = platformInvoiceNumber({ organizationId: "org-1", plan: "standard", periodMonths: 12, date: "2026-08-08" });
    const b = platformInvoiceNumber({ organizationId: "org-1", plan: "standard", periodMonths: 12, date: "2026-08-08" });
    const c = platformInvoiceNumber({ organizationId: "org-2", plan: "standard", periodMonths: 12, date: "2026-08-08" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain("STD12");
  });
});

describe("проект договора без номера", () => {
  it("официальный номер только у утверждённого договора", () => {
    expect(contractNumberForStatus("draft", "Д-1")).toBeNull();
    expect(contractNumberForStatus("approved", "Д-1")).toBe("Д-1");
    expect(contractNumberForStatus("approved", "  ")).toBeNull();
  });

  it("сумма проекта берётся из SUBSCRIPTION_PLANS", () => {
    const draft = buildDraftForRequest({ organizationId: "o", plan: "standard", periodMonths: 1, customer: ORG });
    expect(draft.monthlyPrice).toBe(SUBSCRIPTION_PLANS.standard.price);
    expect(draft.totalAmount).toBe(SUBSCRIPTION_PLANS.standard.price);
  });
});

describe("идемпотентность", () => {
  it("повторное формирование не создаёт дубли договора и счёта", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    const req = { organizationId: "org-1", plan: "standard" as const, periodMonths: 12 as const, customer: ORG };

    const first = await createPlatformCommercialSet(client, req);
    const second = await createPlatformCommercialSet(client, req);

    expect(client.calls.contractInserts).toBe(1);
    expect(client.calls.invoiceInserts).toBe(1);
    expect(second.contract.id).toBe(first.contract.id);
    expect(second.invoice.id).toBe(first.invoice.id);
    expect(first.contract.contract_number).toBeNull();
  });

  it("другой тариф создаёт отдельный проект", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    const base = { organizationId: "org-1", customer: ORG };
    await createPlatformCommercialSet(client, { ...base, plan: "standard", periodMonths: 12 });
    await createPlatformCommercialSet(client, { ...base, plan: "professional", periodMonths: 12 });
    expect(client.calls.contractInserts).toBe(2);
    expect(client.calls.invoiceInserts).toBe(2);
  });

  it("счёт создаётся на выбранный тариф и срок", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    const req = { organizationId: "org-1", plan: "professional" as const, periodMonths: 12 as const, customer: ORG };
    const draft = buildDraftForRequest(req);
    const invoice = await ensurePlatformInvoice(client, req, draft);
    expect(invoice.plan).toBe("professional");
    expect(invoice.period_months).toBe(12);
    expect(Number(invoice.amount)).toBe(draft.totalAmount);
    expect(invoice.status).toBe("pending");
  });

  it("обновляет существующий черновик, а не плодит новые", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    const req = { organizationId: "org-1", plan: "start" as const, periodMonths: 1 as const, customer: ORG };
    const draft = buildDraftForRequest(req);
    await ensurePlatformContractProject(client, req, draft);
    await ensurePlatformContractProject(client, req, draft);
    expect(client.calls.contractInserts).toBe(1);
    expect(client.calls.contractUpdates).toBe(1);
  });

  it("бесплатный тариф не формирует комплект", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    await expect(
      createPlatformCommercialSet(client, { organizationId: "o", plan: "free", periodMonths: 1, customer: ORG }),
    ).rejects.toThrow();
  });
});

describe("акт только по оплате", () => {
  it("недоступен без подтверждённой оплаты", () => {
    expect(isInvoicePaid({ status: "pending", paid_at: null } as any)).toBe(false);
    expect(isInvoicePaid({ status: "paid", paid_at: null } as any)).toBe(false);
    expect(isInvoicePaid({ status: "paid", paid_at: "2026-08-08T00:00:00Z" } as any)).toBe(true);
    expect(canIssueAct({ paidInvoice: null })).toBe(false);
    expect(canIssueAct({ paidInvoice: { status: "paid", paid_at: "x" } as any })).toBe(true);
  });
});
