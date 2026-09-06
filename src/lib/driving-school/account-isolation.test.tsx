import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const mocks=vi.hoisted(()=>({accountId:'account-A',rpc:vi.fn(),adapter:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:mocks.accountId},userRole:'organization'})}));
vi.mock('@/lib/driving-school/cloud-adapter',()=>({drivingRpc:mocks.rpc,createCloudAdapter:mocks.adapter}));
vi.mock('@/components/driving-school/DrivingApp',()=>({default:({adapter}:{adapter:{owner:string}})=><div>Cached workspace {adapter.owner}</div>}));
import DrivingSchoolPage from '@/pages/DrivingSchoolPage';
const deferred=()=>{let resolve:(value:unknown)=>void;const promise=new Promise(r=>{resolve=r;});return {promise,resolve:resolve!};};
beforeEach(()=>{mocks.accountId='account-A';mocks.rpc.mockReset();mocks.adapter.mockReset();mocks.adapter.mockImplementation(()=>({owner:mocks.accountId}));});
describe('account isolation of driving pages',()=>{
 it('synchronously drops selected school and cached workspace on same-role account swap',async()=>{
  const b=deferred();mocks.rpc.mockImplementation((rpc:string)=>rpc==='driving_my_schools'?(mocks.accountId==='account-A'?Promise.resolve([{organization_id:'school-A',name:'School A',role:'student'}]):b.promise):Promise.resolve({installed:true,connected:true,can_manage:true}));
  const ui=<MemoryRouter><DrivingSchoolPage/></MemoryRouter>,view=render(ui);
  fireEvent.click(await screen.findByRole('button',{name:'School A · Ученик'}));await screen.findByText('Cached workspace account-A');
  mocks.accountId='account-B';view.rerender(<MemoryRouter><DrivingSchoolPage/></MemoryRouter>);
  expect(screen.queryByText('Cached workspace account-A')).toBeNull();expect(screen.queryByRole('button',{name:'School A · Ученик'})).toBeNull();
  b.resolve([{organization_id:'school-B',name:'School B',role:'student'}]);await screen.findByRole('button',{name:'School B · Ученик'});
 });
 it('rechecks the selected organization and recreates its adapter for the new account',async()=>{
  const b=deferred();mocks.rpc.mockImplementation(()=>mocks.accountId==='account-A'?Promise.resolve({installed:true,connected:true,can_manage:true}):b.promise);
  const view=render(<MemoryRouter><DrivingSchoolPage organizationId="same-school"/></MemoryRouter>);await screen.findByText('Cached workspace account-A');
  mocks.accountId='account-B';view.rerender(<MemoryRouter><DrivingSchoolPage organizationId="same-school"/></MemoryRouter>);
  expect(screen.queryByText('Cached workspace account-A')).toBeNull();expect(screen.queryByText('Cached workspace account-B')).toBeNull();
  b.resolve({installed:true,connected:true,can_manage:true});await screen.findByText('Cached workspace account-B');expect(mocks.adapter).toHaveBeenCalledTimes(2);
 });
});


