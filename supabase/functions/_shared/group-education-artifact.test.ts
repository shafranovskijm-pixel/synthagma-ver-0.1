// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import * as f from '../../../src/lib/groupEducationFacts/__tests__/fixtures';
import {hasEducationSource,parseEducationSource,parseEducationArtifactSnapshot,resolveGroupEducationArtifact,withEducationArtifact,educationArtifactDocumentSnapshot,educationArtifactRows,EDUCATION_ARTIFACT_NOTICE} from './group-education-artifact';

const parse=(raw:unknown)=>parseEducationArtifactSnapshot(raw,f.scope.organization_id,f.scope.group_id);
describe('strict original-caller retained education artifact',()=>{
 it('retains old programme proof and microseconds while mapping only the separate four-date calendar',()=>{
  const raw=f.compatibleArtifactSnapshot(),v=parse(raw),snapshot=educationArtifactDocumentSnapshot(v);
  expect(v.programme.groupFields?.training_dates).toEqual(['2026-10-19','2026-10-20','2026-10-21','2026-10-22']);
  expect(v.programme.groupFields?.schedule_text).toBe('');expect(v.source.as_of).toBe(f.time);
  expect(snapshot.program_facts.group_snapshot.training_dates).toEqual(['2026-09-01']);
  expect(snapshot.education_calendar.lessons.map(l=>l.topic)).toHaveLength(4);expect(snapshot.education_source_notice).toBe(EDUCATION_ARTIFACT_NOTICE);
 });
 it('rebuilds retained identity rows, dropping current profile/passport/marks/extras',()=>{
  const raw=f.compatibleArtifactSnapshot(),ctx={organization:{id:f.scope.organization_id},group:{id:f.scope.group_id,name:'Live'},students:[{user_id:f.id(999),full_name:'CURRENT',passport:'SECRET',email:'private@invalid'}],extras:{MARK_1:'excellent'}};
  const rebuilt=withEducationArtifact(ctx,raw);
  expect(rebuilt.students).toEqual([{user_id:f.row.user_id,full_name:f.row.subject_label}]);expect(rebuilt.extras).toEqual({});
  const rows=educationArtifactRows(raw,['N','STUDENT_NAME','PASSPORT','MARK_1','STUDENT_PROGRAM']);
  expect(rows).toEqual([{N:'1',STUDENT_NAME:f.row.subject_label,PASSPORT:'',MARK_1:'',STUDENT_PROGRAM:'Учебная программа'}]);
 });
 it.each([null,{},false,{...f.compatibleArtifactSnapshot().source,path:'arbitrary'}, {...f.compatibleArtifactSnapshot().source,knowledge_revision:Number.MAX_SAFE_INTEGER+1}])('present malformed source cannot become legacy (%j)',raw=>{
  expect(hasEducationSource({educationSource:raw})).toBe(true);expect(()=>parseEducationSource(raw)).toThrow('INVALID_INPUT');
 });
 it('uses own property rather than truthiness or inherited source',()=>{
  expect(hasEducationSource({})).toBe(false);expect(hasEducationSource(Object.create({educationSource:{}}))).toBe(false);expect(hasEducationSource({educationSource:null})).toBe(true);
 });
 const corruptions:[string,(raw:any)=>void][]=[
  ['unknown projection key',v=>{v.projection.extra='PII';}],['unknown row key',v=>{v.rows[0].passport='not allowed';}],
  ['scope mismatch',v=>{v.projection.scope.group_id=f.id(900);}],['source echo',v=>{v.source.source_hash='b'.repeat(64);}],
  ['calendar hash',v=>{v.projection.calendar.content_hash='b'.repeat(64);}],['programme reference',v=>{v.projection.program_facts.binding_revision=2;}],
  ['association unconfirmed',v=>{v.rows[0].association='no_program_snapshot';v.rows[0].program_enrollment_snapshot_id=null;}],
  ['snapshot reference missing',v=>{v.projection.program_facts.enrollment_snapshot_ids=[];}],['redaction',v=>{v.header.redacted_count=1;}],
  ['unavailable source',v=>{v.header.available=false;}],['missing label',v=>{v.rows[0].subject_label=null;v.rows[0].label_state='unavailable';}],
  ['wrong label actor',v=>{v.rows[0].label_source.subject_user_id=f.id(901);}],['partial plan',v=>{v.projection.calendar.coverage='partial_plan';v.projection.calendar.partial_reason='partial';}],
  ['five lessons',v=>{v.projection.calendar.lessons.push({...v.projection.calendar.lessons[0],lesson_id:f.id(902)});}],
  ['three lessons',v=>{v.projection.calendar.lessons.pop();}],['cancelled extra',v=>{v.projection.calendar.lessons[3].status='cancelled';v.projection.calendar.lessons[3].cancellation_reason='cancelled';}],
  ['multiple teacher',v=>{v.projection.calendar.lessons[3].teacher_user_id=f.id(903);}],['unknown teacher',v=>{v.projection.calendar.lessons[3].teacher_user_id=null;}],
  ['hours mismatch',v=>{v.projection.calendar.lessons[0].academic_hours='7';}],['calendar draft',v=>{v.projection.calendar.state='draft';}],
 ];
 it.each(corruptions)('fails closed for %s',(_label,mutate)=>{const v=f.compatibleArtifactSnapshot();mutate(v);expect(()=>parse(v)).toThrow();});
 it('supports exact uniform local clocks but rejects varied/partial or wrong-local-date clocks',()=>{
  const v=f.compatibleArtifactSnapshot();for(const l of v.projection.calendar.lessons){l.starts_at=l.local_date+'T06:00:00Z';l.ends_at=l.local_date+'T14:00:00Z';}
  expect(parse(v).programme.groupFields?.schedule_text).toBe('09:00–17:00');
  v.projection.calendar.lessons[3].ends_at='2026-10-22T15:00:00Z';expect(()=>parse(v)).toThrow('TEMPLATE_INCOMPATIBLE');
  v.projection.calendar.lessons[3].starts_at=null;expect(()=>parse(v)).toThrow('TEMPLATE_INCOMPATIBLE');
 });
 it('accepts semantic key order while preserving exact retained values',()=>{
  const reversed=(v:any):any=>Array.isArray(v)?v.map(reversed):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reversed(x)])):v;
  expect(parse(reversed(f.compatibleArtifactSnapshot())).source.as_of).toBe(f.time);
 });
 it('keeps same-name subjects distinct by canonical IDs across pinned pages',async()=>{
  const v=f.compatibleArtifactSnapshot(),second={...structuredClone(v.rows[0]),user_id:f.id(23),enrollment_id:f.id(24),program_enrollment_snapshot_id:f.id(25),label_source:{kind:'authorized_current_profile' as const,subject_user_id:f.id(23)}};
  v.header.row_count=2;v.projection.program_facts.enrollment_snapshot_ids.push(second.program_enrollment_snapshot_id!);
  const rpc=vi.fn((_name:string,args:any)=>Promise.resolve({data:{schema_version:1,header:v.header,rows:args.p_query.after_user_id?[second]:v.rows,next_after_user_id:args.p_query.after_user_id?null:v.rows[0].user_id,artifact_projection:args.p_query.after_user_id?null:v.projection},error:null}));
  const result=await resolveGroupEducationArtifact({rpc},f.scope.organization_id,f.scope.group_id,v.source);
  expect(result.rows.map(r=>r.user_id)).toEqual([f.id(20),f.id(23)]);expect(result.rows.map(r=>r.subject_label)).toEqual([f.row.subject_label,f.row.subject_label]);
  expect(rpc).toHaveBeenCalledTimes(2);expect(rpc.mock.calls[1][1].p_query.after_user_id).toBe(f.id(20));
 });
 it('rejects same-key denial, moved header and repeated/nonadvancing page without legacy reads',async()=>{
  const v=f.compatibleArtifactSnapshot();v.header.row_count=2;
  for(const variant of ['denied','header','cursor']){
   let calls=0;const rpc=vi.fn(()=>Promise.resolve(++calls===1?{data:{schema_version:1,header:v.header,rows:v.rows,next_after_user_id:v.rows[0].user_id,artifact_projection:v.projection},error:null}:variant==='denied'?{data:null,error:{code:'42501'}}:{data:{schema_version:1,header:{...v.header,source_hash:variant==='header'?'b'.repeat(64):v.header.source_hash},rows:v.rows,next_after_user_id:v.rows[0].user_id,artifact_projection:null},error:null}));
   await expect(resolveGroupEducationArtifact({rpc},f.scope.organization_id,f.scope.group_id,v.source)).rejects.toThrow();expect(rpc.mock.calls.length).toBe(2);
  }
 });
 it.each(['SOURCE_CHANGED','SOURCE_UNAVAILABLE','TEMPLATE_INCOMPATIBLE','INVALID_INPUT','ACCESS_DENIED'])('preserves fixed original SQL %s error without exposing raw messages',async code=>{
  const v=f.compatibleArtifactSnapshot(),rpc=()=>Promise.resolve({data:null,error:{code:'P0001',message:'GROUP_FACTS_'+code}});await expect(resolveGroupEducationArtifact({rpc},f.scope.organization_id,f.scope.group_id,v.source)).rejects.toMatchObject({code,message:code});
 });
 it('does not echo unknown SQL details or treat them as an authoritative source',async()=>{const v=f.compatibleArtifactSnapshot(),rpc=()=>Promise.resolve({data:null,error:{code:'P0001',message:'private detail GROUP_FACTS_SOURCE_UNAVAILABLE'}});await expect(resolveGroupEducationArtifact({rpc},f.scope.organization_id,f.scope.group_id,v.source)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE',message:'DEPENDENCY_UNAVAILABLE'});});
 it('pins original Authorization through the actual installed SDK lazy token path',async()=>{
  const v=f.compatibleArtifactSnapshot(),sent:string[]=[];
  const client=createClient('https://synthetic.invalid','synthetic-anon',{accessToken:async()=>'LATER_TOKEN_B',global:{fetch:async(input,init)=>{const request=new Request(input,init);sent.push(request.headers.get('Authorization')!);expect(await request.json()).toMatchObject({p_organization_id:f.scope.organization_id,p_group_id:f.scope.group_id,p_query:{kind:'snapshot',snapshot_id:v.header.id}});return new Response(JSON.stringify({schema_version:1,header:v.header,rows:v.rows,next_after_user_id:null,artifact_projection:v.projection}),{status:200,headers:{'content-type':'application/json'}});}}});
  await resolveGroupEducationArtifact(client,f.scope.organization_id,f.scope.group_id,v.source,'Bearer ORIGINAL_A');expect(sent).toEqual(['Bearer ORIGINAL_A']);
 });
});
