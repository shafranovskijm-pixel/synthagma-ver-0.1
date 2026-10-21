import {act,cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import CourseLanding from'../CourseLanding';
const m=vi.hoisted(()=>({route:'a1160000-0000-4000-8000-000000000001',invoke:vi.fn(),navigate:vi.fn(),success:vi.fn(),error:vi.fn(),successUrlReads:0}));
vi.mock('react-router-dom',()=>({useParams:()=>({courseId:m.route}),useNavigate:()=>m.navigate}));
vi.mock('react-helmet-async',()=>({Helmet:()=>null}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:null})}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error}}));
vi.mock('@/lib/leadTracking',()=>({captureLeadSource:()=>{},getLeadTracking:()=>({})}));
vi.mock('@/lib/landing-enrollment',()=>({getEnrollmentConfig:()=>({mode:'instant',get success_url(){m.successUrlReads++;return undefined;}})}));
vi.mock('@/components/course-landing/LandingThemeProvider',()=>({LandingThemeProvider:({children}:any)=>children}));
vi.mock('@/components/course-landing/LandingHeroSection',()=>({LandingHeroSection:({enrollButton}:any)=><div>{enrollButton}</div>}));
vi.mock('@/components/course-landing/LandingCtaSection',()=>({LandingCtaSection:({onSubmit,submitted}:any)=>submitted?<p>Подтверждённая запись</p>:<button onClick={()=>void onSubmit({name:'Synthetic Person',email:'synthetic@example.invalid',phone:''})}>Отправить форму</button>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:m.invoke},from:(table:string)=>{
 const course={id:m.route,title:'Synthetic Course',organization_id:'a1160000-0000-4000-8000-000000000009',price:0,landing_content:{sections_order:['hero','cta']}};
 const value={data:table==='courses'?course:table==='organizations'?{name:'Synthetic Centre'}:[],error:null};
 const chain:any={select:()=>chain,eq:()=>chain,order:()=>chain,maybeSingle:async()=>value,then:(resolve:any)=>Promise.resolve(value).then(resolve)};return chain;
}}}));
beforeEach(()=>{vi.clearAllMocks();m.route='a1160000-0000-4000-8000-000000000001';m.successUrlReads=0;m.invoke.mockResolvedValue({data:{ok:true,created_new:true,enrolled:true},error:null});});
afterEach(cleanup);
const submit=async()=>{fireEvent.click(await screen.findByRole('button',{name:'Отправить форму'}));};

describe('public landing confirms enrollment outcomes before success UI',()=>{
 it('accepts the existing explicit ok wire only after the server reply',async()=>{
  render(<CourseLanding/>);await submit();await screen.findByText('Подтверждённая запись');expect(m.success).toHaveBeenCalledOnce();expect(m.successUrlReads).toBe(1);expect(m.invoke).toHaveBeenCalledOnce();
 });
 it.each([
  {data:{ok:false,recovery_required:true,error:'A recovery result'},error:null},
  {data:null,error:null},
  {data:{ok:true,enrolled:true},error:null},
  {data:{ok:'true',created_new:true,enrolled:true},error:null},
  {data:{error:'An unclassified response'},error:null},
  {data:null,error:Error('Unknown network outcome')},
 ])('shows recovery and never evaluates success redirect or resubmits for %j',async result=>{
  m.invoke.mockResolvedValue(result);render(<CourseLanding/>);await submit();
  await screen.findByRole('status');expect(screen.getByText('Завершение записи требует проверки')).toBeTruthy();expect(screen.queryByRole('button',{name:'Отправить форму'})).toBeNull();
  expect(screen.queryByText('Подтверждённая запись')).toBeNull();expect(m.success).not.toHaveBeenCalled();expect(m.successUrlReads).toBe(0);expect(m.invoke).toHaveBeenCalledOnce();expect(m.navigate).not.toHaveBeenCalled();
 });
 it('treats quota409 after Auth creation as recovery instead of blind resubmission',async()=>{
  m.invoke.mockResolvedValue({data:null,error:{context:new Response(JSON.stringify({code:'STUDENT_LIMIT_EXCEEDED',recovery_required:true}),{status:409})}});
  render(<CourseLanding/>);await submit();await screen.findByRole('status');expect(m.successUrlReads).toBe(0);expect(m.invoke).toHaveBeenCalledOnce();
 });
 it('allows corrected input after an explicit pre-Auth validation response',async()=>{
  m.invoke.mockResolvedValueOnce({data:null,error:{context:new Response(null,{status:400})}});render(<CourseLanding/>);await submit();await waitFor(()=>expect(m.error).toHaveBeenCalledOnce());
  expect(screen.queryByRole('status')).toBeNull();await submit();await screen.findByText('Подтверждённая запись');expect(m.invoke).toHaveBeenCalledTimes(2);
 });
 it('starts only one request while an instant submission is still in flight',async()=>{
  let resolve!:(value:unknown)=>void;m.invoke.mockImplementation(()=>new Promise(r=>resolve=r));render(<CourseLanding/>);await submit();await submit();expect(m.invoke).toHaveBeenCalledOnce();
  await act(async()=>resolve({data:{ok:true,created_new:true,enrolled:true},error:null}));await screen.findByText('Подтверждённая запись');
 });
 it('does not apply an old course reply after a route change',async()=>{
  let resolve!:(value:unknown)=>void;m.invoke.mockImplementation(()=>new Promise(r=>resolve=r));const view=render(<CourseLanding/>);await submit();
  m.route='a1160000-0000-4000-8000-000000000002';view.rerender(<CourseLanding/>);await screen.findByRole('button',{name:'Отправить форму'});
  await act(async()=>resolve({data:{ok:true,created_new:true,enrolled:true},error:null}));expect(m.success).not.toHaveBeenCalled();expect(m.successUrlReads).toBe(0);expect(screen.queryByText('Подтверждённая запись')).toBeNull();
 });
});
