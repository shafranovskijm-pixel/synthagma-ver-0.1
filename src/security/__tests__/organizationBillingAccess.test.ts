import { describe,expect,it,vi } from 'vitest';
import { billingHoldResponse,organizationBillingHoldResponse } from '../../../supabase/functions/_shared/billing-access.ts';
describe('service boundary for held organizations',()=>{
  it.each([true,false])('checks only verified actor and returns denial=%s',async held=>{
    const db={rpc:vi.fn().mockResolvedValue({data:held,error:null})};
    const response=await billingHoldResponse(db,'verified-actor',{'Access-Control-Allow-Origin':'*'});
    expect(db.rpc).toHaveBeenCalledWith('is_user_blocked',{_user_id:'verified-actor'});
    if(held){expect(response?.status).toBe(403);expect(response?.headers.get('Cache-Control')).toBe('no-store');}
    else expect(response).toBeNull();
  });
  it.each([{data:null,error:null},{data:'false',error:null},{data:false,error:{message:'private server trace'}}])('fails closed without disclosing raw failures',async result=>{
    const response=await billingHoldResponse({rpc:vi.fn().mockResolvedValue(result)},'actor',{});
    expect(response?.status).toBe(503);expect(await response?.text()).not.toContain('private server trace');
  });
  it('fails closed on thrown transport error',async()=>{
    const response=await billingHoldResponse({rpc:vi.fn().mockRejectedValue(new Error('token=private'))},'actor',{});
    expect(response?.status).toBe(503);expect(await response?.text()).not.toContain('token=');
  });
  it.each([true,false])('checks the exact target organization before anonymous registration, allowed=%s',async allowed=>{
    const db={rpc:vi.fn().mockResolvedValue({data:allowed,error:null})};
    const response=await organizationBillingHoldResponse(db,'exact-target-org',{});
    expect(db.rpc).toHaveBeenCalledWith('organization_billing_access_allowed',{p_organization_id:'exact-target-org'});
    expect(response?.status??null).toBe(allowed?null:403);
  });
  it('does not treat an unknown target as allowed',async()=>{
    const response=await organizationBillingHoldResponse({rpc:vi.fn().mockResolvedValue({data:null,error:null})},'missing',{});
    expect(response?.status).toBe(503);
  });
});
