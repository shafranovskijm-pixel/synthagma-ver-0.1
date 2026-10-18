import { useStaffPermissions } from "@/hooks/useStaffPermissions";

/** UI convenience only. The RPC/RLS remains authoritative for each row/group. */
export function isCurrentOrganizationAccess(permissions: ReturnType<typeof useStaffPermissions>, organizationId: string) {
  // The legacy no-provider fallback has can() === true. Never use it to
  // advertise signature/issuance actions, or another workspace's privileges.
  return !!organizationId && !permissions.loading && !permissions.error &&
    (permissions.organizationId === organizationId ||
      (permissions.organizationId === null && permissions.isOrgOwner && permissions.orgPermissions.size > 0));
}

export function useDocumentActionPermissions(organizationId: string) {
  const permissions = useStaffPermissions();
  const ready = isCurrentOrganizationAccess(permissions, organizationId);
  const platformRole = permissions.organizationId === null ? permissions.adminRole : null;
  const canActForOrganization = ready && platformRole !== "viewer" && platformRole !== "sales_manager";
  return {
    canIssue: canActForOrganization && permissions.can("documents.issue"),
    canSign: canActForOrganization && permissions.can("documents.sign"),
    canWrite: canActForOrganization && permissions.can("documents.write"),
    canSalesWrite: ready && platformRole !== "viewer" && permissions.can("sales.write"),
  };
}
