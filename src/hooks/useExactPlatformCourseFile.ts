import { useCallback,useEffect,useRef,useState,useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { exactPlatformCourseFile } from "@/api/exactPlatformCourseFile";
import { checkSelectedPlatformFile,type SelectedPlatformFileReference,type ExactPlatformCourseFileLease } from "@/lib/exactPlatformCourseFile";
import { captureOfflineAuthRevision,captureOfflineContext,subscribeOfflineAuthRevision } from "@/utils/courseCache";
export type ExactPlatformCourseFileView = {readonly state:"idle"|"loading"|"held"}|{readonly state:"exact";readonly lease:ExactPlatformCourseFileLease};
interface Ticket {readonly key:string;valid:boolean}
/** Moderator inspection of one explicitly selected saved proposal only. This is
 * not an authorisation/capability path for generic learners or current files. */
export function useExactPlatformCourseFile(scope:Readonly<SelectedPlatformFileReference>|null,enabled:boolean) {
  const auth=useAuth();
  const revision=useSyncExternalStore(subscribeOfflineAuthRevision,captureOfflineAuthRevision,captureOfflineAuthRevision);
  const [refreshRevision,setRefreshRevision]=useState(0);
  const [visible,setVisible]=useState(()=>typeof document==="undefined"||document.visibilityState==="visible");
  const [snapshot,setSnapshot]=useState<{ticket:Ticket;view:ExactPlatformCourseFileView}|null>(null);
  const ticketRef=useRef<Ticket|null>(null);
  const active=useRef<{ticket:Ticket;abort:AbortController;lease:ExactPlatformCourseFileLease|null}|null>(null);
  const actual=captureOfflineContext();
  let selected:Readonly<SelectedPlatformFileReference>|null=null;
  try {
    if(enabled&&visible&&scope&&!auth.loading&&!auth.authError&&auth.userRole==="admin"&&auth.user?.id===scope.actorId
      &&actual?.actorId===scope.actorId&&actual.revision===revision) selected=checkSelectedPlatformFile(scope);
  } catch { /* Unknown or stale actor/selection stays held. */ }
  const key=selected?JSON.stringify([selected.actorId,revision,selected.marketplaceId,selected.courseId,selected.proposalId,selected.proposalEditionSha256,selected.referenceKind,selected.referenceId,refreshRevision]):"inactive";
  if(!ticketRef.current||ticketRef.current.key!==key||!ticketRef.current.valid)ticketRef.current={key,valid:true};
  const ticket=ticketRef.current;
  const invalidate=useCallback(()=>{if(ticketRef.current)ticketRef.current.valid=false;const request=active.current;request?.abort.abort();request?.lease?.release();if(request)request.lease=null;setRefreshRevision(value=>value+1);},[]);
  useEffect(()=>subscribeOfflineAuthRevision(invalidate),[invalidate]);
  useEffect(()=>{
    const visibility=()=>{invalidate();setVisible(document.visibilityState==="visible");};
    window.addEventListener("focus",invalidate);document.addEventListener("visibilitychange",visibility);
    return()=>{window.removeEventListener("focus",invalidate);document.removeEventListener("visibilitychange",visibility);};
  },[invalidate]);
  useEffect(()=>{
    active.current?.abort.abort();active.current?.lease?.release();
    const request={ticket,abort:new AbortController(),lease:null as ExactPlatformCourseFileLease|null};active.current=request;
    const current=()=>active.current===request&&ticketRef.current===ticket&&ticket.valid&&!request.abort.signal.aborted
      &&captureOfflineContext()?.actorId===selected?.actorId&&captureOfflineAuthRevision()===revision;
    if(!selected)setSnapshot({ticket,view:{state:"idle"}});
    else {
      setSnapshot({ticket,view:{state:"loading"}});
      void(async()=>{try{
        const context=await exactPlatformCourseFile.context(selected,request.abort.signal);if(!current())return;
        if(context.state!=="bytes_sealed"){setSnapshot({ticket,view:{state:"held"}});return;}
        const lease=await exactPlatformCourseFile.bytes(selected,context,request.abort.signal);
        if(!current()){lease.release();return;}request.lease=lease;setSnapshot({ticket,view:{state:"exact",lease}});
      }catch{if(current())setSnapshot({ticket,view:{state:"held"}});}})();
    }
    return()=>{request.abort.abort();request.lease?.release();request.lease=null;if(active.current===request)active.current=null;};
    // Unique render tickets include the complete selected immutable proposal tuple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ticket]);
  const view:ExactPlatformCourseFileView=selected&&snapshot?.ticket===ticket&&ticket.valid?snapshot.view:{state:"idle"};
  return{view,refresh:invalidate} as const;
}
