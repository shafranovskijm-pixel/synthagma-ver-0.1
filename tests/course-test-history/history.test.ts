import { describe, expect, it } from 'vitest';
import { buildHistoryExport, questionCounts, resolveAttemptHistory, storedAttemptOutcome, UNKNOWN_HISTORY } from '../../src/lib/courseTestHistory';
const attempt = (extra: Record<string, unknown> = {}) => ({ id:'attempt-1', answers:{q1:1}, shown_question_ids:['q1'], score:1, max_score:1, passed:true, passing_score:90, ...extra });
const snapshot = (extra: Record<string, unknown> = {}) => ({ attempt_id:'attempt-1', history_status:'snapshot', questions:[{id:'q1',question:'Сохранённая формулировка',options:['Первый','Сохранённый выбор'],correct_answer:1}], ...extra });
const exported = (a: ReturnType<typeof attempt>, history: ReturnType<typeof resolveAttemptHistory>) => ({...a,user_name:'Synthetic',user_email:'',lesson_title:'QA test',completed_at:'2026-10-01T12:00:00Z',history});
describe('immutable test history', () => {
 it('HR01 snapshot text/options/key remain exact after a separate bank mutation',()=>{
  const bank={question:'Старая',options:['A','B'],correct_answer:1};
  const frozen=snapshot(); const a=attempt();
  const before=JSON.stringify({a,frozen});
  bank.question='Новая';bank.options.reverse();bank.correct_answer=0;
  const result=resolveAttemptHistory(a,frozen);
  expect(result.status).toBe('snapshot');expect(result.details[0]).toMatchObject({questionText:'Сохранённая формулировка',options:['Первый','Сохранённый выбор'],correctAnswer:1,isCorrect:true});
  expect(JSON.stringify({a,frozen})).toBe(before);
 });
 it('HR02 legacy ignores supplied question material and preserves original score/outcome',()=>{
  const a=attempt({score:8,max_score:10,passed:false,passing_score:90});
  const history=resolveAttemptHistory(a,snapshot({history_status:'legacy_unknown'}));
  const data=buildHistoryExport([exported(a,history)]);
  expect(history).toEqual({status:'legacy_unknown',details:[]});
  expect(data.summaryData[0]).toMatchObject({'Баллы':8,'Макс. баллы':10,'Результат':'Не пройден','Правильных':'Не подтверждено','Неправильных':'Не подтверждено'});
  expect(data.detailedData).toHaveLength(1);expect(data.detailedData[0]['Вопрос']).toBe(UNKNOWN_HISTORY);
  expect(data.wrongAnswersData).toEqual([]);expect(JSON.stringify(data)).not.toContain('Сохранённый выбор');
 });
 it('HR03 absent or mismatched attempt payload cannot resolve any question',()=>{
  for(const p of [null,undefined,{},snapshot({attempt_id:'other'}),snapshot({history_status:'snapshot_unavailable'})]) expect(resolveAttemptHistory(attempt(),p).details).toEqual([]);
 });
 it('HR04 malformed/duplicate/incomplete snapshots fail whole history without a partial list',()=>{
  const q=(snapshot().questions as any[])[0];
  for(const questions of [[],{},[q,q],[q,{...q,id:'q2',options:[123]}],[{...q,question:null}]]){
   expect(resolveAttemptHistory(attempt(),snapshot({questions}))).toEqual({status:'snapshot_unavailable',details:[]});
  }
 });
 it('HR05 invalid frozen key is not corrected and cannot mark an answer wrong',()=>{
  const q={...snapshot().questions[0],correct_answer:99};
  const a=attempt();const history=resolveAttemptHistory(a,snapshot({questions:[q]}));
  expect(history.details[0]).toMatchObject({correctAnswer:null,isCorrect:null,selectedAnswer:1});
  expect(questionCounts(history)).toEqual({correct:null,incorrect:null});
  const data=buildHistoryExport([exported(a,history)]);
  expect(data.summaryData[0]['Баллы']).toBe(1);expect(data.wrongAnswersData).toEqual([]);expect(data.detailedData[0]['Правильный ответ']).toBe('Не подтверждён');
 });
 it('HR06 unanswered remains an incorrect answer only with a valid frozen key',()=>{
  const d=resolveAttemptHistory(attempt({answers:{}}),snapshot()).details[0];
  expect(d).toMatchObject({selectedAnswer:-1,selectedAnswerStatus:'unanswered',isCorrect:false});
 });
 it('HR07 invalid stored selections are unknown rather than unanswered or wrong',()=>{
  for(const raw of [-1,99,'1',null]){
   const a=attempt({answers:{q1:raw}});const history=resolveAttemptHistory(a,snapshot());
   expect(history.details[0]).toMatchObject({isCorrect:null,selectedAnswerStatus:'unknown'});
   expect(buildHistoryExport([exported(a,history)]).detailedData[0]['Ответ студента']).toBe('Не подтверждён');
  }
 });
 it('HR08 frozen string and text-object choices keep their original order',()=>{
  const q={...snapshot().questions[0],options:[{text:'Первый'},'Второй']};
  expect(resolveAttemptHistory(attempt(),snapshot({questions:[q]})).details[0].options).toEqual(['Первый','Второй']);
 });
 it('HR09 stored passed decision has precedence over a recomputed threshold',()=>{
  expect(storedAttemptOutcome(attempt({score:0,passed:true}))).toBe(true);
  expect(storedAttemptOutcome(attempt({score:1,passed:false}))).toBe(false);
 });
 it('HR10 legacy uses its saved threshold rather than a fixed seventy percent',()=>{
  expect(storedAttemptOutcome(attempt({score:8,max_score:10,passed:null,passing_score:90}))).toBe(false);
  expect(storedAttemptOutcome(attempt({score:8,max_score:10,passed:null,passing_score:60}))).toBe(true);
 });
 it('HR11 unknown threshold preserves score but does not invent a pass decision',()=>{
  for(const threshold of [null,undefined,101,-1]) expect(storedAttemptOutcome(attempt({passed:null,passing_score:threshold}))).toBeNull();
  expect(storedAttemptOutcome(attempt({passed:null,max_score:0}))).toBeNull();
 });
 it('HR12 shown-question mismatch or malformed answers cannot be patched from another source',()=>{
  for(const extra of [{shown_question_ids:['other']},{shown_question_ids:['q1','q2']},{answers:null},{answers:[]},{shown_question_ids:[123]}]){
   expect(resolveAttemptHistory(attempt(extra),snapshot())).toEqual({status:'snapshot_unavailable',details:[]});
  }
 });
 it('HR13 exact frozen question order and incorrect-answer export are retained',()=>{
  const a=attempt({shown_question_ids:['q2','q1'],answers:{q1:0,q2:0}});
  const q=snapshot().questions[0];const p=snapshot({questions:[{...q,id:'q2',question:'Снимок два',correct_answer:0},q]});
  const history=resolveAttemptHistory(a,p);const data=buildHistoryExport([exported(a,history)]);
  expect(history.details.map(d=>d.questionText)).toEqual(['Снимок два','Сохранённая формулировка']);
  expect(questionCounts(history)).toEqual({correct:1,incorrect:1});
  expect(data.wrongAnswersData).toHaveLength(1);expect(data.wrongAnswersData[0]['Вопрос']).toBe('Сохранённая формулировка');
 });
});
