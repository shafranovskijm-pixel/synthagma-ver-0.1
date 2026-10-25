import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:'',epoch:1,queue:[] as any[],calls:[] as any[],session:vi.fn()}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:m.actor,revision:m.epoch}),isOfflineActorCurrent:(a:string,r:number)=>a===m.actor&&r===m.epoch}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:()=>m.session()},rpc:(name:string,args:any)=>({setHeader:(header:string,bearer:string)=>{m.calls.push({name,args:structuredClone(args),header,bearer});const next=m.queue.shift();return typeof next==='function'?next():Promise.resolve(next);}})}}));
import * as api from '../client.ts';
import {captureEducationScope} from '@/lib/groupEducationFacts/client';
import {confirm,detail,draft,id,receipt,scope} from './fixtures.ts';
const actor=()=>captureEducationScope(scope.organization_id,scope.group_id,undefined,scope.course_id),ok=(data:unknown)=>({data,error:null});
beforeEach(()=>{m.actor=id(40);m.epoch=1;m.queue=[];m.calls=[];m.session.mockReset().mockResolvedValue({data:{session:{user:{id:m.actor},access_token:'original'}},error:null});});
describe('conducted sessions authorized transport',()=>{
 it('captures original actor bearer and exact group/course result scope',async()=>{
  m.queue.push(ok(detail()));await api.readFullConductedSession(actor(),id(60));expect(m.calls[0]).toMatchObject({name:'read_conducted_sessions',args:{p_organization_id:scope.organization_id,p_group_id:scope.group_id,p_query:{kind:'session',session_id:id(60),revision:null,after_user_id:null,limit:50}},header:'Authorization',bearer:'Bearer original'});
 });
 it('never accepts a foreign result or group response',async()=>{
  const d=detail();d.outcomes[0].outcome!.scope.user_id=id(99);m.queue.push(ok(d));await expect(api.readConductedSession(actor(),id(60))).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
 });
 it('masks an A→B→A reply and rejects revoked proxy403',async()=>{
  let resolve!:(v:any)=>void;const waiting=new Promise(r=>resolve=r);m.queue.push(()=>waiting);const p=api.readConductedSession(actor(),id(60));await vi.waitFor(()=>expect(m.calls).toHaveLength(1));m.actor=id(41);m.epoch++;m.actor=id(40);m.epoch++;resolve(ok(detail()));await expect(p).rejects.toMatchObject({code:'ACCESS_DENIED'});
  m.queue.push({data:'opaque proxy error',status:403,error:null});await expect(api.readSessionDraft(actor(),id(70))).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('retries the identical command/request after unknown failure, not later edited input',async()=>{
  const a=confirm(),operation=api.prepareSessionMutation(actor(),0,a,id(80));a.reason='Later edit';m.queue.push({data:null,error:{message:'network'}},ok(receipt()));await expect(operation.run()).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});await operation.run();expect(m.calls[0].args).toEqual(m.calls[1].args);expect(m.calls[0].args.p_action.reason).not.toBe('Later edit');
 });
 it('pins paginated attendance revision/hash and refuses changed second page',async()=>{
  const first=detail();first.next_after_user_id=first.version.attendance[0].user_id;
  const next=detail();next.version.content_hash='b'.repeat(64);next.version.attendance=[];next.outcomes=[];m.queue.push(ok(first),ok(next));await expect(api.readFullConductedSession(actor(),id(60))).rejects.toMatchObject({code:'SOURCE_CHANGED'});
 });
 it('preserves explicit stale draft availability and never treats it as fresh content',async()=>{
  const d=draft();d.draft.source_current=false;d.draft.source_proof=null;m.queue.push(ok(d));expect((await api.readSessionDraft(actor(),id(70))).draft.source_proof).toBeNull();
 });
});
