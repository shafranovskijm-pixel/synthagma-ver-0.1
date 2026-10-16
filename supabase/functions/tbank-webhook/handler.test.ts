// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTbankWebhookHandler } from "./handler";

const order = "sub_1234567890123456789012345678";
const terminal = "fixture-terminal", password = "fixture-password";
const invoice = { id: "12345678-1234-1234-1234-123456789012", organization_id: "org", amount: 4490, payment_id: "123", payment_method: "tbank", tbank_terminal_key: terminal };
// Independent signing oracle, not the production helper being tested.
function sign(values: Record<string, unknown>, secret = password) {
  const scalar = Object.fromEntries(Object.entries(values).filter(([k, v]) => k !== "Token" && v !== null && typeof v !== "object"));
  scalar.Password = secret;
  return createHash("sha256").update(Object.keys(scalar).sort().map(k => String(scalar[k])).join("")).digest("hex");
}
function fixture(options: { missing?: boolean; lookupError?: boolean; rpcError?: boolean; bound?: string | null; ownTerminal?: string } = {}) {
  const rpc = vi.fn(async (name: string, _params?: unknown) => name === "get_decrypted_payment_settings"
    ? { data: [{ terminal_key: options.ownTerminal ?? terminal, password }] }
    : options.rpcError ? { error: { message: "fixture failure" } } : { data: { applied: true, outcome: "applied" } });
  const filters: unknown[] = [];
  const db = { rpc, from: vi.fn((table: string) => {
    const query: any = {
      select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; },
      maybeSingle: async () => ({ data: options.missing ? null : { ...invoice, tbank_terminal_key: options.bound === undefined ? terminal : options.bound }, error: options.lookupError ? {} : null }),
      in: async () => ({ data: [{ setting_key: "tbank_terminal_key", setting_value: terminal }, { setting_key: "tbank_password", setting_value: password }] }),
    };
    if (!["subscription_invoices", "course_payments", "app_settings"].includes(table)) throw new Error("Unexpected table");
    return query;
  }) };
  const handler = createTbankWebhookHandler(db, { error: vi.fn(), warn: vi.fn() });
  const send = async (patch: Record<string, unknown> = {}, token?: string) => {
    const body = { TerminalKey: terminal, OrderId: order, PaymentId: 123, Amount: 449000, Success: true, Status: "CONFIRMED", ...patch };
    return handler(new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify({ ...body, Token: token ?? sign(body) }) }));
  };
  return { rpc, filters, send };
}
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); })); });
describe("actual T-Bank notification handler", () => {
  it("settles a signed confirmed payment by exact persisted order identity", async () => {
    const f = fixture(); expect((await f.send()).status).toBe(200);
    expect(f.filters).toEqual([["tbank_order_id", order]]);
    expect(f.rpc).toHaveBeenLastCalledWith("apply_tbank_payment_event", {
      p_kind: "subscription", p_record_id: invoice.id, p_payment_id: "123", p_terminal_key: terminal, p_amount_kopecks: 449000, p_status: "CONFIRMED",
    });
  });
  it.each(["AUTHORIZED", "NEW", "REVERSED"])("does not grant access for %s", async Status => {
    const f = fixture(); expect((await f.send({ Status })).status).toBe(200);
    expect(f.rpc.mock.calls.filter(([name]) => name === "apply_tbank_payment_event")).toHaveLength(0);
  });
  it.each([
    [{ Amount: 1 }, undefined, 400], [{ PaymentId: "999" }, undefined, 400],
    [{ TerminalKey: "wrong" }, undefined, 400], [{ Success: false }, undefined, 400], [{}, "0".repeat(64), 403],
  ])("rejects inconsistent notification %j", async (patch, token, status) => {
    const f = fixture(); expect((await f.send(patch, token)).status).toBe(status);
    expect(f.rpc.mock.calls.filter(([name]) => name === "apply_tbank_payment_event")).toHaveLength(0);
  });
  it.each([{ missing: true }, { lookupError: true }, { rpcError: true }])("asks the bank to retry on incomplete settlement %j", async options => {
    expect((await fixture(options).send()).status).toBe(500);
  });
  it("verifies an old platform-terminal invoice even if an organization terminal was added later", async () => {
    expect((await fixture({ bound: null, ownTerminal: "new-org-terminal" }).send()).status).toBe(200);
  });
  it("uses the actual course identity and never writes through PostgREST directly", async () => {
    const f = fixture();
    expect((await f.send({ OrderId: invoice.id })).status).toBe(200);
    expect(f.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_kind: "course" });
  });
});
