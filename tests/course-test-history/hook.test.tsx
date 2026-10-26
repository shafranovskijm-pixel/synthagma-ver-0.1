import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ports } from './client.port';
import { useCourseTestReport } from '../../src/hooks/useCourseTestReport';
const xlsx=vi.hoisted(()=>({writeFile:vi.fn(),sheets:[] as any[]}));
vi.mock('xlsx',()=>({utils:{book_new:()=>({}),json_to_sheet:(rows:any)=>rows,book_append_sheet:(_wb:any,rows:any,name:string)=>xlsx.sheets.push({rows,name})},writeFile:xlsx.writeFile}));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
const a=(id='attempt-1',extra:Record<string,unknown>={})=>({id,user_id:'synthetic-user',lesson_id:'lesson-1',score:8,max_score:10,completed_at:'2026-10-01T12:00:00Z',answers:{q1:1},shown_question_ids:['q1'],passed:false,passing_score:90,...extra});
const p=(id='attempt-1',text='Зафиксированный вопрос')=>({attempt_id:id,history_status:'snapshot',questions:[{id:'q1',question:text,options:['A','B'],correct_answer:1}]});
beforeEach(()=>{
 ports.tables={lessons:{data:[{id:'lesson-1',title:'Synthetic lesson'}],error:null},test_attempts:{data:[a()],error:null},profiles:{data:[{user_id:'synthetic-user',full_name:'Synthetic',email:''}],error:null}};
 ports.rpc=async()=>({data:[p()],error:null});xlsx.sheets.length=0;xlsx.writeFile.mockClear();
});
describe('actual teacher history hook',()=>{
 it('HH01 loads only authorized snapshot RPC and exports its exact text without reading a bank',async()=>{
  const {result}=renderHook(()=>useCourseTestReport('course-1','QA','org-1'));
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.loadError).toBe(false);expect(result.current.getAttemptQuestionDetails(result.current.testData[0])[0].questionText).toBe('Зафиксированный вопрос');
  expect(ports.calls.find(c=>c.kind==='rpc')).toMatchObject({name:'get_teacher_test_attempt_history',args:{p_course_id:'course-1',p_attempt_ids:['attempt-1']}});
  expect(ports.calls.filter(c=>c.kind==='from').map(c=>c.name)).toEqual(['lessons','test_attempts','profiles']);
  expect(ports.calls.find(c=>c.name==='test_attempts')?.select).toContain('passed, passing_score');
  await act(async()=>{await result.current.handleExport();});
  expect(xlsx.writeFile).toHaveBeenCalledTimes(1);expect(xlsx.sheets.find(s=>s.name==='Все ответы').rows[0]['Вопрос']).toBe('Зафиксированный вопрос');expect(ports.fetchCalls).toBe(0);
 });
 it('HH02 legacy score and saved ninety-percent outcome survive without a question association',async()=>{
  ports.rpc=async()=>({data:[{attempt_id:'attempt-1',history_status:'legacy_unknown',questions:null}],error:null});
  const {result}=renderHook(()=>useCourseTestReport('course-1','QA','org-1'));
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.testData[0]).toMatchObject({score:8,max_score:10,passed:false,passing_score:90,history:{status:'legacy_unknown',details:[]}});
  expect(result.current.stats.passedCount).toBe(0);
  await act(async()=>{await result.current.handleExport();});
  expect(xlsx.sheets.find(s=>s.name==='Сводка').rows[0]).toMatchObject({'Баллы':8,'Результат':'Не пройден','Правильных':'Не подтверждено'});
  expect(xlsx.sheets.find(s=>s.name==='Все ответы').rows[0]).not.toHaveProperty('Правильный ответ');
 });
 it('HH03 student or foreign-organization RPC denial produces no snapshot or stale report',async()=>{
  const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{});
  for(const denial of ['student','foreign-org']){
   ports.rpc=async()=>({data:null,error:{code:'42501',message:denial+' PRIVATE_ERROR_SENTINEL'}});
   const {result,unmount}=renderHook(()=>useCourseTestReport('course-1','QA',denial));
   await waitFor(()=>expect(result.current.isLoading).toBe(false));
   expect(result.current.loadError).toBe(true);expect(result.current.testData).toEqual([]);expect(xlsx.writeFile).not.toHaveBeenCalled();
   unmount();
  }
  expect(errorLog.mock.calls).toEqual([['course_test_report_unavailable'],['course_test_report_unavailable']]);errorLog.mockRestore();
 });
 it('HH04 late old-course RPC cannot overwrite the current course snapshot',async()=>{
  let release!:(value:any)=>void;
  const delayed=new Promise<{data:unknown;error:unknown}>(resolve=>{release=resolve;});
  ports.rpc=async(_name,args:any)=>args.p_course_id==='course-A'?delayed:{data:[p('attempt-1','Снимок курса B')],error:null};
  const {result,rerender}=renderHook(({course})=>useCourseTestReport(course,'QA','org-1'),{initialProps:{course:'course-A'}});
  await waitFor(()=>expect(ports.calls.some(c=>c.kind==='rpc')).toBe(true));
  rerender({course:'course-B'});
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.testData[0].history.details[0].questionText).toBe('Снимок курса B');
  await act(async()=>{release({data:[p('attempt-1','СТАРЫЙ A')],error:null});await delayed;});
  expect(result.current.testData[0].history.details[0].questionText).toBe('Снимок курса B');
 });
 it('HH05 duplicate/missing RPC result rows fail closed instead of mixing snapshots',async()=>{
  ports.rpc=async()=>({data:[{...p(),attempt_id:'other'}],error:null});
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const {result}=renderHook(()=>useCourseTestReport('course-1','QA','org-1'));
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.loadError).toBe(true);expect(result.current.testData).toEqual([]);log.mockRestore();
 });
 it('HH06 snapshot requests stay bounded to two hundred exact attempt IDs',async()=>{
  ports.tables.test_attempts={data:Array.from({length:201},(_,i)=>a('attempt-'+i)),error:null};
  ports.rpc=async(_name,args:any)=>({data:args.p_attempt_ids.map((id:string)=>({attempt_id:id,history_status:'legacy_unknown',questions:null})),error:null});
  const {result}=renderHook(()=>useCourseTestReport('course-1','QA','org-1'));
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.testData).toHaveLength(201);
  const calls=ports.calls.filter(c=>c.kind==='rpc').map(c=>(c.args as any).p_attempt_ids);
  expect(calls.map(ids=>ids.length)).toEqual([200,1]);expect(new Set(calls.flat()).size).toBe(201);expect(ports.fetchCalls).toBe(0);
 });
});
