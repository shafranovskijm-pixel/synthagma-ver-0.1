import{act,renderHook}from'@testing-library/react';
import{beforeEach,describe,it,expect,vi}from'vitest';
const state=vi.hoisted(()=>({existing:[]as{user_id:string;status:string|null}[],queryError:null as unknown,select:vi.fn(),insert:vi.fn(),changed:vi.fn(),info:vi.fn(),error:vi.fn(),invalidate:vi.fn()}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:state.invalidate})}));
vi.mock('sonner',()=>({toast:{error:state.error,info:state.info,success:vi.fn()}}));
vi.mock('@/api/students',()=>({deleteStudent:vi.fn(),fetchStudentsByUserIds:async(_org:string,ids:string[])=>({students:ids.map(user_id=>({user_id,name:'Synthetic '+user_id}))})}));
vi.mock('@/api/enrollments',async original=>({...await original<typeof import('@/api/enrollments')>(),insertEnrollmentsVerified:(...args:unknown[])=>state.insert(...args)}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{let columns='';const q:any={select:(value:string)=>{columns=value;state.select(value);return q;},eq:()=>q,in:()=>q,then:(resolve:any,reject:any)=>Promise.resolve({data:state.existing.map(row=>columns.includes('status')?row:{user_id:row.user_id}),error:state.queryError}).then(resolve,reject)};return q;}}}));
import{useEnrollmentActions}from'../useEnrollmentActions';
const courses:any[]=[{id:'course-1',title:'Synthetic course'}];
beforeEach(()=>{vi.clearAllMocks();state.existing=[];state.queryError=null;state.insert.mockResolvedValue([]);});
const setup=()=>renderHook(()=>useEnrollmentActions('org-1','Synthetic center',state.changed,vi.fn()));
describe('ordinary assignment preflight retains cancelled history while allowing verified restoration',()=>{
 it('passes a cancelled assignment to the existing verified insertion/restore flow',async()=>{
  state.existing=[{user_id:'student-1',status:'cancelled'}];const{result}=setup();let saved;
  await act(async()=>{saved=await result.current.bulkEnroll('course-1',['student-1'],courses);});
  expect(saved).toBe(true);expect(state.select).toHaveBeenCalledWith('user_id, status');
  expect(state.insert).toHaveBeenCalledWith([{user_id:'student-1',course_id:'course-1',status:'active',progress:0}]);
  expect(state.changed).toHaveBeenCalledTimes(1);
 });
 it.each(['active','completed',null])('continues treating status %s as an existing assignment',async status=>{
  state.existing=[{user_id:'student-1',status}];const{result}=setup();let saved;
  await act(async()=>{saved=await result.current.bulkEnroll('course-1',['student-1'],courses);});
  expect(saved).toBe(false);expect(state.insert).not.toHaveBeenCalled();expect(state.changed).not.toHaveBeenCalled();expect(state.info).toHaveBeenCalledWith('Все выбранные ученики уже зачислены на этот курс');
 });
 it('sends only cancelled and absent selected learners from a mixed batch to verified persistence',async()=>{
  state.existing=[{user_id:'cancelled',status:'cancelled'},{user_id:'active',status:'active'},{user_id:'completed',status:'completed'},{user_id:'legacy',status:null}];const{result}=setup();let saved;
  await act(async()=>{saved=await result.current.bulkEnroll('course-1',['active','cancelled','completed','legacy','new','cancelled'],courses);});
  expect(saved).toBe(true);expect(state.insert).toHaveBeenCalledWith([{user_id:'cancelled',course_id:'course-1',status:'active',progress:0},{user_id:'new',course_id:'course-1',status:'active',progress:0}]);expect(state.changed).toHaveBeenCalledTimes(1);
 });
 it('does not infer missing assignments when the existing-assignment lookup fails',async()=>{
  state.queryError={code:'42501'};const{result}=setup();let saved;
  await act(async()=>{saved=await result.current.bulkEnroll('course-1',['student-1'],courses);});
  expect(saved).toBe(false);expect(state.insert).not.toHaveBeenCalled();expect(state.changed).not.toHaveBeenCalled();expect(state.error).toHaveBeenCalledWith('Не удалось проверить существующие зачисления. Зачисление отменено.');
 });
});
