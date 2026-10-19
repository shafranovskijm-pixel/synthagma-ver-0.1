import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { captureOfflineActor, captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import * as api from '@/lib/admissionCases/client';
import * as c from '@/lib/admissionCases/contract';

type Selection = {key: string; scope: c.AdmissionScope | null};
type CaseValue = {key: string; data: c.AdmissionCaseRead | null; loading: boolean; error: c.AdmissionErrorCode | null};
type Pending = {key: string; run: () => Promise<c.AdmissionMutationResult>};

/** Private case state is memory-only and synchronously masked before any effect runs. */
export function useAdmissionCase(organizationId: string|null|undefined, studentUserId: string|null|undefined, enabled = true, observedAccessKey = '', ownOnly = false) {
  const {user,loading: authLoading} = useAuth();
  const accessRevision = captureOfflineActor(user?.id);
  const globalKey = JSON.stringify([user?.id,accessRevision,organizationId,studentUserId,enabled,authLoading,observedAccessKey,ownOnly]);
  const live = useRef({key: globalKey,generation:0});
  if (live.current.key !== globalKey) live.current = {key:globalKey,generation:live.current.generation+1};
  const globalGeneration = live.current.generation;
  const lifecycle = useRef({active:true,revision:0});
  const target = useRef({key:globalKey,counter:0});
  if (target.current.key !== globalKey) target.current = {key:globalKey,counter:target.current.counter+1};
  const [selection,setSelection] = useState<Selection>({key:'',scope:null});
  const selected = selection.key === globalKey ? selection.scope : null;
  const viewKey = JSON.stringify([globalKey,selected,target.current.counter]);
  const [associations,setAssociations] = useState<{key:string; data:c.AdmissionAssociations|null; loading:boolean; error:c.AdmissionErrorCode|null}>({key:'',data:null,loading:false,error:null});
  const [value,setValue] = useState<CaseValue>({key:'',data:null,loading:false,error:null});
  const [work,setWork] = useState<{key:string; busy:boolean; pending:boolean; error:c.AdmissionErrorCode|null}>({key:'',busy:false,pending:false,error:null});
  const [resourceError,setResourceError] = useState<{key:string; error:c.AdmissionErrorCode|null}>({key:'',error:null});
  const pending = useRef<Pending|null>(null);
  const authorityEpoch = useRef(0);
  const busy = useRef(false);
  const caseSequence = useRef(0);
  const associationSequence = useRef(0);
  const current = () => lifecycle.current.active && enabled && !authLoading && !!user && !!organizationId && !!studentUserId
    && (!ownOnly || user.id === studentUserId) && live.current.generation === globalGeneration && isOfflineActorCurrent(user.id,accessRevision);
  const makeScope = (exact: c.AdmissionScope|null = selected, includeTarget = true) => {
    const lifecycleRevision = lifecycle.current.revision, counter = target.current.counter, authority = authorityEpoch.current;
    return {...api.captureAdmissionScope(organizationId!,studentUserId!,exact,() => current() && lifecycle.current.revision === lifecycleRevision && authorityEpoch.current === authority && (!includeTarget || target.current.counter === counter)),
      contextKey:JSON.stringify([globalGeneration,lifecycleRevision,counter,authority])};
  };
  const denyAccess = () => {
    if (!current()) return;
    authorityEpoch.current++;caseSequence.current++;pending.current=null;busy.current=false;
    setValue({key:viewKey,data:null,loading:false,error:'ACCESS_DENIED'});
    setResourceError({key:viewKey,error:'ACCESS_DENIED'});setWork({key:viewKey,busy:false,pending:false,error:'ACCESS_DENIED'});
  };
  const selectAssociation = (scope: c.AdmissionScope|null) => {
    if (!current()) return;
    if (scope && (!associations.data?.items.some(item => JSON.stringify(item.scope) === JSON.stringify(scope)) || associations.key !== globalKey)) return;
    target.current.counter++; caseSequence.current++; pending.current = null; busy.current = false;
    setSelection({key:globalKey,scope}); setValue({key:'',data:null,loading:!!scope,error:null});
    setWork({key:'',busy:false,pending:false,error:null}); setResourceError({key:'',error:null});
  };
  const refreshAssociations = useCallback(async (more = false) => {
    if (!current()) return;
    const seq = ++associationSequence.current;
    const actorScope = makeScope(null,false);
    const old = associations.key === globalKey ? associations.data : null;
    setAssociations(previous => ({key:globalKey,data:more ? previous.data : null,loading:true,error:null}));
    try {
      const data = await api.readAdmissionAssociations(actorScope,more ? old?.next_after_id || null : null);
      if (!api.admissionScopeCurrent(actorScope) || seq !== associationSequence.current) return;
      const items = more && old ? [...old.items,...data.items] : data.items;
      if (new Set(items.map(item => item.scope.group_id)).size !== items.length) throw new api.AdmissionError();
      setAssociations({key:globalKey,data:{...data,items},loading:false,error:null});
      if (!more && !data.has_more && selected && !data.items.some(item => JSON.stringify(item.scope) === JSON.stringify(selected))) {
        target.current.counter++; pending.current = null; busy.current = false;
        setSelection({key:globalKey,scope:null});setValue({key:'',data:null,loading:false,error:null});
      }
      if (!more && data.items.length === 1 && !data.has_more && !selected) {
        target.current.counter++; setSelection({key:globalKey,scope:data.items[0].scope});
      }
    } catch (error) {
      if (api.admissionScopeCurrent(actorScope) && seq === associationSequence.current) {
        setAssociations({key:globalKey,data:null,loading:false,error:api.normalizeAdmissionError(error).code});
        target.current.counter++; setSelection({key:globalKey,scope:null}); setValue({key:'',data:null,loading:false,error:null});
      }
    }
  }, [globalKey,associations.data]);
  const refresh = useCallback(async () => {
    if (!current() || !selected) return null;
    const actorScope = makeScope(), seq = ++caseSequence.current;
    setValue({key:viewKey,data:null,loading:true,error:null});
    try {
      const data = await api.readAdmissionCase(actorScope);
      if (!api.admissionScopeCurrent(actorScope) || seq !== caseSequence.current) return null;
      if (ownOnly && data.projection !== 'learner') throw new api.AdmissionError('ACCESS_DENIED');
      setValue({key:viewKey,data,loading:false,error:null}); return data;
    } catch (error) {
      if (api.admissionScopeCurrent(actorScope) && seq === caseSequence.current) {
        const code=api.normalizeAdmissionError(error).code;if(code==='ACCESS_DENIED') denyAccess();else setValue({key:viewKey,data:null,loading:false,error:code});
      }
      return null;
    }
  }, [viewKey]);
  useEffect(() => {
    lifecycle.current.active = true; lifecycle.current.revision++;
    pending.current = null; busy.current = false; associationSequence.current++;
    setSelection({key:globalKey,scope:null}); setWork({key:'',busy:false,pending:false,error:null});
    if (current()) void refreshAssociations();
    return () => {lifecycle.current.active = false; lifecycle.current.revision++; caseSequence.current++; associationSequence.current++; pending.current = null; busy.current = false;};
  }, [globalKey]);
  useEffect(() => { if (selected && current()) void refresh(); }, [viewKey]);

  const visible = current() && value.key === viewKey;
  const data = visible ? value.data : null;
  const staff = data?.projection === 'staff' ? data.state : null;
  const resource = async <T,>(operation: (scope:api.AdmissionActorScope,state:c.AdmissionStaffCase) => Promise<T>): Promise<T|null> => {
    if (!current() || !staff || value.loading || value.error) return null;
    const actorScope = makeScope(); setResourceError({key:viewKey,error:null});
    try { const result = await operation(actorScope,staff); return api.admissionScopeCurrent(actorScope) ? result : null; }
    catch (error) { if (api.admissionScopeCurrent(actorScope)) {const code=api.normalizeAdmissionError(error).code;if(code==='ACCESS_DENIED') denyAccess();else setResourceError({key:viewKey,error:code});} return null; }
  };
  const execute = async (operation: Pending): Promise<boolean> => {
    if (!current() || !selected || operation.key !== viewKey || busy.current) return false;
    const actorScope = makeScope(); busy.current = true; pending.current = operation;
    setWork({key:viewKey,busy:true,pending:true,error:null});
    try {
      const result = await operation.run();
      if (!api.admissionScopeCurrent(actorScope)) return false;
      caseSequence.current++; pending.current = null;
      setValue({key:viewKey,loading:false,error:null,data:{schema_version:1,mode:'case',projection:'staff',scope:result.scope,program_ref:result.state.program_ref,
        program_title:result.state.program_title,state:result.state,prerequisites:result.state.prerequisites,capabilities:result.state.capabilities}});
      setAssociations(previous => previous.key === globalKey && previous.data ? {...previous,data:{...previous.data,items:previous.data.items.map(item => item.scope.group_id === result.scope.group_id && item.scope.enrollment_id === result.scope.enrollment_id ? {...item,case_id:result.state.id} : item)}} : previous);
      setWork({key:viewKey,busy:false,pending:false,error:null}); return true;
    } catch (error) {
      if (!api.admissionScopeCurrent(actorScope)) return false;
      const code = api.normalizeAdmissionError(error).code;
      const uncertain = code === 'DEPENDENCY_UNAVAILABLE';
      if (!uncertain) pending.current = null;
      if (code === 'ACCESS_DENIED') {denyAccess();return false;}
      setWork({key:viewKey,busy:false,pending:uncertain,error:code}); return false;
    } finally { if (api.admissionScopeCurrent(actorScope)) busy.current = false; }
  };
  const mutate = async (command: c.AdmissionCaseAction) => {
    if (!current() || ownOnly || !data || data.projection !== 'staff' || value.loading || value.error || pending.current || busy.current) return false;
    const capability = {initialize:'can_initialize',assign_responsible:'can_assign',review_local_rules:'can_configure_rules',review_requirement:'can_review',review_evidence:'can_review',record_decision:'can_decide'}[command.action] as keyof typeof data.capabilities;
    if (!(command.action==='initialize' ? data.capabilities : staff?.capabilities)?.[capability]) return false;
    if (command.action!=='initialize' && (!staff || command.case_id!==staff.id || command.expected_revision!==staff.revision || JSON.stringify(command.expected_program_ref)!==JSON.stringify(staff.program_ref))) return false;
    const actorScope = makeScope(), requestId = crypto.randomUUID();
    return execute({key:viewKey,run:() => api.applyAdmissionAction(actorScope,command,requestId)});
  };
  const capture = async (requirementId:string, source:c.AdmissionEvidenceSource|File, supersedesId:string|null = null) => {
    if (!current() || ownOnly || !staff?.capabilities.can_prepare_evidence || pending.current || busy.current) return false;
    if (!staff.requirements.some(requirement => requirement.id === requirementId)) return false;
    if (source instanceof File && (!c.admissionMime.safeParse(source.type).success || !source.size || source.size > c.ADMISSION_MAX_BYTES)) {
      setWork({key:viewKey,busy:false,pending:false,error:'SOURCE_UNAVAILABLE'}); return false;
    }
    const actorScope = makeScope(), prepareId = crypto.randomUUID(), commitId = crypto.randomUUID(), exactState = staff;
    return execute({key:viewKey,run:async () => {
      let input:c.AdmissionEvidenceSource;
      if (source instanceof File) {
        const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await source.arrayBuffer()))).map(byte => byte.toString(16).padStart(2,'0')).join('');
        if (!api.admissionScopeCurrent(actorScope)) throw new api.AdmissionError('ACCESS_DENIED');
        input = {kind:'upload',requirement_id:requirementId,supersedes_id:supersedesId,declared_size:source.size,declared_mime:source.type as 'application/pdf'|'image/jpeg'|'image/png',declared_sha256:sha};
      } else input = source;
      return api.captureAdmissionEvidence(actorScope,exactState,input,prepareId,commitId,source instanceof File ? source : null);
    }});
  };
  return {
    viewKey, scope: current() && selected ? makeScope() : null, selected, selectAssociation,
    associations: current() && associations.key === globalKey ? associations.data : null,
    associationsLoading: current() && (associations.key !== globalKey || associations.loading), associationsError: current() && associations.key === globalKey ? associations.error : null,
    data, staff, loading: current() && !!selected && (!visible || value.loading), error: visible ? value.error : null,
    busy: current() && work.key === viewKey && work.busy, pending: current() && work.key === viewKey && work.pending,
    operationError: current() && work.key === viewKey ? work.error : null, resourceError: current() && resourceError.key === viewKey ? resourceError.error : null,
    refresh, refreshAssociations, mutate, capture, denyAccess, retryPending: () => pending.current ? execute(pending.current) : Promise.resolve(false),
    options: (kind:'responsibles'|'local_acts',afterId:string|null = null) => resource((scope,state) => api.readAdmissionOptions(scope,state,kind,afterId)),
    candidates: (kind:'identity_document'|'enrollment_document'|'contract_artifact'|'organization_document_version',afterId:string|null = null) => resource((scope,state) => api.readAdmissionCandidates(scope,state,kind,afterId)),
    history: (before:number|null = null,ceiling:number|null = null) => resource((scope,state) => api.readAdmissionHistory(scope,state,before,ceiling)),
  };
}

export type AdmissionCaseController = ReturnType<typeof useAdmissionCase>;

export function useAdmissionEvidenceFile(scope:api.AdmissionActorScope|null,state:c.AdmissionStaffCase|null,evidence:c.AdmissionEvidence|null,historyEvent:c.AdmissionHistory['items'][number]|null = null,onAccessDenied?:()=>void) {
  const actor = captureOfflineContext();
  const key = JSON.stringify([actor?.actorId,actor?.revision,scope?.actorId,scope?.accessRevision,scope?.contextKey,scope?.association,state?.id,state?.revision,evidence?.id,evidence?.byte_sha256,evidence?.can_read_bytes,historyEvent?.id]);
  const epoch = useRef({key,generation:0}); if (epoch.current.key !== key) epoch.current = {key,generation:epoch.current.generation+1};
  const [value,setValue] = useState<{key:string;url:string|null;loading:boolean;error:boolean}>({key:'',url:null,loading:false,error:false});
  useEffect(() => {
    const generation = epoch.current.generation; let cancelled = false, url:string|null = null;
    const current = () => !cancelled && epoch.current.generation === generation && !!scope && api.admissionScopeCurrent(scope);
    setValue({key,url:null,loading:!!scope && !!evidence,error:false});
    if (scope && state && evidence) void (async () => {
      try {
        const blob = await api.readAdmissionEvidenceFile(scope,state,evidence,historyEvent); if (!current()) return;
        url = URL.createObjectURL(blob); if (!current()) {URL.revokeObjectURL(url);url=null;return;}
        setValue({key,url,loading:false,error:false});
      } catch(error) { if (current()) {if(api.normalizeAdmissionError(error).code==='ACCESS_DENIED') onAccessDenied?.();if(current()) setValue({key,url:null,loading:false,error:true});} }
    })();
    return () => {cancelled = true;if (url) URL.revokeObjectURL(url);};
  }, [key]);
  return value.key === key && scope && api.admissionScopeCurrent(scope) ? value : {key,url:null,loading:false,error:false};
}
