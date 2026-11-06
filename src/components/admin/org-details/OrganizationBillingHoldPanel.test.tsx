import React from 'react';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:m.rpc}}));
import { OrganizationBillingHoldPanel } from './OrganizationBillingHoldPanel';
const org='10000000-0000-4000-8000-000000000001';
const hold={organization_id:org,active:false,hold_id:null,reason:null,held_at:null};
beforeEach(()=>{vi.clearAllMocks();m.rpc.mockResolvedValue({data:hold,error:null});});afterEach(cleanup);
describe('admin reversible organization hold',()=>{
  it('never changes access on initial load and keeps one operation for double clicks',async()=>{
    let finish!:(x:any)=>void;m.rpc.mockImplementation((name:string)=>name==='get_organization_billing_hold'?Promise.resolve({data:hold,error:null}):new Promise(resolve=>{finish=resolve;}));
    render(<OrganizationBillingHoldPanel organizationId={org}/>);
    const button=await screen.findByRole('button',{name:'Приостановить доступ до оплаты'});
    expect(m.rpc).toHaveBeenCalledTimes(1);fireEvent.click(button);fireEvent.click(button);
    expect(m.rpc).toHaveBeenCalledTimes(2);expect(button).toBeDisabled();
    expect(m.rpc.mock.calls[1]).toEqual(['set_organization_billing_hold',expect.objectContaining({p_organization_id:org,p_action:'hold',p_expected_hold_id:null,p_request_id:expect.stringMatching(/^[0-9a-f-]{36}$/)})]);
    await act(async()=>finish({data:{...hold,active:true,hold_id:'receipt',reason:'Неоплата'},error:null}));
    expect(screen.getByRole('status')).toHaveTextContent('Доступ организации приостановлен');
  });
  it('retries an uncertain save with the same request ID and releases only the exact current hold',async()=>{
    let count=0;m.rpc.mockImplementation(async(name:string,args:any)=>{
      if(name==='get_organization_billing_hold')return{data:hold,error:null};
      if(count++===0)return{data:null,error:{message:'lost'}};
      return{data:{...hold,active:args.p_action==='hold',hold_id:'saved',reason:'Неоплата'},error:null};
    });
    render(<OrganizationBillingHoldPanel organizationId={org}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Приостановить доступ до оплаты'}));
    await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Приостановить доступ до оплаты'}));
    await screen.findByRole('button',{name:'Восстановить доступ после оплаты'});
    expect(m.rpc.mock.calls[1][1].p_request_id).toBe(m.rpc.mock.calls[2][1].p_request_id);
    fireEvent.click(screen.getByRole('button',{name:'Восстановить доступ после оплаты'}));
    await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(4));
    expect(m.rpc.mock.calls[3][1]).toMatchObject({p_action:'release',p_expected_hold_id:'saved'});
  });
  it('does not offer an action if the returned organization does not match',async()=>{
    m.rpc.mockResolvedValue({data:{...hold,organization_id:'foreign'},error:null});
    render(<OrganizationBillingHoldPanel organizationId={org}/>);await screen.findByRole('alert');
    expect(screen.queryByRole('button',{name:'Приостановить доступ до оплаты'})).toBeNull();
  });
});
