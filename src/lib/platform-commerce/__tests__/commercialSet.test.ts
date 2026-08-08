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

const ORG_ID = "11111111-2222-4333-8444-555555555555";
const ORG_ID_2 = "99999999-2222-4333-8444-555555555555";

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
  const calls = { contractInserts: 0, contractUpdates: 0, invoiceInserts: 0, invoiceDeletes: 0 };
  const client = {
    calls,
    from(table: string) {
      const rows = table === "org_contracts" ? state.contracts : table === "subscription_invoices" ? state.invoices : state.acts || [];
      const filters: Record<string, any> = {};
      const match = () => rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const resolveList = () => Promise.resolve({ data: match(), error: null });
      const q: any = {
        select() { return q; },
        eq(col: string, val: any) { filters[col] = val; return q; },
        order() { return q; },
        limit() { return resolveList(); },
        maybeSingle() { return Promise.resolve({ data: match()[0] || null, error: null }); },
        single() { return Promise.resolve({ data: match()[0] || null, error: null }); },
        then(onFulfilled: any, onRejected: any) { return resolveList().then(onFulfilled, onRejected); },
        insert(payload: any) {
          const row = {
            id: `${table}-${rows.length + 1}`,
            created_at: new Date(Date.now() + rows.length).toISOString(),
            status: table === "subscription_invoices" ? "pending" : payload.status,
            paid_at: null,
            ...payload,
          };
          rows.push(row);
          if (table === "org_contracts") calls.contractInserts++; else calls.invoiceInserts++;
          return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
        },
        update(payload: any) {
          if (table === "org_contracts") calls.contractUpdates++;
          const u: any = {
            eq(col: string, val: any) { filters[col] = val; return u; },
            select() { return u; },
            single() {
              const target = match()[0];
              if (!target) return Promise.resolve({ data: null, error: { message: "not found" } });
              const idx = rows.indexOf(target);
              rows[idx] = { ...rows[idx], ...payload };
              return Promise.resolve({ data: rows[idx], error: null });
            },
          };
          return u;
        },
        delete() {
          const d: any = {
            eq(col: string, val: any) { filters[col] = val; return d; },
            then(onFulfilled: any, onRejected: any) {
              for (const r of match()) {
                rows.splice(rows.indexOf(r), 1);
                if (table === "subscription_invoices") calls.invoiceDeletes++;
              }
              return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
            },
          };
          return d;
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
    const a = platformInvoiceNumber({ organizationId: ORG_ID, plan: "standard", periodMonths: 12, date: "2026-08-08" });
    const b = platformInvoiceNumber({ organizationId: ORG_ID, plan: "standard", periodMonths: 12, date: "2026-08-08" });
    const c = platformInvoiceNumber({ organizationId: ORG_ID_2, plan: "standard", periodMonths: 12, date: "2026-08-08" });
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
    const draft = buildDraftForRequest({ organizationId: ORG_ID, plan: "standard", periodMonths: 1, customer: ORG });
    expect(draft.monthlyPrice).toBe(SUBSCRIPTION_PLANS.standard.price);
    expect(draft.totalAmount).toBe(SUBSCRIPTION_PLANS.standard.price);
  });
});

describe("идемпотентность", () => {
  it("повторное формирование не создаёт дубли договора и счёта", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    const req = { organizationId: ORG_ID, plan: "standard" as const, periodMonths: 12 as const, customer: ORG };

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
    const base = { organizationId: ORG_ID, customer: ORG };
    await createPlatformCommercialSet(client, { ...base, plan: "standard", periodMonths: 12 });
    await createPlatformCommercialSet(client, { ...base, plan: "professional", periodMonths: 12 });
    expect(client.calls.contractInserts).toBe(2);
    expect(client.calls.invoiceInserts).toBe(2);
  });

  it("счёт создаётся на выбранный тариф и срок", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    const req = { organizationId: ORG_ID, plan: "professional" as const, periodMonths: 12 as const, customer: ORG };
    const draft = buildDraftForRequest(req);
    const invoice = await ensurePlatformInvoice(client, req, draft);
    expect(invoice.plan).toBe("professional");
    expect(invoice.period_months).toBe(12);
    expect(Number(invoice.amount)).toBe(draft.totalAmount);
    expect(invoice.status).toBe("pending");
  });

  it("обновляет существующий черновик, а не плодит новые", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    const req = { organizationId: ORG_ID, plan: "start" as const, periodMonths: 1 as const, customer: ORG };
    const draft = buildDraftForRequest(req);
    await ensurePlatformContractProject(client, req, draft);
    await ensurePlatformContractProject(client, req, draft);
    expect(client.calls.contractInserts).toBe(1);
    expect(client.calls.contractUpdates).toBe(1);
  });

  it("бесплатный тариф не формирует комплект", async () => {
    const client = makeClient({ contracts: [], invoices: [] });
    await expect(
      createPlatformCommercialSet(client, { organizationId: ORG_ID, plan: "free", periodMonths: 1, customer: ORG }),
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

describe("scope-guard организации", () => {
  it("не даёт создать документы без валидного organization_id", async () => {
    const { assertOrganizationScope } = await import("../commercialSet");
    expect(() => assertOrganizationScope("")).toThrow();
    expect(() => assertOrganizationScope("org-1")).toThrow();
    expect(assertOrganizationScope(ORG_ID)).toBe(ORG_ID);
  });
});

describe("экранирование реквизитов", () => {
  it("экранирует кавычки, амперсанд и угловые скобки", async () => {
    const { escapeHtml } = await import("@/lib/html/escapeHtml");
    expect(escapeHtml(`ООО "А&Б" <script>`)).toBe("ООО &quot;А&amp;Б&quot; &lt;script&gt;");
  });

  it("не пропускает сырой HTML реквизитов в проект договора", async () => {
    const { buildPlatformContractDocumentHtml } = await import("@/lib/platform-contract");
    const draft = buildDraftForRequest({
      organizationId: ORG_ID,
      plan: "standard",
      periodMonths: 12,
      customer: { ...ORG, name: 'ООО "Тест" <script>alert(1)</script> & Ко' },
    });
    const html = buildPlatformContractDocumentHtml(draft);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; Ко");
  });
});

describe("гонка при двойном нажатии", () => {
  it("схлопывает второй счёт с тем же номером и не оставляет дубль", async () => {
    const state = { contracts: [] as any[], invoices: [] as any[] };
    const client = makeClient(state);
    const req = { organizationId: ORG_ID, plan: "standard" as const, periodMonths: 12 as const, customer: ORG };
    const draft = buildDraftForRequest(req);
    const [a, b] = await Promise.all([
      ensurePlatformInvoice(client, req, draft),
      ensurePlatformInvoice(client, req, draft),
    ]);
    expect(a.invoice_number).toBe(b.invoice_number);
    expect(state.invoices.filter((i) => i.invoice_number === a.invoice_number)).toHaveLength(1);
  });
});
