import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type ParticipantSchool = { organization_id: string; name: string; role: 'student' | 'instructor' };
type ParticipantRequest = { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
// Existing RPC, shared Auth/proxy client; the generated Database types predate this module.
const participantRpc = supabase.rpc.bind(supabase) as unknown as (name: 'driving_my_schools') => ParticipantRequest;
function isParticipantSchool(value: unknown): value is ParticipantSchool {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.organization_id === 'string' && row.organization_id.length > 0
    && typeof row.name === 'string' && (row.role === 'student' || row.role === 'instructor');
}

/** Visibility only; the existing chooser and workspace recheck all server permissions. */
export function useDrivingSchoolParticipantEntry(
  organizationId: string | null, subjectUserId: string | null, enabled = true,
) {
  const { user, loading: authLoading, authError } = useAuth();
  const userId = user?.id ?? null;
  const ready = enabled && !!organizationId && !!subjectUserId && !!userId
    && subjectUserId === userId && !authLoading && !authError;
  const key = JSON.stringify([userId, subjectUserId, organizationId, ready]);
  const scope = useRef({ key, generation: 0 });
  // Close a previous account/organization/preview scope before passive effects run.
  if (scope.current.key !== key) scope.current = { key, generation: scope.current.generation + 1 };
  const generation = scope.current.generation;
  const [result, setResult] = useState<{ key: string; generation: number; allowed: boolean } | null>(null);

  useEffect(() => {
    if (!ready || !organizationId) return;
    let active = true;
    let request = 0;
    let inFlight = false;
    let controller: AbortController | null = null;
    let timeout: number | null = null;
    const current = () => active && scope.current.key === key && scope.current.generation === generation;
    const check = async () => {
      if (!current() || inFlight) return;
      inFlight = true;
      const version = ++request;
      const read = new AbortController();
      controller = read;
      // Abort the physical fetch; do not race a timeout against an abandoned network request.
      const timer = window.setTimeout(() => read.abort(), 12000);
      timeout = timer;
      setResult({ key, generation, allowed: false });
      try {
        const { data: schools, error } = await participantRpc('driving_my_schools').abortSignal(read.signal);
        if (!current() || version !== request || read.signal.aborted) return;
        if (error) throw error;
        const allowed = Array.isArray(schools) && schools.every(isParticipantSchool)
          && schools.some(school => school.organization_id === organizationId);
        setResult({ key, generation, allowed });
      } catch {
        if (current() && version === request) setResult({ key, generation, allowed: false });
      } finally {
        window.clearTimeout(timer);
        if (timeout === timer) timeout = null;
        if (controller === read) controller = null;
        inFlight = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false; request++;
      controller?.abort();
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, generation, ready, organizationId]);

  return ready && result?.key === key && result?.generation === generation && result?.allowed === true;
}
