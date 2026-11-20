import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchGroupFolderCounts,
  EMPTY_GROUP_FOLDER_COUNTS,
  type GroupFolderCounts,
  type GroupFolderCountSeed,
} from "@/lib/groups/folderCounts";

/** Счётчики папок группы с возможностью перезапроса после генерации документов. */
export function useGroupFolderCounts(organizationId: string | null, groupId: string | null, initialRead?: GroupFolderCountSeed | null) {
  const scope = JSON.stringify([organizationId, groupId]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const generation = useRef(0);
  const [state, setState] = useState({ scope, counts: { ...EMPTY_GROUP_FOLDER_COUNTS }, loading: true, error: false });

  const read = useCallback(async (seed?: GroupFolderCountSeed | null) => {
    if (scopeRef.current !== scope) return;
    const request = ++generation.current;
    const isCurrent = () => generation.current === request && scopeRef.current === scope;
    if (!organizationId || !groupId) {
      setState({ scope, counts: { ...EMPTY_GROUP_FOLDER_COUNTS }, loading: false, error: false });
      return;
    }
    setState(current => ({ scope, counts: current.scope === scope ? current.counts : { ...EMPTY_GROUP_FOLDER_COUNTS }, loading: true, error: false }));
    try {
      const next = await fetchGroupFolderCounts(supabase, organizationId, groupId, seed);
      if (isCurrent()) setState({ scope, counts: next, loading: false, error: false });
    } catch {
      // Do not expose request URLs or learner data in diagnostic messages.
      if (isCurrent()) {
        console.error("[useGroupFolderCounts] load_failed");
        setState({ scope, counts: { ...EMPTY_GROUP_FOLDER_COUNTS }, loading: false, error: true });
      }
    }
  }, [organizationId, groupId, scope]);

  // Only the initial scope read may reuse the just-confirmed roster details.
  // Explicit refreshes after documents/membership changes always query afresh.
  const refresh = useCallback(() => read(), [read]);
  useEffect(() => {
    void read(initialRead);
    return () => { generation.current += 1; };
  }, [read, initialRead]);

  return {
    counts: state.scope === scope ? state.counts : { ...EMPTY_GROUP_FOLDER_COUNTS },
    loading: state.scope !== scope || state.loading,
    error: state.scope === scope && state.error,
    refresh,
  };
}
