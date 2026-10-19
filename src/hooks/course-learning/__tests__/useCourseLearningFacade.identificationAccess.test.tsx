import {cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useCourseLearning} from '../useCourseLearningFacade';
import {setOfflineAuthActor} from '@/utils/courseCache';
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),navigate:vi.fn(),enrollment:null as any,toast:{error:vi.fn(),info:vi.fn(),success:vi.fn()}}));
vi.mock('react-router-dom',()=>({useParams:()=>({courseId:'course'}),useNavigate:()=>mocks.navigate}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'student'},loading:false})}));
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>false}));
vi.mock('@/hooks/useSwipeGesture',()=>({useSwipeGesture:()=>({current:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mocks.from,rpc:mocks.rpc}}));
vi.mock('sonner',()=>({toast:mocks.toast}));
vi.mock('@/utils/courseCache',async original=>({...await original<typeof import('@/utils/courseCache')>(),cacheCourseData:vi.fn().mockResolvedValue(undefined),getCachedCourseData:vi.fn().mockResolvedValue(null)}));
vi.mock('@/utils/offlineSync',()=>({setupOfflineSyncListeners:()=>()=>{}}));
vi.mock('@/utils/safeInvoke',()=>({safeInvoke:vi.fn()}));
vi.mock('@/utils/limitToast',()=>({showLimitToast:vi.fn()}));
vi.mock('@/utils/generateAttestationProtocol',()=>({generateAttestationProtocol:vi.fn()}));
vi.mock('@/api/courseLibrary',()=>({fetchCourseLibraryShell:vi.fn()}));
vi.mock('@/hooks/course-learning/useLessonVideo',()=>({useLessonVideo:()=>({setVideoWatchProgress:vi.fn()})}));
vi.mock('@/hooks/course-learning/useLessonTest',()=>({useLessonTest:()=>({testQuestions:[],testAttemptId:null,testScore:null})}));
vi.mock('@/hooks/course-learning/useLessonTTS',()=>({useLessonTTS:()=>({})}));
vi.mock('@/hooks/course-learning/useLessonChat',()=>({useLessonChat:()=>({})}));
class Query {
  private mutation=false;private columns='';constructor(private table:string){}
  select(columns:string){this.columns=columns;return this;}eq(){return this;}in(){return this;}order(){return this;}insert(){this.mutation=true;return this;}
  response(){const data=this.mutation?null:this.table==='courses'?{id:'course',organization_id:'org',title:'Existing course',skip_video_identification:false}
    :this.table==='enrollments'?mocks.enrollment:this.table==='profiles'?{organization_id:'org'}:this.table==='video_identifications'?{status:'pending'}
    :this.table==='lessons'?this.columns==='content'?{content:'Existing lesson'}:[{id:'lesson',course_id:'course',title:'Existing lesson',type:'text',module_id:null}]:[];return Promise.resolve({data,error:null});}
  single(){return this.response();}maybeSingle(){return this.response();}then(resolve:any,reject:any){return this.response().then(resolve,reject);}
}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();setOfflineAuthActor(null);setOfflineAuthActor('student');mocks.enrollment={id:'enrollment',user_id:'student',course_id:'course',status:'active',expires_at:null};mocks.from.mockImplementation(table=>new Query(table));});
afterEach(()=>{cleanup();setOfflineAuthActor(null);});
describe('existing learning rights are independent from newly pending photo evidence',()=>{
  it('a current active enrollment still opens with pending identity and no selfie approval/grant query',async()=>{const h=renderHook(()=>useCourseLearning());await waitFor(()=>expect(h.result.current.enrollmentId).toBe('enrollment'));expect(h.result.current.course?.title).toBe('Existing course');expect(mocks.navigate).not.toHaveBeenCalled();expect(mocks.from.mock.calls.some(call=>call[0]==='video_identifications')).toBe(false);});
  it('completed enrollment retains existing expired-access compatibility',async()=>{mocks.enrollment={...mocks.enrollment,status:'completed',expires_at:'2020-01-01T00:00:00Z'};const h=renderHook(()=>useCourseLearning());await waitFor(()=>expect(h.result.current.enrollmentId).toBe('enrollment'));expect(mocks.navigate).not.toHaveBeenCalled();});
  it('pending identity cannot create a missing enrollment',async()=>{mocks.enrollment=null;const h=renderHook(()=>useCourseLearning());await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith('/student'));expect(h.result.current.enrollmentId).toBeNull();expect(h.result.current.course).toBeNull();});
  it('pending identity cannot override an expired active enrollment',async()=>{mocks.enrollment={...mocks.enrollment,expires_at:'2020-01-01T00:00:00Z'};const h=renderHook(()=>useCourseLearning());await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith('/student'));expect(h.result.current.enrollmentId).toBeNull();});
  it.each([{user_id:'foreign-student'},{course_id:'foreign-course'},{status:'pending'},{status:'blocked'}])('pending identity cannot authorize a foreign/nonactive exact enrollment: %j',async extra=>{mocks.enrollment={...mocks.enrollment,...extra};const h=renderHook(()=>useCourseLearning());await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith('/student'));expect(h.result.current.course).toBeNull();expect(h.result.current.enrollmentId).toBeNull();});
});
