import { GENERIC_EDUCATION_DRAFT_TYPES, type GenericEducationDraftType } from './retainedGenericDrafts.ts';
import type { EducationArtifactSnapshot } from '../../../supabase/functions/_shared/group-education-artifact.ts';
export interface RetainedDraftRow { id:string; organization_id:string; group_id:string; doc_type:string; document_date:string|null; doc_status?:string|null; document_number:string|null; layout_format?:string|null; package_batch_id?:string|null; package_version?:number|null; variables_snapshot?:Record<string,any>|null }
export interface RetainedDraftSelection { actorId:string;organizationId:string;groupId:string;source:EducationArtifactSnapshot["source"];dates:Record<GenericEducationDraftType,string> }
export interface RetainedDraftReceipt { batchId:string;version:number;ids:string[];reconciled:boolean }
export class RetainedDraftBatchError extends Error { constructor(readonly code:"BUSY"|"SOURCE_CHANGED"|"UNCERTAIN"|"COLLISION",readonly savedIds:string[]=[]){super(code);} }
const sourceKeys=["schema_version","snapshot_id","source_hash","roster_hash","calendar_version_id","calendar_hash","as_of","timezone","knowledge_revision","coverage_segment_id"] as const;
const sourceSame=(left:any,right:any)=>!!left&&sourceKeys.every(key=>left[key]===right[key]);
export const retainedDraftAttemptKey=(s:RetainedDraftSelection)=>JSON.stringify([s.actorId,s.organizationId,s.groupId,...sourceKeys.map(key=>s.source[key]),...GENERIC_EDUCATION_DRAFT_TYPES.map(type=>[type,s.dates[type]])]);
function reconcile(rows:readonly RetainedDraftRow[],s:RetainedDraftSelection):RetainedDraftReceipt|null {
 const matches=rows.filter(row=>row.organization_id===s.organizationId&&row.group_id===s.groupId&&(GENERIC_EDUCATION_DRAFT_TYPES as readonly string[]).includes(row.doc_type)&&row.document_date===s.dates[row.doc_type as GenericEducationDraftType]&&sourceSame(row.variables_snapshot?.education_source,s.source));
 if(!matches.length)return null;
 const batch=matches[0].package_batch_id,version=matches[0].package_version;
 if(matches.length!==3||!batch||!version||new Set(matches.map(row=>row.doc_type)).size!==3||matches.some(row=>row.package_batch_id!==batch||row.package_version!==version||row.doc_status!=="draft"||row.document_number!==null||row.layout_format!=="legacy_html"))throw new RetainedDraftBatchError("COLLISION",matches.map(row=>row.id));
 return {batchId:batch,version,ids:matches.map(row=>row.id),reconciled:true};
}
/** One scoped atomic write. A lost acknowledgement is reconciled, never blindly reissued. */
export function createRetainedDraftBatchGuard(store?:{getItem(key:string):string|null;setItem(key:string,value:string):void}) {
 const busy=new Set<string>(),uncertain=new Set<string>();
 return async (selection:RetainedDraftSelection,operations:{isCurrent():boolean;read():Promise<readonly RetainedDraftRow[]>;save():Promise<unknown>}):Promise<RetainedDraftReceipt>=>{
  const key=retainedDraftAttemptKey(selection),storageKey="sintagma:generic-draft-attempt:"+key;
  if(busy.has(key))throw new RetainedDraftBatchError("BUSY");
  if(!operations.isCurrent())throw new RetainedDraftBatchError("SOURCE_CHANGED");
  busy.add(key);
  const current=()=>{if(!operations.isCurrent())throw new RetainedDraftBatchError("SOURCE_CHANGED");};
  const read=async()=>{current();const rows=await operations.read();current();return reconcile(rows,selection);};
  try {
   const existing=await read();if(existing)return existing;
   if(uncertain.has(key)||store?.getItem(storageKey))throw new RetainedDraftBatchError("UNCERTAIN");
   // Persist before the write. If persistence fails, no server mutation starts.
   store?.setItem(storageKey,"pending");uncertain.add(key);current();
   try { await operations.save(); } catch(error) { current();const recovered=await read();if(recovered)return recovered;throw new RetainedDraftBatchError("UNCERTAIN"); }
   current();const result=await read();if(!result)throw new RetainedDraftBatchError("UNCERTAIN");
   store?.setItem(storageKey,"saved");return {...result,reconciled:false};
  } finally {busy.delete(key);}
 };
}
