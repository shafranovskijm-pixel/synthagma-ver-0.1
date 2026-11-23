import { useEffect, useRef, useState } from 'react';
import { captureDocumentChainScope, documentChainScopeCurrent, normalizeChainError, readDocumentChain, type DocumentChainScope } from '@/lib/documentChain/client';
import type { ChainDetailRead, ChainListRead, ChainRow, ChainScope } from '@/lib/documentChain/contract';

export function useDocumentChain(organizationId: string, target: ChainScope, enabled: boolean, accessKey: string, ownOnly = false) {
  const key = JSON.stringify([organizationId, target, enabled, accessKey, ownOnly]);
  const currentKey = useRef(key); currentKey.current = key;
  const mounted = useRef(true), epoch = useRef(0), scope = useRef<DocumentChainScope | null>(null), loadingMoreRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; loading: boolean; error: string | null; data: ChainListRead | ChainDetailRead | null }>({ key, loading: enabled, error: null, data: null });
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; }; }, []);
  useEffect(() => {
    const ticket = ++epoch.current, controller = new AbortController();
    scope.current = null; loadingMoreRef.current = false; setLoadingMore(false);
    setState({ key, loading: enabled, error: null, data: null });
    if (!enabled) return () => controller.abort();
    const current = () => mounted.current && currentKey.current === key && epoch.current === ticket && !controller.signal.aborted;
    void (async () => {
      try {
        const captured = captureDocumentChainScope(organizationId, target, current, controller.signal); scope.current = captured;
        if (ownOnly) captured.expectedViewer = 'self';
        const value = await readDocumentChain(captured, target.kind === 'student' && target.enrollment_id
          ? { kind: 'detail', enrollment_id: target.enrollment_id, group_id: target.group_id }
          : { kind: 'list', after_enrollment_id: null, limit: 20 });
        if (current() && documentChainScopeCurrent(captured) && (value.kind === 'list' || value.kind === 'detail')) setState({ key, loading: false, error: null, data: value });
      } catch (error) { if (current()) setState({ key, loading: false, error: normalizeChainError(error).message, data: null }); }
    })();
    return () => { controller.abort(); scope.current = null; };
    // The normalized key, rather than fresh object identities, owns the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);
  const visible = state.key === key ? state : { key, loading: enabled, error: null, data: null };
  const data = visible.data;
  const rows: ChainRow[] = data?.kind === 'list' ? data.rows : data?.row ? [data.row] : [];
  const loadMore = async () => {
    const captured = scope.current;
    if (!captured || loadingMoreRef.current || data?.kind !== 'list' || !data.next_after_enrollment_id) return;
    const ticket = epoch.current, cursor = data.next_after_enrollment_id;
    loadingMoreRef.current = true; setLoadingMore(true);
    try {
      const value = await readDocumentChain(captured, { kind: 'list', after_enrollment_id: cursor, limit: 20 });
      if (!mounted.current || currentKey.current !== key || epoch.current !== ticket || !documentChainScopeCurrent(captured) || value.kind !== 'list') return;
      if (value.availability !== 'available') throw new Error();
      setState(previous => previous.key !== key || previous.data?.kind !== 'list' || previous.data.next_after_enrollment_id !== cursor ? previous
        : { ...previous, error: null, data: { ...value, rows: [...previous.data.rows, ...value.rows] } });
    } catch (error) { if (mounted.current && currentKey.current === key && epoch.current === ticket) setState(previous => previous.key === key ? { ...previous, error: normalizeChainError(error).message } : previous); }
    finally { if (mounted.current && currentKey.current === key && epoch.current === ticket) { loadingMoreRef.current = false; setLoadingMore(false); } }
  };
  return { ...visible, rows, loadingMore, loadMore, refresh: () => setRevision(value => value + 1) };
}
