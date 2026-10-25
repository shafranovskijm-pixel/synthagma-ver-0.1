import {z} from 'zod';
import {supabase} from '@/integrations/supabase/client';
import {captureDocumentRegistryScope,readDocumentRegistry} from '@/lib/documentRegistry/client';
import {assertArchiveScope,requireArchiveJwt,type ArchiveClientScope} from './client';
import {ArchiveError,archiveUuid} from './contract';
export interface ArchivePersonChoice{id:string;label:string}
/** Reuses the current original-JWT registry party search; no new broad learner directory. */
export async function readArchiveStudentChoices(scope:ArchiveClientScope,search:string,afterId:string|null=null){
 assertArchiveScope(scope);const context=scope.archiveScope.kind==='organization'?{kind:'organization' as const}:{kind:'group' as const,group_id:scope.archiveScope.group_id};
 const registry=captureDocumentRegistryScope(scope.organizationId,context,()=>{try{assertArchiveScope(scope);return true;}catch{return false;}});
 const value=await readDocumentRegistry(registry,{kind:'parties',party_kind:'student',text:search.trim().slice(0,200),after_id:afterId,limit:25});assertArchiveScope(scope);
 if(value.kind!=='parties')throw new ArchiveError('SOURCE_CHANGED');
 const items:ArchivePersonChoice[]=[];for(const choice of value.parties){if(choice.party.kind!=='student')throw new ArchiveError('SOURCE_CHANGED');if(scope.archiveScope.kind==='enrollment'&&choice.party.user_id!==scope.archiveScope.user_id)continue;items.push({id:choice.party.user_id,label:choice.label});}
 return{items,next:scope.archiveScope.kind==='enrollment'?null:value.next_after_id};
}
const staffRow=z.object({id:archiveUuid,user_id:archiveUuid,display_name:z.string().max(1000).nullable(),role:z.string().max(100),expires_at:z.string().nullable()}).strict();
/** Existing staff RLS is authoritative. Only the owner with explicit archive appointment capability uses this picker. */
export async function readArchiveAuthorityChoices(scope:ArchiveClientScope,afterId:string|null=null){
 if(scope.archiveScope.kind!=='organization'||afterId!==null&&!archiveUuid.safeParse(afterId).success)throw new ArchiveError('ACCESS_DENIED');
 const token=await requireArchiveJwt(scope);let query=supabase.from('org_staff').select('id,user_id,display_name,role,expires_at').eq('organization_id',scope.organizationId).order('id').limit(26);if(afterId)query=query.gt('id',afterId);
 const response=await query.setHeader('Authorization','Bearer '+token);assertArchiveScope(scope);if(response.status===401||response.status===403)throw new ArchiveError('ACCESS_DENIED');if(response.error)throw new ArchiveError('SOURCE_UNAVAILABLE');
 const parsed=z.array(staffRow).max(26).safeParse(response.data);if(!parsed.success)throw new ArchiveError('SOURCE_UNAVAILABLE');let previous=afterId;for(const row of parsed.data){if(previous!==null&&row.id<=previous)throw new ArchiveError('SOURCE_CHANGED');previous=row.id;}
 const rows=parsed.data.slice(0,25);return{items:rows.map(row=>({id:row.user_id,label:row.display_name?.trim()||'Сотрудник',expired:row.expires_at!==null&&new Date(row.expires_at).getTime()<=Date.now()})),next:parsed.data.length>25?rows.at(-1)!.id:null};
}
