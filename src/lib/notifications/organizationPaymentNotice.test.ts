import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as { table: string; filters: unknown[][]; limit: number | null }[],
  failedTable: "",
  postpaid: false,
  postpaidError: false,
}));
vi.mock("@/lib/postpaidAccess", () => ({ fetchPostpaidAccessProfile: async (id: string) => {
  if (state.postpaidError) throw Error("secret server payload");
  return { organization_id: id, active: state.postpaid, billing_mode: state.postpaid ? "postpaid" : "prepaid" };
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const filters: unknown[][] = []; let limit: number | null = null; let single = false;
  const query: any = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters.push(["eq", column, value]); return query; },
    is: (column: string, value: unknown) => { filters.push(["is", column, value]); return query; },
    in: (column: string, value: unknown[]) => { filters.push(["in", column, value]); return query; },
    order: () => query,
    limit: (value: number) => { limit = value; return query; },
    single: () => { single = true; return query; },
    then: (resolve: (result: unknown) => unknown) => {
      state.calls.push({ table, filters, limit });
      let rows = [...(state.tables[table] || [])].filter(row => filters.every(([op, col, val]) => op === "in"
        ? (val as unknown[]).includes(row[col as string]) : row[col as string] === val));
      rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      if (limit !== null) rows = rows.slice(0, limit);
      return Promise.resolve(resolve({ data: single ? rows[0] || null : rows, error: state.failedTable === table ? { message: "secret" } : null }));
    },
  };
  return query;
} } }));

import { readOrganizationPaymentNotice } from "./organizationPaymentNotice";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INVOICE = "33333333-3333-4333-8333-333333333333";
const NOTICE = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  state.calls = []; state.failedTable = ""; state.postpaid = false; state.postpaidError = false;
  state.tables = {
    organizations: [{ id: ORG, paid_until: "2026-07-20T00:00:00Z" }],
    subscription_invoices: [{ id: INVOICE, organization_id: ORG, status: "pending", billing_kind: "prepaid", paid_at: null, created_at: "2026-11-05T21:35:30Z" }],
    org_notifications: [{ id: NOTICE, organization_id: ORG, type: "subscription_expiry", title: "Оплатите доступ до 20 ноября", message: "Счёт № 0025 — 8 000 ₽. Нажмите, чтобы открыть счёт.", related_id: INVOICE, created_at: "2026-11-05T21:37:08Z", is_read: true }],
  };
});

describe("existing organization payment reminder", () => {
  it("keeps a read reminder visible behind 80 newer ordinary notifications and uses the existing invoice route", async () => {
    state.tables.org_notifications.push(...Array.from({ length: 80 }, (_, i) => ({ id: `ordinary-${i}`, organization_id: ORG, type: "course_completed", created_at: "2026-11-19T00:00:00Z" })));
    const result = await readOrganizationPaymentNotice(ORG);
    expect(result).toMatchObject({ organizationId: ORG, id: NOTICE, title: "Оплатите доступ до 20 ноября", path: `/invoice/${INVOICE}` });
    expect(state.calls.find(c => c.table === "org_notifications")).toMatchObject({ limit: 1, filters: [["eq", "organization_id", ORG], ["eq", "type", "subscription_expiry"], ["in", "related_id", [INVOICE]]] });
    expect(state.calls.find(c => c.table === "subscription_invoices")?.limit).toBe(20);
  });
  it.each(["paid", "cancelled", "draft"])("does not revive a %s invoice reminder", async status => {
    state.tables.subscription_invoices[0].status = status;
    expect(await readOrganizationPaymentNotice(ORG)).toBeNull();
    expect(state.calls.some(c => c.table === "org_notifications")).toBe(false);
  });
  it("does not show an invoice marked paid even if status remained pending", async () => {
    state.tables.subscription_invoices[0].paid_at = "2026-11-19T12:00:00Z";
    expect(await readOrganizationPaymentNotice(ORG)).toBeNull();
  });
  it.each(["subscription_invoices", "org_notifications"])("does not join a foreign organization's %s", async table => {
    state.tables[table][0].organization_id = OTHER;
    expect(await readOrganizationPaymentNotice(ORG)).toBeNull();
  });
  it("does not manufacture a warning from a pending invoice without an existing expiry notice", async () => {
    state.tables.org_notifications = [];
    expect(await readOrganizationPaymentNotice(ORG)).toBeNull();
  });
  it.each(["2099-11-20T00:00:00Z", "2026-11-10T00:00:00Z"])("suppresses a previous reminder after a later paid term %s", async paidUntil => {
    state.tables.organizations[0].paid_until = paidUntil;
    expect(await readOrganizationPaymentNotice(ORG)).toBeNull();
  });
  it("suppresses prepaid notices for a current postpaid agreement", async () => {
    state.postpaid = true;
    expect(await readOrganizationPaymentNotice(ORG)).toBeNull();
  });
  it.each(["organizations", "subscription_invoices", "org_notifications"])("fails without declaring debt when %s is unavailable", async table => {
    state.failedTable = table;
    await expect(readOrganizationPaymentNotice(ORG)).rejects.toThrow("payment_notice_unavailable");
  });
  it("requires a known postpaid answer", async () => {
    state.postpaidError = true;
    await expect(readOrganizationPaymentNotice(ORG)).rejects.toThrow();
  });
  it("does not read malformed organization scopes", async () => {
    expect(await readOrganizationPaymentNotice("bad-scope")).toBeNull();
    expect(state.calls).toEqual([]);
  });
});
