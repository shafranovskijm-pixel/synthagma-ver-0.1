import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from './fixtures';
const port=vi.hoisted(()=>({user:'account-A' as string|null,rpc:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:port.user?{id:port.user}:null})}));
vi.mock('@/lib/driving-school/cloud-adapter',()=>({drivingRpc:port.rpc}));
import { useDrivingSchoolEntry } from '@/hooks/useDrivingSchoolEntry';
const status={installed:true,connected:true,can_manage:true};
beforeEach(()=>{port.user='account-A';port.rpc.mockReset();});
describe('current connected organization entry',()=>{
 it('ASE01 hides unconnected organizations and opens only connected manageable status',async()=>{
  port.rpc.mockResolvedValueOnce({...status,connected:false}).mockResolvedValueOnce(status);
  const hook=renderHook(()=>useDrivingSchoolEntry('org-A'));
  await waitFor(()=>expect(port.rpc).toHaveBeenCalledTimes(1));expect(hook.result.current).toBe(false);
  act(()=>window.dispatchEvent(new Event('focus')));
  await waitFor(()=>expect(hook.result.current).toBe(true));
  expect(port.rpc).toHaveBeenLastCalledWith('driving_module_status',{_organization_id:'org-A'});
 });
 it('ASE02 does not turn participant-only status into an organization owner entry',async()=>{
  port.rpc.mockResolvedValue({...status,can_manage:false});const hook=renderHook(()=>useDrivingSchoolEntry('org-A'));
  await waitFor(()=>expect(port.rpc).toHaveBeenCalled());expect(hook.result.current).toBe(false);
 });
 it('ASE03 closes malformed and denied reads without falling back to ordinary org permission',async()=>{
  port.rpc.mockResolvedValueOnce({connected:true}).mockRejectedValueOnce(new Error('permission closed'));
  const hook=renderHook(()=>useDrivingSchoolEntry('org-A'));await waitFor(()=>expect(port.rpc).toHaveBeenCalledTimes(1));expect(hook.result.current).toBe(false);
  act(()=>window.dispatchEvent(new Event('focus')));await waitFor(()=>expect(port.rpc).toHaveBeenCalledTimes(2));expect(hook.result.current).toBe(false);
  expect(port.rpc.mock.calls.every(([name])=>name==='driving_module_status')).toBe(true);
 });
 it('ASE04 drops the previous actor/org synchronously and ignores its late status',async()=>{
  const old=deferred<typeof status>(),next=deferred<typeof status>();port.rpc.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const hook=renderHook(({org})=>useDrivingSchoolEntry(org),{initialProps:{org:'org-A'}});
  port.user='account-B';hook.rerender({org:'org-B'});expect(hook.result.current).toBe(false);
  await act(async()=>old.resolve(status));expect(hook.result.current).toBe(false);
  await act(async()=>next.resolve(status));await waitFor(()=>expect(hook.result.current).toBe(true));
 });
 it('ASE05 clears cached visibility while the same actor is rechecked after rights revocation',async()=>{
  const revoked=deferred<typeof status>();port.rpc.mockResolvedValueOnce(status).mockReturnValueOnce(revoked.promise);
  const hook=renderHook(()=>useDrivingSchoolEntry('org-A'));await waitFor(()=>expect(hook.result.current).toBe(true));
  act(()=>window.dispatchEvent(new Event('focus')));expect(hook.result.current).toBe(false);
  await act(async()=>revoked.reject(new Error('42501')));expect(hook.result.current).toBe(false);
 });
 it('ASE06 sign-out hides the entry and never creates a membership or connection',async()=>{
  port.rpc.mockResolvedValue(status);const hook=renderHook(()=>useDrivingSchoolEntry('org-A'));await waitFor(()=>expect(hook.result.current).toBe(true));
  port.user=null;hook.rerender();expect(hook.result.current).toBe(false);expect(port.rpc).toHaveBeenCalledTimes(1);
 });
});
