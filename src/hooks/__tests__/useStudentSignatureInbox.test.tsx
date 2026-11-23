import React from 'react';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const org='10000000-0000-4000-8000-000000000001',learner='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const m=vi.hoisted(()=>({read:vi.fn(),actor:'20000000-0000-4000-8000-000000000001',revision:1,channel:vi.fn(),remove:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:m.actor},loading:false})}));
vi.mock('@/utils/courseCache',()=>({captureOfflineActor:(id:string)=>id===m.actor?m.revision:null,isOfflineActorCurrent:(id:string,r:number)=>id===m.actor&&r===m.revision}));
vi.mock('@/lib/studentDocumentInbox',()=>({readStudentDocumentInbox:(...args:any[])=>m.read(...args)}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:(...args:any[])=>m.channel(...args),removeChannel:(...args:any[])=>m.remove(...args)}}));
import {useStudentSignatureInbox} from '../useStudentSignatureInbox';
const at='2026-11-23T08:00:00Z';
const response=(state='pending')=>({version:1,ok:true,organization_id:org,recipient_user_id:m.actor,observed_at:at,items:[{id:'30000000-0000-4000-8000-000000000001',organization_id:org,legacy_status:'sent',state,pending:state==='pending',document_title:'Ведомость выдачи',assurance:{confirmed_at:state==='confirmed'?at:null}}],pending_count:state==='pending'?1:0,total_count:1,next_cursor:null});
const clients:QueryClient[]=[];
function wrapper(){const c=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(c);return({children}:{children:React.ReactNode})=><QueryClientProvider client={c}>{children}</QueryClientProvider>;}
beforeEach(()=>{vi.clearAllMocks();m.actor=learner;m.revision=1;m.channel.mockImplementation(()=>{const c={on:vi.fn(()=>c),subscribe:vi.fn(()=>c)};return c;});m.read.mockResolvedValue(response());});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());});
describe('learner inbox lifecycle',()=>{
 it('does not query or subscribe as an administrative preview of another learner',()=>{const h=renderHook(()=>useStudentSignatureInbox(other,org),{wrapper:wrapper()});expect(h.result.current.enabled).toBe(false);expect(h.result.current.items).toEqual([]);expect(m.read).not.toHaveBeenCalled();expect(m.channel).not.toHaveBeenCalled();});
 it('does not query an unknown organization',()=>{renderHook(()=>useStudentSignatureInbox(learner,null),{wrapper:wrapper()});expect(m.read).not.toHaveBeenCalled();});
 it('uses server pending count instead of the loaded page length',async()=>{m.read.mockResolvedValue({...response(),pending_count:72,total_count:80,next_cursor:{created_at:at,id:other}});const h=renderHook(()=>useStudentSignatureInbox(learner,org),{wrapper:wrapper()});await waitFor(()=>expect(h.result.current.pendingCount).toBe(72));expect(h.result.current.pending).toHaveLength(1);expect(h.result.current.hasMore).toBe(true);});
 it('moves the exact new confirmation to archive without modifying historical status',async()=>{const h=renderHook(()=>useStudentSignatureInbox(learner,org),{wrapper:wrapper()});await waitFor(()=>expect(h.result.current.pending).toHaveLength(1));m.read.mockResolvedValue(response('confirmed'));await act(()=>h.result.current.reload());expect(h.result.current.pending).toHaveLength(0);expect(h.result.current.archive[0].state).toBe('confirmed');expect(h.result.current.archive[0].status).toBe('sent');});
 it('clears visible scope immediately when the actor changes while an old read is in flight',async()=>{let finish:(v:any)=>void=()=>{};const oldRead=new Promise(resolve=>{finish=resolve;});m.read.mockImplementation((_org:string,id:string)=>id===learner?oldRead:new Promise(()=>{}));const h=renderHook(({id})=>useStudentSignatureInbox(id,org),{initialProps:{id:learner},wrapper:wrapper()});const old=response();m.actor=other;m.revision++;h.rerender({id:other});await act(async()=>finish(old));expect(h.result.current.items).toEqual([]);expect(h.result.current.pendingCount).toBe(0);});
 it('does not display a failed status read as no outstanding documents',async()=>{m.read.mockRejectedValue(new Error('DEPENDENCY_UNAVAILABLE'));const h=renderHook(()=>useStudentSignatureInbox(learner,org),{wrapper:wrapper()});await waitFor(()=>expect(h.result.current.error).toContain('Не удалось'));expect(h.result.current.items).toEqual([]);});
 it('refreshes on return from the signing tab without a permanent timer',async()=>{const h=renderHook(()=>useStudentSignatureInbox(learner,org),{wrapper:wrapper()});await waitFor(()=>expect(h.result.current.pendingCount).toBe(1));m.read.mockResolvedValue(response('confirmed'));act(()=>window.dispatchEvent(new Event('focus')));await waitFor(()=>expect(h.result.current.pendingCount).toBe(0));});
});
