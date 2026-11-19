import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchGroupFolderCounts,
  EMPTY_GROUP_FOLDER_COUNTS,
  type GroupFolderCounts,
} from "@/lib/groups/folderCounts";

/** Счётчики папок группы с возможностью перезапроса после генерации документов. */
export function useGroupFolderCounts(organizationId: string | null, groupId: string | null) {
  const scope = JSON.stringify([organizationId, groupId]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const generation = useRef(0);
  const [state, setState] = useState({ scope, counts: { ...EMPTY_GROUP_FOLDER_COUNTS }, loading: true, error: false });

  const refresh = useCallback(async () => {
    if (scopeRef.current !== scope) return;
    const request = ++generation.current;
    const isCurrent = () => generation.current === request && scopeRef.current === scope;
    if (!organizationId || !groupId) {
      setState({ scope, counts: { ...EMPTY_GROUP_FOLDER_COUNTS }, loading: false, error: false });
      return;
    }
    setState(current => ({ scope, counts: current.scope === scope ? current.counts : { ...EMPTY_GROUP_FOLDER_COUNTS }, loading: true, error: false }));
    try {
      const next = await fetchGroupFolderCounts(supabase, organizationId, groupId);
      if (isCurrent()) setState({ scope, counts: next, loading: false, error: false });
    } catch {
      // Do not expose request URLs or learner data in diagnostic messages.
      if (isCurrent()) {
        console.error("[useGroupFolderCounts] load_failed");
        setState({ scope, counts: { ...EMPTY_GROUP_FOLDER_COUNTS }, loading: false, error: true });
      }
    }
  }, [organizationId, groupId, scope]);

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

  return {
    counts: state.scope === scope ? state.counts : { ...EMPTY_GROUP_FOLDER_COUNTS },
    loading: state.scope !== scope || state.loading,
    error: state.scope === scope && state.error,
    refresh,
  };
}
