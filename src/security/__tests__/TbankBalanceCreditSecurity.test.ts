import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
  .replace(/\r\n?/g, "\n");
const migration = read(
  "supabase/migrations/20260822164000_atomic_tbank_balance_credit.sql",
);
const webhook = read("supabase/functions/tbank-webhook/index.ts");
const generatedTypes = read("src/integrations/supabase/types.ts");

function sqlFunctionBody(functionName: string): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  ));
  expect(match, `missing SQL body for ${functionName}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("atomic T-Bank balance credit security contract", () => {
  it("serializes ledger and balance mutations under the organization row lock", () => {
    const body = sqlFunctionBody("apply_tbank_balance_credit");
    const lockAt = body.indexOf("FOR UPDATE");
    const ledgerAt = body.indexOf("INSERT INTO public.balance_transactions");
    const balanceAt = body.indexOf("UPDATE public.organizations");

    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(ledgerAt).toBeGreaterThan(lockAt);
    expect(balanceAt).toBeGreaterThan(ledgerAt);
    expect(body).toContain("SET balance = balance + p_amount");
    expect(body).not.toMatch(/SUM\s*\(/i);
  });

  it("applies each stable payment identity once and fails closed on key collisions", () => {
    const body = sqlFunctionBody("apply_tbank_balance_credit");

    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS idempotency_key text/,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS balance_transactions_idempotency_key_unique[\s\S]*?WHERE idempotency_key IS NOT NULL/,
    );
    expect(body).toMatch(
      /ON CONFLICT \(idempotency_key\) WHERE idempotency_key IS NOT NULL\s+DO NOTHING/,
    );
    expect(body).toContain("'applied', false");
    expect(body).toContain("'applied', true");
    expect(body).toContain(
      "v_existing.organization_id IS DISTINCT FROM p_organization_id",
    );
    expect(body).toContain("v_existing.amount IS DISTINCT FROM p_amount");
    expect(body).toContain(
      "v_existing.type IS DISTINCT FROM p_transaction_type",
    );
    expect(body).toContain("related_order_id");
    expect(body).toMatch(/p_description,\s+NULL,\s+NULL,\s+v_key/);
  });

  it("exposes the billing RPC only to the service integration", () => {
    const signature =
      "public.apply_tbank_balance_credit(uuid, numeric, text, text, text)";

    expect(migration).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}\n  FROM authenticated`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}\n  TO service_role`);
    expect(generatedTypes).toContain("apply_tbank_balance_credit: {");
    expect(generatedTypes).toContain("idempotency_key: string | null");
  });

  it("routes both callbacks through the RPC with stable keys and checks failures", () => {
    expect(webhook).toContain('.rpc("apply_tbank_balance_credit"');
    expect(webhook).toContain("if (error)");
    expect(webhook).toContain("Atomic T-Bank balance credit failed");
    expect(webhook).toContain("`tbank:subscription:${(invoice as any).id}`");
    expect(webhook).toContain("`tbank:course:${payment.id}`");
    expect(webhook).not.toContain('.from("balance_transactions").insert');
    expect(webhook).not.toContain('.select("amount")');
    expect(webhook).not.toContain("relatedOrderId");
    expect(webhook).toContain("if (balanceCredit.applied)");
    expect(webhook).toContain('return new Response("Internal error", { status: 500 })');
  });
});
