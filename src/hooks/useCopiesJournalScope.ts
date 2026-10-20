import { useLayoutEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isCurrentOrganizationAccess } from "@/hooks/useDocumentActionPermissions";

export interface CopiesJournalScope {
  organizationId: string;
  actorId: string | null;
  actorRole: string | null;
  viewKey: string;
  ready: boolean;
  active: boolean;
}

/** A lifetime token, not an authorization grant. Existing workspace rights still apply. */
export function useCopiesJournalScope(organizationId: string, viewKey = "") {
  const { user, userRole, loading } = useAuth();
  const permissions = useStaffPermissions();
  const actorId = user?.id ?? null;
  const actorRole = userRole ?? null;
  // The organization prop can lag behind a changed actor. Require the existing
  // resolved workspace/read permission as well; the legacy no-provider fallback
  // is not confirmation. This adds no write permission or role grant.
  const ready = Boolean(organizationId && actorId && !loading
    && isCurrentOrganizationAccess(permissions, organizationId) && permissions.can("journals.read"));
  const current = useRef<CopiesJournalScope | null>(null);
  if (!current.current || current.current.organizationId !== organizationId
    || current.current.actorId !== actorId || current.current.actorRole !== actorRole
    || current.current.viewKey !== viewKey || current.current.ready !== ready) {
    if (current.current) current.current.active = false;
    current.current = { organizationId, actorId, actorRole, viewKey, ready, active: false };
  }
  const scope = current.current;
  useLayoutEffect(() => {
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  // Object identity also rejects old A callbacks after A -> B -> A.
  const isCurrent = () => current.current === scope && scope.ready && scope.active;
  return { scope, isCurrent };
}
