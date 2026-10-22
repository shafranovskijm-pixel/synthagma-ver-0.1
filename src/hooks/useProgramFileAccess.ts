import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { isCurrentOrganizationAccess } from '@/hooks/useDocumentActionPermissions';
import { captureOfflineContext, captureOfflineAuthRevision } from '@/utils/courseCache';
import { captureProgramFileScope, type ProgramFileScope } from '@/lib/programFiles';

/** Render owner changes before passive reset, so an observed A→B→A never revives old state. */
export function useProgramFileAccess(organizationId: string, canConfigure: boolean) {
  const { user } = useAuth();
  const permissions = useStaffPermissions();
  const ready = isCurrentOrganizationAccess(permissions, organizationId);
  const canRead = ready && (permissions.can('documents.read') || permissions.can('documents.write'));
  const canWrite = ready && canConfigure && permissions.can('documents.write') &&
    !(permissions.organizationId === null && ['viewer','sales_manager'].includes(permissions.adminRole ?? ''));
  const actor = captureOfflineContext();
  const key = JSON.stringify([user?.id ?? null, organizationId, canConfigure, canRead, canWrite,
    permissions.organizationId, permissions.loading, permissions.error, permissions.orgRole, permissions.adminRole,
    [...permissions.orgPermissions].sort(), [...permissions.adminSections].sort(), actor?.revision ?? captureOfflineAuthRevision()]);
  const owner = useRef({ key, epoch: 0 });
  if (owner.current.key !== key) owner.current = { key, epoch: owner.current.epoch + 1 };
  const epoch = owner.current.epoch;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scope = useMemo((): ProgramFileScope | null => {
    if (!user?.id || !actor || user.id !== actor.actorId || !canRead) return null;
    try { return captureProgramFileScope(organizationId, key + ':' + epoch,
      () => mounted.current && owner.current.key === key && owner.current.epoch === epoch); } catch { return null; }
  }, [key, epoch]);
  return { scope, canRead, canWrite, loading: permissions.loading, ownerKey: key + ':' + epoch };
}
