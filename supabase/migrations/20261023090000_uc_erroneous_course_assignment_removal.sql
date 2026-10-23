DO $preimages$DECLARE actual_md5 text;BEGIN
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='uc_education_personal_counts'AND pg_get_function_identity_arguments(p.oid)='p_user uuid';IF actual_md5 IS DISTINCT FROM'f9f3714b1a4f68352dafe5ff4c9a9241'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: uc_education_personal_counts' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='uc_education_withdraw_state'AND pg_get_function_identity_arguments(p.oid)='p_org uuid, p_group uuid, p_enrollment uuid';IF actual_md5 IS DISTINCT FROM'86459790c2c706e1fa626c7cda7677ef'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: uc_education_withdraw_state' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='uc_enrollment_is_withdrawn'AND pg_get_function_identity_arguments(p.oid)='p_enrollment uuid';IF actual_md5 IS DISTINCT FROM'90ce19257149ae1d77a87b59531c7609'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: uc_enrollment_is_withdrawn' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='uc_guard_retained_enrollment'AND pg_get_function_identity_arguments(p.oid)='';IF actual_md5 IS DISTINCT FROM'00ed27541ac0f6dbc7e129ef5fe98d62'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: uc_guard_retained_enrollment' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='get_course_student_test_results_page'AND pg_get_function_identity_arguments(p.oid)='p_course_id uuid, p_limit integer, p_offset integer, p_search text, p_status text, p_result_filter text';IF actual_md5 IS DISTINCT FROM'3b0477021dab332faf915c4068b645cd'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: get_course_student_test_results_page' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='get_course_students_stats'AND pg_get_function_identity_arguments(p.oid)='p_course_id uuid';IF actual_md5 IS DISTINCT FROM'd2c479644a57371ea661375aeb2b49cf'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: get_course_students_stats' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='get_organization_students_page'AND pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_limit integer, p_offset integer, p_search text, p_course_id uuid, p_group_filter text, p_status text, p_docs_filter text, p_archive_mode text';IF actual_md5 IS DISTINCT FROM'6c6dad472fc379d7505ee505e8bdd6a7'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: get_organization_students_page' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='get_available_students_for_course_page'AND pg_get_function_identity_arguments(p.oid)='p_course_id uuid, p_limit integer, p_offset integer, p_search text';IF actual_md5 IS DISTINCT FROM'de2304381645c691a17e4d8b93d5823b'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: get_available_students_for_course_page' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='account_deletion_files'AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid';IF actual_md5 IS DISTINCT FROM'2c6b6cc3785592a1783f0da78d9903b0'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: account_deletion_files' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='account_deletion_snapshot'AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid';IF actual_md5 IS DISTINCT FROM'c2bc791637e1c8328c4f75d31f789066'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: account_deletion_snapshot' USING ERRCODE='55000';END IF;
 SELECT md5(p.prosrc)INTO actual_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='uc_scoped_journal_erase_user'AND pg_get_function_identity_arguments(p.oid)='p_user uuid';IF actual_md5 IS DISTINCT FROM'4114bd6e72cd005e809ab2d6c4e52f48'THEN RAISE EXCEPTION 'Assignment removal preimage mismatch: uc_scoped_journal_erase_user' USING ERRCODE='55000';END IF;
END;$preimages$;
-- Technical cancellation of an erroneous, unstarted assignment. No physical DELETE and no inferred legal withdrawal.
-- Source candidate only. The operator applies a guarded migration separately.
CREATE TABLE public.uc_course_assignment_removal_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),enrollment_id uuid NOT NULL REFERENCES public.enrollments(id),organization_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,group_id uuid,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),state text NOT NULL CHECK(state IN('cancelled','active')),actor_id uuid NOT NULL,request_id uuid NOT NULL,
 preflight_sha256 text NOT NULL CHECK(preflight_sha256~'^[a-f0-9]{64}$'),before_enrollment jsonb NOT NULL,after_enrollment jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL DEFAULT 'erroneous_unstarted_assignment'CHECK(reason='erroneous_unstarted_assignment'),UNIQUE(enrollment_id,revision),UNIQUE(actor_id,request_id)
);
ALTER TABLE public.uc_course_assignment_removal_events ENABLE ROW LEVEL SECURITY;
DO $acl$DECLARE role_row record;column_row record;BEGIN
 REVOKE ALL ON TABLE public.uc_course_assignment_removal_events FROM PUBLIC;
 FOR role_row IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x WHERE c.oid='public.uc_course_assignment_removal_events'::regclass AND x.grantee<>0 AND x.grantee<>c.relowner LOOP EXECUTE format('REVOKE ALL ON TABLE public.uc_course_assignment_removal_events FROM %I',pg_get_userbyid(role_row.grantee));END LOOP;
 FOR column_row IN SELECT a.attname,x.grantee FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid CROSS JOIN LATERAL aclexplode(a.attacl)x WHERE a.attrelid='public.uc_course_assignment_removal_events'::regclass AND x.grantee<>c.relowner LOOP EXECUTE format('REVOKE ALL(%I)ON public.uc_course_assignment_removal_events FROM %s',column_row.attname,CASE WHEN column_row.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(column_row.grantee))END);END LOOP;
END;$acl$;
CREATE FUNCTION public.uc_assignment_removal_immutable()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN RAISE EXCEPTION 'assignment_removal_history_is_immutable' USING ERRCODE='42501';END;$fn$;
CREATE TRIGGER uc_assignment_removal_immutable BEFORE UPDATE OR DELETE ON public.uc_course_assignment_removal_events FOR EACH ROW EXECUTE FUNCTION public.uc_assignment_removal_immutable();
CREATE OR REPLACE FUNCTION public.uc_enrollment_is_withdrawn(p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states s WHERE s.enrollment_id=p_enrollment AND NOT s.redacted)
 OR EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events e WHERE e.enrollment_id=p_enrollment AND e.state='cancelled'AND NOT EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events later WHERE later.enrollment_id=e.enrollment_id AND later.revision>e.revision))
$fn$;
CREATE OR REPLACE FUNCTION public.uc_guard_retained_enrollment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE previous public.uc_course_assignment_removal_events;org_key uuid;group_key uuid;BEGIN IF public.uc_education_trusted_erasure(OLD.user_id)THEN RETURN NEW;END IF;
 PERFORM public.uc_education_issue_enrollment_fence(OLD.id,false);
 IF public.uc_enrollment_is_withdrawn(OLD.id)AND(to_jsonb(OLD)-'document_facts_revision')IS DISTINCT FROM(to_jsonb(NEW)-'document_facts_revision')THEN
  -- Only an explicit assignment reactivation can reverse a technical cancellation. Formal withdrawal is immutable.
  IF OLD.status='cancelled'AND NEW.status='active'AND(to_jsonb(OLD)-ARRAY['status','document_facts_revision','updated_at'])=(to_jsonb(NEW)-ARRAY['status','document_facts_revision','updated_at'])
   AND NOT EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states w WHERE w.enrollment_id=OLD.id AND NOT w.redacted)THEN
   SELECT r.*INTO previous FROM public.uc_course_assignment_removal_events r WHERE r.enrollment_id=OLD.id ORDER BY r.revision DESC LIMIT 1;
   IF previous.id IS NOT NULL AND previous.state='cancelled'THEN
    org_key:=previous.organization_id;group_key:=previous.group_id;
    IF NOT public.uc_education_withdraw_can(org_key,group_key,OLD.id,true)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
    PERFORM public.uc_education_issue_fence(org_key,group_key,ARRAY[OLD.user_id,previous.actor_id,auth.uid()],NULL);
    PERFORM public.uc_education_issue_enrollment_fence(OLD.id,true);
    IF NOT public.uc_education_withdraw_can(org_key,group_key,OLD.id,true)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
    IF coalesce(OLD.progress,0)<>0 OR coalesce(OLD.time_spent,0)<>0 OR OLD.completed_at IS NOT NULL THEN RAISE EXCEPTION 'assignment_has_learning_history' USING ERRCODE='23514';END IF;
    INSERT INTO public.uc_course_assignment_removal_events(enrollment_id,organization_id,user_id,course_id,group_id,revision,state,actor_id,request_id,preflight_sha256,before_enrollment,after_enrollment)
    VALUES(OLD.id,org_key,OLD.user_id,OLD.course_id,group_key,previous.revision+1,'active',auth.uid(),gen_random_uuid(),public.uc_program_hash(to_jsonb(OLD)),to_jsonb(OLD),to_jsonb(NEW));RETURN NEW;
   END IF;
  END IF;
 RAISE EXCEPTION 'retained_enrollment_is_immutable' USING ERRCODE='42501';END IF;RETURN NEW;END;$function$;

CREATE FUNCTION public.uc_assignment_removal_state(p_org uuid,p_group uuid,p_enrollment uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
DECLARE enrollment_row public.enrollments;removal_row public.uc_course_assignment_removal_events;has_history boolean;has_documents boolean;has_withdrawal boolean;other_history boolean:=false;relation_row record;ref_value jsonb;hash_value text;BEGIN
 IF NOT public.uc_education_withdraw_can(p_org,p_group,p_enrollment,true)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 SELECT e.*INTO enrollment_row FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment AND c.organization_id=p_org;
 IF enrollment_row.id IS NULL THEN PERFORM public.uc_education_issue_error('NOT_FOUND');END IF;
 PERFORM public.uc_education_issue_fence(p_org,p_group,ARRAY[enrollment_row.user_id,auth.uid()],NULL);
 SELECT r.*INTO removal_row FROM public.uc_course_assignment_removal_events r WHERE r.enrollment_id=enrollment_row.id ORDER BY r.revision DESC LIMIT 1;
 PERFORM public.uc_education_issue_fence(p_org,p_group,ARRAY[enrollment_row.user_id,auth.uid(),removal_row.actor_id],NULL);
 has_history:=coalesce(enrollment_row.progress,0)<>0 OR coalesce(enrollment_row.time_spent,0)<>0 OR enrollment_row.completed_at IS NOT NULL OR enrollment_row.status IS DISTINCT FROM'active'
  OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=enrollment_row.user_id AND l.course_id=enrollment_row.course_id)
  OR EXISTS(SELECT 1 FROM public.test_attempts t JOIN public.lessons l ON l.id=t.lesson_id WHERE t.user_id=enrollment_row.user_id AND l.course_id=enrollment_row.course_id)
  OR EXISTS(SELECT 1 FROM public.course_manual_credits m WHERE m.enrollment_id=enrollment_row.id);
 -- started_at is populated when assigned and is intentionally not evidence of study.
 FOR relation_row IN SELECT c.oid::regclass relation,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname IN('test_attempt_sessions','homework_submissions','course_access_log')AND c.relkind IN('r','p')ORDER BY c.oid LOOP
  IF relation_row.relname='test_attempt_sessions'THEN EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s r JOIN public.lessons l ON l.id=r.lesson_id WHERE r.user_id=$1 AND l.course_id=$2)',relation_row.relation)INTO other_history USING enrollment_row.user_id,enrollment_row.course_id;
  ELSIF relation_row.relname='homework_submissions'THEN EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE student_id=$1 AND course_id=$2)',relation_row.relation)INTO other_history USING enrollment_row.user_id,enrollment_row.course_id;
  ELSE EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE user_id=$1 AND course_id=$2)',relation_row.relation)INTO other_history USING enrollment_row.user_id,enrollment_row.course_id;END IF;
  has_history:=has_history OR other_history;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.uc_learning_attestation_decisions d JOIN public.uc_learning_outcome_states s ON s.id=d.state_id WHERE s.enrollment_id=enrollment_row.id)THEN has_history:=true;END IF;
 SELECT EXISTS(SELECT 1 FROM public.education_document_records d WHERE d.enrollment_id=enrollment_row.id OR(d.user_id=enrollment_row.user_id AND d.course_id=enrollment_row.course_id))INTO has_documents;
 SELECT EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states w WHERE w.enrollment_id=enrollment_row.id AND NOT w.redacted)INTO has_withdrawal;
 ref_value:=jsonb_build_object('organization_id',p_org,'group_id',p_group,'enrollment_id',enrollment_row.id,'user_id',enrollment_row.user_id,'course_id',enrollment_row.course_id);
 hash_value:=public.uc_program_hash(jsonb_build_object('ref',ref_value,'enrollment',to_jsonb(enrollment_row),'history',has_history,'documents',has_documents,'withdrawn',has_withdrawal,'removal_id',removal_row.id));
 RETURN jsonb_build_object('schema_version',1,'ref',ref_value||jsonb_build_object('state_hash',hash_value),'state',CASE WHEN removal_row.state='cancelled'THEN'removed'WHEN has_withdrawal THEN'withdrawn'ELSE'active'END,
  'can_remove',removal_row.state IS DISTINCT FROM'cancelled'AND NOT has_history AND NOT has_documents AND NOT has_withdrawal,
  'can_withdraw',removal_row.state IS DISTINCT FROM'cancelled'AND NOT has_withdrawal,'reason',CASE WHEN removal_row.state='cancelled'THEN'ALREADY_REMOVED'WHEN has_withdrawal THEN'FORMALLY_WITHDRAWN'WHEN has_documents OR has_history THEN'LEARNING_STARTED'ELSE NULL END);
END;$fn$;
CREATE FUNCTION public.read_course_assignment_removal(p_organization_id uuid,p_group_id uuid,p_enrollment_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN RETURN public.uc_assignment_removal_state(p_organization_id,p_group_id,p_enrollment_id);END;$fn$;
CREATE FUNCTION public.remove_erroneous_course_assignment(p_organization_id uuid,p_group_id uuid,p_enrollment_id uuid,p_expected_hash text,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='3s' AS $fn$
DECLARE before_row public.enrollments;after_row public.enrollments;previous public.uc_course_assignment_removal_events;created public.uc_course_assignment_removal_events;current_state jsonb;relation_row record;BEGIN
 IF p_request_id IS NULL OR coalesce(p_expected_hash,'')!~'^[a-f0-9]{64}$'OR NOT public.uc_education_withdraw_can(p_organization_id,p_group_id,p_enrollment_id,true)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 IF current_setting('transaction_isolation')<>'read committed'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 SELECT e.*INTO before_row FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment_id AND c.organization_id=p_organization_id;
 IF before_row.id IS NULL THEN PERFORM public.uc_education_issue_error('NOT_FOUND');END IF;
 PERFORM public.uc_education_issue_fence(p_organization_id,p_group_id,ARRAY[before_row.user_id,auth.uid()],'assignment_removal:'||auth.uid()::text||':'||p_request_id::text);
 PERFORM public.uc_education_issue_enrollment_fence(p_enrollment_id,true);
 SELECT e.*INTO before_row FROM public.enrollments e WHERE e.id=p_enrollment_id FOR UPDATE NOWAIT;
 SELECT r.*INTO previous FROM public.uc_course_assignment_removal_events r WHERE r.actor_id=auth.uid()AND r.request_id=p_request_id;
 IF previous.id IS NOT NULL THEN
  IF previous.organization_id<>p_organization_id OR previous.enrollment_id<>p_enrollment_id OR previous.group_id IS DISTINCT FROM p_group_id OR previous.preflight_sha256<>p_expected_hash THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
  PERFORM public.uc_education_issue_fence(p_organization_id,p_group_id,ARRAY[previous.user_id,previous.actor_id],NULL);
  IF EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events later WHERE later.enrollment_id=previous.enrollment_id AND later.revision>previous.revision)THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
  IF NOT public.uc_education_withdraw_can(p_organization_id,p_group_id,p_enrollment_id,true)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
  RETURN jsonb_build_object('schema_version',1,'cancelled',true,'retained',true,'organization_id',previous.organization_id,'group_id',previous.group_id,'enrollment_id',previous.enrollment_id,'user_id',previous.user_id,'course_id',previous.course_id,'event_id',previous.id,'actor_id',previous.actor_id,'request_id',previous.request_id,'replayed',true);
 END IF;
 -- The old cancellation RPC used these locks too. NOWAIT returns a retry instead of blocking an active learner.
 LOCK TABLE public.lessons,public.lesson_progress,public.test_attempts,public.course_manual_credits,public.education_document_records,public.uc_learning_attestation_decisions IN SHARE MODE NOWAIT;
 FOR relation_row IN SELECT c.oid::regclass relation FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname IN('test_attempt_sessions','homework_submissions','course_access_log')AND c.relkind IN('r','p')ORDER BY c.oid LOOP EXECUTE format('LOCK TABLE %s IN SHARE MODE NOWAIT',relation_row.relation);END LOOP;
 current_state:=public.uc_assignment_removal_state(p_organization_id,p_group_id,p_enrollment_id);
 IF current_state->'ref'->>'state_hash'IS DISTINCT FROM p_expected_hash THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF current_state->'can_remove'IS DISTINCT FROM'true'::jsonb THEN RAISE EXCEPTION 'assignment_has_learning_history' USING ERRCODE='23514';END IF;
 UPDATE public.enrollments e SET status='cancelled'WHERE e.id=p_enrollment_id RETURNING e.*INTO after_row;
 IF after_row.id IS NULL OR(to_jsonb(after_row)-ARRAY['status','document_facts_revision','updated_at'])IS DISTINCT FROM(to_jsonb(before_row)-ARRAY['status','document_facts_revision','updated_at'])THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 INSERT INTO public.uc_course_assignment_removal_events(enrollment_id,organization_id,user_id,course_id,group_id,revision,state,actor_id,request_id,preflight_sha256,before_enrollment,after_enrollment)
 VALUES(before_row.id,p_organization_id,before_row.user_id,before_row.course_id,p_group_id,coalesce((SELECT max(r.revision)FROM public.uc_course_assignment_removal_events r WHERE r.enrollment_id=before_row.id),0)+1,'cancelled',auth.uid(),p_request_id,p_expected_hash,to_jsonb(before_row),to_jsonb(after_row))RETURNING *INTO created;
 RETURN jsonb_build_object('schema_version',1,'cancelled',true,'retained',true,'organization_id',created.organization_id,'group_id',created.group_id,'enrollment_id',created.enrollment_id,'user_id',created.user_id,'course_id',created.course_id,'event_id',created.id,'actor_id',created.actor_id,'request_id',created.request_id,'replayed',false);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_education_withdraw_state(p_org uuid, p_group uuid, p_enrollment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE e public.enrollments;h public.uc_enrollment_withdrawal_states;ref jsonb;technical jsonb;groups jsonb;issued jsonb:='[]';g uuid;BEGIN
 IF NOT public.uc_education_withdraw_can(p_org,p_group,p_enrollment,false)AND NOT public.uc_education_withdraw_can(p_org,p_group,p_enrollment,true)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 SELECT x.*INTO STRICT e FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id WHERE x.id=p_enrollment AND c.organization_id=p_org;SELECT *INTO h FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=e.id AND NOT redacted;
 SELECT coalesce(jsonb_agg(m.group_id ORDER BY m.group_id),'[]')INTO groups FROM public.student_group_memberships_effective m JOIN public.student_groups sg ON sg.id=m.group_id AND sg.organization_id=m.organization_id WHERE m.organization_id=p_org AND m.user_id=e.user_id AND sg.course_id=e.course_id;
 g:=p_group;IF g IS NULL AND jsonb_array_length(groups)=1 THEN g:=(groups->>0)::uuid;END IF;
 technical:=jsonb_build_object('status',e.status,'progress',e.progress,'time_spent',e.time_spent,'completed_at',e.completed_at,'started_at',e.started_at,'access_days',e.access_days,'expires_at',e.expires_at,'manual_credits',(SELECT coalesce(jsonb_agg(to_jsonb(c)ORDER BY c.id),'[]')FROM public.course_manual_credits c WHERE c.enrollment_id=e.id));
 ref:=jsonb_build_object('organization_id',p_org,'enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id,'group_id',g,'revision',coalesce(h.revision,0),'source_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'scope_group_id',p_group,'enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id,'groups',groups,'revision',coalesce(h.revision,0),'technical',technical)));
 IF public.uc_education_issue_can(p_org,p_group,e.id,e.user_id,e.course_id,'read')THEN SELECT coalesce(jsonb_agg(id ORDER BY id),'[]')INTO issued FROM public.education_document_records WHERE organization_id=p_org AND enrollment_id=e.id AND document_status='original';END IF;
 RETURN jsonb_build_object('ref',ref,'state',CASE WHEN h.enrollment_id IS NULL THEN 'active'ELSE 'withdrawn'END,'effective_date',h.effective_date,'recorded_at',h.recorded_at,'recorded_by',h.recorded_by,'basis',CASE WHEN h.enrollment_id IS NOT NULL THEN public.uc_education_issue_basis_projection(p_org,h.basis)END,
 'technical_status',e.status,'technical_progress',e.progress,'technical_completed_at',e.completed_at,'technical_time_spent',e.time_spent,'manual_credit_retained',EXISTS(SELECT 1 FROM public.course_manual_credits c WHERE c.enrollment_id=e.id AND c.revoked_at IS NULL),'original_record_ids',issued,'can_withdraw',h.enrollment_id IS NULL AND NOT public.uc_enrollment_is_withdrawn(e.id)AND public.uc_education_withdraw_can(p_org,p_group,e.id,true));END;$function$;

CREATE OR REPLACE FUNCTION public.uc_education_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',t,'column',c,'count',n)ORDER BY t,c),'[]'::jsonb)FROM(
 SELECT'uc_education_issuance_states'::text t,'subject_or_actor_attribution'::text c,count(*)n FROM public.uc_education_issuance_states s WHERE s.user_id=p_user OR s.recorded_by=p_user OR s.updated_by=p_user OR p_user=ANY(s.participant_ids)OR public.uc_education_actor_json(s.latest_handover,p_user)='true'::jsonb OR public.uc_education_actor_json(s.annulment,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_events','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_events e WHERE e.user_id=p_user OR e.actor_id=p_user OR p_user=ANY(e.participant_ids)OR public.uc_education_actor_json(e.payload,p_user)='true'::jsonb
 UNION ALL SELECT'uc_enrollment_withdrawal_states','subject_or_actor_attribution',count(*)FROM public.uc_enrollment_withdrawal_states w WHERE w.user_id=p_user OR w.recorded_by=p_user OR p_user=ANY(w.participant_ids)OR public.uc_education_actor_json(w.technical_snapshot,p_user)='true'::jsonb
 UNION ALL SELECT'uc_enrollment_withdrawal_events','subject_or_actor_attribution',count(*)FROM public.uc_enrollment_withdrawal_events e WHERE e.user_id=p_user OR e.actor_id=p_user OR p_user=ANY(e.participant_ids)OR public.uc_education_actor_json(e.before_state,p_user)='true'::jsonb OR public.uc_education_actor_json(e.after_state,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_requests','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_requests r WHERE r.actor_id=p_user OR p_user=ANY(r.participant_ids)
 UNION ALL SELECT'uc_education_issuance_contexts','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_contexts x WHERE x.user_id=p_user OR x.actor_id=p_user OR public.uc_education_actor_json(x.source_snapshot,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_preparations','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_preparations p WHERE p.actor_id=p_user OR p_user=ANY(p.participant_ids)OR public.uc_education_actor_json(p.plan,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_preparation_items','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_preparation_items i WHERE i.user_id=p_user OR p_user=ANY(i.participant_ids)OR public.uc_education_actor_json(i.source_snapshot,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_preparation_items','retained_subject_output_reference_review_required',count(*)FROM public.uc_education_issuance_preparation_items i WHERE i.retained_subject_user_id=p_user
 UNION ALL SELECT'uc_course_assignment_removal_events','assignment_removal_retention_review_required',count(*)FROM public.uc_course_assignment_removal_events r WHERE r.user_id=p_user OR r.actor_id=p_user OR public.uc_education_actor_json(r.before_enrollment,p_user)='true'::jsonb OR public.uc_education_actor_json(r.after_enrollment,p_user)='true'::jsonb
 )counts WHERE n>0 $function$;

DO $acl$DECLARE function_row record;grant_row record;BEGIN
 FOR function_row IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname IN('uc_assignment_removal_immutable','uc_assignment_removal_state','read_course_assignment_removal','remove_erroneous_course_assignment')LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',function_row.oid::regprocedure);
  FOR grant_row IN SELECT DISTINCT x.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x WHERE p.oid=function_row.oid AND x.grantee<>0 AND x.grantee<>p.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',function_row.oid::regprocedure,pg_get_userbyid(grant_row.grantee));END LOOP;
 END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.read_course_assignment_removal(uuid,uuid,uuid),public.remove_erroneous_course_assignment(uuid,uuid,uuid,text,uuid)TO authenticated;

-- Active assignment lists retain personal files and history; omit cancelled enrollment rows only.
CREATE OR REPLACE FUNCTION public.get_course_student_test_results_page(p_course_id uuid, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_result_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, user_id uuid, full_name text, email text, login text, enrollment_id uuid, progress integer, status text, started_at timestamp with time zone, completed_at timestamp with time zone, time_spent integer, archived_at timestamp with time zone, tests_total integer, tests_attempted integer, tests_passed integer, average_percent integer, latest_score integer, latest_max_score integer, latest_percent integer, latest_passing_score integer, attempts_used integer, last_attempt_at timestamp with time zone, result_status text, test_details jsonb, total_count bigint, active_count bigint, completed_count bigint, average_progress numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 10)));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search_like text;
  v_org uuid;
  v_tests_total int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_course(p_course_id, 'students.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_org FROM public.courses c WHERE c.id = p_course_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'course not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_search IS NOT NULL THEN
    v_search_like := '%' || v_search || '%';
  END IF;

  SELECT COUNT(*)::int INTO v_tests_total
  FROM public.lessons l
  WHERE l.course_id = p_course_id AND l.type = 'test';

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = v_org
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  base AS (
    SELECT p.id, p.user_id, p.full_name, p.email, p.login, p.archived_at,
           e.id AS enrollment_id, COALESCE(e.progress, 0) AS progress,
           e.status, e.started_at, e.completed_at, e.time_spent,
           mc.credited_at AS manual_credited_at, mc.credited_by AS manual_credited_by
    FROM public.enrollments e
    JOIN public.profiles p ON p.user_id = e.user_id
    LEFT JOIN public.course_manual_credits mc ON mc.enrollment_id = e.id AND mc.revoked_at IS NULL
    WHERE e.status IS DISTINCT FROM 'cancelled' AND e.course_id = p_course_id AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = v_org AND srr.user_id = e.user_id)
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = e.user_id)
      AND (
        v_search IS NULL
        OR p.full_name ILIKE v_search_like
        OR p.email     ILIKE v_search_like
        OR p.login     ILIKE v_search_like
      )
      AND (
        p_status IS NULL OR p_status = 'all'
        OR (p_status = 'active'    AND e.status = 'active')
        OR (p_status = 'completed' AND e.status = 'completed')
      )
  ),
  test_lessons AS (
    SELECT l.id, l.title, l.order_index,
           COALESCE(l.test_passing_score, 70) AS passing_score,
           l.test_max_attempts
    FROM public.lessons l
    WHERE l.course_id = p_course_id AND l.type = 'test'
  ),
  latest_attempts AS (
    SELECT DISTINCT ON (ta.user_id, ta.lesson_id)
      ta.user_id, ta.lesson_id, ta.score, ta.max_score, ta.completed_at, ta.passing_score, ta.passed
    FROM public.test_attempts ta
    JOIN test_lessons tl ON tl.id = ta.lesson_id
    WHERE ta.user_id IN (SELECT b.user_id FROM base b)
    ORDER BY ta.user_id, ta.lesson_id, ta.completed_at DESC NULLS LAST
  ),
  attempt_counts AS (
    SELECT ta.user_id, ta.lesson_id, COUNT(*)::int AS attempts_used
    FROM public.test_attempts ta
    JOIN test_lessons tl ON tl.id = ta.lesson_id
    WHERE ta.user_id IN (SELECT b.user_id FROM base b)
    GROUP BY ta.user_id, ta.lesson_id
  ),
  per_lesson AS (
    SELECT
      b.user_id, tl.id AS lesson_id, tl.title AS lesson_title, tl.order_index,
      la.score, la.max_score,
      CASE WHEN la.max_score > 0
        THEN ROUND(la.score::numeric * 100 / la.max_score)::int
        ELSE NULL END AS percent,
      COALESCE(la.passing_score, tl.passing_score) AS passing_score,
      la.passed AS attempt_passed,
      tl.test_max_attempts,
      COALESCE(ac.attempts_used, 0) AS attempts_used,
      la.completed_at, b.manual_credited_at, b.manual_credited_by
    FROM base b
    CROSS JOIN test_lessons tl
    LEFT JOIN latest_attempts la ON la.user_id = b.user_id AND la.lesson_id = tl.id
    LEFT JOIN attempt_counts ac ON ac.user_id = b.user_id AND ac.lesson_id = tl.id
    WHERE la.lesson_id IS NOT NULL OR b.manual_credited_at IS NOT NULL
  ),
  per_user AS (
    SELECT
      pl.user_id,
      COUNT(*) FILTER (WHERE pl.attempts_used > 0)::int AS tests_attempted,
      SUM(CASE WHEN pl.manual_credited_at IS NOT NULL OR COALESCE(pl.attempt_passed, pl.max_score > 0 AND pl.percent >= pl.passing_score, false) THEN 1 ELSE 0 END)::int AS tests_passed,
      ROUND(AVG(pl.percent))::int AS average_percent,
      MAX(pl.completed_at) AS last_attempt_at,
      -- Single-test convenience fields (from the first / only latest attempt)
      (ARRAY_AGG(pl.score       ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_score,
      (ARRAY_AGG(pl.max_score   ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_max_score,
      (ARRAY_AGG(pl.percent     ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_percent,
      (ARRAY_AGG(pl.passing_score ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_passing_score,
      (ARRAY_AGG(pl.attempts_used ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_attempts_used,
      jsonb_agg(jsonb_build_object(
        'lesson_id',     pl.lesson_id,
        'lesson_title',  pl.lesson_title,
        'score',         pl.score,
        'max_score',     pl.max_score,
        'percent',       pl.percent,
        'passing_score', pl.passing_score,
        'passed',        (pl.manual_credited_at IS NOT NULL OR COALESCE(pl.attempt_passed, pl.max_score > 0 AND pl.percent >= pl.passing_score, false)),
        'manual_credited_at', pl.manual_credited_at,
        'manual_credited_by', pl.manual_credited_by,
        'attempts_used', pl.attempts_used,
        'max_attempts',  pl.test_max_attempts,
        'completed_at',  pl.completed_at
      ) ORDER BY pl.order_index NULLS LAST, pl.lesson_id) AS test_details
    FROM per_lesson pl
    GROUP BY pl.user_id
  ),
  joined AS (
    SELECT
      b.*,
      COALESCE(pu.tests_attempted, 0)  AS tests_attempted,
      COALESCE(pu.tests_passed, 0)     AS tests_passed,
      COALESCE(pu.average_percent, 0)  AS average_percent,
      pu.latest_score, pu.latest_max_score, pu.latest_percent,
      pu.latest_passing_score, pu.latest_attempts_used, pu.last_attempt_at,
      COALESCE(pu.test_details, '[]'::jsonb) AS test_details,
      CASE
        WHEN v_tests_total = 0 THEN 'no_tests'
        WHEN b.manual_credited_at IS NOT NULL THEN 'passed'
        WHEN COALESCE(pu.tests_attempted, 0) = 0 THEN 'not_started'
        WHEN COALESCE(pu.tests_passed, 0) >= v_tests_total THEN 'passed'
        ELSE 'failed'
      END AS result_status
    FROM base b
    LEFT JOIN per_user pu ON pu.user_id = b.user_id
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE
      p_result_filter IS NULL OR p_result_filter = 'all'
      OR (p_result_filter = 'passed'      AND j.result_status = 'passed')
      OR (p_result_filter = 'failed'      AND j.result_status = 'failed')
      OR (p_result_filter = 'not_started' AND j.result_status = 'not_started')
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total_count FROM filtered),
  course_cnt AS (
    SELECT
      COUNT(*) FILTER (WHERE e.status = 'active')::bigint     AS active_count,
      COUNT(*) FILTER (WHERE e.status = 'completed')::bigint  AS completed_count,
      COALESCE(ROUND(AVG(COALESCE(e.progress, 0))::numeric, 1), 0) AS avg_progress
    FROM public.enrollments e
    WHERE e.status IS DISTINCT FROM 'cancelled' AND e.course_id = p_course_id AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = v_org AND srr.user_id = e.user_id)
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = e.user_id)
  )
  SELECT
    f.id, f.user_id, f.full_name, f.email, f.login,
    f.enrollment_id, f.progress, f.status, f.started_at, f.completed_at, f.time_spent,
    f.archived_at,
    v_tests_total AS tests_total,
    f.tests_attempted, f.tests_passed, f.average_percent,
    f.latest_score, f.latest_max_score, f.latest_percent,
    f.latest_passing_score,
    f.latest_attempts_used AS attempts_used,
    f.last_attempt_at,
    f.result_status,
    f.test_details,
    cnt.total_count,
    course_cnt.active_count, course_cnt.completed_count, course_cnt.avg_progress
  FROM filtered f, cnt, course_cnt
  ORDER BY f.full_name NULLS LAST, f.user_id
  OFFSET v_offset
  LIMIT  v_limit;
END;
$function$;

-- Active assignment lists retain personal files and history; omit cancelled enrollment rows only.
CREATE OR REPLACE FUNCTION public.get_course_students_stats(p_course_id uuid)
 RETURNS TABLE(total_count bigint, active_count bigint, completed_count bigint, average_progress numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_course(p_course_id, 'students.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_org FROM public.courses c WHERE c.id = p_course_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'course not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = v_org
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  base AS (
    SELECT e.status, COALESCE(e.progress, 0) AS progress
    FROM public.enrollments e
    JOIN public.profiles p ON p.user_id = e.user_id
    WHERE e.status IS DISTINCT FROM 'cancelled' AND e.course_id = p_course_id AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = v_org AND srr.user_id = e.user_id)
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = e.user_id)
  )
  SELECT
    COUNT(*)::bigint                                                    AS total_count,
    COUNT(*) FILTER (WHERE status = 'active')::bigint                   AS active_count,
    COUNT(*) FILTER (WHERE status = 'completed')::bigint                AS completed_count,
    COALESCE(ROUND(AVG(progress)::numeric, 1), 0)                       AS average_progress
  FROM base;
END;
$function$;

-- Active assignment lists retain personal files and history; omit cancelled enrollment rows only.
CREATE OR REPLACE FUNCTION public.get_organization_students_page(p_organization_id uuid, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_course_id uuid DEFAULT NULL::uuid, p_group_filter text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_docs_filter text DEFAULT NULL::text, p_archive_mode text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, user_id uuid, full_name text, email text, login text, company_id uuid, student_group_id uuid, last_visit_at timestamp with time zone, archived_at timestamp with time zone, progress integer, status text, last_activity timestamp with time zone, enrollments jsonb, has_passport boolean, has_snils boolean, has_education boolean, frdo_complete boolean, frdo_has_data boolean, total_count bigint, active_count bigint, archived_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 10)));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search_like text;
  v_archive text := COALESCE(p_archive_mode, 'active');
  v_unrestricted_scope boolean;
  v_teacher_limited boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_organization(p_organization_id, 'students.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Both helpers are STABLE and depend on this actor/organization only.
  -- NULL/limited scopes keep every original per-row authorization check.
  v_unrestricted_scope := public.uc_document_scope_allowed(p_organization_id, NULL, NULL) IS TRUE;
  v_teacher_limited := public.uc_document_teacher_limited(p_organization_id);

  IF v_search IS NOT NULL THEN
    v_search_like := '%' || v_search || '%';
  END IF;

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = p_organization_id
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  base AS (
    SELECT p.id, p.user_id, p.full_name, p.email, p.login, p.company_id,
           CASE WHEN v_teacher_limited AND NOT public.uc_document_scope_allowed(p.organization_id,p.student_group_id,NULL) THEN NULL ELSE p.student_group_id END AS student_group_id, p.last_visit_at, p.archived_at
    FROM public.profiles p
    WHERE p.organization_id = p_organization_id AND (CASE WHEN v_unrestricted_scope THEN true ELSE public.uc_document_student_scope_allowed(p_organization_id,p.user_id) END) AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = p_organization_id AND srr.user_id = p.user_id)
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = p.user_id)
      AND (
        (v_archive = 'active'  AND p.archived_at IS NULL) OR
        (v_archive = 'archive' AND p.archived_at IS NOT NULL)
      )
      AND (
        v_search IS NULL
        OR p.full_name ILIKE v_search_like
        OR p.email     ILIKE v_search_like
        OR p.login     ILIKE v_search_like
      )
      AND (
        p_group_filter IS NULL
        OR p_group_filter = 'all'
        OR (p_group_filter = 'no_group' AND NOT EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = p.organization_id AND m.user_id = p.user_id))
        OR EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = p.organization_id AND m.user_id = p.user_id AND m.group_id::text = p_group_filter)
      )
  ),
  base_enr AS (
    SELECT e.user_id,
           jsonb_agg(jsonb_build_object(
             'id',           e.id,
             'course_id',    e.course_id,
             'course_title', c.title,
             'progress',     COALESCE(e.progress, 0),
             'status',       e.status,
             'started_at',   e.started_at,
             'completed_at', e.completed_at,
             'time_spent',   e.time_spent
           ) ORDER BY e.started_at DESC NULLS LAST) AS enrollments,
           COUNT(*)::int                                   AS enroll_count,
           BOOL_OR(e.status = 'completed')                 AS has_completed,
           BOOL_OR(e.status = 'active')                    AS has_active,
           ROUND(AVG(COALESCE(e.progress, 0)))::int        AS avg_progress,
           MAX(e.started_at)                               AS last_started
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.status IS DISTINCT FROM 'cancelled' AND c.organization_id = p_organization_id AND (CASE WHEN v_unrestricted_scope THEN true ELSE public.uc_document_scope_allowed(p_organization_id,NULL,e.id) END)
      AND e.user_id IN (SELECT b.user_id FROM base b)
    GROUP BY e.user_id
  ),
  docs AS (
    SELECT d.user_id,
           BOOL_OR(d.type IN ('passport','birth_certificate'))                     AS has_passport,
           BOOL_OR(d.type = 'snils')                                               AS has_snils,
           BOOL_OR(d.type IN ('education_document','diploma','attestat'))          AS has_education
    FROM public.student_identity_documents d
    WHERE d.organization_id = p_organization_id
      AND d.user_id IN (SELECT b.user_id FROM base b)
    GROUP BY d.user_id
  ),
  frdo AS (
    SELECT f.user_id,
           (f.last_name  IS NOT NULL AND
            f.first_name IS NOT NULL AND
            f.birth_date IS NOT NULL AND
            f.gender     IS NOT NULL AND
            f.snils      IS NOT NULL) AS frdo_complete
    FROM public.student_frdo_data f
    WHERE f.organization_id = p_organization_id
      AND f.user_id IN (SELECT b.user_id FROM base b)
  ),
  joined AS (
    SELECT b.*,
           COALESCE(be.avg_progress, 0)                                             AS r_progress,
           CASE
             WHEN be.enroll_count IS NULL THEN NULL
             WHEN be.has_completed THEN 'completed'
             WHEN be.has_active    THEN 'active'
             ELSE NULL
           END                                                                      AS r_status,
           be.last_started                                                          AS r_last_activity,
           COALESCE(be.enrollments, '[]'::jsonb)                                    AS r_enrollments,
           COALESCE(be.enroll_count, 0)                                             AS r_enroll_count,
           COALESCE(be.has_active, false)                                           AS r_has_active,
           COALESCE(be.has_completed, false)                                        AS r_has_completed,
           COALESCE(d.has_passport,  false)                                         AS r_has_passport,
           COALESCE(d.has_snils,     false)                                         AS r_has_snils,
           COALESCE(d.has_education, false)                                         AS r_has_education,
           COALESCE(fr.frdo_complete, false)                                        AS r_frdo_complete,
           (fr.user_id IS NOT NULL)                                                 AS r_frdo_has_data
    FROM base b
    LEFT JOIN base_enr be ON be.user_id = b.user_id
    LEFT JOIN docs     d  ON d.user_id  = b.user_id
    LEFT JOIN frdo     fr ON fr.user_id = b.user_id
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE (
      p_course_id IS NULL
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(j.r_enrollments) x
        WHERE (x->>'course_id')::uuid = p_course_id
      )
    )
    AND (
      p_status IS NULL OR p_status = 'all'
      OR (p_status = 'active'       AND j.r_has_active)
      OR (p_status = 'completed'    AND j.r_has_completed)
      OR (p_status = 'not_enrolled' AND j.r_enroll_count = 0)
    )
    AND (
      p_docs_filter IS NULL OR p_docs_filter = 'all'
      OR (p_docs_filter = 'complete'     AND j.r_has_passport AND j.r_has_snils AND j.r_has_education)
      OR (p_docs_filter = 'incomplete'   AND NOT (j.r_has_passport AND j.r_has_snils AND j.r_has_education))
      OR (p_docs_filter = 'no_passport'  AND NOT j.r_has_passport)
      OR (p_docs_filter = 'no_snils'     AND NOT j.r_has_snils)
      OR (p_docs_filter = 'no_education' AND NOT j.r_has_education)
    )
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total_count FROM filtered),
  org_cnt AS (
    SELECT
      COUNT(*) FILTER (WHERE p.archived_at IS NULL)     ::bigint AS active_count,
      COUNT(*) FILTER (WHERE p.archived_at IS NOT NULL) ::bigint AS archived_count
    FROM public.profiles p
    WHERE p.organization_id = p_organization_id AND (CASE WHEN v_unrestricted_scope THEN true ELSE public.uc_document_student_scope_allowed(p_organization_id,p.user_id) END) AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = p_organization_id AND srr.user_id = p.user_id)
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = p.user_id)
  )
  SELECT
    f.id, f.user_id, f.full_name, f.email, f.login, f.company_id,
    f.student_group_id, f.last_visit_at, f.archived_at,
    f.r_progress, f.r_status, f.r_last_activity, f.r_enrollments,
    f.r_has_passport, f.r_has_snils, f.r_has_education,
    f.r_frdo_complete, f.r_frdo_has_data,
    cnt.total_count, org_cnt.active_count, org_cnt.archived_count
  FROM filtered f, cnt, org_cnt
  ORDER BY
    CASE WHEN v_archive = 'archive' THEN 0 ELSE 1 END,
    CASE WHEN v_archive = 'archive' THEN f.archived_at END DESC NULLS LAST,
    CASE WHEN v_archive <> 'archive' AND f.r_enroll_count > 0 THEN 0 ELSE 1 END,
    f.full_name NULLS LAST,
    f.user_id
  OFFSET v_offset
  LIMIT  v_limit;
END;
$function$;

-- A removed technical assignment may be explicitly selected again using the ordinary course workflow.
CREATE OR REPLACE FUNCTION public.get_available_students_for_course_page(p_course_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, user_id uuid, full_name text, email text, login text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 20)));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search_like text;
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_course(p_course_id, 'students.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_org FROM public.courses c WHERE c.id = p_course_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'course not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_search IS NOT NULL THEN
    v_search_like := '%' || v_search || '%';
  END IF;

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = v_org
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  rows AS (
    SELECT p.id, p.user_id, p.full_name, p.email, p.login
    FROM public.profiles p
    WHERE p.organization_id = v_org
      AND p.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = p.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.status IS DISTINCT FROM 'cancelled' AND e.course_id = p_course_id AND e.user_id = p.user_id
      )
      AND (
        v_search IS NULL
        OR p.full_name ILIKE v_search_like
        OR p.email     ILIKE v_search_like
        OR p.login     ILIKE v_search_like
      )
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total_count FROM rows)
  SELECT r.id, r.user_id, r.full_name, r.email, r.login, cnt.total_count
  FROM rows r, cnt
  ORDER BY r.full_name NULLS LAST, r.user_id
  OFFSET v_offset
  LIMIT  v_limit;
END;
$function$;

-- Retained technical history must block destructive planning and file export before any cleanup mutation.
CREATE OR REPLACE FUNCTION public.account_deletion_files(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name,'objectId',o.id,'updatedAt',o.updated_at) ORDER BY o.bucket_id,o.name),'[]'::jsonb)
 FROM storage.objects o WHERE NOT EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events retained_removal WHERE retained_removal.user_id=p_user_id OR retained_removal.actor_id=p_user_id)AND(
  (o.bucket_id IN ('avatars','student-documents','final-test-photos','student-identification-media','admission-case-evidence','education-issuance-staging') AND split_part(o.name,'/',1)=p_user_id::text)
  OR (o.bucket_id='student-documents' AND o.name LIKE 'avatars/'||p_user_id::text||'.%')
  OR (o.bucket_id='admission-case-evidence'AND split_part(o.name,'/',4)='staging'AND split_part(o.name,'/',5)=p_user_id::text)
  OR (o.bucket_id='chat-attachments' AND split_part(o.name,'/',2)=p_user_id::text
    AND (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id AND split_part(o.name,'/',1)=p.organization_id::text)
      OR EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=p_user_id AND j.state='cleanup_pending' AND split_part(o.name,'/',1)=j.snapshot->>'organizationId'))));
$function$;

-- Retained technical history must block destructive planning and file export before any cleanup mutation.
CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false; v_education_outputs jsonb;v_education_unissued bigint;v_education_issued bigint;
 v_blockers jsonb:='[]'; v_categories jsonb:='[]'; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0; v_documentary bigint:=0;
 v_org_shared bigint:=0; v_courses bigint:=0; r record; v_fingerprint jsonb;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
 SELECT count(*)INTO v_count FROM public.uc_course_assignment_removal_events removal_event WHERE removal_event.user_id=p_user_id OR removal_event.actor_id=p_user_id;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранена история отмены или повторного назначения курса. До удаления нужна отдельная проверка этих записей; назначение не удаляется физически.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_assignment_removals','label','История отмен и повторных назначений: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 v_files:=public.account_deletion_files(p_user_id);
 -- Exact subject/document relationships; JSON checks are read-only detection,
 -- never commands to remove an organization-wide document.
 SELECT
   (SELECT count(*) FROM public.education_document_records WHERE user_id=p_user_id OR enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_issuance_log WHERE user_id=p_user_id)+
   (SELECT count(*) FROM public.student_documents WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_signatures WHERE (recipient_user_id=p_user_id OR sender_user_id=p_user_id) AND (signed_at IS NOT NULL OR sender_signed_at IS NOT NULL OR status='signed'))+
   (SELECT count(*) FROM public.org_contracts WHERE (student_user_id=p_user_id OR students::text LIKE '%'||p_user_id::text||'%') AND (approved_at IS NOT NULL OR signed_at IS NOT NULL OR status NOT IN ('draft','cancelled')))+
   (SELECT count(*) FROM public.group_documents WHERE (student_user_id=p_user_id OR variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%') AND (file_path IS NOT NULL OR doc_status<>'draft'))
 INTO v_docs;
 IF v_docs>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','У аккаунта есть оформленные учебные или подписанные документы организации. Для этих записей требуется отдельная проверка возможности удаления; она не заменяется подтверждением удаления аккаунта.')); END IF;
 IF EXISTS(SELECT 1 FROM public.group_completion_decision_history WHERE user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.group_completion_decisions WHERE user_id=p_user_id) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть неизменяемая история итоговых решений организации. Их автоматическое удаление сейчас не поддержано без нарушения целостности общей истории; удаление не начато.'));
 END IF;
 -- CSZ preserves accepted homework by a dedicated immutable-history trigger.
 -- Do not bypass that guard just to scrub a personal free-text attachment.
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE student_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=p_user_id AND l.course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a')) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть защищённые работы ЦСЗ. Их обработка требует отдельного решения; результаты обучения сейчас не изменяются.'));
 END IF;
 -- These records have other stakeholders or privileged ownership. Never let
 -- Auth FK cascades silently delete client call records, contracts or grants.
 FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','student_user_id'),
  ('ai_avatar_templates','created_by'),
  ('balance_transactions','performed_by'),
  ('call_logs','manager_user_id'),
  ('chat_groups','created_by'),
  ('checko_search_presets','created_by'),
  ('checko_search_runs','created_by'),
  ('commercial_proposals','created_by'),
  ('commercial_proposals','deleted_by'),
  ('companies','user_id'),
  ('company_documents','deleted_by'),
  ('company_staff','invited_by'),
  ('course_landing_history','created_by'),
  ('course_manual_credits','credited_by'),
  ('course_manual_credits','revoked_by'),
  ('course_payments','user_id'),
  ('course_review_grants','created_by'),
  ('course_review_grants','updated_by'),
  ('course_snapshots','created_by'),
  ('data_subject_requests','deleted_by'),
  ('data_subject_requests','resolved_by'),
  ('document_issuance_log','deleted_by'),
  ('document_signatures','deleted_by'),
  ('driving_audit','user_id'),
  ('driving_entries','created_by'),
  ('driving_entry_reversals','created_by'),
  ('driving_instructors','user_id'),
  ('driving_invites','created_by'),
  ('driving_lessons','created_by'),
  ('driving_memberships','user_id'),
  ('driving_schools','created_by'),
  ('driving_students','user_id'),
  ('education_document_records','deleted_by'),
  ('email_campaigns','created_by'),
  ('email_drip_sequences','created_by'),
  ('email_templates','created_by'),
  ('enrollment_requests','resolved_by'),
  ('enrollment_requests','user_id'),
  ('goreltech_document_operations','actor_id'),
  ('goreltech_enrollment_orders','actor_id'),
  ('group_class_journal_marks','updated_by'),
  ('group_completion_decisions','confirmed_by'),
  ('group_document_schedules','updated_by'),
  ('group_documents','created_by'),
  ('group_documents','student_user_id'),
  ('homework_submissions','reviewer_id'),
  ('incoming_documents','deleted_by'),
  ('labor_safety_enrollment_protocols','created_by'),
  ('labor_safety_enrollment_protocols','source_user_id'),
  ('labor_safety_enrollment_protocols','updated_by'),
  ('labor_safety_profiles','user_id'),
  ('library_documents','created_by'),
  ('mailing_deliverability_seeds','created_by'),
  ('mailing_report_links','created_by'),
  ('mailing_senders','created_by'),
  ('marketplace_course_comments','user_id'),
  ('marketplace_orders','buyer_user_id'),
  ('org_billing_documents','deleted_by'),
  ('org_contract_template_versions','created_by'),
  ('org_custom_roles','created_by'),
  ('org_document_share_links','created_by'),
  ('org_documents','deleted_by'),
  ('org_signatories','created_by'),
  ('platform_invoice_acts','created_by'),
  ('platform_updates','created_by'),
  ('proposal_presets','created_by'),
  ('referral_attribution_log','user_id'),
  ('referral_partners','user_id'),
  ('sales_demo_links','created_by'),
  ('sales_demo_sessions','user_id'),
  ('sales_managers','user_id'),
  ('sales_tasks','created_by'),
  ('signature_comments','author_user_id'),
  ('signature_comments','resolved_by'),
  ('signature_revisions','created_by'),
  ('training_plans','created_by'),
  ('webinar_polls','created_by'),
  ('webinars','created_by'),
  ('webinars','host_user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING p_user_id;
  v_shared:=v_shared+v_count;
 END LOOP;
 v_shared:=v_shared+(SELECT count(*) FROM public.document_signatures WHERE (sender_user_id=p_user_id OR recipient_user_id=p_user_id) AND (sender_user_id IS DISTINCT FROM p_user_id OR recipient_user_id IS DISTINCT FROM p_user_id));
 v_shared:=v_shared+(SELECT count(*) FROM public.org_contracts WHERE student_user_id IS DISTINCT FROM p_user_id AND students::text LIKE '%'||p_user_id::text||'%');
 v_shared:=v_shared+(SELECT count(*) FROM public.group_documents WHERE student_user_id IS DISTINCT FROM p_user_id AND (variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%'));
 IF v_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_DATA_REVIEW_REQUIRED','message','Аккаунт связан с общими рабочими записями. Сначала нужно передать ответственность за них; данные других пользователей не удаляются.')); END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE (o.owner=p_user_id OR o.owner_id=p_user_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f->>'bucket'=o.bucket_id AND f->>'path'=o.name)) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_FILES_REVIEW_REQUIRED','message','Есть загруженные аккаунтом файлы вне личных папок. Сначала нужно проверить их принадлежность организации.'));
 END IF;
 IF v_owner THEN
  -- Locking/revalidation occurs again in begin. A brand-new sole-owner
  -- organization may be removed with its default welcome course/templates.
  SELECT count(*) INTO v_org_shared FROM public.profiles WHERE organization_id=v_org AND user_id<>p_user_id;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=v_org);
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.organizations WHERE id=v_org AND (balance<>0 OR is_paid OR paid_until IS NOT NULL));
  FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','organization_id'),
  ('org_crm_deals','organization_id'),
  ('org_crm_tasks','organization_id'),
  ('org_crm_activities','organization_id'),
  ('achievements','organization_id'),
  ('admin_generated_documents','sent_to_organization_id'),
  ('admin_org_messages','organization_id'),
  ('ai_avatar_templates','organization_id'),
  ('audit_logs','organization_id'),
  ('balance_transactions','organization_id'),
  ('chat_groups','organization_id'),
  ('checko_search_presets','organization_id'),
  ('commercial_proposals','organization_id'),
  ('companies','organization_id'),
  ('company_requests','organization_id'),
  ('consent_documents','organization_id'),
  ('course_landing_history','organization_id'),
  ('course_payments','organization_id'),
  ('course_reminders','organization_id'),
  ('course_requests','organization_id'),
  ('course_snapshots','organization_id'),
  ('data_subject_requests','organization_id'),
  ('document_issuance_log','organization_id'),
  ('document_number_sequences','organization_id'),
  ('document_signatures','organization_id'),
  ('driving_audit','organization_id'),
  ('driving_cars','organization_id'),
  ('driving_courses','organization_id'),
  ('driving_entries','organization_id'),
  ('driving_entry_reversals','organization_id'),
  ('driving_groups','organization_id'),
  ('driving_instructors','organization_id'),
  ('driving_invites','organization_id'),
  ('driving_lessons','organization_id'),
  ('driving_memberships','organization_id'),
  ('driving_operations','organization_id'),
  ('driving_programs','organization_id'),
  ('driving_schools','organization_id'),
  ('driving_shifts','organization_id'),
  ('driving_students','organization_id'),
  ('education_document_records','organization_id'),
  ('email_action_tokens','organization_id'),
  ('email_campaign_consent_log','organization_id'),
  ('email_campaigns','organization_id'),
  ('email_drip_subscribers','organization_id'),
  ('frdo_signed_documents','organization_id'),
  ('goreltech_document_operations','organization_id'),
  ('goreltech_enrollment_orders','organization_id'),
  ('group_class_journal_marks','organization_id'),
  ('group_completion_decision_history','organization_id'),
  ('group_completion_decisions','organization_id'),
  ('group_document_schedules','organization_id'),
  ('group_documents','organization_id'),
  ('homework_submissions','organization_id'),
  ('incoming_documents','organization_id'),
  ('journal_instances','organization_id'),
  ('kinescope_usage_cache','organization_id'),
  ('knowledge_bank','organization_id'),
  ('labor_safety_enrollment_protocols','organization_id'),
  ('labor_safety_groups','organization_id'),
  ('labor_safety_profiles','organization_id'),
  ('library_documents','organization_id'),
  ('library_folders','organization_id'),
  ('mailing_campaign_ledger','organization_id'),
  ('mailing_campaign_replies','organization_id'),
  ('mailing_contacts','organization_id'),
  ('mailing_deliverability_checks','organization_id'),
  ('mailing_deliverability_seeds','organization_id'),
  ('mailing_report_links','organization_id'),
  ('mailing_seed_ledger','organization_id'),
  ('mailing_senders','organization_id'),
  ('marketplace_courses','organization_id'),
  ('marketplace_orders','buyer_organization_id'),
  ('ordinary_mail_report_events','organization_id'),
  ('org_billing_documents','organization_id'),
  ('org_contract_template_versions','organization_id'),
  ('org_contract_templates','organization_id'),
  ('org_contracts','organization_id'),
  ('org_custom_roles','organization_id'),
  ('org_document_share_links','organization_id'),
  ('org_document_versions','organization_id'),
  ('org_documents','organization_id'),
  ('org_general_messages','organization_id'),
  ('org_payers','organization_id'),
  ('org_services','organization_id'),
  ('org_signatories','organization_id'),
  ('org_smtp_settings','organization_id'),
  ('org_staff','organization_id'),
  ('org_student_messages','organization_id'),
  ('organization_comments','organization_id'),
  ('organization_payment_settings','organization_id'),
  ('organization_reminders','organization_id'),
  ('pending_enrollments','organization_id'),
  ('platform_invoice_acts','organization_id'),
  ('program_categories','organization_id'),
  ('program_documents','organization_id'),
  ('program_folders','organization_id'),
  ('program_training_plans','organization_id'),
  ('proposal_presets','organization_id'),
  ('referral_attribution_log','organization_id'),
  ('referral_commissions','organization_id'),
  ('referral_registrations','organization_id'),
  ('registration_links','organization_id'),
  ('role_audit_log','organization_id'),
  ('sales_blacklist','organization_id'),
  ('sales_companies_db','organization_id'),
  ('sales_contracts','organization_id'),
  ('sales_demo_links','organization_id'),
  ('sales_demo_sessions','organization_id'),
  ('sales_lead_activities','organization_id'),
  ('sales_leads','organization_id'),
  ('sales_tasks','organization_id'),
  ('service_orders','organization_id'),
  ('skillspace_import_jobs','organization_id'),
  ('staff_invitations','organization_id'),
  ('student_deletion_log','organization_id'),
  ('student_group_memberships','organization_id'),
  ('student_groups','organization_id'),
  ('student_roster_removals','organization_id'),
  ('subscription_invoices','organization_id'),
  ('system_diagnostics','organization_id'),
  ('testimonials','organization_id'),
  ('training_plans','organization_id'),
  ('webinars','organization_id')
  ) x(t,c) LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING v_org;
   v_org_shared:=v_org_shared+v_count;
  END LOOP;
  -- Only the audited seeded course is auto-removable in the first release.
  SELECT count(*) INTO v_courses FROM public.courses WHERE organization_id=v_org;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.courses WHERE organization_id=v_org AND system_key IS DISTINCT FROM 'welcome');
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_group_education_states WHERE organization_id=v_org);
 IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','OWNERSHIP_TRANSFER_REQUIRED','message','Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.','actionHref','/organization?tab=staff')); END IF;
 END IF;
 -- PEP is deletable only when it is the person's standalone agreement, not
 -- evidence attached to a document signature (the live FK is SET NULL).
 SELECT count(*) INTO v_documentary FROM public.pep_agreements pa
 WHERE pa.user_id=p_user_id AND EXISTS(SELECT 1 FROM public.document_signatures d WHERE d.pep_agreement_id=pa.id);
 -- An organization's offer acceptance belongs to the organization lifecycle.
 -- Remove it only together with the verified unused sole-owner organization.
 SELECT v_documentary+count(*) INTO v_documentary FROM public.organization_offer_acceptances a
 WHERE a.user_id=p_user_id AND NOT (v_owner AND v_org_shared=0 AND a.organization_id=v_org);
 IF v_documentary>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','DOCUMENTARY_RELATION_REVIEW_REQUIRED','message','Есть соглашение ПЭП, связанное с подписью документа, или акцепт оферты действующей организации. Эти общие документальные записи требуют отдельной обработки; удаление аккаунта не начато.')); END IF;
 v_education_outputs:=public.uc_education_saved_output_counts(p_user_id);v_education_unissued:=(v_education_outputs->>'unissued')::bigint;v_education_issued:=(v_education_outputs->>'issued')::bigint;
 IF v_education_unissued+v_education_issued>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED','message','Сохранены файлы подготовки, ещё не выданные: '||v_education_unissued||'; архивы выданных документов: '||v_education_issued||'. Учебному центру нужно проверить черновики и основания дальнейшего хранения архива. Удаление аккаунта не начато.'));END IF;
 v_categories:=v_categories||jsonb_build_array(
  jsonb_build_object('key','account','label','Вход в аккаунт, пароль, профиль и личные настройки','count',1,'action','delete'),
  jsonb_build_object('key','private_files','label','Личные фотографии и загруженные документы','count',jsonb_array_length(v_files),'action','delete'),
  jsonb_build_object('key','learning_results','label','Назначения курсов, прогресс, попытки, ответы и результаты обучения','count',v_learning,'action','delete'),
  jsonb_build_object('key','institutional_documents','label','Оформленные документы','count',v_docs,'action',CASE WHEN v_docs>0 THEN 'block' ELSE 'delete' END));
 IF v_education_unissued+v_education_issued>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','education_artifact_outputs','label','Файлы подготовки и архив выданных документов: требуется проверка сохранения','count',v_education_unissued+v_education_issued,'action','block'));END IF;
 IF v_documentary>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','documentary_relations','label','Соглашения ПЭП и акцепты оферт, связанные с документами или действующей организацией','count',v_documentary,'action','block')); END IF;
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','empty_organization','label','Неиспользованная организация и ознакомительный курс','count',1,'action',CASE WHEN v_org_shared>0 THEN 'block' ELSE 'delete' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','common_audit','label','Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются','count',v_count,'action','anonymize')); END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_cases WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_cases','label','Личные дела и их индивидуальные копии','count',v_count,'action','delete'));END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_case_events WHERE actor_id=p_user_id AND user_id<>p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_review_attribution','label','Атрибуция внутренних проверок: удаляется ссылка на аккаунт и личный текст','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','conducted_sessions','label','Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$;

-- Retained technical history must block destructive planning and file export before any cleanup mutation.
CREATE OR REPLACE FUNCTION public.uc_scoped_journal_erase_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations rev WHERE rev.user_id=p_user) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events retained_removal WHERE retained_removal.user_id=p_user OR retained_removal.actor_id=p_user)THEN RAISE EXCEPTION 'COURSE_ASSIGNMENT_REMOVAL_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 PERFORM public.uc_education_erase_user(p_user);
 PERFORM public.uc_copy_registry_erase_user(p_user);
 PERFORM public.uc_document_registry_erase_user(p_user);
 -- Every copied personal export is invalidated, never silently re-rendered under an old hash.
 DELETE FROM public.uc_scoped_journal_exports e WHERE e.recorded_by=p_user OR p_user=ANY(e.participant_ids);
 DELETE FROM public.uc_scoped_journal_requests request_row WHERE request_row.actor_id=p_user OR p_user=ANY(request_row.participant_ids);
 DELETE FROM public.uc_scoped_journal_history h WHERE h.subject_user_id=p_user;
 DELETE FROM public.uc_scoped_journal_records r WHERE r.subject_user_id=p_user;
 -- Conservatively redact an entire attributed copy, including nonpersonal-author text.
 -- No universal discovery of undeclared third-party personal data in free text is claimed.
 UPDATE public.uc_scoped_journal_history SET recorded_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values='{}',source='{"kind":"none"}',reason='',participant_ids='{}',redacted=true
  WHERE recorded_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_records SET recorded_by=NULL,created_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values='{}',source='{"kind":"none"}',participant_ids='{}',redacted=true
  WHERE recorded_by=p_user OR created_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_contexts SET created_by=NULL WHERE created_by=p_user;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.uc_education_personal_counts(p_user))x WHERE x->>'column'='retained_subject_output_reference_review_required')THEN RAISE EXCEPTION 'EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 IF public.uc_scoped_journal_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_custom_journal_error('DEPENDENCY_UNAVAILABLE');END IF;
END;$function$;
