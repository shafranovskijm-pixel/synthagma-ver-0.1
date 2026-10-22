import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({actor:'00000000-0000-4000-8000-000000000001',revision:1,user:'00000000-0000-4000-8000-000000000001',permissions:{} as any}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:m.user}})}));
vi.mock('@/hooks/useStaffPermissions',()=>({useStaffPermissions:()=>m.permissions}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/utils/proxyFetch',()=>({proxiedAssetUrl:(url:string)=>url}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:m.actor,revision:m.revision}),captureOfflineAuthRevision:()=>m.revision,isOfflineActorCurrent:(id:string,revision:number)=>id===m.actor&&revision===m.revision}));
import { useProgramFileAccess } from '../useProgramFileAccess';
import { programFileScopeCurrent } from '@/lib/programFiles';
const org='00000000-0000-4000-8000-000000000002';
beforeEach(()=>{
  m.actor=m.user='00000000-0000-4000-8000-000000000001';m.revision=1;
  const rights=new Set(['documents.read','documents.write']);
  m.permissions={organizationId:org,isOrgOwner:false,loading:false,error:null,orgRole:'admin',adminRole:null,orgPermissions:rights,adminSections:new Set(),can:(p:string)=>rights.has(p)};
});
describe('programme access captured owner',()=>{
  it('invalidates the previous scope on observed organization A→B→A rather than reviving the same key',()=>{
    const h=renderHook(({organizationId})=>useProgramFileAccess(organizationId,true),{initialProps:{organizationId:org}}),old=h.result.current.scope!;
    expect(programFileScopeCurrent(old)).toBe(true);
    h.rerender({organizationId:'00000000-0000-4000-8000-000000000003'});expect(h.result.current.scope).toBeNull();
    h.rerender({organizationId:org});expect(h.result.current.scope?.key).not.toBe(old.key);expect(programFileScopeCurrent(old)).toBe(false);
  });
  it('catches an offline actor/access roundtrip before a React render',()=>{
    const h=renderHook(()=>useProgramFileAccess(org,true)),old=h.result.current.scope!;
    m.actor='00000000-0000-4000-8000-000000000099';++m.revision;m.actor=m.user;++m.revision;
    expect(programFileScopeCurrent(old)).toBe(false);
  });
  it('keeps read access after a write downgrade but never revives an old writable scope',()=>{
    const h=renderHook(()=>useProgramFileAccess(org,true)),old=h.result.current.scope!;
    const read=new Set(['documents.read']);m.permissions={...m.permissions,orgPermissions:read,can:(p:string)=>read.has(p)};h.rerender();
    expect(h.result.current.canRead).toBe(true);expect(h.result.current.canWrite).toBe(false);expect(programFileScopeCurrent(old)).toBe(false);
  });
  it('does not advertise a legacy no-provider fallback or platform viewer as a programme writer',()=>{
    m.permissions={...m.permissions,organizationId:null,isOrgOwner:false,orgPermissions:new Set(),can:()=>true};
    const h=renderHook(()=>useProgramFileAccess(org,true));expect(h.result.current.scope).toBeNull();expect(h.result.current.canWrite).toBe(false);
    m.permissions={...m.permissions,isOrgOwner:true,orgPermissions:new Set(['documents.read','documents.write']),adminRole:'viewer'};h.rerender();
    expect(h.result.current.canWrite).toBe(false);
  });
});
