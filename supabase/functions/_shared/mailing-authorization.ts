// Caller-scoped RPCs only. A service client does not carry the user's auth.uid().
export interface MailingPermissionClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export async function mailingAccountActive(client: MailingPermissionClient): Promise<boolean> {
  const result = await client.rpc("account_deletion_access_allowed");
  return !result.error && result.data === true;
}

export async function canManageMailing(client: MailingPermissionClient, organizationId: string): Promise<boolean> {
  if (!organizationId || !await mailingAccountActive(client)) return false;
  const result = await client.rpc("can_access_organization", {
    _organization_id: organizationId,
    _permission: "sales.write",
  });
  return !result.error && result.data === true;
}
