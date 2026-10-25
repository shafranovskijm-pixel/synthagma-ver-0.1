// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubscriptionCheckoutHandler } from './handler.ts';
import { SUBSCRIPTION_PLANS, getSubscriptionInvoiceMonthlyAmount } from '../../../src/constants/subscriptionPlans.ts';
import { SUBSCRIPTION_MONTHLY_PRICES } from '../_shared/subscription-pricing.ts';

const organizationId = "12345678-1234-1234-1234-123456789012";
function fixture(options: { postpaid?: boolean; billingError?: boolean; allowed?: boolean; insertError?: boolean; saveError?: boolean; price?: number; discount?: number; currentPlan?: string } = {}) {
  const invoices: any[] = [], calls: string[] = [];
  const db = {
    rpc: vi.fn(async (name: string) => name === "has_active_postpaid_agreement"
      ? { data: options.postpaid ?? false, error: options.billingError ? {} : null }
      : { data: [{ terminal_key: "fixture-terminal", password: "fixture-password" }] }),
    from: vi.fn((table: string) => {
      let inserted: any, updated: any;
      const query: any = {
        select: () => query,
        eq: () => updated ? Promise.resolve({ error: options.saveError ? {} : null }) : query,
        insert: (value: any) => { inserted = value; invoices.push(value); calls.push("persist-order"); return query; },
        update: (value: any) => { updated = value; calls.push("bind-payment"); return query; },
        single: async () => table === "organizations"
          ? { data: { subscription_plan: options.currentPlan ?? "start", custom_price: options.price ?? null, custom_discount: options.discount ?? null } }
          : { data: inserted, error: options.insertError ? {} : null },
      };
      return query;
    }),
  };
  const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push("bank-init");
    const payload = JSON.parse(String(init?.body));
    expect(invoices.some(invoice => invoice.tbank_order_id === payload.OrderId && invoice.amount * 100 === Number(payload.Amount))).toBe(true);
    return new Response(JSON.stringify({ Success: true, PaymentId: String(100 + invoices.length), PaymentURL: "https://bank.example/payment" }), { status: 200 });
  });
  const authorize = vi.fn(async () => options.allowed !== false);
  const handler = createSubscriptionCheckoutHandler({ db, supabaseUrl: "https://fixture.invalid", authorize, fetch: request as typeof fetch });
  const send = (patch: Record<string, unknown> = {}, auth = "Bearer fixture") => handler(new Request("https://fixture.invalid", {
    method: "POST", headers: { Authorization: auth }, body: JSON.stringify({ organization_id: organizationId, plan: "start", period_months: 1, ...patch }),
  }));
  return { send, request, invoices, calls, db, authorize };
}
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); })); });
describe("actual subscription checkout", () => {
  it("quotes Start at 4490 on server, ignoring caller prices and persisting bank identity first", async () => {
    const f = fixture(); const response = await f.send({ amount: 1, custom_price: 1, custom_discount: 4489 });
    expect(response.status).toBe(200); expect((await response.json()).amount).toBe(4490);
    expect(f.calls).toEqual(["persist-order", "bank-init", "bind-payment"]);
    expect(f.invoices[0]).toMatchObject({ plan: "start", amount: 4490, status: "pending", payment_method: "tbank", tbank_terminal_key: "fixture-terminal" });
  });
  it("refuses prepaid checkout for postpaid organizations before reading credentials or creating a bank order", async () => {
    const f = fixture({ postpaid: true });
    expect((await f.send()).status).toBe(409);
    expect(f.request).not.toHaveBeenCalled(); expect(f.db.from).not.toHaveBeenCalled();
    expect(f.db.rpc).toHaveBeenCalledTimes(1);
  });
  it("fails closed if the billing agreement cannot be checked", async () => {
    const f = fixture({ billingError: true }); expect((await f.send()).status).toBe(500);
    expect(f.request).not.toHaveBeenCalled(); expect(f.invoices).toHaveLength(0);
  });
  it("uses server negotiated renewal price and annual discount", async () => {
    const f = fixture({ price: 4000, discount: 100 });
    expect((await (await f.send({ period_months: 12 })).json()).amount).toBe(39780);
  });
  it("does not carry negotiated old-plan terms to a newly selected tariff", async () => {
    const f = fixture({ price: 1, currentPlan: "standard" });
    expect((await (await f.send()).json()).amount).toBe(4490);
  });
  it("checks organization permission before privileged reads or bank calls", async () => {
    const f = fixture({ allowed: false }); expect((await f.send()).status).toBe(403);
    expect(f.db.from).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled();
  });
  it.each([{ plan: "maximum", period_months: -1 }, { plan: "__proto__" }, { plan: "free" }, { organization_id: "invalid" }])("rejects invalid quote input %j", async patch => {
    const f = fixture(); expect((await f.send(patch)).status).toBe(400); expect(f.request).not.toHaveBeenCalled();
  });
  it("does not create a bank payment if durable invoice insert fails", async () => {
    const f = fixture({ insertError: true }); expect((await f.send()).status).toBe(500); expect(f.request).not.toHaveBeenCalled();
  });
  it("does not return a successful checkout after payment binding fails", async () => {
    const f = fixture({ saveError: true }); const response = await f.send();
    expect(response.status).toBe(500); expect(await response.json()).not.toHaveProperty("url");
  });
  it("keeps concurrent checkout documents and bank orders distinct", async () => {
    const f = fixture(); expect((await Promise.all([f.send(), f.send()])).map(r => r.status)).toEqual([200, 200]);
    expect(new Set(f.invoices.map(i => i.invoice_number)).size).toBe(2);
    expect(new Set(f.invoices.map(i => i.tbank_order_id)).size).toBe(2);
  });
  it("shares the displayed tariff contract and existing manual renewal discounts", () => {
    for (const plan of Object.values(SUBSCRIPTION_PLANS)) expect(plan.price).toBe(SUBSCRIPTION_MONTHLY_PRICES[plan.id]);
    expect(getSubscriptionInvoiceMonthlyAmount({ plan: "start", customPrice: 4000, customDiscount: 100 })).toBe(3900);
  });
});
