import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export type CredentialTarget = {
  id: string; user_id: string; organization_id: string | null;
  login: string | null; role: string | null; full_name: string | null; created_at: string;
};
type Request = {
  scope: number; version: number; target: string; row: string;
  controller: AbortController; timer: number | null;
};
type Snapshot = { scope: number; target: string; status: 'loading' | 'revealed' | 'failed'; version: number };
type Secret = { scope: number; target: string; row: string; value: string };
type SingleRead = { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
const readSingle = supabase.rpc.bind(supabase) as unknown as
  (name: 'get_decrypted_student_password', args: { p_user_id: string }) => SingleRead;
const isUUID = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const rowKey = (row: CredentialTarget) => JSON.stringify([
  row.id, row.user_id, row.organization_id, row.login, row.role, row.full_name, row.created_at,
]);
const isPassword = (value: unknown): value is string => typeof value === 'string'
  && value.trim().length > 0 && value.length <= 4096 && !value.includes('\0')
  && !/^ENC:/i.test(value) && !/^[\s•*]+$/.test(value);

/** Explicit one-row display only. The existing RPC repeats server authority. */
export function useExplicitUserCredential(rows: readonly CredentialTarget[], viewKey: string) {
  const { user, session, userRole, loading, authError } = useAuth();
  const actor = user?.id ?? null;
  const ready = !!actor && session?.user?.id === actor && userRole === 'admin'
    && !loading && !authError && typeof session?.expires_at === 'number'
    && session.expires_at * 1000 > Date.now();
  const key = JSON.stringify([actor, ready, viewKey, rows.map(rowKey)]);
  const scope = useRef({ key, session, generation: 0 });
  // A→B→A and renewed sessions cannot reuse an earlier request generation.
  if (scope.current.key !== key || scope.current.session !== session) {
    scope.current = { key, session, generation: scope.current.generation + 1 };
  }
  const generation = scope.current.generation;
  const sequence = useRef(0);
  const pending = useRef<Request | null>(null);
  const secret = useRef<Secret | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const currentRows = useRef(rows);
  currentRows.current = rows;
  const eligible = (id: string) => currentRows.current.find(row =>
    isUUID(id) && row.user_id === id && row.role === 'student' && typeof row.login === 'string' && !!row.login);
  const currentScope = () => ready && document.visibilityState === 'visible' && scope.current.key === key
    && scope.current.session === session && scope.current.generation === generation
    && typeof session?.expires_at === 'number' && session.expires_at * 1000 > Date.now();

  const clear = useCallback((onlyUserId?: string) => {
    if (onlyUserId && secret.current?.target !== onlyUserId && pending.current?.target !== onlyUserId) return;
    sequence.current++;
    const previous = pending.current;
    pending.current = null;
    if (previous) {
      previous.controller.abort();
      if (previous.timer !== null) window.clearTimeout(previous.timer);
    }
    secret.current = null;
    setSnapshot(null);
  }, []);

  useEffect(() => {
    // Plaintext is never stored in the users list or hidden React state.
    secret.current = null;
    setSnapshot(null);
    const stale = pending.current;
    if (stale && stale.scope !== generation) {
      pending.current = null;
      stale.controller.abort();
      if (stale.timer !== null) window.clearTimeout(stale.timer);
    }
    const onHidden = () => { if (document.visibilityState !== 'visible') clear(); };
    const onBlur = () => clear();
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHidden);
    const expiry = ready && typeof session?.expires_at === 'number'
      ? window.setTimeout(clear, Math.min(2147483647, Math.max(0, session.expires_at * 1000 - Date.now())))
      : null;
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHidden);
      if (expiry !== null) window.clearTimeout(expiry);
      if (secret.current?.scope === generation) secret.current = null;
      const request = pending.current;
      if (request?.scope === generation) {
        pending.current = null;
        request.controller.abort();
        if (request.timer !== null) window.clearTimeout(request.timer);
      }
    };
  }, [key, session, generation, ready, clear]);

  const toggle = async (userId: string) => {
    if (!currentScope() || !userId) { clear(); return; }
    const row = eligible(userId);
    if (!row) { clear(); return; }
    if (secret.current?.scope === generation && secret.current.target === userId
      || pending.current?.scope === generation && pending.current.target === userId) { clear(); return; }
    clear();
    const request: Request = {
      scope: generation, version: ++sequence.current, target: userId,
      row: rowKey(row), controller: new AbortController(), timer: null,
    };
    const isCurrent = () => currentScope() && pending.current === request
      && request.version === sequence.current && !request.controller.signal.aborted
      && !!eligible(userId) && rowKey(eligible(userId)!) === request.row;
    pending.current = request;
    setSnapshot({ scope: generation, target: userId, status: 'loading', version: request.version });
    request.timer = window.setTimeout(() => {
      const announce = isCurrent();
      // A deadline always aborts its physical fetch, even after context becomes invalid.
      request.controller.abort();
      if (pending.current !== request) return;
      pending.current = null; sequence.current++; secret.current = null;
      setSnapshot(previous => announce
        ? { scope: generation, target: userId, status: 'failed', version: request.version }
        : previous?.version === request.version ? null : previous);
    }, 12000);
    try {
      const { data, error } = await readSingle('get_decrypted_student_password', {
        p_user_id: userId,
      }).abortSignal(request.controller.signal);
      if (!isCurrent()) return;
      if (error || !isPassword(data)) throw Error('CREDENTIAL_UNAVAILABLE');
      secret.current = { scope: generation, target: userId, row: request.row, value: data };
      setSnapshot({ scope: generation, target: userId, status: 'revealed', version: request.version });
    } catch {
      if (isCurrent()) {
        secret.current = null;
        setSnapshot({ scope: generation, target: userId, status: 'failed', version: request.version });
      }
    } finally {
      if (request.timer !== null) window.clearTimeout(request.timer);
      if (pending.current === request) pending.current = null;
    }
  };

  const passwordFor = (userId: string): string | null => {
    const value = secret.current;
    const row = eligible(userId);
    return currentScope() && value?.scope === generation && value.target === userId
      && row && value.row === rowKey(row) && isPassword(value.value) ? value.value : null;
  };
  const currentSnapshot = currentScope() && snapshot?.scope === generation
    && !!eligible(snapshot.target) ? snapshot : null;
  return {
    toggle, clear, passwordFor,
    pendingUserId: currentSnapshot?.status === 'loading' ? currentSnapshot.target : null,
    failedVersion: currentSnapshot?.status === 'failed' ? currentSnapshot.version : null,
  };
}
