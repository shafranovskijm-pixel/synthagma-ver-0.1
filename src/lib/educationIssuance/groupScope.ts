import { supabase } from '@/integrations/supabase/client';
import { EducationIssuanceError, requireIssuanceScope, type EducationIssuanceScope } from './client.ts';
import { journalUuid } from '@/lib/customJournals/contract';

export interface EnrollmentGroupChoice { id:string; label:string; }
/** Uses effective membership and exact course assignment, never the profile's primary group alone.
 * This read does not depend on an admission case, programme approval or documents permission. */
export async function readEnrollmentGroupChoices(scope:EducationIssuanceScope,enrollmentIds:string[]):Promise<EnrollmentGroupChoice[]> {
  requireIssuanceScope(scope);
  const ids=[...new Set(enrollmentIds)];
  if(!ids.length||ids.length>1000||ids.some(id=>!journalUuid.safeParse(id).success))throw new EducationIssuanceError('INVALID_INPUT');
  const session=await supabase.auth.getSession();requireIssuanceScope(scope);
  if(session.error||session.data.session?.user.id!==scope.actorId||!session.data.session.access_token)throw new EducationIssuanceError('ACCESS_DENIED');
  const authorization='Bearer '+session.data.session.access_token;
  const assignments:{id:string;user_id:string;course_id:string}[]=[];
  for(let offset=0;offset<ids.length;offset+=100){
    const selected=ids.slice(offset,offset+100);
    const response=await supabase.from('enrollments').select('id,user_id,course_id,courses!inner(organization_id)').in('id',selected).eq('courses.organization_id',scope.organizationId).setHeader('Authorization',authorization);
    requireIssuanceScope(scope);if(response.error)throw new EducationIssuanceError('ACCESS_DENIED');
    const rows=response.data??[];
    if(rows.length!==selected.length||new Set(rows.map(row=>row.id)).size!==rows.length||rows.some(row=>!selected.includes(row.id)||!journalUuid.safeParse(row.user_id).success||!journalUuid.safeParse(row.course_id).success||(row.courses as {organization_id:string}|null)?.organization_id!==scope.organizationId))throw new EducationIssuanceError('ACCESS_DENIED');
    assignments.push(...rows);
  }
  const users=[...new Set(assignments.map(row=>row.user_id))];
  const memberships:{group_id:string;user_id:string}[]=[],seenPairs=new Set<string>();
  const maxMembershipPairs=10000;
  for(let offset=0;offset<users.length;offset+=100){
    const selected=users.slice(offset,offset+100);
    let previousPair:string|null=null;
    for(let page=0;;page++){
      const response=await supabase.from('student_group_memberships_effective').select('organization_id,group_id,user_id').eq('organization_id',scope.organizationId).in('user_id',selected).order('group_id').order('user_id').range(page*100,page*100+99).setHeader('Authorization',authorization);
      requireIssuanceScope(scope);if(response.error)throw new EducationIssuanceError('ACCESS_DENIED');
      const rows=response.data??[];
      if(rows.some(row=>row.organization_id!==scope.organizationId||!selected.includes(row.user_id)||!journalUuid.safeParse(row.group_id).success))throw new EducationIssuanceError();
      if(rows.length>100)throw new EducationIssuanceError();
      for(const row of rows){const pair=row.group_id+':'+row.user_id;
        if(seenPairs.has(pair)||previousPair!==null&&pair<=previousPair)throw new EducationIssuanceError('SOURCE_CHANGED');
        if(seenPairs.size>=maxMembershipPairs)throw new EducationIssuanceError('LIMIT_EXCEEDED');
        seenPairs.add(pair);previousPair=pair;
      }
      memberships.push(...rows);if(rows.length<100)break;
    }
  }
  const groupIds=[...new Set(memberships.map(row=>row.group_id))], groups:{id:string;name:string;course_id:string|null}[]=[];
  const seenGroups=new Set<string>();
  for(let offset=0;offset<groupIds.length;offset+=100){
    const selected=groupIds.slice(offset,offset+100);
    const response=await supabase.from('student_groups').select('id,name,course_id,organization_id').eq('organization_id',scope.organizationId).in('id',selected).setHeader('Authorization',authorization);
    requireIssuanceScope(scope);if(response.error)throw new EducationIssuanceError('ACCESS_DENIED');
    if((response.data??[]).some(row=>row.organization_id!==scope.organizationId||!selected.includes(row.id)))throw new EducationIssuanceError();
    for(const row of response.data??[]){if(seenGroups.has(row.id))throw new EducationIssuanceError('SOURCE_CHANGED');seenGroups.add(row.id);}
    groups.push(...response.data??[]);
  }
  requireIssuanceScope(scope);
  const pairs=new Set(memberships.map(row=>row.group_id+':'+row.user_id));
  return groups.filter(group=>assignments.every(row=>group.course_id===row.course_id&&pairs.has(group.id+':'+row.user_id)))
    .map(group=>({id:group.id,label:(group.name??'').trim().slice(0,160)||'Группа без названия'})).sort((a,b)=>a.id.localeCompare(b.id));
}
