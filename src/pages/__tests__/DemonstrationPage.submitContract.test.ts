import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const edgeSource = read("supabase/functions/submit-demo-request/index.ts");
const edgeContractSource = read("supabase/functions/submit-demo-request/contract.ts");
const deliverySource = read("supabase/functions/_shared/demoTelegramDelivery.ts");
const retrySource = read("supabase/functions/retry-demo-request-notification/index.ts");
const pageSource = read("src/pages/DemonstrationPage.tsx");
const adminPageSource = read("src/pages/AdminDashboard.tsx");
const adminHeaderSource = read("src/components/admin/AdminDashboardHeader.tsx");
const generatedTypes = read("src/integrations/supabase/types.ts");
const claimPermissionMigration = read(
  "supabase/migrations/20260830183500_restrict_notification_dedup_claim.sql",
);
const salesLeadMigration = read(
  "supabase/migrations/20260216024439_4a1d4046-6e1b-4033-b26b-d517fedef52d.sql",
);

describe("/demonstration submission source contract", () => {
  it("stops with HTTP 500 when the mandatory lead cannot be persisted", () => {
    const leadFailure = edgeSource.indexOf("if (!lead?.id)");
    const durableRecord = edgeSource.indexOf('.from("admin_notifications")');

    expect(leadFailure).toBeGreaterThan(-1);
    expect(durableRecord).toBeGreaterThan(leadFailure);
    expect(edgeSource.slice(leadFailure, durableRecord)).toContain("lead_persistence_failed");
    expect(edgeSource.slice(leadFailure, durableRecord)).toMatch(/},\s*500\);/);
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
    expect(deliverySource).toContain('Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID")');
    expect(deliverySource).toContain('"send-telegram-notification"');
    expect(deliverySource).toContain("notificationInvokeSucceeded(data)");
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

  it("passes stored attribution and reports the goal only after acceptance", () => {
    expect(pageSource).toContain("tracking: getUtmData()");

    const acceptanceGate = pageSource.indexOf("if (!isDemoRequestAccepted(data))");
    const goal = pageSource.indexOf('reachYandexGoal("demo_request_success")');

    expect(acceptanceGate).toBeGreaterThan(-1);
    expect(goal).toBeGreaterThan(acceptanceGate);
  });

  it("normalizes attribution without changing the sales_leads insert schema", () => {
    expect(edgeContractSource).toContain("normalizeDemoRequestTracking(body.tracking)");
    expect(edgeSource).toContain("...buildAttributionLines(input.tracking)");
    expect(edgeSource).not.toContain("utm_source:");
    expect(edgeSource).not.toContain("yclid:");
  });

  it("uses a stable client request id and treats duplicate inserts as the same lead", () => {
    expect(pageSource).toContain("useState(() => crypto.randomUUID())");
    expect(pageSource).toContain("request_id: requestId");
    expect(edgeSource).toContain("id: leadId");
    expect(edgeSource).toContain('leadError?.code === "23505"');
    expect(edgeSource).toContain('existingLead.source === "demo_request"');
    expect(edgeSource).toContain('(existingLead.notes || "") === leadPayload.notes');
    expect(edgeSource).toContain('error: "request_id_conflict"');
  });

  it("stores a visible delivery record before Telegram and keeps a durable lead warning on failure", () => {
    const recordInsert = edgeSource.indexOf('.from("admin_notifications")');
    const deliveryAttempt = edgeSource.indexOf("telegramDelivery = await attemptDemoTelegramDelivery");
    expect(recordInsert).toBeGreaterThan(-1);
    expect(deliveryAttempt).toBeGreaterThan(recordInsert);
    expect(edgeSource).toContain("ignoreDuplicates: true");
    expect(edgeSource).toContain("доставку заявки в Telegram требуется проверить вручную");
    expect(deliverySource).toContain('"claim_notification_dedup"');
    expect(deliverySource).toContain('.from("notification_dedup_log")');
    expect(deliverySource).toContain('failure_code: "telegram_delivery_outcome_unknown"');
    expect(deliverySource).toContain('telegram_status: "pending"');
    expect(deliverySource).toContain('.select("id, related_entity_id, type, metadata")');
    expect(deliverySource).toMatch(
      /:force-retry:\$\{\s*metadata\.attempt_count \+ 1\s*\}/,
    );
    expect(deliverySource).toContain('const activeClaimKey = forceRetryKey');
    expect(retrySource).toContain('preclaimedKey = forceClaim.claim_key');
    const safePreInvokeRelease = deliverySource.indexOf('.delete()');
    const externalInvoke = deliverySource.indexOf('supabase.functions.invoke(');
    const unknownOutcome = deliverySource.indexOf('failure_code: "telegram_delivery_outcome_unknown"');
    expect(safePreInvokeRelease).toBeGreaterThan(-1);
    expect(safePreInvokeRelease).toBeLessThan(externalInvoke);
    expect(deliverySource.slice(unknownOutcome)).not.toContain('.delete()');
  });

  it("offers an explicit admin-only retry and routes the notification to Sales", () => {
    expect(retrySource).toContain("auth.getUser()");
    expect(retrySource).toContain('userClient.rpc("has_role"');
    expect(retrySource).toContain("isAdmin !== true");
    expect(adminHeaderSource).toContain("Повторить Telegram");
    expect(adminHeaderSource).toContain("Уже доставлено");
    expect(adminHeaderSource).toContain("Не найдено — повторить");
    expect(adminPageSource).toContain('"retry-demo-request-notification"');
    expect(adminPageSource).toContain("confirm_duplicate_risk");
    expect(adminPageSource).toContain("confirm_delivered");
    expect(adminPageSource).toContain('setActiveTab("sales")');
  });

  it("restricts the delivery claim RPC to service_role", () => {
    expect(claimPermissionMigration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.claim_notification_dedup\(TEXT\) FROM PUBLIC;/,
    );
    expect(claimPermissionMigration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.claim_notification_dedup\(TEXT\) FROM anon;/,
    );
    expect(claimPermissionMigration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.claim_notification_dedup\(TEXT\) FROM authenticated;/,
    );
    expect(claimPermissionMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_notification_dedup\(TEXT\) TO service_role;/,
    );
  });

  it("refreshes the admin notification bell without depending on Realtime", () => {
    expect(adminPageSource).toContain("window.setInterval(refreshWhenVisible");
    expect(adminPageSource).toContain('window.addEventListener("focus", refreshWhenVisible)');
    expect(adminPageSource).toContain('document.addEventListener("visibilitychange", refreshWhenVisible)');
    expect(adminPageSource).toContain("window.clearInterval(pollId)");
  });

  it("rejects the untouched +7 phone placeholder on both client and server", () => {
    expect(pageSource).toContain("if (!isReasonableDemoPhone(phone))");
    expect(edgeSource).toContain("if (!isReasonablePhone(input.phone))");
    expect(edgeSource).toContain('error: "invalid_phone"');
  });
});
