import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { drivingRpc } from '@/lib/driving-school/cloud-adapter';
/** Menu visibility only. Each workspace RPC still checks current server permissions. */
export function useDrivingSchoolEntry(organizationId: string | null) {
  const { user } = useAuth();
  const userId = user?.id;
  const [result, setResult] = useState<{org: string; user: string; allowed: boolean} | null>(null);
  useEffect(() => {
    if (!organizationId || !userId) return;
    let cancelled = false;
    let request = 0;
    const check = async () => {
      const currentRequest = ++request;
      setResult({org: organizationId,user: userId,allowed: false});
      try {
        const status = await drivingRpc<{installed:boolean;connected:boolean;can_manage:boolean}>(
          'driving_module_status', {_organization_id: organizationId});
        if (!cancelled && currentRequest === request) setResult({org: organizationId,user: userId,
          allowed: status?.installed === true && status.connected === true && status.can_manage === true});
      } catch { /* Missing, unknown, denied and failed reads never open the menu. */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(onVisible, 60000);
    return () => {
      cancelled = true; request++;
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [organizationId,userId]);
  return !!userId && result?.org === organizationId && result?.user === userId && result?.allowed === true;
}
