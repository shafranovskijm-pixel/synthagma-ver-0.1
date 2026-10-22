import {beforeEach,describe,expect,it,vi} from 'vitest';
import {actor,org,course,enrollment} from '@/lib/educationIssuance/__tests__/fixtures';
const mock=vi.hoisted(()=>({current:true,session:vi.fn(),from:vi.fn(),responses:[] as any[],calls:[] as any[]}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'00000000-0000-4000-8000-000000000001',revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mock.session},from:mock.from}}));
import {deleteUnusedCourses} from '../courseDeletion';
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.calls=[];mock.responses=[{data:[{id:course,organization_id:org}],error:null},{data:[],error:null},{data:[{id:course}],error:null}];mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:'synthetic'}},error:null});mock.from.mockImplementation(table=>{mock.calls.push([table]);const q:any={};for(const name of ['select','in','eq','limit','delete'])q[name]=(...args:any[])=>{mock.calls.push([table,name,...args]);return q;};q.setHeader=async()=>mock.responses.shift();return q;});});
describe('retained course deletion guard',()=>{
 it('blocks a course with retained assignments before any deletion and never removes child rows',async()=>{mock.responses[1]={data:[{id:enrollment}],error:null};await expect(deleteUnusedCourses([course])).rejects.toThrow(/история обучения/);expect(mock.calls.some(call=>call[1]==='delete')).toBe(false);expect(mock.from.mock.calls.map(call=>call[0])).toEqual(['courses','enrollments']);});
 it('does not erase children to bypass a database history constraint',async()=>{mock.responses[2]={data:null,error:{code:'23503'}};await expect(deleteUnusedCourses([course])).rejects.toThrow(/данные сохранены/);expect(mock.calls.filter(call=>call[1]==='delete')).toEqual([['courses','delete']]);});
 it('reports success only for the exact confirmed course set',async()=>{await expect(deleteUnusedCourses([course])).resolves.toBeUndefined();mock.responses=[{data:[{id:course,organization_id:org}],error:null},{data:[],error:null},{data:[],error:null}];await expect(deleteUnusedCourses([course])).rejects.toThrow(/не подтвердил/);});
 it('rejects invalid selection before opening a session',async()=>{await expect(deleteUnusedCourses(['not-a-uuid'])).rejects.toThrow();expect(mock.session).not.toHaveBeenCalled();});
});
