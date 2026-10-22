import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { isCurrentOrganizationAccess } from '@/hooks/useDocumentActionPermissions';
import { captureOfflineContext } from '@/utils/courseCache';
import { captureDocumentRegistryScope, registryScopeCurrent, DocumentRegistryError, normalizeRegistryError, prepareDocumentRegistryMutation, readDocumentRegistry } from '@/lib/documentRegistry/client';
import type { RegistryAction, RegistryCapabilities, RegistryErrorCode, RegistryFilters, RegistryIncoming, RegistryMutation, RegistryQuery, RegistryRecord, RegistryScope } from '@/lib/documentRegistry/contract';

const zero = { total: 0, incoming: 0, outgoing: 0, contracts: 0, orders: 0 };
type View = { key: string; records: RegistryRecord[]; incoming: RegistryIncoming[]; next: string | null; counts: typeof zero; capabilities: RegistryCapabilities | null; registryRevision: number; loading: boolean; error: RegistryErrorCode | null };
function maskDowngrade(view: View, caps: RegistryCapabilities) {
  const lostFile = !!view.capabilities?.can_open_file && !caps.can_open_file;
  return {
    records: !caps.can_read ? [] : view.records.map(row => ({ ...row,
      ...(lostFile ? { source_label: null, source_available: false, can_open_file: false, can_correct: false } : {}),
      ...(!caps.can_correct ? { can_correct: false } : {}), ...(!caps.can_archive ? { can_archive: false } : {}),
    })),
    incoming: !caps.can_read_incoming ? [] : view.incoming.map(row => ({ ...row,
      ...(lostFile ? { source_label: null, source_available: false, can_open_file: false } : {}), ...(!caps.can_register_incoming ? { can_register: false } : {}),
    })),
  };
}
export function useDocumentRegistry(organizationId: string, registryScope: RegistryScope, mode: 'registry' | 'incoming' = 'registry') {
  const auth = useAuth(), permissions = useStaffPermissions(), offline = captureOfflineContext();
  const ready = !auth.loading && !!auth.user?.id && !permissions.loading && !permissions.error && isCurrentOrganizationAccess(permissions, organizationId)
    && (permissions.can('journals.read') || permissions.can('documents.read') || permissions.can('documents.write'));
  const identity = JSON.stringify([organizationId, registryScope, mode, auth.user?.id, auth.userRole, auth.loading, offline?.revision, permissions.organizationId, permissions.loading, permissions.error, permissions.orgRole, permissions.adminRole, [...permissions.orgPermissions].sort(), ready]);
  const generation = useRef({ identity, value: 0 }); if (generation.current.identity !== identity) generation.current = { identity, value: generation.current.value + 1 };
  const contextKey = identity + '|' + generation.current.value, currentKey = useRef(contextKey); currentKey.current = contextKey;
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scope = useMemo(() => { if (!ready) return null; try { return captureDocumentRegistryScope(organizationId, registryScope, () => mounted.current && currentKey.current === contextKey); } catch { return null; } }, [contextKey]);
  const [filters, setFilters] = useState<RegistryFilters>({ direction: 'all', document_type: 'all', status: 'registered', date_from: new Date().getFullYear() + '-01-01', date_to: new Date().getFullYear() + '-12-31', text: '' });
  const queryKey = contextKey + '|' + JSON.stringify(filters), activeQuery = useRef(queryKey); activeQuery.current = queryKey;
  const empty = (loading = !!scope): View => ({ key: queryKey, records: [], incoming: [], next: null, counts: zero, capabilities: null, registryRevision: 0, loading, error: null });
  const [view, setView] = useState<View>(() => empty()), [savingKey, setSavingKey] = useState<string | null>(null), [pendingKey, setPendingKey] = useState<string | null>(null), [mutationError, setMutationError] = useState<{ key: string; code: RegistryErrorCode } | null>(null);
  const sequence = useRef(0), pageBusy = useRef(false), running = useRef<string | null>(null), pending = useRef<{ key: string; plan: ReturnType<typeof prepareDocumentRegistryMutation> } | null>(null);
  const scopeCurrent = useCallback(() => !!scope && registryScopeCurrent(scope), [scope]);
  const deny = useCallback((code: RegistryErrorCode) => setView(old => old.key === activeQuery.current ? { ...old, loading: false, error: code,
    ...(['ACCESS_DENIED', 'SOURCE_UNAVAILABLE', 'NOT_FOUND'].includes(code) ? { records: [], incoming: [], capabilities: null, counts: zero } : {}) } : old), [contextKey]);
  const reload = useCallback(async () => {
    if (!scope || !registryScopeCurrent(scope)) return;
    const ticket = ++sequence.current, expectedQuery = queryKey; pageBusy.current = false;
    setView(old => old.key === expectedQuery ? { ...old, loading: true, error: null } : empty());
    try {
      const result = await readDocumentRegistry(scope, mode === 'incoming' ? { kind: 'incoming', after_id: null, limit: 100 } : { kind: 'list', filters, after: null, limit: 100 });
      if (!registryScopeCurrent(scope) || ticket !== sequence.current || activeQuery.current !== expectedQuery) return;
      if (result.kind === 'list') setView({ key: expectedQuery, records: result.records, incoming: [], next: result.next_cursor, counts: result.counts, capabilities: result.capabilities, registryRevision: result.registry_revision, loading: false, error: null });
      else if (result.kind === 'incoming') setView({ key: expectedQuery, records: [], incoming: result.incoming, next: result.next_after_id, counts: zero, capabilities: result.capabilities, registryRevision: result.registry_revision, loading: false, error: null });
    } catch (error) { if (registryScopeCurrent(scope) && ticket === sequence.current && activeQuery.current === expectedQuery) deny(normalizeRegistryError(error).code); }
  }, [scope, mode, queryKey, filters, deny]);
  useEffect(() => { sequence.current++; running.current = null; pending.current = null; setSavingKey(null); setPendingKey(null); setMutationError(null); }, [contextKey]);
  useEffect(() => { sequence.current++; void reload(); }, [reload]);
  const read = useCallback(async (query: RegistryQuery) => {
    if (!scope) throw new DocumentRegistryError('ACCESS_DENIED');
    try {
      const result = await readDocumentRegistry(scope, query); if (!registryScopeCurrent(scope)) throw new DocumentRegistryError('ACCESS_DENIED');
      setView(old => old.key.startsWith(contextKey + '|') ? { ...old, ...maskDowngrade(old, result.capabilities), capabilities: result.capabilities, registryRevision: Math.max(old.registryRevision, result.registry_revision) } : old);
      return result;
    } catch (error) { const normalized = normalizeRegistryError(error); if (registryScopeCurrent(scope) && ['ACCESS_DENIED', 'SOURCE_UNAVAILABLE', 'NOT_FOUND'].includes(normalized.code)) deny(normalized.code); throw normalized; }
  }, [scope, contextKey, deny]);
  const loadMore = useCallback(async () => {
    if (!scope || !registryScopeCurrent(scope) || view.key !== queryKey || view.loading || !view.next || pageBusy.current || running.current === contextKey) return;
    const ticket = ++sequence.current; pageBusy.current = true;
    try {
      const result = await readDocumentRegistry(scope, mode === 'incoming' ? { kind: 'incoming', after_id: view.next, limit: 100 } : { kind: 'list', filters, after: view.next, limit: 100 });
      if (!registryScopeCurrent(scope) || ticket !== sequence.current || activeQuery.current !== queryKey) return;
      setView(old => old.key !== queryKey ? old : result.kind === 'list' ? { ...old, records: [...maskDowngrade(old, result.capabilities).records, ...result.records.filter(row => !old.records.some(known => known.id === row.id))], next: result.next_cursor, counts: result.counts, capabilities: result.capabilities, registryRevision: result.registry_revision }
        : result.kind === 'incoming' ? { ...old, incoming: [...maskDowngrade(old, result.capabilities).incoming, ...result.incoming.filter(row => !old.incoming.some(known => known.id === row.id))], next: result.next_after_id, capabilities: result.capabilities, registryRevision: result.registry_revision } : old);
    } catch (error) { if (registryScopeCurrent(scope) && ticket === sequence.current) deny(normalizeRegistryError(error).code); }
    finally { if (ticket === sequence.current) pageBusy.current = false; }
  }, [scope, view, queryKey, filters, mode, contextKey, deny]);
  const perform = useCallback(async (plan: ReturnType<typeof prepareDocumentRegistryMutation>): Promise<RegistryMutation> => {
    if (!scope || !registryScopeCurrent(scope) || running.current === contextKey) throw new DocumentRegistryError('ACCESS_DENIED');
    running.current = contextKey; sequence.current++; pageBusy.current = false; setSavingKey(contextKey); setMutationError(null);
    try {
      const result = await plan.run(); if (!registryScopeCurrent(scope)) throw new DocumentRegistryError('ACCESS_DENIED');
      pending.current = null; setPendingKey(null);
      setView(old => old.key.startsWith(contextKey + '|') ? { ...old, ...maskDowngrade(old, result.capabilities), capabilities: result.capabilities, registryRevision: result.registry_revision, error: null, loading: false } : old);
      return result;
    } catch (error) {
      const normalized = normalizeRegistryError(error);
      if (registryScopeCurrent(scope)) {
        setMutationError({ key: contextKey, code: normalized.code });
        const rejectedNew = normalized.code === 'REVISION_CONFLICT' && ['register', 'register_incoming', 'capture_incoming'].includes(plan.action.action);
        if (normalized.code !== 'DEPENDENCY_UNAVAILABLE' && !rejectedNew) { pending.current = null; setPendingKey(null); }
        if (['ACCESS_DENIED', 'SOURCE_UNAVAILABLE', 'NOT_FOUND'].includes(normalized.code)) deny(normalized.code);
      }
      throw normalized;
    } finally { if (registryScopeCurrent(scope) && running.current === contextKey) { running.current = null; setSavingKey(null); } }
  }, [scope, contextKey, deny]);
  const mutate = useCallback(async (expectedRevision: number, action: RegistryAction) => {
    if (!scope || !registryScopeCurrent(scope) || view.key !== activeQuery.current || !view.capabilities || view.loading) throw new DocumentRegistryError('ACCESS_DENIED');
    const caps = view.capabilities, allowed = action.action === 'capture_incoming' ? caps.can_capture_incoming : action.action === 'register_incoming' ? caps.can_register_incoming : action.action === 'register' ? caps.can_register : action.action === 'correct' ? caps.can_correct : caps.can_archive;
    if (!allowed) throw new DocumentRegistryError('ACCESS_DENIED');
    if (pending.current?.key === contextKey || running.current === contextKey) throw new DocumentRegistryError('REQUEST_MISMATCH');
    const plan = prepareDocumentRegistryMutation(scope, expectedRevision, action); pending.current = { key: contextKey, plan }; setPendingKey(contextKey); return perform(plan);
  }, [scope, view, contextKey, perform]);
  const retry = useCallback(async () => { if (!scope || pending.current?.key !== contextKey) throw new DocumentRegistryError('SOURCE_UNAVAILABLE'); return perform(pending.current.plan); }, [scope, contextKey, perform]);
  const cancelRejected = useCallback(() => {
    if (!scope || !registryScopeCurrent(scope) || running.current === contextKey || mutationError?.key !== contextKey || mutationError.code !== 'REVISION_CONFLICT' || pending.current?.key !== contextKey || !['register', 'register_incoming', 'capture_incoming'].includes(pending.current.plan.action.action)) return false;
    pending.current = null; setPendingKey(null); setMutationError(null); return true;
  }, [scope, contextKey, mutationError]);
  const visible = view.key === queryKey ? view : empty();
  return { organizationId, registryScope, mode, contextKey, scope, scopeCurrent, filters, setFilters, records: visible.records, incoming: visible.incoming, next: visible.next, counts: visible.counts, capabilities: visible.capabilities, registryRevision: visible.registryRevision,
    loading: visible.loading || auth.loading || permissions.loading, error: !scope && !auth.loading && !permissions.loading ? 'ACCESS_DENIED' as const : visible.error,
    saving: savingKey === contextKey, pending: pendingKey === contextKey, mutationError: mutationError?.key === contextKey ? mutationError.code : null, read, reload, loadMore, mutate, retry, cancelRejected };
}
export type DocumentRegistryModel = ReturnType<typeof useDocumentRegistry>;
