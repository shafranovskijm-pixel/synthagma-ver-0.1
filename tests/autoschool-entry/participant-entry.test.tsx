import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { deferred } from './fixtures';
const port=vi.hoisted(()=>({user:'account-A',role:'student',rpc:vi.fn(),adapter:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:port.user},userRole:port.role})}));
vi.mock('@/lib/driving-school/cloud-adapter',()=>({drivingRpc:port.rpc,createCloudAdapter:port.adapter,DrivingFailure:class extends Error {constructor(message:string,public kind:string){super(message);}}}));
vi.mock('@/components/driving-school/DrivingApp',()=>({default:({adapter}:{adapter:{school:string}})=><div>Loaded private workspace {adapter.school}</div>}));
import DrivingSchoolPage from '@/pages/DrivingSchoolPage';
function Location(){const loc=useLocation(),navigate=useNavigate();return <><output data-testid="location">{loc.pathname+loc.search}</output><button onClick={()=>navigate('/driving-school?invite=new-token&view=today')}>New invitation URL</button></>;}
const ui=(url='/driving-school')=><MemoryRouter initialEntries={[url]}><DrivingSchoolPage/><Location/></MemoryRouter>;
beforeEach(()=>{port.user='account-A';port.role='student';port.rpc.mockReset();port.adapter.mockReset();port.adapter.mockImplementation((school:string)=>({school}));});
describe('participant entry uses current server linkage',()=>{
 it('ASP01 an ordinary learner sees neutral guidance and can return to the unchanged student cabinet',async()=>{
  port.rpc.mockResolvedValue([]);render(ui('/driving-school?organization_id=untrusted-org'));
  await screen.findByText('Автошкола не подключена к аккаунту');expect(screen.queryByText(/Loaded private workspace/)).toBeNull();expect(port.adapter).not.toHaveBeenCalled();
  expect(port.rpc).toHaveBeenCalledExactlyOnceWith('driving_my_schools');
  fireEvent.click(screen.getByRole('button',{name:'В обычный кабинет'}));expect(screen.getByTestId('location').textContent).toBe('/student');
 });
 it('ASP02 only the selected currently linked school is checked and opened; no automatic grant occurs',async()=>{
  port.rpc.mockImplementation((name:string)=>name==='driving_my_schools'?Promise.resolve([{organization_id:'school-A',name:'QA Linked school',role:'student'}]):Promise.resolve({installed:true,connected:true,can_manage:false}));
  render(ui());fireEvent.click(await screen.findByRole('button',{name:'QA Linked school · Ученик'}));
  await screen.findByText('Loaded private workspace school-A');expect(port.rpc).toHaveBeenLastCalledWith('driving_module_status',{_organization_id:'school-A'});
  expect(port.rpc.mock.calls.every(([name])=>['driving_my_schools','driving_module_status'].includes(name))).toBe(true);
 });
 it('ASP03 a same-role account swap unmounts prior selection while the new bindings load',async()=>{
  const next=deferred<unknown>();port.rpc.mockImplementation((name:string)=>name==='driving_my_schools'?(port.user==='account-A'?Promise.resolve([{organization_id:'school-A',name:'QA A',role:'student'}]):next.promise):Promise.resolve({installed:true,connected:true,can_manage:false}));
  const view=render(ui());fireEvent.click(await screen.findByRole('button',{name:'QA A · Ученик'}));await screen.findByText('Loaded private workspace school-A');
  port.user='account-B';view.rerender(ui());expect(screen.queryByText('Loaded private workspace school-A')).toBeNull();
  await act(async()=>next.resolve([]));await screen.findByText('Автошкола не подключена к аккаунту');expect(screen.queryByRole('button',{name:'QA A · Ученик'})).toBeNull();
 });
 it('ASP04 a stale invitation completion cannot erase a different current invite or choose its old school',async()=>{
  const old=deferred<{organization_id:string}>();port.rpc.mockReturnValue(old.promise);render(ui('/driving-school?invite=old-token&view=today'));
  fireEvent.click(screen.getByRole('button',{name:'Принять приглашение'}));fireEvent.click(screen.getByRole('button',{name:'New invitation URL'}));
  await act(async()=>old.resolve({organization_id:'old-school'}));
  expect(screen.getByTestId('location').textContent).toBe('/driving-school?invite=new-token&view=today');expect(port.adapter).not.toHaveBeenCalled();expect(screen.queryByText(/Loaded private workspace/)).toBeNull();
 });
 it('ASP05 denied or malformed linkage never opens an adapter or presents an owner role',async()=>{
  port.rpc.mockResolvedValue([{organization_id:'school-A',name:'QA A',role:'owner'}]);render(ui());
  await screen.findByRole('alert');expect(port.adapter).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'QA A · Инструктор'})).toBeNull();
 });
});
