import {useEffect,useMemo} from 'react';
import {useInfiniteQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/useAuth';
import {captureOfflineActor,isOfflineActorCurrent} from '@/utils/courseCache';
import {readStudentDocumentInbox,type DocumentInboxCursor,type DocumentInboxItem} from '@/lib/studentDocumentInbox';
export type InboxSignature=DocumentInboxItem & {/** Historical state; not the new confirmation result. */status:string};
/** Own inbox only: administrative preview never acts as the learner. */
export function useStudentSignatureInbox(userId:string|null|undefined,organizationId:string|null|undefined) {
 const {user,loading:authLoading}=useAuth();const actorRevision=captureOfflineActor(user?.id);
 const enabled=!authLoading&&!!userId&&user?.id===userId&&!!organizationId&&actorRevision!==null;
 const queryClient=useQueryClient();
 const key=useMemo(()=>['student-document-inbox',userId,organizationId,actorRevision] as const,[userId,organizationId,actorRevision]);
 const query=useInfiniteQuery({queryKey:key,enabled,initialPageParam:null as DocumentInboxCursor|null,
  queryFn:({pageParam,signal})=>readStudentDocumentInbox(organizationId!,userId!,actorRevision!,pageParam,signal),
  getNextPageParam:last=>last.next_cursor??undefined,staleTime:10000,gcTime:0,retry:false,refetchOnWindowFocus:'always'});
 useEffect(()=>{
  if(!enabled)return;
  const refresh=()=>{if(isOfflineActorCurrent(userId!,actorRevision))void queryClient.invalidateQueries({queryKey:key,exact:true},{cancelRefetch:false});};
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  const channel=supabase.channel('student-document-inbox-'+userId+'-'+organizationId+'-'+crypto.randomUUID())
   .on('postgres_changes',{event:'*',schema:'public',table:'document_signatures',filter:'recipient_user_id=eq.'+userId},refresh).subscribe();
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{void supabase.removeChannel(channel);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
 },[enabled,userId,organizationId,actorRevision,key,queryClient]);
 const current=enabled&&isOfflineActorCurrent(userId!,actorRevision);
 const items:InboxSignature[]=current?(query.data?.pages.flatMap(p=>p.items).filter((item,index,all)=>all.findIndex(x=>x.id===item.id)===index).map(item=>({...item,status:item.legacy_status}))??[]):[];
 const first=current?query.data?.pages[0]:null;
 return {items,pending:items.filter(i=>i.pending),archive:items.filter(i=>!i.pending),pendingCount:first?.pending_count??0,totalCount:first?.total_count??0,
  loading:enabled&&query.isPending,error:current&&query.isError?'Не удалось проверить документы. Повторите загрузку.':null,enabled,
  hasMore:current&&query.hasNextPage,loadingMore:query.isFetchingNextPage,loadMore:()=>query.fetchNextPage(),reload:()=>query.refetch()};
}
