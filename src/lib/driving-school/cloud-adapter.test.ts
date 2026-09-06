import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn(),functions:{invoke:vi.fn()}}}));
import { adaptCloudState, createCloudAdapter, drivingError } from './cloud-adapter';
import { supabase } from '@/integrations/supabase/client';
const read=(role:string)=>JSON.parse(readFileSync(`src/lib/driving-school/__fixtures__/booking-state-${role}.json`,'utf8'));
describe('Cloud adapter against isolated PostgreSQL get_state exports',()=>{
 for(const role of ['owner','student','instructor'])it(`accepts the real synthetic SQL output for ${role}`,()=>{const raw=read(role),s=adaptCloudState(raw,raw.school.organization_id);expect(s.user.role).toBe(role);expect(s.school.id).toBe(raw.school.organization_id);expect(s.lessons).toHaveLength(raw.lessons.length);expect(s.resources.filter(r=>r.kind==='student')).toHaveLength(raw.students.length);if(role==='student')expect(s.user.resource_id).toBe(raw.viewer.student_id);if(role==='instructor')expect(s.entries.every(e=>e.kind==='exam'||e.kind==='attempt')).toBe(true);});
 it('refuses a wrong organization and incomplete balances',()=>{const raw=read('owner');expect(()=>adaptCloudState(raw,'other-school')).toThrow('другой организации');raw.balances=[];expect(()=>adaptCloudState(raw,raw.school.organization_id)).toThrow('остатка практики');});
 it('distinguishes gate/forbidden, missing backend and expired auth',()=>{expect(drivingError({code:'42501'}).message).toContain('Доступ не разрешён');expect(drivingError({code:'PGRST202'}).message).toContain('ещё не подключён');expect(drivingError({code:'PGRST301'}).message).toContain('Сессия истекла');expect(drivingError({message:'Failed to fetch'}).message).toContain('Нет связи');});
 it('does not create a student when the UI capability is absent',async()=>{const raw=read('owner'),s=adaptCloudState(raw,raw.school.organization_id),adapter=createCloudAdapter(raw.school.organization_id);await expect(adapter.mutate('resources',{kind:'student'},s)).rejects.toThrow('владелец');expect(supabase.functions.invoke).not.toHaveBeenCalled();});
 it('uses authoritative register-student user_id and never profile id',async()=>{vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({data:{success:true,user_id:'authoritative-auth-id',login:'student_confirmed',is_existing:false,password:'must-never-persist'},error:null} as never);vi.mocked(supabase.rpc).mockResolvedValueOnce({data:'driving-student-id',error:null} as never);const raw=read('owner'),s=adaptCloudState(raw,raw.school.organization_id);const result=await createCloudAdapter(raw.school.organization_id,true).mutate('resources',{kind:'student',name:'Synthetic',email:'synthetic@example.invalid',password:'synthetic-password',programId:raw.programs[0].id},s);expect(result.account).toEqual({login:'student_confirmed',isExisting:false});expect(JSON.stringify(result)).not.toContain('must-never-persist');expect(supabase.rpc).toHaveBeenCalledWith('driving_save_student',expect.objectContaining({_user_id:'authoritative-auth-id',_organization_id:raw.school.organization_id}));});
 it('links the existing handler account without another signup or password disclosure',async()=>{
  vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({data:{success:true,user_id:'existing-auth-id',login:'existing_login',is_existing:true,password:'existing-secret'},error:null} as never);
  vi.mocked(supabase.rpc).mockResolvedValueOnce({data:'linked-student',error:null} as never);
  const raw=read('owner'),s=adaptCloudState(raw,raw.school.organization_id),before=vi.mocked(supabase.functions.invoke).mock.calls.length;
  const result=await createCloudAdapter(raw.school.organization_id,true).mutate('resources',{kind:'student',name:'Existing Synthetic',email:'existing@example.invalid',programId:raw.programs[0].id},s);
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(before+1);expect(supabase.functions.invoke).toHaveBeenLastCalledWith('register-student',expect.anything());
  expect(result.account).toEqual({login:'existing_login',isExisting:true});expect(JSON.stringify(result)).not.toContain('existing-secret');
  expect(supabase.rpc).toHaveBeenLastCalledWith('driving_save_student',expect.objectContaining({_user_id:'existing-auth-id'}));
 });});


