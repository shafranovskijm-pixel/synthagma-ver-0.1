// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { claimStudentCapacity } from '../../functions/_shared/student-capacity-claim';

describe('capacity claim rollback and transport boundary', () => {
  it('retries one confirmed serialization rollback with the same closed-over arguments', async () => {
    const args = Object.freeze({p_user_id:'synthetic-uid',p_organization_id:'synthetic-org'});
    const rpc = vi.fn().mockResolvedValueOnce({data:null,error:{code:'40001'}}).mockResolvedValueOnce({data:{success:true},error:null});
    const result = await claimStudentCapacity(() => rpc(args));
    expect(result.data).toEqual({success:true}); expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][0]).toBe(args); expect(rpc.mock.calls[1][0]).toBe(args);
  });
  it('does not loop after two known rollbacks', async () => {
    const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'40001'}});
    expect((await claimStudentCapacity(rpc)).error?.code).toBe('40001'); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([null,{code:'23505'},{code:'40001_suffix'},{message:'40001'},{code:'TIMEOUT'}])('does not retry an unconfirmed outcome %j',async error=>{
    const rpc=vi.fn().mockResolvedValue({data:null,error}); await claimStudentCapacity(rpc); expect(rpc).toHaveBeenCalledOnce();
  });
  it('turns a lost transport reply into an unknown outcome without another write',async()=>{
    const rpc=vi.fn().mockRejectedValue(Error('Private transport detail'));
    const result=await claimStudentCapacity(rpc);expect(result.error?.code).toBe('CLAIM_TRANSPORT_UNKNOWN');expect(JSON.stringify(result)).not.toContain('Private');expect(rpc).toHaveBeenCalledOnce();
  });
  it('keeps a second unknown response unknown after the sole known-rollback retry',async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{code:'40001'}}).mockRejectedValueOnce(Error('Lost second reply'));
    expect((await claimStudentCapacity(rpc)).error?.code).toBe('CLAIM_TRANSPORT_UNKNOWN');expect(rpc).toHaveBeenCalledTimes(2);
  });
});
