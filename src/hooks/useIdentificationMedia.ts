import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { captureOfflineActor, captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import { captureIdentificationScope, readIdentificationStates, decideIdentification, readIdentificationMedia,
  identificationScopeCurrent, type IdentificationScope } from '@/lib/identification/client';
import { identificationAssuranceLabel, type IdentificationRecord, type IdentificationSubject, type IdentificationAction } from '@/lib/identification/contract';

export function useIdentificationState(organizationId: string | null | undefined, studentUserId: string | null | undefined, enrollmentId: string | null = null, enabled = true, observedAccessKey = '') {
  const {user, loading: authLoading} = useAuth();
  const revision = captureOfflineActor(user?.id);
  const key = JSON.stringify([user?.id,revision,organizationId,studentUserId,enrollmentId,enabled,authLoading,observedAccessKey]);
  const live = useRef({key, generation: 0});
  if (live.current.key !== key) live.current = {key, generation: live.current.generation + 1};
  const [value, setValue] = useState<{generation: number; state: IdentificationSubject | null; error: boolean; loading: boolean; busy: boolean}>({generation: -1,state: null,error: false,loading: true,busy: false});
  const requests = useRef(new Map<string,string>());
  const lifecycle = useRef({active:true,revision:0});
  const generation = live.current.generation;
  const current = () => lifecycle.current.active && enabled && !authLoading && !!user && !!organizationId && !!studentUserId && live.current.generation === generation && isOfflineActorCurrent(user.id, revision);
  const scope = () => captureIdentificationScope(organizationId!,studentUserId!,enrollmentId,current);
  const refresh = useCallback(async () => {
    if (!current()) return null;
    const ticket = lifecycle.current.revision;
    const liveRequest = () => current() && ticket === lifecycle.current.revision;
    setValue(previous => ({...previous,generation,loading: true,error: false}));
    try {
      const state = (await readIdentificationStates(captureIdentificationScope(organizationId!,studentUserId!,enrollmentId,liveRequest),[studentUserId!],true))[0];
      if (!liveRequest()) return null;
      setValue({generation,state,error: false,loading: false,busy: false}); return state;
    } catch {
      if (liveRequest()) setValue({generation,state: null,error: true,loading: false,busy: false});
      return null;
    }
  }, [key]);
  useEffect(() => {
    lifecycle.current.active = true; lifecycle.current.revision++;
    setValue({generation,state: null,error: false,loading: current(),busy: false}); requests.current.clear();
    if (current()) void refresh();
    return () => { lifecycle.current.active = false; lifecycle.current.revision++; };
  }, [key]);
  const decide = async (action: IdentificationAction, record: IdentificationRecord | null, reason: string | null = null) => {
    if (!current() || value.generation !== generation || value.loading || value.busy || !value.state || value.error) return false;
    const capabilities = record?.capabilities || value.state.capabilities;
    if ((action === 'reset' && !capabilities.canReset) || (action === 'reject' && !capabilities.canReject) || (['verify','manual_verify'].includes(action) && !capabilities.canReview)) return false;
    const requestKey = JSON.stringify([action,record?.identificationId,record?.revision,reason]);
    const requestId = requests.current.get(requestKey) || crypto.randomUUID(); requests.current.set(requestKey,requestId);
    const ticket = lifecycle.current.revision;
    const liveRequest = () => current() && ticket === lifecycle.current.revision;
    setValue(previous => ({...previous,busy: true}));
    try {
      await decideIdentification(captureIdentificationScope(organizationId!,studentUserId!,enrollmentId,liveRequest),action,record,requestId,reason);
      if (!liveRequest()) return false;
      await refresh(); return liveRequest();
    } catch {
      if (liveRequest()) { setValue(previous => ({...previous,busy: false,error: true})); await refresh(); }
      return false;
    } finally { if (liveRequest()) setValue(previous => ({...previous,busy: false})); }
  };
  const visible = value.generation === generation && current();
  return {state: visible ? value.state : null, error: visible && value.error, loading: current() && (!visible || value.loading), busy: visible && value.busy,
    refresh, decide, scope: current() ? scope() : null};
}

export function useIdentificationMedia(scope: IdentificationScope | null, record: IdentificationRecord | null) {
  const actor = captureOfflineContext();
  const key = JSON.stringify([actor?.actorId,actor?.revision,scope?.actorId,scope?.accessRevision,scope?.organizationId,scope?.studentUserId,scope?.enrollmentId,record?.identificationId,record?.revision,record?.media?.sourceId,record?.capabilities.canReadMedia]);
  const live = useRef({key,generation: 0});
  if (live.current.key !== key) live.current = {key,generation: live.current.generation + 1};
  const [preview,setPreview] = useState<{key: string; url: string | null; unavailable: boolean}>({key:'',url:null,unavailable:false});
  useEffect(() => {
    const generation = live.current.generation; let cancelled = false; let objectUrl: string | null = null;
    const current = () => !cancelled && live.current.generation === generation && !!scope && identificationScopeCurrent(scope);
    setPreview({key,url:null,unavailable:!record?.media});
    if (scope && identificationScopeCurrent(scope) && record?.media && record.capabilities.canReadMedia) void (async () => {
      try {
        const blob = await readIdentificationMedia(scope,record);
        if (!current()) return;
        objectUrl = URL.createObjectURL(blob);
        if (!current()) { URL.revokeObjectURL(objectUrl); objectUrl = null; return; }
        setPreview({key,url:objectUrl,unavailable:false});
      } catch { if (current()) setPreview({key,url:null,unavailable:true}); }
    })();
    return () => {cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl);};
  }, [key]);
  return preview.key === key && scope && identificationScopeCurrent(scope) ? preview : {key,url:null,unavailable:true};
}

/** Only committed exact private sources can be rendered. Legacy locators never enter an img. */
export function IdentificationPhoto({scope,record,className = 'w-20 h-20 rounded-xl object-cover'}: {scope: IdentificationScope | null; record: IdentificationRecord | null; className?: string}) {
  const preview = useIdentificationMedia(scope,record);
  return preview.url ? createElement('img',{src:preview.url,alt:'Фото для проверки',className})
    : createElement('span',{className: `${className} inline-flex items-center justify-center bg-muted text-[10px] text-muted-foreground text-center p-1`,title:record ? identificationAssuranceLabel(record) : 'Фото отсутствует'},record?.sourceKind === 'manual_staff_claim' ? 'Без фото' : 'Фото недоступно');
}
