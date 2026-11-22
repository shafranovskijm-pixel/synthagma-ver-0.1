-- One NEW focused transition case. Different answer keys are synthetic only.
SET ROLE postgres;
SELECT lab.policy_case('new attempts adopt R2 automatically while resumed and submitted R1 preserve their own keys and result bytes',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();
 SELECT lab.keep('transition_r1',lab.policy_review('Synthetic R1 release before version transition',(now()AT TIME ZONE'Europe/Moscow')::date+60));
 SELECT lab.keep('transition_release_r1',public.publish_rtn_release((lab.ctx('transition_r1')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date-1,'Synthetic R1 applies yesterday'));
 SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
 SELECT lab.keep('transition_assignment',public.assign_rtn_training('11111111-1111-4111-8111-111111111111',(lab.ctx('bank_id')#>>'{}')::uuid,ARRAY['72000000-0000-4000-8000-000000000003']::uuid[]));
 SELECT set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000003',false);
 SELECT lab.keep('transition_start_r1',public.start_rtn_attempt((lab.ctx('transition_assignment')->'assignments'->0->>'id')::uuid));
 SELECT lab.policy_assert(lab.ctx('transition_start_r1')->>'release_id'=lab.ctx('transition_release_r1')->>'release_id');
 SET ROLE postgres;
 SELECT lab.keep('transition_active_snapshot',(SELECT to_jsonb(t)FROM rtn_private.attempts t WHERE id=(lab.ctx('transition_start_r1')->>'attempt_id')::uuid));
 SET ROLE authenticated;SELECT lab.policy_admin();
 SELECT lab.keep('transition_r2',public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,
  jsonb_set(lab.ctx('keys'),'{0,correct_option_ids}','["b"]'),
  'Synthetic independently reviewed R2 answer interpretation',
  jsonb_set(lab.policy_module((now()AT TIME ZONE'Europe/Moscow')::date+60),'{materials,0,body}','"Synthetic R2 material; only this disposable fixture changes its authorial key."'),lab.policy_payload()));
 SELECT lab.keep('transition_release_r2',public.publish_rtn_release((lab.ctx('transition_r2')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic R2 applies today'));
 SELECT set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000003',false);
 SELECT lab.keep('transition_resume_r1',public.start_rtn_attempt((lab.ctx('transition_assignment')->'assignments'->0->>'id')::uuid));
 SELECT lab.policy_assert(lab.ctx('transition_resume_r1')->>'attempt_id'=lab.ctx('transition_start_r1')->>'attempt_id'
  AND lab.ctx('transition_resume_r1')->>'release_id'=lab.ctx('transition_release_r1')->>'release_id');
 SET ROLE postgres;SELECT lab.policy_assert(lab.ctx('transition_active_snapshot')=(SELECT to_jsonb(t)FROM rtn_private.attempts t WHERE id=(lab.ctx('transition_start_r1')->>'attempt_id')::uuid));
 SET ROLE authenticated;
 SELECT lab.keep('transition_grade_r1',public.submit_rtn_attempt((lab.ctx('transition_start_r1')->>'attempt_id')::uuid,'{"q1":["a"],"q2":["yes"]}'));
 SELECT lab.policy_assert((lab.ctx('transition_grade_r1')->>'score')::numeric=100 AND(lab.ctx('transition_grade_r1')->>'passed')::boolean);
 SET ROLE postgres;SELECT lab.keep('transition_submitted_snapshot',(SELECT to_jsonb(t)FROM rtn_private.attempts t WHERE id=(lab.ctx('transition_start_r1')->>'attempt_id')::uuid));
 SET ROLE authenticated;
 SELECT lab.keep('transition_start_r2',public.start_rtn_attempt((lab.ctx('transition_assignment')->'assignments'->0->>'id')::uuid));
 SELECT lab.policy_assert(lab.ctx('transition_start_r2')->>'attempt_id'<>lab.ctx('transition_start_r1')->>'attempt_id'
  AND lab.ctx('transition_start_r2')->>'release_id'=lab.ctx('transition_release_r2')->>'release_id'
  AND lab.ctx('transition_start_r2')->'materials'->0->>'body'='Synthetic R2 material; only this disposable fixture changes its authorial key.');
 SELECT lab.keep('transition_grade_r2',public.submit_rtn_attempt((lab.ctx('transition_start_r2')->>'attempt_id')::uuid,'{"q1":["a"],"q2":["yes"]}'));
 SELECT lab.policy_assert((lab.ctx('transition_grade_r2')->>'score')::numeric=50);
 SET ROLE postgres;
 SELECT lab.policy_assert(lab.ctx('transition_submitted_snapshot')=(SELECT to_jsonb(t)FROM rtn_private.attempts t WHERE id=(lab.ctx('transition_start_r1')->>'attempt_id')::uuid));
$s$);
