import { useCallback, useEffect, useRef, useState } from 'react';
import { captureEducationJournalScope, educationJournalMessages, normalizeEducationJournalError, readEducationJournalWorkspace, type EducationJournalRequestScope } from '@/lib/educationJournalWorkspace/client';
import { scopeKey, type EducationJournalScope, type EducationJournalSummaryRead, type EducationJournalRowsRead, type EducationJournalType } from '@/lib/educationJournalWorkspace/contract';
import { collectEducationJournalExtract, downloadEducationJournalExtract } from '@/lib/educationJournalWorkspace/export';

interface State { key: string; loading: boolean; error: string | null; summary: EducationJournalSummaryRead | null; page: EducationJournalRowsRead | null }
export function useEducationJournalWorkspace(organizationId: string, target: EducationJournalScope, journalType: EducationJournalType | null, enabled = true, accessKey = '') {
  const key = JSON.stringify([organizationId, scopeKey(target), journalType, enabled, accessKey]);
  const currentKey = useRef(key); currentKey.current = key;
  const epoch = useRef(0), mounted = useRef(true), exportRunning = useRef(false), loadMoreRunning = useRef(false);
  const request = useRef<EducationJournalRequestScope | null>(null);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<State>({ key, loading: enabled, error: null, summary: null, page: null });
  const [exportState, setExportState] = useState({ key, busy: false, error: null as string | null });
  const isCurrent = useCallback((captured: string, generation: number) => mounted.current && currentKey.current === captured && epoch.current === generation, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; }; }, []);
  useEffect(() => {
    const generation = ++epoch.current;
    request.current = null; exportRunning.current = false; loadMoreRunning.current = false;
    setExportState({ key, busy: false, error: null });
    setState({ key, loading: enabled, error: null, summary: null, page: null });
    if (!enabled) return;
    void (async () => {
      try {
        const scope = captureEducationJournalScope(organizationId, target, () => isCurrent(key, generation));
        request.current = scope;
        const summary = await readEducationJournalWorkspace(scope, { kind: 'summary' });
        if (summary.kind !== 'summary') throw new Error('invalid_summary');
        let page: EducationJournalRowsRead | null = null;
        if (journalType) {
          const selected = summary.journals.find(row => row.journal_type === journalType);
          if (selected?.state === 'available') {
            const value = await readEducationJournalWorkspace(scope, { kind: 'rows', journal_type: journalType, after: null, limit: 100, snapshot_key: null });
            if (value.kind !== 'rows') throw new Error('invalid_rows');
            page = value;
          }
        }
        if (isCurrent(key, generation)) setState({ key, loading: false, error: null, summary, page });
      } catch (error) {
        if (isCurrent(key, generation)) setState({ key, loading: false, error: educationJournalMessages[normalizeEducationJournalError(error).code], summary: null, page: null });
      }
    })();
    return () => { epoch.current++; };
    // The serialized key includes every target and access field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);
  const visible = state.key === key ? state : { key, loading: enabled, error: null, summary: null, page: null };
  const loadMore = async () => {
    if (loadMoreRunning.current || visible.loading || visible.error || !visible.page?.next_cursor || !journalType || !request.current) return;
    const generation = epoch.current, scope = request.current, previous = visible.page;
    loadMoreRunning.current = true;
    try {
      const value = await readEducationJournalWorkspace(scope, { kind: 'rows', journal_type: journalType, after: previous.next_cursor, limit: 100, snapshot_key: previous.snapshot_key });
      if (value.kind !== 'rows' || value.total_count !== previous.total_count || JSON.stringify(value.context) !== JSON.stringify(previous.context)) throw new Error('invalid_page');
      const seen = new Set(previous.rows.map(row => row.id));
      if (value.rows.some(row => seen.has(row.id))) throw new Error('duplicate_page');
      if (isCurrent(key, generation)) setState(old => ({ ...old, page: { ...value, rows: [...previous.rows, ...value.rows] } }));
    } catch (error) {
      if (isCurrent(key, generation)) setState(old => ({ ...old, error: educationJournalMessages[normalizeEducationJournalError(error).code], page: null }));
    } finally { if (isCurrent(key, generation)) loadMoreRunning.current = false; }
  };
  const exportExtract = async (typeOverride?: EducationJournalType) => {
    const requestedType = typeOverride ?? journalType;
    const selected = visible.summary?.journals.find(row => row.journal_type === requestedType);
    if (exportRunning.current || !requestedType || !request.current || visible.loading || visible.error || !visible.summary?.capabilities.can_export || selected?.state !== 'available' || !selected.exportable) return;
    const scope = request.current, generation = epoch.current;
    exportRunning.current = true; setExportState({ key, busy: true, error: null });
    try {
      const value = await collectEducationJournalExtract(scope, requestedType);
      if (isCurrent(key, generation)) downloadEducationJournalExtract(scope, value);
    } catch (error) {
      if (isCurrent(key, generation)) setExportState({ key, busy: false, error: educationJournalMessages[normalizeEducationJournalError(error).code] });
    } finally {
      if (isCurrent(key, generation)) { exportRunning.current = false; setExportState(old => ({ ...old, busy: false })); }
    }
  };
  return { ...visible, refresh: () => setRetry(value => value + 1), loadMore, exportExtract,
    exportBusy: exportState.key === key && exportState.busy, exportError: exportState.key === key ? exportState.error : null };
}
