-- New cases only. Each mutation case rolls back its synthetic transaction.
SET ROLE postgres;
CREATE FUNCTION lab.policy_assert(ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Synthetic policy assertion failed';END IF;END;$$;
CREATE FUNCTION lab.policy_case(p_name text,p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE p_sql;RAISE EXCEPTION 'synthetic case rollback' USING ERRCODE='ZQP01';
 EXCEPTION WHEN SQLSTATE 'ZQP01' THEN NULL;END;
 PERFORM lab.check(p_name,true);
END;$$;
CREATE FUNCTION lab.policy_payload() RETURNS jsonb LANGUAGE sql AS $$
 SELECT '{"version":"source-tracked-v2","legal_assessment":"applicable_norms_and_end_dates_reviewed","legal_review_note":"Synthetic subject assessment: the supplied normative citations and their applicable end dates were checked for this disposable fixture."}'::jsonb
$$;
CREATE FUNCTION lab.policy_module(p_end date DEFAULT NULL,p_due date DEFAULT (now()AT TIME ZONE'Europe/Moscow')::date+1) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_set(lab.ctx('module'),'{review_before}',to_jsonb(p_due::text))
  ||CASE WHEN p_end IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('valid_until',p_end::text) END
$$;
CREATE FUNCTION lab.policy_review(p_note text,p_end date DEFAULT NULL,p_due date DEFAULT (now()AT TIME ZONE'Europe/Moscow')::date+1) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,
  lab.ctx('keys'),p_note,lab.policy_module(p_end,p_due),lab.policy_payload())
$$;
CREATE FUNCTION lab.policy_admin() RETURNS void LANGUAGE plpgsql AS $$BEGIN
 PERFORM set_config('request.jwt.claim.role','authenticated',false);
 PERFORM set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000999',false);
END;$$;
GRANT EXECUTE ON FUNCTION lab.policy_assert(boolean),lab.policy_module(date,date),lab.policy_payload(),lab.policy_review(text,date,date),lab.policy_admin() TO authenticated,service_role;

SELECT lab.check('policy migration changes only six reviewed bodies preserving all existing function authority',
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('policy_old_functions'))old LEFT JOIN pg_proc p ON p.oid=(old->>'oid')::oid
 WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc' IS DISTINCT FROM old-'prosrc'
 OR(p.oid<>ALL(ARRAY['rtn_private.normative_current(uuid,timestamptz)'::regprocedure::oid,
 'rtn_private.assert_normative_current(uuid,timestamptz)'::regprocedure::oid,'public.get_rtn_workspace(uuid)'::regprocedure::oid,
 'public.get_rtn_editorial_workspace()'::regprocedure::oid,'public.get_rtn_student_workspace()'::regprocedure::oid,
 'public.get_rtn_assignment(uuid)'::regprocedure::oid]) AND p.prosrc IS DISTINCT FROM old->>'prosrc')));
SELECT lab.check('policy migration preserves all old keys releases assignments attempts originals and client records',
 lab.ctx('policy_old_keys')=(SELECT jsonb_agg(to_jsonb(k)ORDER BY id)FROM rtn_private.key_sets k)
 AND lab.ctx('policy_old_releases')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.releases r)
 AND lab.ctx('policy_old_assignments')=(SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM rtn_private.assignments a)
 AND lab.ctx('policy_old_attempts')=(SELECT jsonb_agg(to_jsonb(t)ORDER BY id)FROM rtn_private.attempts t)
 AND lab.ctx('policy_old_sources')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s)
 AND lab.ctx('policy_old_bank_revisions')=(SELECT jsonb_agg(to_jsonb(b)ORDER BY id)FROM rtn_private.bank_revisions b)
 AND lab.ctx('old_data')=(SELECT jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),(SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x))));
SELECT lab.check('new private policy table helpers have no PUBLIC authenticated service or sandbox grant',
 (SELECT relrowsecurity FROM pg_class WHERE oid='rtn_private.key_review_policies'::regclass)
 AND NOT has_table_privilege('authenticated','rtn_private.key_review_policies','SELECT')
 AND NOT has_table_privilege('service_role','rtn_private.key_review_policies','INSERT')
 AND NOT has_function_privilege('authenticated','rtn_private.review_policy_status(uuid,timestamptz)','EXECUTE')
 AND NOT has_function_privilege('service_role','rtn_private.review_policy_summary(uuid,timestamptz)','EXECUTE')
 AND NOT has_function_privilege('sandbox_exec_atxwvjxbqjgkbjlhsdch','public.review_rtn_keys_v2(uuid,uuid,jsonb,text,jsonb,jsonb)','EXECUTE'));

SELECT lab.policy_case('fresh V2 review records one explicit immutable policy with no duplicate attribution',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('new_policy',lab.policy_review('Synthetic fresh V2 review'));
 SET ROLE postgres;
 SELECT lab.policy_assert((SELECT count(*)=1 FROM rtn_private.key_review_policies));
 SELECT lab.policy_assert(lab.ctx('new_policy')->>'approval_policy'='source-tracked-v2' AND lab.ctx('new_policy')->>'legal_validity'='no_declared_cutoff_reviewed');
 SELECT lab.policy_assert((SELECT review_note LIKE '%Нормативная проверка:%' FROM rtn_private.key_sets WHERE id=(lab.ctx('new_policy')->>'key_set_id')::uuid));
 SELECT lab.policy_assert(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='rtn_private' AND table_name='key_review_policies' AND column_name IN('reviewed_by','legal_review_note','actor_id')));
 SELECT lab.denied('policy update denied','UPDATE rtn_private.key_review_policies SET legal_cutoff_at=now()+interval ''1 year''');
 SELECT lab.denied('policy delete denied','DELETE FROM rtn_private.key_review_policies');
 SELECT lab.denied('policy truncate denied','TRUNCATE rtn_private.key_review_policies');
$s$);
SELECT lab.policy_case('exact V2 replay is idempotent with unchanged key and policy bytes',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('first',lab.policy_review('Synthetic repeatable V2 review'));
 SET ROLE postgres;SELECT lab.keep('first_key',(SELECT to_jsonb(k)FROM rtn_private.key_sets k WHERE id=(lab.ctx('first')->>'key_set_id')::uuid));
 SELECT lab.keep('first_policy',(SELECT to_jsonb(p)FROM rtn_private.key_review_policies p));
 SET ROLE authenticated;SELECT lab.keep('second',lab.policy_review('Synthetic repeatable V2 review'));
 SET ROLE postgres;SELECT lab.policy_assert((lab.ctx('second')->>'replayed')::boolean AND lab.ctx('first')->>'key_set_id'=lab.ctx('second')->>'key_set_id');
 SELECT lab.policy_assert(lab.ctx('first_key')=(SELECT to_jsonb(k)FROM rtn_private.key_sets k WHERE id=(lab.ctx('first')->>'key_set_id')::uuid) AND lab.ctx('first_policy')=(SELECT to_jsonb(p)FROM rtn_private.key_review_policies p));
$s$);
SELECT lab.policy_case('legacy replay cannot acquire a V2 sidecar or extend old deadlines',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();
 SELECT lab.keep('legacy_exact',public.review_rtn_keys((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys'),
 'Synthetic exact legacy review'||E'\n\nНормативная проверка: '||(lab.policy_payload()->>'legal_review_note'),lab.policy_module()));
 SELECT lab.denied('legacy promotion refused',$q$SELECT lab.policy_review('Synthetic exact legacy review')$q$,'22023');
 SET ROLE postgres;SELECT lab.policy_assert(NOT EXISTS(SELECT 1 FROM rtn_private.key_review_policies));
$s$);
SELECT lab.policy_case('missing unknown or empty legal assessment rejects atomically',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();
 SELECT lab.denied('missing policy',$q$SELECT public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic missing assessment',lab.policy_module(),NULL)$q$,'22023');
 SELECT lab.denied('unrecognized policy',$q$SELECT public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic unknown assessment',lab.policy_module(),lab.policy_payload()||'{"legal_assessment":"unknown"}')$q$,'22023');
 SELECT lab.denied('empty assessment',$q$SELECT public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic empty assessment',lab.policy_module(),lab.policy_payload()||'{"legal_review_note":" "}')$q$,'22023');
 SET ROLE postgres;SELECT lab.policy_assert(lab.ctx('policy_old_keys')=(SELECT jsonb_agg(to_jsonb(k)ORDER BY id)FROM rtn_private.key_sets k) AND NOT EXISTS(SELECT 1 FROM rtn_private.key_review_policies));
$s$);
SELECT lab.policy_case('new policy cannot remove per-question evidence source matching or editorial declaration',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();
 SELECT lab.denied('missing question evidence',$q$SELECT public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys')#-'{0,evidence}','Synthetic missing evidence',lab.policy_module(),lab.policy_payload())$q$,'22023');
 SELECT lab.denied('wrong official wording',$q$SELECT public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,jsonb_set(lab.ctx('keys'),'{0,text}','"Different wording"'),'Synthetic source mismatch',lab.policy_module(),lab.policy_payload())$q$,'22023');
 SELECT lab.denied('missing editorial date',$q$SELECT public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic missing planned date',lab.ctx('module'),lab.policy_payload())$q$,'22023');
$s$);
SELECT lab.policy_case('legal cutoff derives from declared validity only not mixed editorial minimum',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('bounded',lab.policy_review('Synthetic real legal bound',(now()AT TIME ZONE'Europe/Moscow')::date+40));
 SET ROLE postgres;
 SELECT lab.policy_assert((SELECT normative_cutoff_at<legal_cutoff_at FROM rtn_private.key_sets k JOIN rtn_private.key_review_policies p ON p.key_set_id=k.id WHERE k.id=(lab.ctx('bounded')->>'key_set_id')::uuid));
 SELECT lab.policy_assert(rtn_private.normative_current((lab.ctx('bounded')->>'key_set_id')::uuid,clock_timestamp()+interval '8 days'));
 SELECT lab.policy_assert(rtn_private.review_policy_summary((lab.ctx('bounded')->>'key_set_id')::uuid,clock_timestamp()+interval '8 days')->>'editorial_status'='due');
$s$);
SELECT lab.policy_case('exclusive legal midnight remains hard despite later editorial SLA',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('bounded',lab.policy_review('Synthetic exclusive legal bound',(now()AT TIME ZONE'Europe/Moscow')::date+1,(now()AT TIME ZONE'Europe/Moscow')::date+7));
 SET ROLE postgres;SELECT lab.keep('hard',(SELECT to_jsonb(legal_cutoff_at)FROM rtn_private.key_review_policies WHERE key_set_id=(lab.ctx('bounded')->>'key_set_id')::uuid));
 SELECT lab.policy_assert(rtn_private.normative_current((lab.ctx('bounded')->>'key_set_id')::uuid,(lab.ctx('hard')#>>'{}')::timestamptz-interval '1 microsecond') AND NOT rtn_private.normative_current((lab.ctx('bounded')->>'key_set_id')::uuid,(lab.ctx('hard')#>>'{}')::timestamptz));
 SELECT lab.policy_assert(rtn_private.review_policy_status((lab.ctx('bounded')->>'key_set_id')::uuid,(lab.ctx('hard')#>>'{}')::timestamptz)->>'admission_reason'='legal_limit_reached');
$s$);
SELECT lab.policy_case('nested earlier normative end cannot be hidden by a later module date',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();
 SELECT lab.keep('nested',public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,
 jsonb_set(lab.ctx('keys'),'{0,evidence,0,normative_valid_until}',to_jsonb(((now()AT TIME ZONE'Europe/Moscow')::date+2)::text)),
 'Synthetic nested legal cutoff',lab.policy_module((now()AT TIME ZONE'Europe/Moscow')::date+60),lab.policy_payload()));
 SET ROLE postgres;SELECT lab.policy_assert((SELECT legal_cutoff_at=((now()AT TIME ZONE'Europe/Moscow')::date+2)::timestamp AT TIME ZONE'Europe/Moscow' FROM rtn_private.key_review_policies));
$s$);
SELECT lab.policy_case('legacy seven-day admission is retained while V2 day-eight review is advisory',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();
 SELECT lab.keep('legacy',public.review_rtn_keys((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic still legacy weekly policy',lab.policy_module((now()AT TIME ZONE'Europe/Moscow')::date+60)));
 SELECT lab.keep('v2',lab.policy_review('Synthetic V2 advisory policy',(now()AT TIME ZONE'Europe/Moscow')::date+60));
 SET ROLE postgres;SELECT lab.policy_assert(NOT rtn_private.normative_current((lab.ctx('legacy')->>'key_set_id')::uuid,clock_timestamp()+interval '8 days') AND rtn_private.normative_current((lab.ctx('v2')->>'key_set_id')::uuid,clock_timestamp()+interval '8 days'));
$s$);
SELECT lab.policy_case('already due editorial SLA still permits real new assignment and attempt under V2',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic advisory already due',(now()AT TIME ZONE'Europe/Moscow')::date+60,(now()AT TIME ZONE'Europe/Moscow')::date-1));
 SELECT lab.keep('release',public.publish_rtn_release((lab.ctx('ready')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic V2 current release'));
 SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
 SELECT lab.keep('new_assignment',public.assign_rtn_training('11111111-1111-4111-8111-111111111111',(lab.ctx('bank_id')#>>'{}')::uuid,ARRAY['72000000-0000-4000-8000-000000000003']::uuid[]));
 SELECT set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000003',false);
 SELECT lab.keep('new_attempt',public.start_rtn_attempt((lab.ctx('new_assignment')->'assignments'->0->>'id')::uuid));
 SELECT lab.policy_assert(lab.ctx('new_attempt')->>'release_id'=lab.ctx('release')->>'release_id');
$s$);
SELECT lab.policy_case('changed official hash blocks new admission until a genuinely reviewed release',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic source identity checked'));
 SET ROLE postgres;UPDATE rtn_private.sources SET last_sha256=repeat('b',64) WHERE id=(lab.ctx('source')->>'source_id')::uuid;
 SELECT lab.policy_assert(NOT rtn_private.normative_current((lab.ctx('ready')->>'key_set_id')::uuid,clock_timestamp()) AND rtn_private.review_policy_status((lab.ctx('ready')->>'key_set_id')::uuid,clock_timestamp())->>'admission_reason'='source_revision_changed');
$s$);
SELECT lab.policy_case('new source generation blocks even a returning identical hash',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic source generation checked'));
 SET ROLE postgres;UPDATE rtn_private.sources SET source_generation=source_generation+1 WHERE id=(lab.ctx('source')->>'source_id')::uuid;
 SELECT lab.policy_assert(NOT rtn_private.normative_current((lab.ctx('ready')->>'key_set_id')::uuid,clock_timestamp()));
$s$);
SELECT lab.policy_case('corrected full normalization blocks the older approved interpretation',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic normalization identity checked'));
 SET ROLE postgres;INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,normalization_version,normalized_sha256,normalization_note)
 SELECT bank_id,source_revision_id,questions,question_count,normalization_version+1,repeat('b',64),'Synthetic corrected normalization' FROM rtn_private.bank_revisions WHERE id=(lab.ctx('bank_revision_id')#>>'{}')::uuid;
 SELECT lab.policy_assert(rtn_private.review_policy_status((lab.ctx('ready')->>'key_set_id')::uuid,clock_timestamp())->>'admission_reason'='normalization_changed');
$s$);
SELECT lab.policy_case('corrected parent normalization blocks a previously approved partial module',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();
 SELECT lab.keep('child',public.review_rtn_keys_v2((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,jsonb_build_array(lab.ctx('keys')->0),
 'Synthetic reviewed child module',lab.policy_module()-'kind'||'{"code":"A.1-PART","title":"Synthetic partial one question","domain":"industrial-safety"}',lab.policy_payload()));
 SET ROLE postgres;SELECT lab.policy_assert(rtn_private.normative_current((lab.ctx('child')->>'key_set_id')::uuid,clock_timestamp()));
 INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,normalization_version,normalized_sha256,normalization_note)
 SELECT bank_id,source_revision_id,questions,question_count,normalization_version+1,repeat('c',64),'Synthetic parent normalization correction' FROM rtn_private.bank_revisions WHERE id=(lab.ctx('bank_revision_id')#>>'{}')::uuid;
 SELECT lab.policy_assert(rtn_private.review_policy_status((lab.ctx('child')->>'key_set_id')::uuid,clock_timestamp())->>'admission_reason'='normalization_changed');
$s$);
SELECT lab.policy_case('source403 alone neither revokes confirmed edition nor renews successful-check dates',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic isolated source failure'));
 SET ROLE postgres;SELECT lab.keep('success_before',(SELECT to_jsonb(last_success_at)FROM rtn_private.sources WHERE id=(lab.ctx('source')->>'source_id')::uuid));
 UPDATE rtn_private.sources SET last_status='error',last_checked_at=clock_timestamp() WHERE id=(lab.ctx('source')->>'source_id')::uuid;
 SELECT lab.policy_assert(rtn_private.normative_current((lab.ctx('ready')->>'key_set_id')::uuid,clock_timestamp()) AND lab.ctx('success_before')=(SELECT to_jsonb(last_success_at)FROM rtn_private.sources WHERE id=(lab.ctx('source')->>'source_id')::uuid));
$s$);
SELECT lab.policy_case('active attempt resumes old snapshot while newer source prevents new admissions',$s$
 SET ROLE postgres;UPDATE rtn_private.sources SET last_sha256=repeat('d',64) WHERE id=(lab.ctx('source')->>'source_id')::uuid;
 SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000101',false);
 SELECT lab.keep('resumed',public.start_rtn_attempt((lab.ctx('assignment_id')#>>'{}')::uuid));
 SELECT lab.policy_assert(lab.ctx('resumed')->>'attempt_id'=lab.ctx('old_start')->>'attempt_id');
 SET ROLE postgres;SELECT lab.policy_assert(lab.ctx('policy_old_attempts')=(SELECT jsonb_agg(to_jsonb(t)ORDER BY id)FROM rtn_private.attempts t));
$s$);
SELECT lab.policy_case('latest expired release is not bypassed by falling back to an older valid V2 edition',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic earlier admissible release'));
 SELECT public.publish_rtn_release((lab.ctx('ready')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic admissible prior release');
 SELECT lab.keep('expired',public.review_rtn_keys((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic historical expired newest keys',lab.policy_module(NULL,(now()AT TIME ZONE'Europe/Moscow')::date-1)));
 SET ROLE postgres;
 -- Model an already-published edition whose deadline has elapsed; not a product publication bypass.
 INSERT INTO rtn_private.releases(bank_id,key_set_id,effective_from,release_note,published_by,published_at)
 VALUES((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('expired')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic historical expiry','81000000-0000-4000-8000-000000000999',clock_timestamp()+interval '1 second');
 SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
 SELECT lab.denied('no fallback assignment',$q$SELECT public.assign_rtn_training('11111111-1111-4111-8111-111111111111',(lab.ctx('bank_id')#>>'{}')::uuid,ARRAY['72000000-0000-4000-8000-000000000003']::uuid[])$q$,'22023');
$s$);
SELECT lab.policy_case('current release dates refer to selected release rather than a newer future edition',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic selected release dates',(now()AT TIME ZONE'Europe/Moscow')::date+60));
 SELECT lab.keep('selected',public.publish_rtn_release((lab.ctx('ready')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic selected current edition'));
 SELECT lab.keep('future',lab.policy_review('Synthetic future release dates',(now()AT TIME ZONE'Europe/Moscow')::date+60));
 SELECT public.publish_rtn_release((lab.ctx('future')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date+10,'Synthetic future edition');
 SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
 SELECT lab.keep('display_bank',public.get_rtn_workspace('11111111-1111-4111-8111-111111111111')->'banks'->0);
 SET ROLE postgres;SELECT lab.policy_assert(lab.ctx('display_bank')->>'release_id'=lab.ctx('selected')->>'release_id'
  AND(lab.ctx('display_bank')->>'published_at')::timestamptz=(SELECT published_at FROM rtn_private.releases WHERE id=(lab.ctx('selected')->>'release_id')::uuid)
  AND lab.ctx('display_bank')->>'published_at'=lab.ctx('display_bank')->'active_release'->>'published_at');
$s$);
SELECT lab.policy_case('student and assignment projections separate actual legal limit from routine due date',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic learner date projection',(now()AT TIME ZONE'Europe/Moscow')::date+60,(now()AT TIME ZONE'Europe/Moscow')::date-1));
 SELECT public.publish_rtn_release((lab.ctx('ready')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic current learner metadata');
 SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
 SELECT lab.keep('new_assignment',public.assign_rtn_training('11111111-1111-4111-8111-111111111111',(lab.ctx('bank_id')#>>'{}')::uuid,ARRAY['72000000-0000-4000-8000-000000000003']::uuid[]));
 SELECT set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000003',false);
 SELECT lab.keep('student_policy',public.get_rtn_student_workspace()->'assignments'->0);
 SELECT lab.keep('detail_policy',public.get_rtn_assignment((lab.ctx('new_assignment')->'assignments'->0->>'id')::uuid)->'assignment');
 SELECT lab.policy_assert(lab.ctx('student_policy')->>'approval_policy'='source-tracked-v2' AND lab.ctx('student_policy')->>'editorial_status'='due' AND(lab.ctx('student_policy')->>'can_start')::boolean);
 SELECT lab.policy_assert(lab.ctx('detail_policy')->>'normative_cutoff_at'=lab.ctx('detail_policy')->>'legal_cutoff_at' AND(lab.ctx('detail_policy')->>'can_start')::boolean);
$s$);
SELECT lab.policy_case('editorial server advertises exact V2 capability with safe key metadata',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic editorial metadata'));
 SELECT lab.keep('editorial',public.get_rtn_editorial_workspace());
 SELECT lab.policy_assert(lab.ctx('editorial')->'review_policy_capabilities'='{"source_tracked_v2":true,"version":"source-tracked-v2","legal_assessment":"applicable_norms_and_end_dates_reviewed"}'::jsonb);
 SELECT lab.policy_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('editorial')->'key_sets')k WHERE k->>'id'=lab.ctx('ready')->>'key_set_id' AND k->>'approval_policy'='source-tracked-v2' AND NOT(k?'legal_review_note')));
$s$);
SELECT lab.policy_case('new review still requires real admin and blocks foreign learner access',$s$
 SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
 SELECT lab.denied('owner cannot approve V2',$q$SELECT lab.policy_review('Synthetic unauthorized review')$q$);
 SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000102',false);
 SELECT lab.denied('foreign learner cannot inspect assignment',$q$SELECT public.get_rtn_assignment((lab.ctx('assignment_id')#>>'{}')::uuid)$q$);
$s$);
SELECT lab.policy_case('V2 approval cannot bypass a real organizational access hold',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic paid entitlement guard'));
 SELECT public.publish_rtn_release((lab.ctx('ready')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic current paid edition');
 SET ROLE postgres;INSERT INTO billing_access_private.active_holds VALUES('11111111-1111-4111-8111-111111111111');
 SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
 SELECT lab.denied('hold denies new assignment',$q$SELECT public.assign_rtn_training('11111111-1111-4111-8111-111111111111',(lab.ctx('bank_id')#>>'{}')::uuid,ARRAY['72000000-0000-4000-8000-000000000003']::uuid[])$q$);
$s$);
SELECT lab.policy_case('confirmed reviewer erasure scrubs new legal note without changing policy or learning history',$s$
 SET ROLE authenticated;SELECT lab.policy_admin();SELECT lab.keep('ready',lab.policy_review('Synthetic reviewer erasure with new policy'));
 SET ROLE postgres;SELECT lab.keep('policy_snapshot',(SELECT to_jsonb(p)FROM rtn_private.key_review_policies p));
 SELECT lab.keep('content_snapshot',(SELECT jsonb_agg(to_jsonb(k)-ARRAY['reviewed_by','review_note']ORDER BY id)FROM rtn_private.key_sets k));
 INSERT INTO public.account_deletion_jobs(id,user_id,receipt_hash,state,consent_version,snapshot)VALUES('99000000-0000-4000-8000-000000000961','81000000-0000-4000-8000-000000000999','synthetic-v2-reviewer-erasure','cleanup_pending','full-personal-data-v1','{"emptyOrganization":false,"organizationId":"11111111-1111-4111-8111-111111111111"}');
 INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000999');
 SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
 SELECT lab.policy_assert(public.account_deletion_erase_data('99000000-0000-4000-8000-000000000961','synthetic-v2-reviewer-erasure')->>'erased'='true');
 SET ROLE postgres;SELECT lab.policy_assert(lab.ctx('policy_snapshot')=(SELECT to_jsonb(p)FROM rtn_private.key_review_policies p)
 AND lab.ctx('content_snapshot')=(SELECT jsonb_agg(to_jsonb(k)-ARRAY['reviewed_by','review_note']ORDER BY id)FROM rtn_private.key_sets k)
 AND NOT EXISTS(SELECT 1 FROM rtn_private.key_sets WHERE reviewed_by='81000000-0000-4000-8000-000000000999')
 AND NOT EXISTS(SELECT 1 FROM rtn_private.key_sets WHERE review_note LIKE '%Нормативная проверка:%'));
$s$);
SET ROLE postgres;
