import {act,renderHook} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {actor,org,group,enrollment,uid,caps,hash,withdrawal,withdrawalAction} from '@/lib/educationIssuance/__tests__/fixtures';
const mock=vi.hoisted(()=>({current:true,session:vi.fn(),rpc:vi.fn()}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'00000000-0000-4000-8000-000000000001',revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mock.session},rpc:mock.rpc}}));
import {useEducationIssuanceScope} from '../useEducationIssuance';
import {issuanceScopeCurrent,prepareEducationIssuanceMutation,readEducationIssuance} from '@/lib/educationIssuance/client';
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:'synthetic'}},error:null});});
describe('monotonic issuance context fence',()=>{
 it('never revives an old scope when the same actor returns A to B to A',()=>{const {result,rerender}=renderHook(({groupId})=>useEducationIssuanceScope(org,groupId),{initialProps:{groupId:group}});const original=result.current();expect(issuanceScopeCurrent(original)).toBe(true);rerender({groupId:uid(99)});expect(issuanceScopeCurrent(original)).toBe(false);rerender({groupId:group});expect(issuanceScopeCurrent(original)).toBe(false);expect(issuanceScopeCurrent(result.current())).toBe(true);});
 it('does not send a final mutation from a pending continuation after context ABA',async()=>{let resolve!:(value:any)=>void;const delayed=new Promise<any>(done=>{resolve=done;});mock.rpc.mockImplementation(name=>({setHeader:()=>name==='read_education_issuance'?delayed:Promise.reject(Error('Final RPC must not run'))}));const {result,rerender}=renderHook(({context})=>useEducationIssuanceScope(org,null,context),{initialProps:{context:'A'}});const scope=result.current();const continuation=(async()=>{await readEducationIssuance(scope,{kind:'withdrawal',enrollment_id:enrollment});await prepareEducationIssuanceMutation(scope,withdrawalAction(),uid(70)).run();})();const checked=expect(continuation).rejects.toMatchObject({code:'ACCESS_DENIED'});await act(async()=>{await Promise.resolve();});rerender({context:'B'});rerender({context:'A'});resolve({status:200,error:null,data:{schema_version:1,organization_id:org,scope:{kind:'organization'},capabilities:caps,kind:'withdrawal',state:withdrawal()}});await checked;expect(mock.rpc.mock.calls.map(call=>call[0])).toEqual(['read_education_issuance']);});
});
