// @vitest-environment node
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import JSZip from 'jszip';
import {z} from 'zod';
import {describe,it,expect,vi} from 'vitest';
import * as f from '../../../src/lib/groupEducationFacts/__tests__/fixtures';
import * as access from './privileged-access';
import {requireDocumentWrite} from './document-operation-access';
import * as programmes from './program-facts';
import * as artifacts from './group-education-artifact';
import * as journal from './docx-ooxml/classJournal';
import * as documents from './docx-ooxml/groupDocument';
import * as money from './docx-ooxml/money';
import * as embeddedJournal from './group-doc-templates/goreltech/class-journal/v1/embedded';
import {GROUP_DOCUMENT_TEMPLATE_BUNDLE} from './group-doc-templates/goreltech/group-package/v1/embedded';

const org='7237f9d4-3670-4a19-8946-a43c68fd3473',actor=f.id(40),cap='goreltech-group-package-uc013-v1',legacy='goreltech-group-package-dry-run-v14';
const types=['enrollment_order','expulsion_order','student_list','schedule','attestation_sheet','registration_book','title_page','pass'] as const;
function fixture(){
 const v=f.compatibleArtifactSnapshot();v.header.scope.organization_id=org;v.projection.scope.organization_id=org;v.projection.calendar.scope.organization_id=org;v.projection.program_facts.organization_id=org;return v;
}
function setup(options:{denyRead?:boolean;revokeSource?:boolean;actorChanges?:boolean}={}){
 const snapshot=fixture(),uploads:{path:string;bytes:Uint8Array}[]=[],persisted:any[]=[];
 const upload=vi.fn(async(path:string,bytes:Uint8Array)=>{uploads.push({path,bytes});return{error:null};}),remove=vi.fn(async()=>({error:null}));
 const profileRead=vi.fn(async()=>{throw Error('New source must not read current learner profiles');});let sourceCalls=0,authCalls=0;
 const from=vi.fn((table:string)=>{
  if(['profiles','student_frdo_data'].includes(table))throw Error('Forbidden current profile lookup');
  const data:Record<string,unknown>={student_groups:{id:f.scope.group_id,organization_id:org,course_id:f.scope.course_id,name:'LIVE name',group_number:'QA-013',program_title:'LIVE programme',program_hours:999,instructor_name:'LIVE teacher',training_dates:['2030-01-01']},organizations:{id:org,name:'ГОРЭЛТЕХ QA',inn:'7806541216',director_name:'QA director',director_position:'QA position'},courses:{id:f.scope.course_id,organization_id:org,title:'LIVE course',duration:999},account_deletion_revocations:null};
  const result=()=>({data:data[table]??null,error:null});const q:any={select:()=>q,eq:()=>q,in:()=>q,maybeSingle:async()=>result(),then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return q;
 });
 const calls:{name:string;args:any;bearer:string|null;service:boolean}[]=[];
 const client=(bearer:string|null,service:boolean)=>({auth:{getUser:vi.fn(async(token:string)=>{expect(token).toBe('ORIGINAL_A');authCalls++;return{data:{user:{id:options.actorChanges&&authCalls>1?f.id(99):actor}},error:null};})},from,storage:{from:()=>({upload,remove})},rpc:(name:string,args:any)=>{
  const run=(pinned:string|null)=>{calls.push({name,args,bearer:pinned,service});
   if(name==='uc_document_action_allowed')return{data:args.p_action==='read'?!options.denyRead:true,error:null};
   if(name==='get_group_program_facts')throw Error('New source must never use legacy/current membership proof');
   if(name==='read_group_education_facts'){
    sourceCalls++;if(options.revokeSource&&sourceCalls>1)return{data:null,error:{code:'42501'}};
    return{data:{schema_version:1,header:snapshot.header,rows:snapshot.rows,next_after_user_id:null,artifact_projection:snapshot.projection},error:null};
   }
   if(name==='register_goreltech_group_document_stage'){expect(service).toBe(true);return{data:{payload_sha256:f.hash},error:null};}
   if(name==='create_goreltech_group_document_batch'){expect(service).toBe(false);persisted.push(...args.p_docs);return{data:{batch_id:f.id(90),batch_version:1,inserted_count:args.p_docs.length},error:null};}
   throw Error('Unexpected RPC '+name);
  };
  const q:any={then:(resolve:any,reject:any)=>Promise.resolve().then(()=>run(bearer)).then(resolve,reject),setHeader:(key:string,value:string)=>{expect(key).toBe('Authorization');return Promise.resolve().then(()=>run(value));}};return q;
 }});
 let handler!:(req:Request)=>Promise<Response>;
 const source=readFileSync('supabase/functions/compile-group-class-journal/index.ts','utf8'),ast=ts.createSourceFile('compiler.ts',source,ts.ScriptTarget.Latest,true);
 const ranges=ast.statements.flatMap(s=>ts.isImportDeclaration(s)?[{start:s.getFullStart(),end:s.end}]:ts.canHaveModifiers(s)?(ts.getModifiers(s)||[]).filter(m=>m.kind===ts.SyntaxKind.ExportKeyword).map(m=>({start:m.getStart(ast),end:m.end})):[]);
 const stripped=ranges.sort((a,b)=>b.start-a.start).reduce((s,r)=>s.slice(0,r.start)+s.slice(r.end),source);
 const executable=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const deps={...access,...programmes,...artifacts,...journal,...documents,...money,...embeddedJournal,GROUP_DOCUMENT_TEMPLATE_BUNDLE,requireDocumentWrite,readEffectiveGroupProfiles:profileRead,JSZip,z,corsHeaders:{},createClient:(_url:string,key:string,opts?:any)=>client(opts?.global?.headers?.Authorization??null,key==='SERVICE'),console:{error(){},warn(){},log(){}},Deno:{serve:(fn:typeof handler)=>{handler=fn;},env:{get:(key:string)=>key==='SUPABASE_SERVICE_ROLE_KEY'?'SERVICE':key==='SUPABASE_ANON_KEY'?'ANON':'https://synthetic.invalid'}}};
 new Function(...Object.keys(deps),executable)(...Object.values(deps));
 const request=(body:any,required:string|undefined=cap)=>handler(new Request('https://synthetic.invalid/functions/v1/compile-group-class-journal',{method:'POST',headers:{Authorization:'Bearer ORIGINAL_A','content-type':'application/json',...(required?{'X-Sintagma-Required-Compiler-Revision':required}:{})},body:JSON.stringify(body)}));
 const body=(dryRun=true)=>({organizationId:org,groupId:f.scope.group_id,studentUserIds:snapshot.rows.map(r=>r.user_id),educationSource:snapshot.source,fillMode:'data',dryRun,journalDocumentDate:'2026-10-19',otherDocuments:types.map(doc_type=>{
  const m=JSON.parse(GROUP_DOCUMENT_TEMPLATE_BUNDLE[doc_type].manifestJson);return{doc_type,name:'QA '+doc_type,document_date:'2026-10-19',doc_status:'final',document_number:'MUST-NOT-ISSUE',variables:{org_city:'QA city',year:'2026',contract_basis_line:'QA draft basis',program_title:'FORGED title',program_hours:'999',...(m.row_source_key?{[m.row_source_key]:'<tr>'+m.row_tokens.map(()=>'<td>FORGED</td>').join('')+'</tr>'}:{})}};
 })});
 return{snapshot,request,body,uploads,upload,remove,persisted,calls,profileRead,from};
}
describe('actual compiler retained UC013 branch',()=>{
 it('compiles a nine-document dry run from retained identities/calendar without writes/current profiles',async()=>{
  const v=setup(),res=await v.request(v.body());expect(res.status,await res.clone().text()).toBe(200);const body=await res.json();
  expect(body.compilerRevision).toBe(cap);expect(body.educationSource).toEqual(v.snapshot.source);expect(body.writesPerformed).toBe(false);expect(body.documentCount).toBe(9);
  expect(body.documents.every((d:any)=>d.doc_status==='draft'&&d.document_number===null)).toBe(true);expect(body.warnings).toContain(artifacts.EDUCATION_ARTIFACT_NOTICE);
  expect(v.upload).not.toHaveBeenCalled();expect(v.profileRead).not.toHaveBeenCalled();expect(v.calls.some(c=>c.name==='get_group_program_facts')).toBe(false);
  const reads=v.calls.filter(c=>c.name==='read_group_education_facts');expect(reads).toHaveLength(2);expect(reads.every(c=>!c.service&&c.bearer==='Bearer ORIGINAL_A')).toBe(true);
 });
 it('persists only canonical draft siblings, exact source/label IDs and unchanged old programme calendar',async()=>{
  const v=setup(),input=v.body(false);for(const d of input.otherDocuments)if(d.doc_type==='schedule')Object.assign(d.variables,{schedule_rows:'<tr><td>FORGED_DATE</td><td>FORGED_TIME</td><td>FORGED_TOPIC</td><td>99</td><td>FORGED_TEACHER</td></tr>'});const res=await v.request(input);expect(res.status,await res.clone().text()).toBe(200);expect(v.persisted).toHaveLength(9);expect(v.uploads).toHaveLength(9);
  for(const d of v.persisted){
   expect(d.doc_status).toBe('draft');expect(d.document_number).toBeNull();expect(d.variables_snapshot.education_source).toEqual(v.snapshot.source);
   expect(d.variables_snapshot.education_calendar.lessons).toHaveLength(4);expect(d.variables_snapshot.students).toEqual([{row_number:1,user_id:f.row.user_id,full_name:f.row.subject_label,label_observed_at:f.time,label_source:f.row.label_source}]);
   expect(d.variables_snapshot.program_facts.group_snapshot.training_dates).toEqual(['2026-09-01']);expect(d.variables_snapshot.scalars.DAY1_DATE).toBe('19.10.2026');
   const bytes=v.uploads.find(u=>u.path===d.file_path)!.bytes,zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml')!.async('string');expect(xml).not.toContain('FORGED');expect(xml).not.toContain('LIVE teacher');if(d.doc_type==='schedule'){for(const date of ['19.10.2026','20.10.2026','21.10.2026','22.10.2026'])expect(xml.replace(/<[^>]+>/g,'')).toContain(date);expect(d.variables_snapshot.education_lesson_ids).toHaveLength(4);for(let index=1;index<=4;index++){expect(d.variables_snapshot.scalars['SCHEDULE_DATE_'+index]).toBe((18+index)+'.10.2026');expect(d.variables_snapshot.scalars['SCHEDULE_TIME_'+index]).toBe('');expect(d.variables_snapshot.scalars['SCHEDULE_TEACHER_'+index]).toBe(v.snapshot.projection.calendar.lessons[0].teacher_label);expect(d.variables_snapshot.scalars['SCHEDULE_TOPIC_'+index]).toBe('');expect(d.variables_snapshot.scalars['SCHEDULE_HOURS_'+index]).toBe('');}}
  }
  const journal=v.persisted.find(d=>d.doc_type==='class_journal');expect(journal.variables_snapshot.scalars.DATE_4).toBe('22.10.2026');expect(journal.variables_snapshot.attendance_source).toBe('unavailable_blank');
 });
 it.each(['Иванов Иван Иванович;Петров Пётр Петрович','Иванов Иван Иванович\nПетров Пётр Петрович'])('keeps one retained teacher display label in one canonical short-name slot (%j)',async label=>{
  const v=setup();for(const lesson of v.snapshot.projection.calendar.lessons)lesson.teacher_label=label;
  const res=await v.request(v.body(false));expect(res.status,await res.clone().text()).toBe(200);expect(v.persisted).toHaveLength(9);
  for(const d of v.persisted){expect(d.variables_snapshot.scalars.INSTRUCTOR_SHORT).toBe('Иванов И.И.; Петров П.П.');if(d.doc_type!=='class_journal'){expect(d.variables_snapshot.scalars.INSTRUCTOR_1_SHORT).toBe('Иванов И.И.; Петров П.П.');expect(d.variables_snapshot.scalars.INSTRUCTOR_2_SHORT).toBe('');}expect(d.variables_snapshot.education_calendar.lessons[0].teacher_label).toBe(label);}
 });
 it.each([null,{},false])('rejects malformed present source %j without legacy/source/profile fallback',async source=>{
  const v=setup(),res=await v.request({...v.body(),educationSource:source});expect(res.status).toBe(400);expect((await res.json()).code).toBe('INVALID_INPUT');expect(v.calls).toEqual([]);expect(v.profileRead).not.toHaveBeenCalled();expect(v.upload).not.toHaveBeenCalled();
 });
 it.each([true,false])('requires exact new capability for dryRun=%s before source persistence',async dryRun=>{
  const v=setup(),res=await v.request(v.body(dryRun),legacy);expect(res.status).toBe(409);expect(v.calls).toEqual([]);expect(v.upload).not.toHaveBeenCalled();
 });
 it('rejects incompatible plan before any upload/number/stage/commit',async()=>{
  const v=setup();v.snapshot.projection.calendar.lessons.pop();const res=await v.request(v.body(false));expect(res.status).toBe(409);expect((await res.json()).code).toBe('TEMPLATE_INCOMPATIBLE');expect(v.upload).not.toHaveBeenCalled();expect(v.persisted).toEqual([]);
 });
 it.each([{revokeSource:true},{actorChanges:true}])('rechecks original actor and source before response/commit (%j)',async options=>{
  const v=setup(options),res=await v.request(v.body(false));expect(res.status).toBe(403);expect(v.persisted).toEqual([]);expect(v.uploads).toHaveLength(9);expect(v.remove).toHaveBeenCalledOnce();expect(v.calls.some(c=>c.name==='register_goreltech_group_document_stage')).toBe(false);
 });
 it('negotiates old source-less probe unchanged, and authenticated new probe with no source/media operations',async()=>{
  const v=setup(),old=await v.request({capabilityProbe:true},undefined);expect(old.status).toBe(400);expect(old.headers.get('X-Sintagma-Compiler-Revision')).toBe(legacy);expect(v.calls).toEqual([]);
  const next=await v.request({capabilityProbe:true,requiredRevision:cap,organizationId:org,groupId:f.scope.group_id},undefined);expect(next.status).toBe(400);expect(next.headers.get('X-Sintagma-Compiler-Revision')).toBe(cap);expect(v.calls.map(c=>c.name)).toEqual(['uc_document_action_allowed','uc_document_action_allowed']);expect(v.profileRead).not.toHaveBeenCalled();expect(v.upload).not.toHaveBeenCalled();
 });
 it('does not advertise new capability for unknown revision, malformed probe or denied current read',async()=>{
  for(const body of [{capabilityProbe:true,requiredRevision:'unknown'},{capabilityProbe:true,requiredRevision:cap}]){const v=setup(),res=await v.request(body,undefined);expect(res.status).toBe(400);expect(res.headers.get('X-Sintagma-Compiler-Revision')).toBe(legacy);expect(v.calls).toEqual([]);}
  const v=setup({denyRead:true}),res=await v.request({capabilityProbe:true,requiredRevision:cap,organizationId:org,groupId:f.scope.group_id},undefined);expect(res.status).toBe(403);expect(res.headers.get('X-Sintagma-Compiler-Revision')).toBe(legacy);expect(v.profileRead).not.toHaveBeenCalled();
 });
});
