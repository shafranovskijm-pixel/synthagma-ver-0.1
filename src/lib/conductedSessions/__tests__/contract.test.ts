import {describe,it,expect} from 'vitest';
import * as c from '../contract';
import {confirm,detail,draft,id,scope} from './fixtures';
describe('conducted session provenance contract',()=>{
 it('requires explicit attendance and human attestation, never accepts technical progress as attendance',()=>{
  expect(c.sessionAction.safeParse(confirm()).success).toBe(true);
  for(const change of [{human_attested:false},{attendance:[{user_id:id(20),status:'completed'}]},{attendance:[{user_id:id(20),status:null}]},{attendance:[{user_id:id(20),status:'present',progress:100}]},{attendance:[]}])expect(c.sessionAction.safeParse({...confirm(),...change}).success).toBe(false);
 });
 it('rejects duplicate students, reversed time and implicit timezone',()=>{
  const a=confirm();if(a.action!=='confirm_session')throw new Error();
  for(const change of [{attendance:[a.attendance[0],a.attendance[0]]},{ends_at:a.starts_at},{starts_at:'2026-10-19T04:00:00'},{academic_hours:'0'}])expect(c.sessionAction.safeParse({...a,...change}).success).toBe(false);
 });
 it('binds lesson/calendar/roster and per-person outcome scope together',()=>{
  expect(c.assertSessionScope(c.sessionDetail.parse(detail()) as c.SessionDetail,scope.organization_id,scope.group_id)).toBeTruthy();
  const mutations=[(d:c.SessionDetail)=>{d.session.lesson_id=id(99);},(d:c.SessionDetail)=>{d.version.attendance[0].enrollment_id=id(99);},(d:c.SessionDetail)=>{d.outcomes[0].outcome!.scope.group_id=id(99);},(d:c.SessionDetail)=>{d.version.source_proof.scope.organization_id=id(99);}];
  for(const mutate of mutations){const d=detail();mutate(d);expect(()=>c.assertSessionScope(d,scope.organization_id,scope.group_id)).toThrow();}
 });
 it('retains microsecond-level snapshot identity',()=>{
  const d=detail();d.version.starts_at='2026-10-19T04:00:00.123457+00:00';expect(()=>c.assertSessionScope(d,scope.organization_id,scope.group_id)).toThrow();
 });
 it('rejects a cancelled planned source and unconfirmed roster',()=>{
  const d=detail();d.version.source_proof.lesson.status='cancelled';d.version.source_proof.lesson.cancellation_reason='Синтетическая отмена';expect(c.sessionDetail.safeParse(d).success).toBe(false);
  const source=structuredClone(detail().version.source_proof);source.roster_rows[0].association='no_exact_enrollment';source.roster_rows[0].enrollment_id=null;source.roster_rows[0].program_enrollment_snapshot_id=null;expect(c.sessionSource.safeParse(source).success).toBe(false);
 });
 it('drafts explicitly require review and never assert issuance/signature',()=>{
  const d=draft();expect(c.draftResponse.safeParse(d).success).toBe(true);
  for(const change of [{officially_issued:true},{source_current:false},{redacted:true}])expect(c.draftResponse.safeParse({...d,draft:{...d.draft,...change}}).success).toBe(false);
  d.draft.source_proof!.signature='invented' as never;expect(c.draftResponse.safeParse(d).success).toBe(false);
 });
 it('refuses a draft result from a different enrollment or an unconfirmed official result',()=>{
  const d=draft();d.draft.source_proof!.outcomes[0].outcome!.scope.enrollment_id=id(99);expect(()=>c.assertDraftScope(d,scope.organization_id,scope.group_id)).toThrow();
  const p=draft();p.draft.kind='protocol';p.draft.source_proof!.kind='protocol';expect(()=>c.assertDraftScope(p,scope.organization_id,scope.group_id)).toThrow();
 });
});
