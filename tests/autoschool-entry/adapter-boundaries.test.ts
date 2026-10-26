import { describe, expect, it, vi } from 'vitest';
import { rawStudentState } from './fixtures';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn(()=>{throw new Error('Unexpected live RPC');})}}));
import { adaptCloudState, drivingError, isDrivingAccessClosed } from '@/lib/driving-school/cloud-adapter';
describe('typed closure and participant projection',()=>{
 it('ASB01 session, permission and missing-module errors close a view; network failure has a distinct retry state',()=>{
  for(const code of ['42501','PGRST301','PGRST202'])expect(isDrivingAccessClosed(drivingError({code}))).toBe(true);
  expect(isDrivingAccessClosed(drivingError({message:'Failed to fetch'}))).toBe(false);
 });
 it('ASB02 a current exact learner projection decodes, while wrong tenant or absent linked resource closes it',()=>{
  const raw=rawStudentState();expect(adaptCloudState(raw,'qa-school').user.resource_id).toBe('student');
  for(const candidate of [{...raw,school:{...raw.school,organization_id:'other-school'}},{...raw,students:[],balances:[]}]){
   try{adaptCloudState(candidate,'qa-school');throw new Error('must reject');}catch(error){expect(isDrivingAccessClosed(error)).toBe(true);}
  }
 });
 it('ASB03 private data outside learner linkage and learner answer keys are rejected rather than rendered',()=>{
  const foreign=rawStudentState() as any;foreign.students.push({...foreign.students[0],id:'foreign-student'});
  const keys=rawStudentState() as any;keys.courses.push({id:'synthetic-course',name:'Synthetic test',program_id:'program',material:'Synthetic only',pass_percent:70,questions:[{text:'Synthetic question',options:['a','b'],correct:0}]});
  for(const raw of [foreign,keys]){try{adaptCloudState(raw,'qa-school');throw new Error('must reject');}catch(error){expect(isDrivingAccessClosed(error)).toBe(true);}}
 });
});
