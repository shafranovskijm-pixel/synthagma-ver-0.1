import { describe, expect, it } from 'vitest';
import { drivingRevocationArguments, parseDrivingMembershipAccess, parseDrivingRevocationReceipt } from './membership-access';
const actor='10000000-0000-0000-0000-000000000001', org='20000000-0000-0000-0000-000000000001';
const target='30000000-0000-0000-0000-000000000001', member='40000000-0000-0000-0000-000000000001';
const user='50000000-0000-0000-0000-000000000001', request='60000000-0000-0000-0000-000000000001';
const wire=()=>({contract_version:'driving_membership_access_v1',actor_id:actor,organization_id:org,
  role:'student',target_id:target,state:'linked',membership:{id:member,user_id:user,updated_at:'2026-10-29T01:02:03.123456+00:00'},revocation:null});
const access=()=>parseDrivingMembershipAccess(wire(),org,'student',target);
const receipt=()=>({contract_version:'driving_membership_revocation_v1',actor_id:actor,organization_id:org,
  membership_id:member,user_id:user,role:'student',target_id:target,request_id:request,revoked_at:'2026-10-29T02:00:00+00:00'});
describe('exact school membership contracts',()=>{
  it('ASMR01 accepts actual PostgreSQL UUID syntax and retains microsecond version without Date rewriting',()=>{
    expect(access().membership?.updatedAt).toBe(wire().membership.updated_at);
    const result=drivingRevocationArguments(access(),org,'  Завершён доступ  ',request);
    expect(result.args).toEqual({_membership_id:member,_expected_user_id:user,_role:'student',_target_id:target,
      _expected_updated_at:wire().membership.updated_at,_request_id:request,_reason:'Завершён доступ'});
    expect(Object.keys(result.args).some(key=>key.includes('actor')||key.includes('organization'))).toBe(false);
  });
  it('ASMR02 rejects a different school, resource or member role rather than retargeting it',()=>{
    for(const value of [{...wire(),organization_id:target},{...wire(),target_id:member},{...wire(),role:'instructor'}])
      expect(()=>parseDrivingMembershipAccess(value,org,'student',target)).toThrow();
  });
  it('ASMR03 malformed, missing and unknown authority fields stay unconfirmed',()=>{
    for(const value of [null,{}, {...wire(),extra:true},{...wire(),actor_id:'invalid'},
      {...wire(),membership:{...wire().membership,updated_at:'not-a-date'}},{...wire(),state:'allowed'}])
      expect(()=>parseDrivingMembershipAccess(value,org,'student',target)).toThrow();
  });
  it('ASMR04 unlinked and protected states carry no guessed membership',()=>{
    for(const state of ['unlinked','protected']){
      const value={...wire(),state,membership:null};
      expect(parseDrivingMembershipAccess(value,org,'student',target).membership).toBeNull();
      expect(()=>drivingRevocationArguments(parseDrivingMembershipAccess(value,org,'student',target),org,'Причина',request)).toThrow();
      expect(()=>parseDrivingMembershipAccess({...value,membership:wire().membership},org,'student',target)).toThrow();
    }
  });
  it('ASMR05 revoked state is historical deny-only receipt and cannot be sent as a new grant/revoke',()=>{
    const value={...wire(),state:'revoked',revocation:{request_id:request,revoked_at:receipt().revoked_at}};
    const revoked=parseDrivingMembershipAccess(value,org,'student',target);
    expect(revoked.state).toBe('revoked');
    expect(()=>drivingRevocationArguments(revoked,org,'Причина',request)).toThrow();
    expect(()=>parseDrivingMembershipAccess({...value,revocation:null},org,'student',target)).toThrow();
  });
  it('ASMR06 validates exact receipt actor, grant, subject, target and operation before acknowledgement',()=>{
    expect(parseDrivingRevocationReceipt(receipt(),access(),request).requestId).toBe(request);
    for(const field of ['actor_id','organization_id','membership_id','user_id','target_id','request_id'])
      expect(()=>parseDrivingRevocationReceipt({...receipt(),[field]:'ffffffff-ffff-ffff-ffff-ffffffffffff'},access(),request)).toThrow();
    expect(()=>parseDrivingRevocationReceipt({...receipt(),role:'instructor'},access(),request)).toThrow();
    expect(()=>parseDrivingRevocationReceipt({...receipt(),extra:0},access(),request)).toThrow();
  });
  it('ASMR07 rejects empty/oversized reasons, malformed operation and an unconfirmed UI DTO before transport',()=>{
    for(const reason of ['', ' '.repeat(4), 'x'.repeat(2001), null])
      expect(()=>drivingRevocationArguments(access(),org,reason,request)).toThrow();
    expect(()=>drivingRevocationArguments(access(),org,'Причина','not-uuid')).toThrow();
    expect(()=>drivingRevocationArguments({...access(),unexpected:true},org,'Причина',request)).toThrow();
  });
});
