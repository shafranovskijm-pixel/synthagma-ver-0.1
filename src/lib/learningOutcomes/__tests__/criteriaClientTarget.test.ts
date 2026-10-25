import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { setOfflineAuthActor } from '@/utils/courseCache';
import * as api from '../client.ts';
import * as f from './fixtures.ts';

const mock=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mock.session},rpc:mock.rpc}}));
const scope=()=>api.captureLearningCriteriaScope(f.organization,f.course,f.scope.program_version_id);
const reply=(data:unknown)=>mock.rpc.mockReturnValue({setHeader:vi.fn().mockResolvedValue({data,error:null})});
beforeEach(()=>{
 vi.clearAllMocks();setOfflineAuthActor(null);setOfflineAuthActor(f.actor);
 mock.session.mockResolvedValue({data:{session:{user:{id:f.actor},access_token:'SYNTHETIC_ORIGINAL'}},error:null});
});
afterEach(()=>setOfflineAuthActor(null));

describe('parsed criteria target identity guards',()=>{
 it('accepts the exact envelope, nested version and options target with the original actor bearer',async()=>{
  const header=vi.fn().mockResolvedValueOnce({data:f.criteriaEnvelope(),error:null}).mockResolvedValueOnce({data:f.criteriaOptions(),error:null});
  mock.rpc.mockReturnValue({setHeader:header});
  expect((await api.readLearningCriteria(scope())).versions).toHaveLength(1);
  expect((await api.readLearningCriteriaOptions(scope())).lessons).toHaveLength(1);
  expect(header.mock.calls).toEqual([['Authorization','Bearer SYNTHETIC_ORIGINAL'],['Authorization','Bearer SYNTHETIC_ORIGINAL']]);
 });
 it('rejects each foreign envelope target and nested criteria version target',async()=>{
  for(const data of [
   {...f.criteriaEnvelope(),organization_id:f.id(99)},
   {...f.criteriaEnvelope(),course_id:f.id(99)},
   {...f.criteriaEnvelope(),program_version_id:f.id(99)},
   f.criteriaEnvelope([f.criteriaVersion({organization_id:f.id(99)})]),
   f.criteriaEnvelope([f.criteriaVersion({course_id:f.id(99)})]),
   f.criteriaEnvelope([f.criteriaVersion({program_version_id:f.id(99)})]),
  ]){reply(data);await expect(api.readLearningCriteria(scope())).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});}
 });
 it('keeps required identity and strict-key parsing before accepting a criteria envelope',async()=>{
  const {organization_id:omitted,...missing}=f.criteriaEnvelope();
  for(const data of [missing,{...f.criteriaEnvelope(),course_id:123},{...f.criteriaEnvelope(),unexpected:true}]){
   reply(data);await expect(api.readLearningCriteria(scope())).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
  }
 });
 it('rejects every foreign or missing options target before publishing options',async()=>{
  const {program_version_id:omitted,...missing}=f.criteriaOptions();
  for(const data of [
   {...f.criteriaOptions(),organization_id:f.id(99)},
   {...f.criteriaOptions(),course_id:f.id(99)},
   {...f.criteriaOptions(),program_version_id:f.id(99)},missing,
  ]){reply(data);await expect(api.readLearningCriteriaOptions(scope())).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});}
 });
});
