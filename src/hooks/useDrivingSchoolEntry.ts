import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
/** Menu visibility only. Each module RPC still checks current server permissions. */
export function useDrivingSchoolEntry(organizationId: string | null) {
  const { user } = useAuth();
  const [result, setResult] = useState<{org: string; user: string; allowed: boolean} | null>(null);
  useEffect(() => {
    let cancelled=false;
    if (!organizationId || !user) return;
    supabase.rpc('can_access_organization', { _organization_id: organizationId, _permission: null })
      .then(({data,error}) => { if (!cancelled) setResult({org: organizationId,user:user.id,allowed:!error && data === true}); });
    return () => {cancelled=true;};
  }, [organizationId,user?.id]);
  return !!user && result?.org === organizationId && result?.user === user.id && result?.allowed === true;
}
