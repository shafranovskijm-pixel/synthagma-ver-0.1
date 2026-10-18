// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseGroupProgramGeneration, resolveGroupProgramGeneration, withProgramGeneration, programGenerationScalars, programTrainingPeriod } from "./program-facts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const org=id(1),group=id(2),course=id(3),student=id(4),other=id(5);
export const programEnvelope = () => ({ state:"confirmed",reason:null,group_id:group,course_id:course,enrollment_id:null,revision:1,
  binding:{id:id(6),organization_id:org,group_id:group,course_id:course,revision:1,version_id:id(7),program_id:id(8),snapshot_hash:"a".repeat(64),
    group_snapshot:{name:"Pinned QA v1",start_date:"2026-10-01",end_date:"2026-10-02",training_dates:["2026-10-01","2026-10-02"],schedule_text:"10:00–18:00",instructor_name:"Pinned QA teacher"},
    program_snapshot:{id:id(7),organization_id:org,program_id:id(8),state:"approved",approved_at:"2026-10-18T12:00:00Z",approved_by:id(9),
      file_document_id:id(10),file_version_id:id(11),file_review_id:id(12),facts_hash:"b".repeat(64),
      file_approval:{number:"QA approval",date:"2026-10-18",recorded_by:id(9)},
      facts:{schema_version:1,full_title:"Approved QA v1",program_type:"dpo_upskilling",academic_hours:16,training_form:"mixed",duration_calendar:"2 days",attestation_form:"test",attestation_criteria:"explicit criteria"}}},
  enrollments:[{enrollment_id:id(13),user_id:student,snapshot_id:id(14),state:"confirmed"},{enrollment_id:id(15),user_id:other,snapshot_id:id(16),state:"confirmed"}] });
describe("authoritative shared programme generation resolver",()=>{
 it("projects the exact pinned version and selected enrollment snapshots, never live course text",()=>{
  const p=parseGroupProgramGeneration(programEnvelope(),org,group,[student]);
  expect(p.fields).toEqual({program_title:"Approved QA v1",program_hours:16,program_form:"Очно-заочная"});
  expect(p.provenance).toMatchObject({state:"confirmed",version_id:id(7),file_version_id:id(11),enrollment_snapshot_ids:[id(14)]});
  const legacy={group:{program_title:"Live course v2",program_hours:72,program_form:"Очная",start_date:"2025-01-01"}};
  expect(withProgramGeneration(legacy,p).group).toEqual({...legacy.group,...p.groupFields,...p.fields});expect(legacy.group.program_hours).toBe(72);
  expect(p.provenance.facts_snapshot).toEqual(programEnvelope().binding.program_snapshot.facts);
  expect(p.provenance.group_snapshot).toEqual(programEnvelope().binding.group_snapshot);
  expect(programGenerationScalars(p)).toMatchObject({START_DATE:"2026-10-01",END_DATE:"2026-10-02",SCHEDULE:"10:00–18:00",ATTESTATION_FORM:"test"});
  expect(programTrainingPeriod(p)).toBe("01.10.2026 — 02.10.2026");
 });
 it.each([
  ["foreign group",(v:any)=>v.group_id=id(99)], ["foreign org",(v:any)=>v.binding.organization_id=id(99)],
  ["foreign course",(v:any)=>v.binding.course_id=id(99)], ["stale binding",(v:any)=>v.binding.revision=2],
  ["wrong version",(v:any)=>v.binding.program_snapshot.id=id(99)], ["wrong program",(v:any)=>v.binding.program_snapshot.program_id=id(99)],
  ["draft facts",(v:any)=>v.binding.program_snapshot.state="draft"], ["missing approval",(v:any)=>v.binding.program_snapshot.approved_at=null],
  ["missing file proof",(v:any)=>v.binding.program_snapshot.file_review_id=null], ["bad hash",(v:any)=>v.binding.snapshot_hash="guessed"],
  ["unknown hours",(v:any)=>v.binding.program_snapshot.facts.academic_hours=null], ["unknown training form",(v:any)=>v.binding.program_snapshot.facts.training_form=null],
  ["missing enrollment snapshot",(v:any)=>v.enrollments[0].snapshot_id=null], ["unconfirmed enrollment",(v:any)=>v.enrollments[0].state="unconfirmed"],
  ["duplicate user",(v:any)=>v.enrollments.push({...v.enrollments[0],enrollment_id:id(99)})], ["duplicate snapshot",(v:any)=>v.enrollments[1].snapshot_id=v.enrollments[0].snapshot_id],
  ["missing captured calendar",(v:any)=>delete v.binding.group_snapshot], ["invalid captured dates",(v:any)=>v.binding.group_snapshot.training_dates=["guessed"]],
 ])("rejects %s before generation",(_,mutate)=>{const v=programEnvelope();mutate(v);expect(()=>parseGroupProgramGeneration(v,org,group,[student])).toThrow();});
 it("rejects a missing requested student and duplicate caller roster",()=>{
  expect(()=>parseGroupProgramGeneration(programEnvelope(),org,group,[id(99)])).toThrow();
  expect(()=>parseGroupProgramGeneration(programEnvelope(),org,group,[student,student])).toThrow();
 });
 it("allows only explicit unbound legacy draft state without inventing a version",()=>{
  const v={...programEnvelope(),state:"unconfirmed",reason:"no_confirmed_group_binding",binding:null};
  const p=parseGroupProgramGeneration(v,org,group,[student]);expect(p.fields).toBeNull();
  expect(p.provenance).toEqual({schema_version:1,state:"unconfirmed",organization_id:org,group_id:group,course_id:course,reason:"no_confirmed_group_binding"});
  expect(()=>parseGroupProgramGeneration({...v,reason:null},org,group,[student])).toThrow();
  expect(()=>parseGroupProgramGeneration({...v,binding:programEnvelope().binding},org,group,[student])).toThrow();
 });
 it("uses exact original-caller RPC and fails closed on backend unavailability",async()=>{
  const rpc=vi.fn(async()=>({data:programEnvelope(),error:null}));await resolveGroupProgramGeneration({rpc},org,group,[student]);
  expect(rpc).toHaveBeenCalledWith("get_group_program_facts",{p_organization_id:org,p_group_id:group,p_enrollment_id:null});
  await expect(resolveGroupProgramGeneration({rpc:async()=>({data:null,error:{code:"PGRST202"}})},org,group,[student])).rejects.toMatchObject({status:503});
 });
 it("keeps captured nulls unknown instead of using subsequently entered live calendar fields",()=>{
  const v:any=programEnvelope();for(const k of Object.keys(v.binding.group_snapshot))v.binding.group_snapshot[k]=null;
  const p=parseGroupProgramGeneration(v,org,group,[student]);const live={group:{program_title:"v2",program_hours:999,program_form:"Очная",start_date:"2030-01-01",end_date:"2030-01-31",training_dates:["2030-01-01"],schedule_text:"LIVE",instructor_name:"LIVE"}};
  expect(withProgramGeneration(live,p).group).toMatchObject({name:"",start_date:"",end_date:"",training_dates:[],schedule_text:"",instructor_name:""});
  expect(p.provenance.group_snapshot?.start_date).toBeNull();expect(programTrainingPeriod(p)).toBe("");
 });
});
