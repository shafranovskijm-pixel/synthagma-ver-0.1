import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const edgeSource = read("supabase/functions/submit-demo-request/index.ts");
const pageSource = read("src/pages/DemonstrationPage.tsx");
const generatedTypes = read("src/integrations/supabase/types.ts");
const salesLeadMigration = read(
  "supabase/migrations/20260216024439_4a1d4046-6e1b-4033-b26b-d517fedef52d.sql",
);

describe("/demonstration submission source contract", () => {
  it("stops with HTTP 500 when the mandatory lead cannot be persisted", () => {
    const leadFailure = edgeSource.indexOf("if (leadError || !lead?.id)");
    const telegramInvoke = edgeSource.indexOf('"send-telegram-notification"');

    expect(leadFailure).toBeGreaterThan(-1);
    expect(telegramInvoke).toBeGreaterThan(leadFailure);
    expect(edgeSource.slice(leadFailure, telegramInvoke)).toContain("lead_persistence_failed");
    expect(edgeSource.slice(leadFailure, telegramInvoke)).toMatch(/},\s*500\);/);
  });

  it("writes only fields that exist in the sales_leads schema", () => {
    const salesLeadTypes = generatedTypes.slice(
      generatedTypes.indexOf("sales_leads: {"),
      generatedTypes.indexOf("sales_managers: {"),
    );

    expect(salesLeadMigration).toMatch(/CREATE TABLE public\.sales_leads[\s\S]*?org_name TEXT NOT NULL/);
    expect(salesLeadTypes).toContain("org_name: string");
    expect(salesLeadTypes).not.toContain("contact_name:");
    expect(salesLeadTypes).not.toContain("company_name:");
    expect(edgeSource).toContain("org_name: input.organization || input.name");
    expect(edgeSource).toContain("`Контакт: ${input.name}`");
    expect(edgeSource).not.toContain("contact_name:");
    expect(edgeSource).not.toContain("company_name:");
  });

  it("uses the support-chat/default Telegram route and checks error plus result", () => {
    expect(edgeSource).toContain('Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID")');
    expect(edgeSource).toContain('"send-telegram-notification"');
    expect(edgeSource).toContain("telegramError");
    expect(edgeSource).toContain("notificationInvokeSucceeded(telegramResult)");
  });

  it("returns only stable delivery states and does not echo raw server errors", () => {
    expect(edgeSource).toContain('lead: "stored"');
    expect(edgeSource).toContain("telegram: telegramDelivery");
    expect(edgeSource).toContain("email: emailDelivery");
    expect(edgeSource).toContain('error: "internal_error"');
    expect(edgeSource).not.toMatch(/JSON\.stringify\(\{\s*error:\s*String\(/);
  });

  it("shows success only for data.ok and keeps the form open on failure", () => {
    expect(pageSource).toContain("const { data, error }");
    expect(pageSource).toContain("if (!isDemoRequestAccepted(data))");

    const catchStart = pageSource.indexOf("} catch (err: unknown)");
    const finallyStart = pageSource.indexOf("} finally {", catchStart);
    const catchBlock = pageSource.slice(catchStart, finallyStart);

    expect(catchStart).toBeGreaterThan(-1);
    expect(catchBlock).toContain("setSent(false)");
    expect(catchBlock).toContain("toast.error");
    expect(catchBlock).not.toContain("setSent(true)");
    expect(catchBlock).not.toContain("toast.success");
  });

  it("rejects the untouched +7 phone placeholder on both client and server", () => {
    expect(pageSource).toContain("if (!isReasonableDemoPhone(phone))");
    expect(edgeSource).toContain("if (!isReasonablePhone(input.phone))");
    expect(edgeSource).toContain('error: "invalid_phone"');
  });
});
