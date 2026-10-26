import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';
import { captureOfflineActor, captureOfflineAuthRevision, isOfflineActorCurrent, subscribeOfflineAuthRevision } from '@/utils/courseCache';
import type { HomeworkTaskScope, VerifiedHomeworkTaskProof } from '@/components/course-learning/HomeworkTaskDescription';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const PROOF_LEASE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

interface TaskProofOptions {
  scope: HomeworkTaskScope;
  content: string | null | undefined;
  lessonType?: string;
  enabled: boolean;
  contextKey: string;
}

// B2 is not yet in generated Database types. Keep the transport narrow, treat
// its response as unknown and validate every returned field before presentation.
interface TaskProofClient {
  rpc(name: 'get_platform_learning_task_proof', args: { p_course_id: string; p_lesson_id: string }): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
}

function matchesVerifiedResponse(data: unknown, courseId: string, lessonId: string, digest: string): data is {
  status: 'verified'; courseId: string; lessonId: string; contentSha256: string; policyId: string;
} {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  return value.status === 'verified' && value.courseId === courseId && value.lessonId === lessonId
    && typeof value.contentSha256 === 'string' && SHA256.test(value.contentSha256) && value.contentSha256 === digest
    && typeof value.policyId === 'string' && UUID.test(value.policyId);
}

/** Presentation only: never grants access, submit rights, completion or a grade. */
export function usePlatformHomeworkTaskProof({ scope, content, lessonType, enabled, contextKey }: TaskProofOptions) {
  const { user, session, loading, authError } = useAuth();
  const authEpoch = useSyncExternalStore(subscribeOfflineAuthRevision, captureOfflineAuthRevision, () => 0);
  const actorId = user?.id;
  const actorRevision = captureOfflineActor(actorId);
  const rawContent = content ?? '';
  const courseId = scope.routeCourseId;
  const lessonId = scope.lesson?.id;
  const ownerId = scope.course?.organization_id;
  const [refresh, setRefresh] = useState(0);
  const lease = useMemo(() => ({}), [
    courseId, scope.course?.id, ownerId, lessonId, scope.lesson?.course_id,
    scope.actorId, actorId, actorRevision, authEpoch, rawContent, lessonType,
    enabled, contextKey, loading, authError, session?.user.id, session?.access_token,
    user?.is_anonymous, session?.user.is_anonymous, refresh,
  ]);
  const currentLease = useRef(lease);
  currentLease.current = lease;
  const [proof, setProof] = useState<VerifiedHomeworkTaskProof | null>(null);

  const eligible = enabled && !loading && !authError && !!actorId && UUID.test(actorId)
    && user?.is_anonymous !== true && session?.user.is_anonymous !== true
    && session?.user.id === actorId && !!session?.access_token
    && scope.actorId === actorId && isOfflineActorCurrent(actorId, actorRevision)
    && !!courseId && UUID.test(courseId) && scope.course?.id === courseId
    && !!ownerId && UUID.test(ownerId) && ownerId !== MARKETPLACE_ORG_ID
    && !!lessonId && UUID.test(lessonId) && scope.lesson?.course_id === courseId
    && lessonType === 'homework';

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    const current = () => active && currentLease.current === lease && !!actorId
      && isOfflineActorCurrent(actorId, actorRevision);
    setProof(null);
    if (eligible && actorId && courseId && lessonId && ownerId) {
      requestTimer = setTimeout(() => { controller.abort(); if (current()) setProof(null); }, REQUEST_TIMEOUT_MS);
      void (async () => {
        // Hash exactly the raw UTF-8 bytes coalesce(content,'') used by B2.
        // No trim, HTML parsing, sanitizing, line-ending or Unicode normalization.
        if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') throw new Error('No secure digest');
        const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawContent));
        const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
        if (!current() || controller.signal.aborted) return;
        const { data, error } = await (supabase as unknown as TaskProofClient)
          .rpc('get_platform_learning_task_proof', { p_course_id: courseId, p_lesson_id: lessonId })
          .abortSignal(controller.signal);
        if (!current() || controller.signal.aborted) return;
        if (error || !matchesVerifiedResponse(data, courseId, lessonId, digest)) throw new Error('Unverified task');
        if (requestTimer) clearTimeout(requestTimer);
        setProof({ status: 'verified', courseId, lessonId, organizationId: ownerId, actorId,
          actorRevision: actorRevision!, contentSha256: digest, policyId: data.policyId,
          rawContent, lease, expiresAt: Date.now() + PROOF_LEASE_MS });
        expiryTimer = setTimeout(() => {
          if (current()) { setProof(null); setRefresh(value => value + 1); }
        }, PROOF_LEASE_MS);
      })().catch(() => { if (current()) setProof(null); });
    }
    return () => {
      active = false;
      controller.abort();
      if (requestTimer) clearTimeout(requestTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [lease, eligible, actorId, actorRevision, courseId, lessonId, ownerId, rawContent]);

  // Synchronous lease/content/actor checks prevent a previous render's proof
  // surviving a route, owner, loaded lesson, context, auth or raw-content change.
  const visibleProof = eligible && proof?.lease === lease && proof.rawContent === rawContent
    && proof.expiresAt > Date.now() && !!actorId && isOfflineActorCurrent(actorId, actorRevision) ? proof : null;
  return { scope: { ...scope, actorId, actorRevision, contextLease: lease }, proof: visibleProof };
}
