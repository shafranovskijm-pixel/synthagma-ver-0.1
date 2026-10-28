import { beforeEach, describe, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:h.rpc,functions:{invoke:h.invoke}}}));
import { createCloudAdapter } from './cloud-adapter';
import type { State } from './types';
const org='20000000-0000-0000-0000-000000000001', target='30000000-0000-0000-0000-000000000001';
const request='60000000-0000-0000-0000-000000000001';
const wire=()=>({contract_version:'driving_membership_access_v1',actor_id:'10000000-0000-0000-0000-000000000001',organization_id:org,
  role:'student',target_id:target,state:'linked',membership:{id:'40000000-0000-0000-0000-000000000001',user_id:'50000000-0000-0000-0000-000000000001',updated_at:'2026-10-29T01:00:00.123456+00:00'},revocation:null});
const state=():State=>({user:{id:'',name:'Owner',email:'',role:'owner',resource_id:''},school:{id:org,name:'School',settings:'{}'},
  resources:[{id:target,kind:'student',name:'Synthetic learner',active:1,data:{email:'',phone:'',programId:'program',groupId:null,instructorId:null,practiceMinutes:60,transmission:'MT'}}],
  lessons:[],entries:[],balances:[],busy:[],audit:[]});
beforeEach(()=>{h.rpc.mockReset();h.invoke.mockReset();});
describe('school-only cloud revoke transport',()=>{
  it('ASMR08 reads an exact owner target only and sends no user/Auth mutation',async()=>{
    h.rpc.mockResolvedValue({data:wire(),error:null});
    const adapter=createCloudAdapter(org);
    expect(h.rpc).not.toHaveBeenCalled();
    const access=await adapter.membershipAccess!.read('student',target);
    expect(h.rpc).toHaveBeenCalledWith('driving_get_resource_access',{_organization_id:org,_role:'student',_target_id:target});
    expect(access.membership?.userId).toBe(wire().membership.user_id);
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it('ASMR09 exact selected grant/version/reason/operation reach only the scoped revoke RPC',async()=>{
    h.rpc.mockResolvedValueOnce({data:wire(),error:null});const adapter=createCloudAdapter(org);
    const access=await adapter.membershipAccess!.read('student',target);
    const receipt={contract_version:'driving_membership_revocation_v1',actor_id:access.actorId,organization_id:org,
      membership_id:access.membership!.id,user_id:access.membership!.userId,role:'student',target_id:target,request_id:request,revoked_at:'2026-10-29T02:00:00+00:00'};
    h.rpc.mockResolvedValue({data:receipt,error:null});
    await adapter.mutate('membership-revoke',{access,reason:'Причина',requestId:request},state());
    expect(h.rpc).toHaveBeenLastCalledWith('driving_revoke_membership',{_organization_id:org,_membership_id:access.membership!.id,
      _expected_user_id:access.membership!.userId,_role:'student',_target_id:target,_expected_updated_at:wire().membership.updated_at,
      _request_id:request,_reason:'Причина'});
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it('ASMR10 participant UI role or wrong current resource prevents the new mutation before transport',async()=>{
    h.rpc.mockResolvedValue({data:wire(),error:null});const adapter=createCloudAdapter(org);
    const access=await adapter.membershipAccess!.read('student',target);h.rpc.mockClear();
    for(const role of ['student','instructor'] as const){const current=state();current.user.role=role;
      await expect(adapter.mutate('membership-revoke',{access,reason:'Причина',requestId:request},current)).rejects.toThrow();}
    await expect(adapter.mutate('membership-revoke',{access,reason:'Причина',requestId:request},{...state(),resources:[]})).rejects.toThrow();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('ASMR11 server denial, stale conflict and foreign response never produce a confirmed acknowledgement',async()=>{
    h.rpc.mockResolvedValue({data:{...wire(),organization_id:target},error:null});const adapter=createCloudAdapter(org);
    await expect(adapter.membershipAccess!.read('student',target)).rejects.toThrow();
    for(const code of ['42501','40001']){h.rpc.mockResolvedValue({data:null,error:{code,message:'deny'}});
      await expect(adapter.membershipAccess!.read('student',target)).rejects.toThrow();}
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
