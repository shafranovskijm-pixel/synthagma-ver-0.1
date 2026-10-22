import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { isCurrentOrganizationAccess } from '@/hooks/useDocumentActionPermissions';
import { captureOfflineContext } from '@/utils/courseCache';
import { captureCopyRegistryScope, copyRegistryScopeCurrent, CopyRegistryError, normalizeCopyRegistryError, prepareCopyRegistryMutation, readCopyRegistry } from '@/lib/copyRegistry/client';
import type { CopyAction, CopyCapabilities, CopyErrorCode, CopyMutation, CopyQuery, CopyRecord, CopyScope } from '@/lib/copyRegistry/contract';

type View = { key: string; records: CopyRecord[]; next: string | null; capabilities: CopyCapabilities | null; registryRevision: number; loading: boolean; error: CopyErrorCode | null };

function maskKnownDowngrade(view: View, next: CopyCapabilities): CopyRecord[] {
  const lostSourceAuthority = !!view.capabilities?.can_create && !next.can_create;
  if (!lostSourceAuthority && next.can_write) return view.records;
  // A fresh server envelope can learn a revocation before the permission provider refreshes.
  // Do not retain earlier private titles or advertise stale write actions in that interval.
  return view.records.map(record => ({ ...record,
    ...(lostSourceAuthority ? { original_label: null, original_available: false, can_edit: false, can_transfer: false } : {}),
    ...(!next.can_write ? { can_edit: false, can_transfer: false, can_archive: false } : {}),
  }));
}

export function useCopyRegistry(organizationId: string, registryScope: CopyScope) {
  const auth = useAuth(), permissions = useStaffPermissions(), offlineActor = captureOfflineContext();
  const ready = !auth.loading && !!auth.user?.id && !permissions.loading && !permissions.error
    && isCurrentOrganizationAccess(permissions, organizationId) && permissions.can('journals.read');
  const identity = JSON.stringify([organizationId, registryScope, auth.user?.id ?? null, auth.userRole, auth.loading, offlineActor?.revision ?? null,
    permissions.organizationId, permissions.loading, permissions.error, permissions.orgRole, permissions.adminRole, [...permissions.orgPermissions].sort(), ready]);
  const generation = useRef({ identity, number: 0 });
  if (generation.current.identity !== identity) generation.current = { identity, number: generation.current.number + 1 };
  const key = identity + '|generation:' + generation.current.number;
  const currentKey = useRef(key); currentKey.current = key;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scope = useMemo(() => {
    if (!ready) return null;
    try { return captureCopyRegistryScope(organizationId, registryScope, () => mounted.current && currentKey.current === key); }
    catch { return null; }
  }, [key]);
  const empty = (loading = !!scope): View => ({ key, records: [], next: null, capabilities: null, registryRevision: 0, loading, error: null });
  const [view, setView] = useState<View>(() => empty());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<{ key: string; code: CopyErrorCode } | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pending = useRef<{ key: string; plan: ReturnType<typeof prepareCopyRegistryMutation> } | null>(null);
  const running = useRef<string | null>(null);
  const sequence = useRef(0), paginating = useRef<number | null>(null), sequenceIdentity = useRef(key);
  if (sequenceIdentity.current !== key) { sequenceIdentity.current = key; sequence.current++; }
  const scopeCurrent = useCallback(() => !!scope && copyRegistryScopeCurrent(scope), [scope]);
  const denyView = useCallback((code: CopyErrorCode) => {
    setView(old => old.key === key ? { ...old, loading: false, error: code,
      ...(['ACCESS_DENIED', 'SOURCE_UNAVAILABLE', 'NOT_FOUND'].includes(code) ? { records: [], capabilities: null } : {}) } : old);
  }, [key]);
  const reload = useCallback(async () => {
    if (!scope || !copyRegistryScopeCurrent(scope)) return;
    const readSequence = ++sequence.current; paginating.current = null;
    setView(old => old.key === key ? { ...old, loading: true, error: null } : empty());
    try {
      const result = await readCopyRegistry(scope, { kind: 'list', after_id: null, limit: 100, archived: true });
      if (result.kind !== 'list' || readSequence !== sequence.current || !copyRegistryScopeCurrent(scope)) return;
      setView({ key, records: result.records, next: result.next_after_id, capabilities: result.capabilities, registryRevision: result.registry_revision, loading: false, error: null });
    } catch (error) { if (readSequence === sequence.current && copyRegistryScopeCurrent(scope)) denyView(normalizeCopyRegistryError(error).code); }
  }, [scope, key, denyView]);
  useEffect(() => {
    sequence.current++; paginating.current = null; running.current = null; pending.current = null;
    setPendingKey(null); setMutationError(null); setSavingKey(null); setView(empty());
    void reload();
  }, [scope, key]);
  const read = useCallback(async (query: CopyQuery) => {
    if (!scope) throw new CopyRegistryError('ACCESS_DENIED');
    try {
      const result = await readCopyRegistry(scope, query);
      if (!copyRegistryScopeCurrent(scope)) throw new CopyRegistryError('ACCESS_DENIED');
      setView(old => old.key === key ? { ...old, records: maskKnownDowngrade(old, result.capabilities), capabilities: result.capabilities, registryRevision: Math.max(old.registryRevision, result.registry_revision) } : old);
      return result;
    } catch (error) {
      const normalized = normalizeCopyRegistryError(error);
      if (copyRegistryScopeCurrent(scope) && ['ACCESS_DENIED', 'SOURCE_UNAVAILABLE', 'NOT_FOUND'].includes(normalized.code)) denyView(normalized.code);
      throw normalized;
    }
  }, [scope, key, denyView]);
  const visible = view.key === key ? view : empty();
  const loadMore = useCallback(async () => {
    if (!scope || !copyRegistryScopeCurrent(scope) || view.key !== key || view.loading || !view.next || paginating.current !== null || running.current === key) return;
    const readSequence = ++sequence.current; paginating.current = readSequence;
    try {
      const result = await readCopyRegistry(scope, { kind: 'list', after_id: view.next, limit: 100, archived: true });
      if (result.kind !== 'list' || readSequence !== sequence.current || !copyRegistryScopeCurrent(scope)) return;
      setView(old => old.key === key ? { ...old, records: [...maskKnownDowngrade(old, result.capabilities), ...result.records.filter(row => !old.records.some(known => known.id === row.id))], next: result.next_after_id,
        capabilities: result.capabilities, registryRevision: result.registry_revision } : old);
    } catch (error) { if (readSequence === sequence.current && copyRegistryScopeCurrent(scope)) denyView(normalizeCopyRegistryError(error).code); }
    finally { if (paginating.current === readSequence) paginating.current = null; }
  }, [scope, key, view, denyView]);
  const perform = useCallback(async (plan: ReturnType<typeof prepareCopyRegistryMutation>): Promise<CopyMutation> => {
    if (!scope || !copyRegistryScopeCurrent(scope) || running.current === key) throw new CopyRegistryError('ACCESS_DENIED');
    running.current = key; sequence.current++; paginating.current = null; setSavingKey(key); setMutationError(null);
    try {
      const result = await plan.run();
      if (!copyRegistryScopeCurrent(scope)) throw new CopyRegistryError('ACCESS_DENIED');
      pending.current = null; setPendingKey(null);
      setView(old => old.key === key ? { ...old, records: maskKnownDowngrade(old, result.capabilities), capabilities: result.capabilities, registryRevision: result.registry_revision, loading: false, error: null,
        ...('record' in result ? { records: [...maskKnownDowngrade(old, result.capabilities).filter(row => row.id !== result.record.id), result.record].sort((a, b) => a.id.localeCompare(b.id)) } : {}) } : old);
      return result;
    } catch (error) {
      const normalized = normalizeCopyRegistryError(error);
      if (copyRegistryScopeCurrent(scope)) {
        setMutationError({ key, code: normalized.code });
        const retrySameRejectedCreate = normalized.code === 'REVISION_CONFLICT' && (plan.action.action === 'create' || plan.action.action === 'preview_import');
        if (normalized.code !== 'DEPENDENCY_UNAVAILABLE' && !retrySameRejectedCreate) { pending.current = null; setPendingKey(null); }
        if (['ACCESS_DENIED', 'SOURCE_UNAVAILABLE', 'NOT_FOUND'].includes(normalized.code)) denyView(normalized.code);
      }
      throw normalized;
    } finally {
      if (copyRegistryScopeCurrent(scope) && running.current === key) { sequence.current++; running.current = null; setSavingKey(null); }
    }
  }, [scope, key, denyView]);
  const mutate = useCallback(async (expectedRevision: number, action: CopyAction) => {
    if (!scope || view.key !== key || view.loading || !view.capabilities || !copyRegistryScopeCurrent(scope)) throw new CopyRegistryError('ACCESS_DENIED');
    const caps = view.capabilities;
    const allowed = action.action === 'capture_export' ? caps.can_export : action.action === 'preview_import' || action.action === 'apply_import' ? caps.can_import : action.action === 'create' ? caps.can_create : caps.can_write;
    if (!allowed) throw new CopyRegistryError('ACCESS_DENIED');
    if (pending.current?.key === key || running.current === key) throw new CopyRegistryError('REQUEST_MISMATCH');
    const plan = prepareCopyRegistryMutation(scope, expectedRevision, action);
    pending.current = { key, plan }; setPendingKey(key);
    return perform(plan);
  }, [scope, key, view, perform]);
  const retry = useCallback(async () => {
    if (!scope || pending.current?.key !== key) throw new CopyRegistryError('SOURCE_UNAVAILABLE');
    return perform(pending.current.plan);
  }, [scope, key, perform]);
  const cancelRejected = useCallback(() => {
    if (!scope || !copyRegistryScopeCurrent(scope) || running.current === key || mutationError?.key !== key || mutationError.code !== 'REVISION_CONFLICT'
      || pending.current?.key !== key || !['create', 'preview_import'].includes(pending.current.plan.action.action)) return false;
    pending.current = null; setPendingKey(null); setMutationError(null); return true;
  }, [scope, key, mutationError]);
  return { contextKey: key, organizationId, registryScope, scopeCurrent, records: visible.records, next: visible.next, capabilities: visible.capabilities,
    registryRevision: visible.registryRevision, loading: visible.loading || auth.loading || permissions.loading,
    error: !scope && !auth.loading && !permissions.loading ? 'ACCESS_DENIED' as const : visible.error, saving: savingKey === key, pending: pendingKey === key,
    mutationError: mutationError?.key === key ? mutationError.code : null, read, reload, loadMore, mutate, retry, cancelRejected };
}
export type CopyRegistryModel = ReturnType<typeof useCopyRegistry>;
