import{act,fireEvent,render,renderHook,screen,waitFor}from'@testing-library/react';
import{beforeEach,describe,it,expect,vi}from'vitest';
import{MemoryRouter}from'react-router-dom';
import type{ReactNode}from'react';
import{useEnrollmentActions}from'@/hooks/useEnrollmentActions';
const state=vi.hoisted(()=>({actor:'actor-1',loading:false,rows:[]as any[],reads:vi.fn(),verifiedInsert:vi.fn(),refreshRows:vi.fn(),updated:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:state.actor},userRole:'organization',loading:state.loading})}));
vi.mock('@/hooks/useStaffPermissions',()=>({useStaffPermissions:()=>({loading:false,can:()=>true,organizationId:'org-1',orgRole:'owner',orgPermissions:['students.read','students.write','documents.read']})}));
vi.mock('@/hooks/useIdentificationMedia',()=>({useIdentificationState:()=>({state:null,scope:null})}));
vi.mock('@/hooks/useSubscriptionLimits',()=>({useSubscriptionLimits:()=>({plan:'professional'})}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:vi.fn()})}));
vi.mock('@/contexts/OrgDashboardContext',()=>({useOrgDashboard:()=>{const enrollmentActions=useEnrollmentActions('org-1','Synthetic center',state.updated,state.refreshRows);return{organizationId:'org-1',tabNavigation:{selectedStudentId:'student-1'},courses:[{id:'welcome',title:'Welcome',is_published:true},{id:'keep',title:'Keep',is_published:true}],categories:[],getCategoryById:()=>undefined,refreshStudentRows:state.refreshRows,enrollmentActions};}}));
vi.mock('@/utils/safeInvoke',()=>({safeInvoke:async()=>({data:null,error:null})}));
vi.mock('@/api/students',()=>({deleteStudent:vi.fn(),fetchOrganizationStudentEnrollments:(...args:unknown[])=>state.reads(...args),fetchStudentsByUserIds:async(_org:string,userIds:string[])=>({students:userIds.map(user_id=>({user_id,name:'Synthetic learner'}))})}));
vi.mock('@/api/enrollments',async original=>({...await original<typeof import('@/api/enrollments')>(),insertEnrollmentsVerified:(...args:unknown[])=>state.verifiedInsert(...args)}));
vi.mock('@/api/studentGroupMemberships',()=>({fetchEffectiveGroupMemberships:async()=>[]}));
vi.mock('@/components/organization/CancelCourseAssignmentButton',()=>({CancelCourseAssignmentButton:({enrollmentId,courseTitle,onCancelled}:any)=><button onClick={()=>{state.rows=state.rows.map(row=>row.id===enrollmentId?{...row,status:'cancelled'}:row);onCancelled?.();}}>Удалить курс {courseTitle}</button>}));
vi.mock('@/components/organization/groups/AddStudentsToGroupsDialog',()=>({AddStudentsToGroupsDialog:()=>null}));
vi.mock('@/components/organization/student-detail/ProfileTab',()=>({ProfileTab:()=>null}));
vi.mock('@/components/organization/student-detail/IdentificationTab',()=>({IdentificationTab:()=>null}));
vi.mock('@/components/organization/student-detail/DocumentsTab',()=>({DocumentsTab:()=>null}));
vi.mock('@/components/organization/student-detail/LearningResultsTab',()=>({LearningResultsTab:()=>null}));
vi.mock('@/components/organization/student-detail/ActivityTab',()=>({ActivityTab:()=>null}));
vi.mock('@/components/organization/student-detail/ChatTab',()=>({ChatTab:()=>null}));
vi.mock('@/components/organization/student-detail/AdmissionCaseCard',()=>({AdmissionCaseCard:()=>null}));
vi.mock('@/components/organization/student-detail/SendDocumentToStudentDialog',()=>({SendDocumentToStudentDialog:()=>null}));
vi.mock('@/components/organization/FRDOExportDialog',()=>({FRDOExportDialog:()=>null}));
vi.mock('@/components/organization/sales/OrgCrmCardSection',()=>({OrgCrmCardSection:()=>null}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn(),warning:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 from:(table:string)=>{let columns='';const filters:Record<string,unknown>={};const result=()=>{
  if(table==='profiles')return{data:columns.includes('user_id')?{user_id:filters.user_id,organization_id:'org-1',full_name:'Synthetic learner',email:'qa@example.invalid',login:'qa',archived_at:null}:{student_group_id:null,department:''},error:null};
  if(table==='courses')return{data:{id:filters.id},error:null};
  if(table==='enrollments')return{data:state.rows.filter(row=>row.course_id===filters.course_id&&(filters.user_id as string[]).includes(row.user_id)).map(row=>columns.includes('status')?{user_id:row.user_id,status:row.status}:{user_id:row.user_id}),error:null};
  if(table==='student_frdo_data')return{data:null,error:null};
  return{data:[],error:null};
 };const q:any={select:(value:string)=>{columns=value;return q;},eq:(key:string,value:unknown)=>{filters[key]=value;return q;},in:(key:string,value:unknown)=>{filters[key]=value;return q;},is:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>Promise.resolve(result()),single:()=>Promise.resolve(result()),then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return q;},
 rpc:async()=>({data:null,error:null})
}}));
import{StudentDetailsTab}from'@/components/organization/tabs/StudentDetailsTab';
import{useStudentDetailCardLogic}from'@/hooks/useStudentDetailCard';
const wrapper=({children}:{children:ReactNode})=><MemoryRouter>{children}</MemoryRouter>;
const learner=(user_id='student-1')=>({id:user_id,user_id,name:'Synthetic learner',email:'qa@example.invalid'});
beforeEach(()=>{vi.clearAllMocks();state.actor='actor-1';state.loading=false;state.rows=['welcome','keep'].map(course_id=>({id:'enrollment-'+course_id,user_id:'student-1',course_id,course_title:course_id==='welcome'?'Welcome':'Keep',progress:0,status:'active',started_at:'2026-10-23T00:00:00Z',time_spent:0}));state.reads.mockImplementation(async()=>state.rows.filter(row=>row.status!=='cancelled').map(row=>({...row})));state.verifiedInsert.mockImplementation(async(rows:{user_id:string;course_id:string}[])=>{state.rows=state.rows.map(row=>rows.some(input=>input.course_id===row.course_id&&input.user_id===row.user_id)?{...row,status:'active'}:row);return rows;});});
describe('organization course assignment refresh',()=>{
 it('refreshes actual parent and CoursesTab automatically after confirmed removal, then reflects ordinary assignment refresh',async()=>{
  render(<MemoryRouter initialEntries={['/organization/student/student-1?studentSection=courses']}><StudentDetailsTab/></MemoryRouter>);
  await screen.findByRole('heading',{name:'Курсы (2)'});
  fireEvent.click(screen.getByRole('button',{name:'Удалить курс Welcome'}));
  await screen.findByRole('heading',{name:'Курсы (1)'});
  expect(screen.queryByRole('heading',{name:'Welcome'})).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Keep'})).toBeInTheDocument();
  expect(state.reads).toHaveBeenCalledTimes(2);expect(state.refreshRows).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Добавить курс'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'Welcome'}));
  fireEvent.click(screen.getByRole('button',{name:/Добавить выбранные курсы/}));
  await screen.findByRole('heading',{name:'Курсы (2)'});
  expect(state.verifiedInsert).toHaveBeenCalledWith([{user_id:'student-1',course_id:'welcome',status:'active',progress:0}]);
  expect(state.reads).toHaveBeenCalledTimes(3);expect(screen.getByRole('heading',{name:'Welcome'})).toBeInTheDocument();
 });
 it('does not refresh the new learner through a stale callback or during authentication loading',async()=>{
  const {result,rerender}=renderHook(({userId})=>useStudentDetailCardLogic({isOpen:true,student:learner(userId),organizationId:'org-1',onStudentUpdated:state.updated}),{initialProps:{userId:'student-1'},wrapper});
  await waitFor(()=>expect(result.current.isLoading).toBe(false));const old=result.current.onStudentUpdated;
  rerender({userId:'student-2'});act(()=>old());expect(state.updated).not.toHaveBeenCalled();
  await waitFor(()=>expect(result.current.isLoading).toBe(false));act(()=>result.current.onStudentUpdated());expect(state.updated).toHaveBeenCalledTimes(1);
  const current=result.current.onStudentUpdated;state.loading=true;rerender({userId:'student-2'});act(()=>current());expect(state.updated).toHaveBeenCalledTimes(1);
 });
});
