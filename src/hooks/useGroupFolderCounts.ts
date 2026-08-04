import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchGroupFolderCounts,
  EMPTY_GROUP_FOLDER_COUNTS,
  type GroupFolderCounts,
} from "@/lib/groups/folderCounts";

/** Счётчики папок группы с возможностью перезапроса после генерации документов. */
export function useGroupFolderCounts(organizationId: string | null, groupId: string | null) {
  const [counts, setCounts] = useState<GroupFolderCounts>({ ...EMPTY_GROUP_FOLDER_COUNTS });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId || !groupId) {
      setCounts({ ...EMPTY_GROUP_FOLDER_COUNTS });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchGroupFolderCounts(supabase, organizationId, groupId);
      setCounts(next);
    } catch (e) {
      console.error("[useGroupFolderCounts]", e);
    } finally {
      setLoading(false);
    }
  }, [organizationId, groupId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { counts, loading, refresh };
}
