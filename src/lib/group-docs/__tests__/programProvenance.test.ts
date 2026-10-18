import {describe,expect,it} from "vitest";
import {generateDocument} from "../generate";
import {SAMPLE_CONTEXT} from "../sampleContext";
import {withProgramGeneration,type ProgramGeneration} from "../../../../supabase/functions/_shared/program-facts";
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
