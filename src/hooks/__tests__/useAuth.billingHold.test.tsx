import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn(),listener:null as any,cleanup:vi.fn(),offline:vi.fn()}));
vi.mock('@/utils/courseCache',()=>({setOfflineAuthActor:m.offline,observeOfflineAccess:vi.fn()}));
vi.mock('@/utils/privateRuntimeCacheCleanup',()=>({clearPrivateRuntimeCaches:m.cleanup}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:m.rpc,auth:{getSession:m.getSession,
  onAuthStateChange:(fn:any)=>{m.listener=fn;return{data:{subscription:{unsubscribe:vi.fn()}}};},
  startAutoRefresh:vi.fn(),stopAutoRefresh:vi.fn(),signOut:vi.fn(),signInWithPassword:vi.fn(),signUp:vi.fn(),
}}}));
import { AuthProvider,useAuth } from '../useAuth';
const wrapper=({children}:{children:React.ReactNode})=><AuthProvider>{children}</AuthProvider>;
const session=(id='held')=>({user:{id,email:id+'@example.invalid'},access_token:'synthetic'});
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();m.getSession.mockResolvedValue({data:{session:session()},error:null});
  m.rpc.mockImplementation(async(name:string)=>({data:name==='is_user_blocked'?false:'organization',error:null}));m.cleanup.mockResolvedValue(undefined);});
afterEach(cleanup);
describe('billing hold on existing authentication',()=>{
  it('refuses a restored session before trusting a cached or server role',async()=>{
    localStorage.setItem('user_role','organization');m.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'organization_access_suspended'}});
    const {result}=renderHook(()=>useAuth(),{wrapper});
    await waitFor(()=>expect(result.current.loading).toBe(false));
    expect(result.current.authError).toBe('ACCESS_SUSPENDED');expect(result.current.userRole).toBeNull();
    expect(localStorage.getItem('user_role')).toBeNull();
    expect(m.rpc).toHaveBeenCalledWith('get_user_role',{_user_id:'held'});
    expect(m.offline).toHaveBeenLastCalledWith(null);expect(m.cleanup).toHaveBeenCalled();
  });
  it('withdraws a previously confirmed role when hold is discovered on refresh',async()=>{
    const {result}=renderHook(()=>useAuth(),{wrapper});
    await waitFor(()=>expect(result.current.userRole).toBe('organization'));
    m.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'organization_access_suspended'}});
    await act(async()=>{await result.current.refreshUserRole();});
    expect(result.current.authError).toBe('ACCESS_SUSPENDED');expect(result.current.userRole).toBeNull();
    expect(localStorage.getItem('user_role')).toBeNull();
  });
  it('does not apply the previous actor suspension to the next actor',async()=>{
    let finish!:(x:any)=>void;m.rpc.mockImplementation((name:string,args:any)=>name==='get_user_role'&&args._user_id==='held'
      ?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:name==='is_user_blocked'?false:'organization',error:null}));
    const {result}=renderHook(()=>useAuth(),{wrapper});await waitFor(()=>expect(finish).toBeTypeOf('function'));
    act(()=>m.listener('SIGNED_IN',session('other')));
    await waitFor(()=>expect(result.current.userRole).toBe('organization'));
    await act(async()=>finish({data:null,error:{code:'42501',message:'organization_access_suspended'}}));
    expect(result.current.user?.id).toBe('other');expect(result.current.authError).toBeNull();
    expect(result.current.userRole).toBe('organization');
  });
});
