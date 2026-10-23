import{useMemo,useSyncExternalStore}from'react';
import{getAdminViewData}from'@/utils/adminViewMode';
import{ADMIN_PREVIEW_CONTEXT_EVENT}from'@/utils/adminPreviewSession';
function snapshot():string|null{try{return localStorage.getItem('adminViewAsStudent');}catch{return null;}}
function subscribe(notify:()=>void){
 const storage=(event:StorageEvent)=>{if(event.key==='adminViewAsStudent'||event.key===null)notify();};
 window.addEventListener('storage',storage);window.addEventListener(ADMIN_PREVIEW_CONTEXT_EVENT,notify);
 return()=>{window.removeEventListener('storage',storage);window.removeEventListener(ADMIN_PREVIEW_CONTEXT_EVENT,notify);};
}
/** React to auth cleanup even when the learner route stays mounted across accounts. */
export function useAdminStudentPreview(){const raw=useSyncExternalStore(subscribe,snapshot,()=>null);return useMemo(()=>getAdminViewData(),[raw]);}
