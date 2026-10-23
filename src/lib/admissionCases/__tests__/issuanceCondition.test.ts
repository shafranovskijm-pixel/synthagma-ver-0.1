import { describe, expect, it } from "vitest";
import { admissionStaffCaseSchema, admissionLocalRequirementInputSchema, admissionCaseActionSchema } from "../contract";
import { admissionIssuanceConditionSchema, admissionIssuanceEvidenceSchema } from "../issuanceCondition";
import { staffCase, id, program, caseId, localSource } from "./fixtures";
describe("optional issuance phase preserves historical admission decisions",()=>{
  it("parses an old untyped case without adding a condition, evidence or a new decision",()=>{
    const original=staffCase(),parsed=admissionStaffCaseSchema.parse(original);
    expect(parsed).toEqual(original);expect(parsed).not.toHaveProperty("issuance_conditions");expect(parsed).not.toHaveProperty("issuance_reviews");
  });
  it("does not accept a generic condition as a hidden exception to primary education",()=>{
    expect(admissionIssuanceConditionSchema.safeParse({kind:"primary_education_before_qualification",education_levels:["spo","vo"],concurrent_study_admission_allowed:true,waive_qualification_requirement:true}).success).toBe(false);
    expect(admissionIssuanceEvidenceSchema.safeParse({kind:"completed_primary_education",education_level:"still_studying",evidence_version_ids:[id(30)]}).success).toBe(false);
  });
  it("binds the typed phase only to an education-basis definition",()=>{
    const row={key:"application",kind:"application",staff_label:"Заявление",source_version_ids:[localSource.version_id],provision:"п.1",exception_policy:"not_defined",
      issuance_condition:{kind:"primary_education_before_qualification",education_levels:["spo","vo"],concurrent_study_admission_allowed:false}};
    expect(admissionLocalRequirementInputSchema.safeParse(row).success).toBe(false);
    expect(admissionLocalRequirementInputSchema.safeParse({...row,key:"education_basis",kind:"education_basis"}).success).toBe(true);
  });
  it("allows the existing review action to record pending qualification evidence without inventing a second approval",()=>{
    const command={action:"review_requirement",case_id:caseId,expected_revision:3,expected_program_ref:program,requirement_id:id(20),expected_requirement_revision:1,
      applicability:"applicable",evidence_version_ids:[],reason:"Приём во время обучения рассмотрен; завершение СПО/ВО пока не подтверждено.",issuance_evidence:null,exception:null};
    expect(admissionCaseActionSchema.parse(command)).toEqual(command);
  });
  it("requires exact unique sealed evidence references and an explicit education level",()=>{
    expect(admissionIssuanceEvidenceSchema.safeParse({kind:"completed_primary_education",education_level:"spo",evidence_version_ids:[id(30),id(30)]}).success).toBe(false);
    expect(admissionIssuanceEvidenceSchema.safeParse({kind:"completed_primary_education",education_level:"vo",evidence_version_ids:[]}).success).toBe(false);
  });
});
