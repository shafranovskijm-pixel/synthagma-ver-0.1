import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hasVerifiedAdminRole, type RoleLookupClient } from "./admin-role";

const verifiedUserId = "00000000-0000-4000-8000-000000000001";

function clientFor(data: { role: string } | null, error: unknown = null) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.eq.mockReturnValue(query);
  const select = vi.fn().mockReturnValue(query);
  const client = { from: vi.fn().mockReturnValue({ select }) };
  return { client: client as RoleLookupClient, from: client.from, select, query };
}

describe("run-email-campaign verified admin role", () => {
  it("uses only the verified caller's stored admin role, without overloaded RPC", async () => {
    const { client, from, select, query } = clientFor({ role: "admin" });
    await expect(hasVerifiedAdminRole(client, verifiedUserId)).resolves.toBe(true);
    expect(from).toHaveBeenCalledExactlyOnceWith("user_roles");
    expect(select).toHaveBeenCalledExactlyOnceWith("role");
    expect(query.eq.mock.calls).toEqual([["user_id", verifiedUserId], ["role", "admin"]]);
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it.each([null, { role: "user" }, { role: "organization_admin" }, { role: "ADMIN" }])(
    "does not grant platform-admin access for %j", async (data) => {
      await expect(hasVerifiedAdminRole(clientFor(data).client, verifiedUserId)).resolves.toBe(false);
    },
  );

  it("fails closed on lookup error even if data also contains admin", async () => {
    await expect(hasVerifiedAdminRole(clientFor({ role: "admin" }, { message: "private DB detail" }).client, verifiedUserId))
      .rejects.toThrow("Admin role lookup failed");
  });

  it("does not query roles without a verified user id", async () => {
    const { client, from } = clientFor({ role: "admin" });
    await expect(hasVerifiedAdminRole(client, "")).rejects.toThrow("Verified user required");
    expect(from).not.toHaveBeenCalled();
  });

  it("does not convert a transport exception to authorized=true", async () => {
    const { client, query } = clientFor(null);
    query.maybeSingle.mockRejectedValueOnce(new Error("transport unavailable"));
    await expect(hasVerifiedAdminRole(client, verifiedUserId)).rejects.toThrow("transport unavailable");
  });
});

describe("runner authorization wiring regression", () => {
  const source = readFileSync(resolve(process.cwd(), "supabase/functions/run-email-campaign/index.ts"), "utf8").replace(/\r\n/g, "\n");
  it("authenticates before role lookup and uses getUser id rather than body data", () => {
    const auth = source.indexOf("if (!userData?.user) return json({ error: \"Unauthorized\" }, 401)");
    const userId = source.indexOf("const userId = userData.user.id");
    const lookup = source.indexOf("hasVerifiedAdminRole(userClient, userId)");
    expect(auth).toBeGreaterThan(-1);
    expect(userId).toBeGreaterThan(auth);
    expect(lookup).toBeGreaterThan(userId);
    expect(source).not.toMatch(/\.rpc\(["']has_role["']/);
  });
  it("fails before consent, quota and SMTP when role lookup fails", () => {
    const failure = source.indexOf('return json({ error: "Не удалось проверить права запуска рассылки" }, 500)');
    expect(failure).toBeGreaterThan(-1);
    for (const effect of ['admin.rpc("confirm_campaign_send_consent_admin"', '"resolve_campaign_recipients"', 'admin.rpc("consume_email_quota"', 'admin.functions.invoke("send-campaign-email"']) {
      expect(source.indexOf(effect)).toBeGreaterThan(failure);
    }
  });
  it("retains service-role, platform-admin, organization permission and consent gates", () => {
    expect(source).toContain('bearer.length > 0 && bearer === SERVICE_KEY');
    expect(source).toContain('if (isServiceRole) {\n      authorized = true;');
    expect(source).toContain('campaign.scope === "platform"');
    expect(source).toContain('authorized = isAdmin;');
    expect(source).toContain('userClient.rpc("can_access_organization"');
    expect(source).toContain('_permission: "sales.write"');
    expect(source).toContain('authorized = writeRow === true');
    expect(source).toContain('if (!authorized) return json({ error: "Forbidden" }, 403)');
    expect(source).toContain('if (!consentConfirmed)');
    expect(source).toContain('admin.rpc("confirm_campaign_send_consent_admin"');
  });
});
