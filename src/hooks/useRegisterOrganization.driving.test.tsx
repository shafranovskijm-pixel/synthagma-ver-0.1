import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({params:new URLSearchParams(), navigate:vi.fn(), invoke:vi.fn(), signin:vi.fn(), role:vi.fn(), user:null as null | {id:string}, userRole:null as null|string}));
vi.mock('react-router-dom',()=>({useNavigate:()=>state.navigate,useSearchParams:()=>[state.params]}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:state.user,userRole:state.userRole,loading:false,refreshUserRole:state.role})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke},auth:{signInWithPassword:state.signin}}}));
vi.mock('@/utils/safeInvoke',()=>({safeInvoke:vi.fn()}));
vi.mock('@/utils/referralCookie',()=>({getRefCode:()=>null,clearRefCode:vi.fn(),captureRefFromUrl:vi.fn()}));
vi.mock('@/utils/utmCapture',()=>({getUtmData:()=>null}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import { useRegisterOrganization } from './useRegisterOrganization';

describe('registration return intent through the existing handler',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();state.params=new URLSearchParams();state.user=null;state.userRole=null;
  state.invoke.mockImplementation(async(name:string)=>({data:name==='register-organization'?{organization_id:'test-org',user_id:'test-user'}:{},error:null}));
  state.signin.mockResolvedValue({error:null});state.role.mockResolvedValue('organization');
 });
 async function submit(){
  const hook=renderHook(()=>useRegisterOrganization());
  act(()=>{hook.result.current.setOrgName('Synthetic school');hook.result.current.setContactName('Synthetic owner');hook.result.current.setEmail('owner@example.test');hook.result.current.setPhone('000');hook.result.current.setPassword('synthetic-only');hook.result.current.setConfirmPassword('synthetic-only');});
  await act(async()=>{await hook.result.current.handleSubmit({preventDefault(){}} as React.FormEvent);});
  return hook;
 }
 it('returns new school to its module after ordinary server registration',async()=>{
  state.params=new URLSearchParams('module=driving-school');await submit();
  expect(state.invoke).toHaveBeenCalledWith('register-organization',expect.objectContaining({body:expect.objectContaining({email:'owner@example.test'})}));
  expect(state.navigate).toHaveBeenLastCalledWith('/organization/driving-school',{replace:true});
 });
 it('keeps intent when automatic sign-in fails after successful creation',async()=>{
  state.params=new URLSearchParams('module=driving-school');state.signin.mockResolvedValue({error:{message:'synthetic signin failure'}});await submit();
  expect(state.navigate).toHaveBeenLastCalledWith('/login?next=%2Forganization%2Fdriving-school',expect.objectContaining({replace:true}));
 });
 it('preserves ordinary registration target',async()=>{await submit();expect(state.navigate).toHaveBeenLastCalledWith('/organization',{replace:true});});
 it('uses the fixed target for an already signed-in organization',async()=>{
  state.params=new URLSearchParams('module=driving-school&next=https://evil.test');state.user={id:'test-user'};state.userRole='organization';
  renderHook(()=>useRegisterOrganization());await waitFor(()=>expect(state.navigate).toHaveBeenCalledWith('/organization/driving-school',{replace:true}));
  expect(state.invoke).not.toHaveBeenCalled();
 });
 it('keeps the existing-account login link scoped to the driving module',()=>{
  state.params=new URLSearchParams('module=driving-school&next=https://evil.test');
  const hook=renderHook(()=>useRegisterOrganization());
  expect(hook.result.current.loginTarget).toBe('/login?next=%2Forganization%2Fdriving-school');
  expect(state.invoke).not.toHaveBeenCalled();
 });
 it('preserves the ordinary existing-account login link',()=>{
  state.params=new URLSearchParams('module=unknown&next=/admin');
  const hook=renderHook(()=>useRegisterOrganization());
  expect(hook.result.current.loginTarget).toBe('/login');
  expect(state.invoke).not.toHaveBeenCalled();
 });});

