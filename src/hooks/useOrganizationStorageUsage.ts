import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOrganizationStorageUsage } from "@/lib/storage/organizationStorageUsage";

interface StorageUsageState {
  organizationId: string | null;
  bytes: number | null;
  loading: boolean;
  error: string | null;
}

/** Display-only scan. Mount this with the billing page, not access checks. */
export function useOrganizationStorageUsage(organizationId: string | null) {
  const activeOrganization = useRef(organizationId);
  activeOrganization.current = organizationId;
  const sequence = useRef(0);
  const [state, setState] = useState<StorageUsageState>({ organizationId: null, bytes: null, loading: false, error: null });

  useEffect(() => {
    const request = ++sequence.current;
    const isCurrent = () => activeOrganization.current === organizationId && sequence.current === request;
    setState({ organizationId, bytes: null, loading: !!organizationId, error: null });
    if (organizationId) {
      void getOrganizationStorageUsage(supabase, organizationId)
        .then(bytes => {
          if (isCurrent()) setState({ organizationId, bytes, loading: false, error: null });
        })
        .catch(() => {
          if (isCurrent()) setState({ organizationId, bytes: null, loading: false, error: "Не удалось рассчитать объём хранилища." });
        });
    }
    return () => { sequence.current++; };
  }, [organizationId]);

  return state.organizationId === organizationId
    ? state
    : { organizationId, bytes: null, loading: !!organizationId, error: null };
}
