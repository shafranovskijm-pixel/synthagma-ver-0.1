/** Preview hints select UI context only; server authority and the original SDK
 * session remain unchanged. Clear them before publishing another account. */
export const ADMIN_PREVIEW_CONTEXT_EVENT='admin-preview-context-changed';
const previewKeys=['adminViewAsStudent','adminViewAsOrg','adminViewAsSalesManager','orgViewAsCompany']as const;
function clearKeys(keys:readonly string[]):void{
 let changed=false;
 for(const key of keys){try{if(localStorage.getItem(key)!==null){localStorage.removeItem(key);changed=true;}}catch{/* Storage failure must not prevent real auth/session cleanup. */}}
 if(changed&&typeof window!=='undefined')window.dispatchEvent(new Event(ADMIN_PREVIEW_CONTEXT_EVENT));
}
export function clearAdminPreviewContexts():void{clearKeys(previewKeys);}
/** Initial same-session hydration keeps legitimate admin/manager previews pending
 * server-role validation; a real identity transition or signed-out session does not. */
export function resetAdminPreviewForAuth(previousActor:string|null,nextActor:string|null,initialized:boolean):void{
 if(nextActor===null||previousActor!==nextActor&&(initialized||previousActor!==null))clearAdminPreviewContexts();
}
/** Only the successfully observed canonical server role may decide this cleanup.
 * A storage role hint or transient failed RPC is never a role confirmation. */
export function clearDisallowedAdminPreviews(role:string):void{
 if(role==='admin')return;
 if(role==='organization')clearKeys(['adminViewAsOrg','adminViewAsSalesManager']);
 else clearAdminPreviewContexts();
}
