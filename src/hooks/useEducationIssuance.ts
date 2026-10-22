import { useCallback, useEffect, useRef } from 'react';
import { captureIssuanceScope, normalizeIssuanceError, type EducationIssuanceScope } from '@/lib/educationIssuance/client';
import type { IssuanceScope } from '@/lib/educationIssuance/types';

/** Scope changes clear visible data before the next network response is accepted. */
export function useEducationIssuanceScope(organizationId: string | null | undefined, groupId?: string | null, contextKey = "") {
  const key = `${organizationId ?? ''}:${groupId ?? 'organization'}:${contextKey}`;
  const context = useRef({key,revision:0});
  if(context.current.key!==key)context.current={key,revision:context.current.revision+1};
  const revision=context.current.revision;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return useCallback((): EducationIssuanceScope => {
    if (!organizationId) throw normalizeIssuanceError({ code: '42501' });
    const scope: IssuanceScope = groupId ? { kind: 'group', group_id: groupId } : { kind: 'organization' };
    return captureIssuanceScope(organizationId, scope, () => mounted.current && context.current.revision === revision);
  }, [organizationId, groupId, key, revision]);
}
