import {describe,expect,it} from "vitest";
import {generateDocument} from "../generate";
import {SAMPLE_CONTEXT} from "../sampleContext";
import {withProgramGeneration,type ProgramGeneration} from "../../../../supabase/functions/_shared/program-facts";
import {compatibleArtifactSnapshot,id} from '@/lib/groupEducationFacts/__tests__/fixtures';
import {generatePackage} from '../generate';
import {PACKAGE_DOC_TYPES} from '../packageTypes';
describe("generic group document programme source",()=>{
 it("keeps unbound programme output draft without an official number or approval claim",()=>{
  const provenance={schema_version:1 as const,state:"unconfirmed" as const,organization_id:"qa-org",group_id:"qa-group",course_id:null,reason:"no_confirmed_group_binding"};
  const doc=generateDocument(SAMPLE_CONTEXT,"enrollment_order",{mode:"data",requestedStatus:"final",documentNumber:"MUST-NOT-BE-ISSUED",programFacts:provenance});
  expect(doc.doc_status).toBe("draft");expect(doc.document_number).toBe("");
  expect(doc.variables_snapshot).toEqual({program_facts:provenance,student_user_ids:SAMPLE_CONTEXT.students.map(s=>s.user_id).sort()});
  expect(doc.source_note).toContain("не подтверждены");
 });
 it("renders the pinned title, hours and form while preserving unrelated dates and the original context",()=>{
  const source:ProgramGeneration={state:"confirmed",reason:null,fields:{program_title:"QA approved v1",program_hours:16,program_form:"Заочная"},
    groupFields:{name:"Pinned QA group",start_date:"2026-10-01",end_date:"2026-10-02",training_dates:["2026-10-01"],schedule_text:"Pinned schedule",instructor_name:"Pinned teacher"},
    facts:{duration_calendar:"2 days",attestation_form:"test",attestation_criteria:"explicit criteria"},provenance:{schema_version:1,state:"confirmed",organization_id:"qa-org",group_id:"qa-group",course_id:"qa-course",version_id:"v1"}};
  const original=structuredClone(SAMPLE_CONTEXT);const ctx=withProgramGeneration(original,source);
  const doc=generateDocument(ctx,"title_page",{mode:"blank",requestedStatus:"draft",programFacts:source.provenance});
  expect(doc.variables).toMatchObject({program_title:"QA approved v1",program_hours:"16",program_form:"Заочная"});
  expect(ctx.group.start_date).toBe("2026-10-01");expect(original.group.program_title).toBe(SAMPLE_CONTEXT.group.program_title);
  expect(doc.variables).toMatchObject({start_date:"01.10.2026",end_date:"02.10.2026",instructor_name:"Pinned teacher"});
  expect(doc.variables_snapshot?.program_facts).toEqual(source.provenance);
 });
});
describe('new retained group education source never grants issuance or copies current personal fields',()=>{
 const context=()=>({...structuredClone(SAMPLE_CONTEXT),organization:{...SAMPLE_CONTEXT.organization,id:id(1)},group:{...SAMPLE_CONTEXT.group,id:id(2)},students:[{user_id:id(90),full_name:'SHOULD-NOT-COPY',passport:'SHOULD-NOT-COPY'}],extras:{private_profile_value:'SHOULD-NOT-COPY'}});
 it('all nine siblings share one canonical snapshot, distinct dates, draft and NULLnumber',()=>{const source=compatibleArtifactSnapshot(),dates=Object.fromEntries(PACKAGE_DOC_TYPES.map((type,i)=>[type,`2026-11-${String(i+1).padStart(2,'0')}`]));const docs=generatePackage(context(),PACKAGE_DOC_TYPES,{educationSnapshot:source,documentDates:dates,mode:'data',requestedStatus:'final',documentNumber:'MUST-NOT-ISSUE'});expect(docs).toHaveLength(9);for(const doc of docs){expect(doc.doc_status).toBe('draft');expect(doc.document_number).toBeNull();expect(doc.document_date).toBe(dates[doc.doc_type]);expect(doc.variables_snapshot?.education_source).toEqual(source.source);expect((doc.variables_snapshot?.program_facts as any).group_snapshot.start_date).toBe('2026-09-01');expect(JSON.stringify(doc)).not.toContain('SHOULD-NOT-COPY');expect(doc.source_note).toContain('отображаемые подписи');}});
 it('present malformed source cannot silently use legacy context',()=>{expect(()=>generateDocument(context(),'title_page',{educationSnapshot:null as any,documentDate:'2026-10-19'})).toThrow();expect(()=>generateDocument(context(),'contract',{educationSnapshot:compatibleArtifactSnapshot(),documentDate:'2026-10-19'})).toThrow();});
 it('requires explicit document date and compatible complete fourlesson source',()=>{expect(()=>generateDocument(context(),'enrollment_order',{educationSnapshot:compatibleArtifactSnapshot()})).toThrow('дату');const s=compatibleArtifactSnapshot();s.projection.calendar.lessons.pop();expect(()=>generateDocument(context(),'title_page',{educationSnapshot:s,documentDate:'2026-10-19'})).toThrow();});
 it('keeps newly selected human signatories without reviving old extras',()=>{const doc=generateDocument(context(),'enrollment_order',{educationSnapshot:compatibleArtifactSnapshot(),documentDate:'2026-10-19',manualSignatories:{enrollment_order:{position:'Учебный директор',name:'Учебная подпись ответственного'}},documentBasis:'Договор — учебный пример'});expect(doc.variables).toMatchObject({signatory_position_enrollment_order:'Учебный директор',signatory_name_enrollment_order:'Учебная подпись ответственного'});expect(JSON.stringify(doc)).not.toContain('SHOULD-NOT-COPY');});
});
