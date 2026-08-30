import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = resolve(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

const srcText = sourceFiles(resolve(process.cwd(), "src"))
  .filter((path) => /\.[cm]?[jt]sx?$/.test(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const specialClient = read("src/components/landing/SpecialOfferPopup.tsx");
const registrationClient = read("src/hooks/useRegisterOrganization.ts");
const supportClient = read("src/components/onboarding/SupportRequestForm.tsx");
const orgTestClient = read("src/components/organization/OrgShowcaseAndTelegramSection.tsx");
const subscriptionClient = read("src/hooks/useSubscriptionTab.ts");

const specialEdge = read("supabase/functions/submit-special-offer-request/index.ts");
const registrationEdge = read("supabase/functions/notify-organization-registration/index.ts");
const supportEdge = read("supabase/functions/notify-support-request/index.ts");
const orgTestEdge = read("supabase/functions/test-organization-telegram/index.ts");
const subscriptionEdge = read("supabase/functions/request-subscription-upgrade/index.ts");
const delivery = read("supabase/functions/_shared/telegram-domain-delivery.ts");
const migration = read("supabase/migrations/20260830221500_telegram_domain_delivery_claim.sql");
const config = read("supabase/config.toml");

describe("browser Telegram boundary", () => {
  it("contains no direct browser invocation of the arbitrary Telegram relay", () => {
    expect(srcText).not.toMatch(/\.functions\.invoke\(\s*["']send-telegram-notification["']/);
  });

  it("routes all five callers through narrow domain endpoints", () => {
    expect(specialClient).toContain('functions.invoke("submit-special-offer-request"');
    expect(registrationClient).toContain('functions.invoke("notify-organization-registration"');
    expect(supportClient).toContain('functions.invoke("notify-support-request"');
    expect(orgTestClient).toContain('functions.invoke("test-organization-telegram"');
    expect(subscriptionClient).toContain('functions.invoke("request-subscription-upgrade"');
  });
});

describe("durability, actors and server-owned Telegram content", () => {
  it("persists anonymous special-offer leads before claiming notification delivery", () => {
    expect(specialEdge.indexOf('.from("plan_requests")')).toBeGreaterThanOrEqual(0);
    expect(specialEdge.indexOf('const delivery = await deliverTelegramDomainNotification')).toBeGreaterThan(specialEdge.indexOf('.from("plan_requests")'));
    expect(specialEdge).toContain('.from("landing_popups")');
    expect(specialEdge).toContain("clientAddress(req)");
    expect(specialEdge).toContain("request_id_conflict");
    expect(specialEdge).toContain("supportTelegramChatId()");
  });

  it("authenticates registration notification and loads the owned organization", () => {
    expect(registrationEdge).toContain("userClient.auth.getUser()");
    expect(registrationEdge).toMatch(/can_access_organization[\s\S]*?settings\.write/);
    expect(registrationEdge).toContain('.from("organizations")');
    expect(registrationEdge).toContain('.from("subscription_requests")');
    expect(registrationEdge).toContain("supportTelegramChatId()");
  });

  it("notifies only an authenticated actor's persisted support request", () => {
    expect(supportEdge).toContain("userClient.auth.getUser()");
    expect(supportEdge).toMatch(/\.from\("support_requests"\)[\s\S]*?\.eq\("user_id", authData\.user\.id\)/);
    expect(supportEdge).toContain("organization_mismatch");
    expect(supportEdge).toContain("isTrustedSupabaseStorageUrl");
    expect(supportEdge).toContain("supportTelegramChatId()");
    expect(supportClient.indexOf('.from("support_requests")')).toBeLessThan(supportClient.indexOf('functions.invoke("notify-support-request"'));
  });

  it("loads an organization's saved chat id for an authorized test", () => {
    expect(orgTestEdge).toContain("userClient.auth.getUser()");
    expect(orgTestEdge).toMatch(/can_access_organization[\s\S]*?settings\.write/);
    expect(orgTestEdge).toContain("telegram_notify_chat_id");
    expect(orgTestEdge).toContain("targetChatId: organization.telegram_notify_chat_id");
    expect(orgTestEdge).not.toMatch(/body\.chat_id|body\.message/);
  });

  it("persists subscription requests with server-loaded organization and current plan", () => {
    expect(subscriptionEdge).toContain("userClient.auth.getUser()");
    expect(subscriptionEdge).toMatch(/can_access_organization[\s\S]*?settings\.write/);
    expect(subscriptionEdge).toContain('.from("organizations")');
    expect(subscriptionEdge).toContain("organization.subscription_plan");
    expect(subscriptionEdge.indexOf('.from("subscription_requests")')).toBeLessThan(subscriptionEdge.indexOf("const delivery = await deliverTelegramDomainNotification"));
    expect(subscriptionEdge).toContain("request_id_conflict");
    expect(subscriptionEdge).toContain("supportTelegramChatId()");
  });
});

describe("persistent Telegram delivery claim", () => {
  it("atomically combines persistent rate limiting with the existing dedup log", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.telegram_domain_rate_limits");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("public.notification_dedup_log");
    expect(migration).toContain("ON CONFLICT (key) DO NOTHING");
    expect(migration).toContain("RETURN 'rate_limited'");
    expect(migration).toContain("RETURN 'duplicate'");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.claim_telegram_domain_delivery[\s\S]*?FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_telegram_domain_delivery[\s\S]*?TO service_role/);
  });

  it("keeps arbitrary relay invocation on the server and fixes support target to env", () => {
    expect(delivery).toContain('Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID")');
    expect(delivery).toContain('admin.functions.invoke(\n      "send-telegram-notification"');
    expect(delivery).toContain('admin.rpc(\n    "claim_telegram_domain_delivery"');
  });

  it("allows only the public lead endpoint without a JWT gateway", () => {
    expect(config).toMatch(/\[functions\.submit-special-offer-request\]\s+verify_jwt = false/);
    for (const name of [
      "notify-organization-registration",
      "notify-support-request",
      "test-organization-telegram",
      "request-subscription-upgrade",
    ]) {
      expect(config).toMatch(new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = true`));
    }
  });
});
