import { canManageMailing, type MailingPermissionClient } from "../../functions/_shared/mailing-authorization.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Assertion failed: ${JSON.stringify(actual)}`);
}
function client(active: boolean, allowedOrganization: string | null, failed = false) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const rpc: MailingPermissionClient = { rpc(name, args) {
    calls.push({ name, args });
    return Promise.resolve({ error: failed ? { message: "unavailable" } : null,
      data: name === "account_deletion_access_allowed" ? active : args?._organization_id === allowedOrganization });
  } };
  return { rpc, calls };
}
Deno.test("mailing write uses caller sales.write and the exact sender organization", async () => {
  const c = client(true, "org-a");
  equal(await canManageMailing(c.rpc, "org-a"), true);
  equal(c.calls, [{ name: "account_deletion_access_allowed", args: undefined },
    { name: "can_access_organization", args: { _organization_id: "org-a", _permission: "sales.write" } }]);
  equal(await canManageMailing(c.rpc, "org-b"), false);
});
Deno.test("read-only staff and failed permission lookups cannot manage mailing", async () => {
  equal(await canManageMailing(client(true, null).rpc, "org-a"), false);
  equal(await canManageMailing(client(true, "org-a", true).rpc, "org-a"), false);
});
Deno.test("revoked accounts and absent organizations stop before the write gate", async () => {
  const revoked = client(false, "org-a");
  equal(await canManageMailing(revoked.rpc, "org-a"), false);
  equal(revoked.calls.length, 1);
  const empty = client(true, "org-a");
  equal(await canManageMailing(empty.rpc, ""), false);
  equal(empty.calls.length, 0);
});
