import {describe,it,expect} from 'vitest';
import * as c from '../contract';
import * as f from './fixtures';

describe('finite admission wire: strict private and human projections',()=>{
  it('first read exposes exact UC011 input before initialize, without creating a case',()=>{
    const value=c.admissionCaseReadSchema.parse(f.staffRead(null));expect(value.projection).toBe('staff');if(value.projection==='staff') expect(value.program_ref).toEqual(f.program);
    expect(c.admissionCaseActionSchema.parse({action:'initialize',group_id:f.group,enrollment_id:f.enrollment,expected_program_ref:f.program,expected_revision:0})).toHaveProperty('action','initialize');
  });
  it('requires three review questions and exact selected source versions, without inferring applicability',()=>{
    expect(c.admissionCaseActionSchema.safeParse(f.localRules()).success).toBe(true);
    expect(c.admissionCaseActionSchema.safeParse({...f.localRules(),requirements:f.localRules().requirements.slice(1)}).success).toBe(false);
    expect(c.admissionCaseActionSchema.safeParse({...f.localRules(),requirements:f.localRules().requirements.map(row=>({...row,source_version_ids:[f.id(99)]}))}).success).toBe(false);
  });
  it.each(['education_basis','application','contract_or_funding'])('rejects omitted process question %s',kind=>{
    const rows=f.localRules().requirements.filter(row=>row.kind!==kind);rows.push({...rows[0],kind:'other_reviewed',key:'other'});
    expect(c.admissionCaseActionSchema.safeParse({...f.localRules(),requirements:rows}).success).toBe(false);
  });
  it.each([{...f.action(),isLegal:true},{...f.localRules(),federalLawCurrent:true},{...f.program,file_url:'https://foreign.invalid/secret'}])('rejects unknown authority/file fields %j',value=>{
    expect((Object.prototype.hasOwnProperty.call(value,'file_url')?c.admissionProgramRefSchema:c.admissionCaseActionSchema).safeParse(value).success).toBe(false);
  });
  it('learner projection never accepts staff notes, caps, evidence or an inferred grant',()=>{
    const safe={schema_version:1,mode:'case',projection:'learner',scope:f.scope,state:null,prerequisites:[]};expect(c.admissionCaseReadSchema.safeParse(safe).success).toBe(true);
    for(const field of ['capabilities','program_ref','evidence','staff_notes']) expect(c.admissionCaseReadSchema.safeParse({...safe,[field]:{private:true}}).success).toBe(false);
  });
  it.each(['application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/html','image/svg+xml'])('unsupported %s cannot reserve a readable evidence upload',mime=>{
    expect(c.admissionEvidenceSourceSchema.safeParse({kind:'upload',requirement_id:f.id(20),supersedes_id:null,declared_size:10,declared_sha256:f.hash,declared_mime:mime}).success).toBe(false);
  });
  it('has exact historical metadata/then responsible, without locator or stored grant escape hatches',()=>{
    expect(c.admissionEventSchema.safeParse(f.event()).success).toBe(true);
    expect(c.admissionEventSchema.safeParse({...f.event(),payload:{...f.event().payload,evidence:[{...f.evidence(),file_url:'https://foreign.invalid'}]}}).success).toBe(false);
    const {responsible_id,...payload}=f.event().payload;expect(c.admissionEventSchema.safeParse({...f.event(),payload}).success).toBe(false);
  });
  it('empty/null response is not a successful mutation, and exact case CAS is required',()=>{
    expect(c.admissionMutationResultSchema.safeParse(null).success).toBe(false);
    expect(c.admissionMutationResultSchema.safeParse(f.mutation()).success).toBe(true);
    expect(c.admissionCaseActionSchema.safeParse({...f.action(),expected_revision:0}).success).toBe(false);
  });
});
