-- Integrate only RTN-owned personal links into the existing confirmed erasure
-- workflow. This migration NEVER invokes account erasure or deletes an account.
BEGIN;

-- SELECT-only live preimage capture, project d57ddcdf-2d1b-42ec-8bfb-3484123b5ff2,
-- 2026-11-14. Preserve existing owner/ACL/config and every unrelated body byte.
CREATE TEMP TABLE rtn_erasure_old_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p)-'prosrc' AS metadata,p.prosrc,pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p WHERE p.oid IN(
  to_regprocedure('public.account_deletion_erase_data(uuid,text)'),
  to_regprocedure('public.account_deletion_snapshot(uuid)'),
  to_regprocedure('public.uc_scoped_journal_personal_counts(uuid)'),
  to_regprocedure('rtn_private.reject_mutation()'),to_regprocedure('rtn_private.freeze_attempt()'),
  to_regprocedure('public.review_rtn_keys(uuid,uuid,jsonb,text,jsonb)'),to_regprocedure('public.publish_rtn_release(uuid,date,text)'),
  to_regprocedure('public.save_rtn_settings(uuid,boolean,boolean)'),to_regprocedure('public.request_rtn_source_check(uuid,uuid)'),
  to_regprocedure('public.set_rtn_rollout_stage(text,integer,uuid,text,jsonb)'),to_regprocedure('public.assign_rtn_training(uuid,uuid,uuid[],uuid)'));
DO $preimage$ DECLARE expected record;actual pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'RTN_ERASURE_REQUIRES_EXISTING_POSTGRES_OWNER';END IF;
 FOR expected IN SELECT * FROM(VALUES
  ('public.account_deletion_erase_data(uuid,text)','a13f74f6687fff498ac1628830458560','a496bbcd2154d994c9e83888313a84a3','v','search_path=pg_catalog, public, storage','{postgres=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}'),
  ('public.account_deletion_snapshot(uuid)','c6e55ea2001e24e7849875210d44baad','aaa5cc6d382e87fd1b513f0632f7ea2f','s','search_path=pg_catalog, public, storage','{postgres=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}'),
  ('public.uc_scoped_journal_personal_counts(uuid)','f8f7b3be7cf578aafc26c66c46864ec9','4824a861df1f690d3c4e6b0e23a5832a','s','search_path=pg_catalog, public','{postgres=X/postgres}')
 )x(signature,body_md5,definition_md5,volatility,config,acl) LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF actual.oid IS NULL OR md5(actual.prosrc) IS DISTINCT FROM expected.body_md5
   OR md5(pg_get_functiondef(actual.oid)) IS DISTINCT FROM expected.definition_md5
   OR pg_get_userbyid(actual.proowner)<>'postgres' OR actual.proacl::text IS DISTINCT FROM expected.acl
   OR actual.proconfig IS DISTINCT FROM ARRAY[expected.config] OR NOT actual.prosecdef
   OR actual.provolatile::text<>expected.volatility
  THEN RAISE EXCEPTION 'RTN_ERASURE_LIVE_PREIMAGE_OR_AUTHORITY_CHANGED:%',expected.signature;END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_temp.rtn_erasure_old_functions)<>11
  OR to_regprocedure('rtn_private.erase_personal_usage(uuid)') IS NULL
  OR to_regclass('rtn_private.attempt_drafts') IS NULL
 THEN RAISE EXCEPTION 'RTN_ERASURE_REQUIRES_REVIEWED_BASE_QUOTA_AND_DRAFTS';END IF;
 IF md5((SELECT prosrc FROM pg_proc WHERE oid='rtn_private.reject_mutation()'::regprocedure))<>'fc8ca8c8def34c589fdc59179d98031c'
  OR md5((SELECT prosrc FROM pg_proc WHERE oid='rtn_private.freeze_attempt()'::regprocedure))<>'f2234ae90d3c6b90aa47791495ab3efc'
 THEN RAISE EXCEPTION 'RTN_ERASURE_BASE_IMMUTABILITY_PREIMAGE_CHANGED';END IF;
 FOR expected IN SELECT * FROM(VALUES
  ('public.assign_rtn_training(uuid,uuid,uuid[],uuid)','0dab3b01227afaf531635becdf00b200'),
  ('public.publish_rtn_release(uuid,date,text)','8712abd115875f97add8a00d3115197f'),
  ('public.request_rtn_source_check(uuid,uuid)','e736883d1eb95853e65299a19037f284'),
  ('public.review_rtn_keys(uuid,uuid,jsonb,text,jsonb)','ccadcd11d2a9f11d7bbe85f32d69b427'),
  ('public.save_rtn_settings(uuid,boolean,boolean)','97aae32458ab9586a0132b9847b2bdf9'),
  ('public.set_rtn_rollout_stage(text,integer,uuid,text,jsonb)','07d9db01a778e728a05c8a98fe7b61fa')
 )x(signature,body_md5) LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF actual.oid IS NULL OR md5(actual.prosrc) IS DISTINCT FROM expected.body_md5 OR pg_get_userbyid(actual.proowner)<>'postgres'
   OR actual.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR NOT actual.prosecdef OR actual.provolatile<>'v'
  THEN RAISE EXCEPTION 'RTN_ERASURE_WRITER_PREIMAGE_OR_AUTHORITY_CHANGED:%',expected.signature;END IF;
 END LOOP;
END;$preimage$;

-- Actor-attributed writes join the confirmed erasure subject lock before
-- source/organization/rollout locks, and revalidate after waiting.
CREATE FUNCTION rtn_private.lock_actor() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid:=auth.uid();BEGIN
 IF NOT rtn_private.actor_allowed() THEN RAISE EXCEPTION 'rtn_active_actor_required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,42007));
 IF NOT rtn_private.actor_allowed() OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=actor)
 THEN RAISE EXCEPTION 'rtn_active_actor_required' USING ERRCODE='42501';END IF;
 RETURN actor;
END;$fn$;
DO $actor_fences$ DECLARE f record;old record;body text;anchor text;replacement text;BEGIN
 FOR f IN SELECT * FROM(VALUES
  ('public.review_rtn_keys(uuid,uuid,jsonb,text,jsonb)'),('public.publish_rtn_release(uuid,date,text)'),
  ('public.save_rtn_settings(uuid,boolean,boolean)'),('public.request_rtn_source_check(uuid,uuid)'),
  ('public.set_rtn_rollout_stage(text,integer,uuid,text,jsonb)')
 )x(signature) LOOP
  SELECT * INTO STRICT old FROM pg_temp.rtn_erasure_old_functions WHERE oid=to_regprocedure(f.signature);
  anchor:=E'BEGIN\n';
  IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1
  THEN RAISE EXCEPTION 'RTN_ERASURE_ACTOR_FENCE_ANCHOR_CHANGED:%',f.signature;END IF;
  body:=replace(old.prosrc,anchor,anchor||E' PERFORM rtn_private.lock_actor();\n');
  EXECUTE replace(old.definition,old.prosrc,body);
 END LOOP;
 SELECT * INTO STRICT old FROM pg_temp.rtn_erasure_old_functions WHERE oid='public.assign_rtn_training(uuid,uuid,uuid[],uuid)'::regprocedure;
 anchor:='FOR quota_user IN SELECT DISTINCT p2.user_id FROM public.profiles p2 WHERE p2.id=ANY(p_student_ids) AND p2.organization_id=p_organization_id ORDER BY p2.user_id LOOP';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_ERASURE_ASSIGNMENT_SUBJECT_SET_CHANGED';END IF;
 replacement:='FOR quota_user IN SELECT subject.user_id FROM(SELECT auth.uid() AS user_id UNION SELECT p2.user_id FROM public.profiles p2 WHERE p2.id=ANY(p_student_ids) AND p2.organization_id=p_organization_id)subject ORDER BY subject.user_id LOOP';
 body:=replace(old.prosrc,anchor,replacement);
 anchor:=' PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,42));';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_ERASURE_ASSIGNMENT_ORGANIZATION_LOCK_CHANGED';END IF;
 body:=replace(body,anchor,E' PERFORM rtn_private.lock_actor();\n PERFORM rtn_private.assert_staff(p_organization_id,''courses.write'');PERFORM rtn_private.assert_staff(p_organization_id,''students.write'');PERFORM rtn_private.assert_entitled(p_organization_id,p_bank_id);\n'||anchor);
 EXECUTE replace(old.definition,old.prosrc,body);
END;$actor_fences$;

CREATE TABLE rtn_private.erasure_contexts(
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,subject_user_id uuid NOT NULL,
 request_id uuid NOT NULL,PRIMARY KEY(backend_pid,transaction_id,subject_user_id)
);
CREATE TABLE rtn_private.erased_learning_totals(
 organization_id uuid NOT NULL REFERENCES public.organizations(id),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 release_id uuid NOT NULL REFERENCES rtn_private.releases(id),month_start date NOT NULL,
 started_count bigint NOT NULL CHECK(started_count>=0),submitted_count bigint NOT NULL CHECK(submitted_count>=0),
 passed_count bigint NOT NULL CHECK(passed_count>=0),score_sum numeric NOT NULL CHECK(score_sum>=0),
 PRIMARY KEY(organization_id,bank_id,release_id,month_start)
);
ALTER TABLE rtn_private.erasure_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rtn_private.erased_learning_totals ENABLE ROW LEVEL SECURITY;

-- VOLATILE is intentional: this guard must see a context inserted earlier in
-- the same erasure RPC. It never creates a context or grants erasure authority.
CREATE FUNCTION rtn_private.erasure_allowed(p_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_user IS NOT NULL AND auth.role()='service_role'
 AND current_setting('sintagma.account_deletion_erase_user',true)=p_user::text
 AND EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p_user)
 AND EXISTS(SELECT 1 FROM rtn_private.erasure_contexts c JOIN public.account_deletion_jobs j ON j.id=c.request_id
  WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.subject_user_id=p_user
   AND j.user_id=p_user AND j.state='cleanup_pending' AND j.consent_version='full-personal-data-v1'),false)
$fn$;

CREATE FUNCTION rtn_private.personal_counts(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t record;r jsonb;v jsonb;n bigint;unhandled bigint;result jsonb:='[]';BEGIN
 IF p_user IS NULL THEN RETURN result;END IF;
 -- The private schema has no ordinary PostgREST exposure. Inspect declared UUID
 -- links AND exact UUID occurrences in copies; do not claim universal discovery
 -- of undeclared names/third-party personal text in arbitrary learning content.
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='rtn_private' AND tablename<>'erasure_contexts' ORDER BY tablename LOOP
  n:=0;unhandled:=0;
  FOR r IN EXECUTE format('SELECT to_jsonb(x) FROM rtn_private.%I x',t.tablename) LOOP
   IF position(p_user::text IN r::text)=0 THEN CONTINUE;END IF;
   n:=n+1;v:=r;
   IF t.tablename IN('assignments','attempts') AND r->>'student_user_id'=p_user::text THEN CONTINUE;
   ELSIF t.tablename IN('monthly_completions','monthly_active_learners') AND r->>'user_id'=p_user::text THEN CONTINUE;
   ELSIF t.tablename='activity_events' AND r->>'learner_id'=p_user::text THEN CONTINUE;
   ELSIF t.tablename='key_sets' AND r->>'reviewed_by'=p_user::text THEN v:=r-ARRAY['reviewed_by','review_note'];
   ELSIF t.tablename='releases' AND r->>'published_by'=p_user::text THEN v:=r-ARRAY['published_by','release_note'];
   ELSIF t.tablename='rollout_events' AND r->>'actor_id'=p_user::text THEN v:=r-ARRAY['actor_id','reason','evidence'];
   ELSIF t.tablename='check_runs' AND r->>'requested_by'=p_user::text THEN v:=r-ARRAY['requested_by','error','result_metadata'];
   ELSIF t.tablename='settings' AND r->>'updated_by'=p_user::text THEN v:=r-'updated_by';
   ELSIF t.tablename='assignments' AND r->>'assigned_by'=p_user::text THEN v:=r-'assigned_by';
   END IF;
   IF position(p_user::text IN v::text)>0 THEN unhandled:=unhandled+1;END IF;
  END LOOP;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','rtn_private.'||t.tablename,'column','personal_link','count',n));END IF;
  IF unhandled>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','rtn_private.'||t.tablename,'column','content_reference_requires_review','count',unhandled));END IF;
 END LOOP;
 SELECT count(*) INTO n FROM rtn_private.attempt_drafts d JOIN rtn_private.attempts a ON a.id=d.attempt_id WHERE a.student_user_id=p_user;
 IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','rtn_private.attempt_drafts','column','attempt_subject','count',n));END IF;
 SELECT count(*) INTO n FROM rtn_private.assignments a JOIN public.profiles p ON p.id=a.student_id
 WHERE(p.user_id=p_user OR a.student_user_id=p_user)AND a.student_user_id IS DISTINCT FROM p.user_id;
 IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','rtn_private.assignments','column','content_reference_requires_review','count',n));END IF;
 SELECT count(*) INTO n FROM rtn_private.attempts attempt_row JOIN rtn_private.assignments a ON a.id=attempt_row.assignment_id
 WHERE(attempt_row.student_user_id=p_user OR a.student_user_id=p_user)AND(attempt_row.student_user_id IS DISTINCT FROM a.student_user_id OR attempt_row.organization_id IS DISTINCT FROM a.organization_id);
 IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','rtn_private.attempts','column','content_reference_requires_review','count',n));END IF;
 RETURN result;
END;$fn$;

CREATE FUNCTION rtn_private.organization_retention_count(p_org uuid,p_user uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT(SELECT count(*) FROM rtn_private.assignments WHERE organization_id=p_org)
 +(SELECT count(*) FROM rtn_private.erased_learning_totals WHERE organization_id=p_org)
 +(SELECT count(*) FROM rtn_private.monthly_activity_totals WHERE organization_id=p_org)
 +(SELECT count(*) FROM rtn_private.monthly_used_banks WHERE organization_id=p_org)
 +(SELECT count(*) FROM rtn_private.check_runs WHERE organization_id=p_org AND requested_by IS DISTINCT FROM p_user)
$fn$;

-- Nullable attribution is required to remove the erased editor's identity.
-- Normative originals, questions, materials, release IDs and grades stay frozen.
ALTER TABLE rtn_private.key_sets ALTER COLUMN reviewed_by DROP NOT NULL;
ALTER TABLE rtn_private.releases ALTER COLUMN published_by DROP NOT NULL;
ALTER TABLE rtn_private.rollout_events ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE rtn_private.assignments ALTER COLUMN assigned_by DROP NOT NULL;
ALTER TABLE rtn_private.settings ALTER COLUMN updated_by DROP NOT NULL;
ALTER TABLE rtn_private.check_runs ADD COLUMN requester_erased boolean NOT NULL DEFAULT false;
DO $manual_constraint$ DECLARE name text;BEGIN
 SELECT conname INTO name FROM pg_constraint WHERE conrelid='rtn_private.check_runs'::regclass AND contype='c'
  AND pg_get_constraintdef(oid)='CHECK (((kind = ''manual''::text) = ((organization_id IS NOT NULL) AND (requested_by IS NOT NULL))))';
 IF name IS NULL THEN RAISE EXCEPTION 'RTN_ERASURE_MANUAL_CHECK_CONSTRAINT_CHANGED';END IF;
 EXECUTE format('ALTER TABLE rtn_private.check_runs DROP CONSTRAINT %I',name);
END;$manual_constraint$;
ALTER TABLE rtn_private.check_runs ADD CONSTRAINT rtn_manual_request_attribution CHECK(
 (kind='manual' AND((NOT requester_erased AND organization_id IS NOT NULL AND requested_by IS NOT NULL)
  OR(requester_erased AND requested_by IS NULL)))
 OR(kind IN('daily','weekly') AND organization_id IS NULL AND requested_by IS NULL AND NOT requester_erased)
);

CREATE FUNCTION rtn_private.allowed_redaction(p_table text,p_old jsonb,p_new jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE subject uuid;allowed text[];BEGIN
 IF p_table='key_sets' THEN
  subject:=(p_old->>'reviewed_by')::uuid;allowed:=ARRAY['reviewed_by','review_note'];
  IF p_new->>'reviewed_by' IS NOT NULL OR p_new->>'review_note' IS DISTINCT FROM 'Авторская атрибуция удалена по подтверждённому запросу.' THEN RETURN false;END IF;
 ELSIF p_table='releases' THEN
  subject:=(p_old->>'published_by')::uuid;allowed:=ARRAY['published_by','release_note'];
  IF p_new->>'published_by' IS NOT NULL OR p_new->>'release_note' IS DISTINCT FROM 'Авторская атрибуция удалена по подтверждённому запросу.' THEN RETURN false;END IF;
 ELSIF p_table='rollout_events' THEN
  subject:=(p_old->>'actor_id')::uuid;allowed:=ARRAY['actor_id','reason','evidence'];
  IF p_new->>'actor_id' IS NOT NULL OR p_new->>'reason' IS DISTINCT FROM 'Авторская атрибуция удалена по подтверждённому запросу.'
   OR p_new->'evidence' IS DISTINCT FROM '{"redacted":true,"basis":"confirmed_account_erasure"}'::jsonb THEN RETURN false;END IF;
 ELSE RETURN false;
 END IF;
 RETURN subject IS NOT NULL AND rtn_private.erasure_allowed(subject) AND p_old-allowed=p_new-allowed;
END;$fn$;

-- Preserve trigger function authority and all normal immutability checks.
DO $immutable_patch$ DECLARE p record;body text;patched text;definition text;BEGIN
 SELECT * INTO STRICT p FROM pg_temp.rtn_erasure_old_functions WHERE oid='rtn_private.reject_mutation()'::regprocedure;
 IF p.prosrc IS DISTINCT FROM ' BEGIN RAISE EXCEPTION ''rtn_history_is_immutable'' USING ERRCODE=''42501'';END;'
 THEN RAISE EXCEPTION 'RTN_ERASURE_IMMUTABLE_GUARD_PREIMAGE_CHANGED';END IF;
 body:=$body$ BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_SCHEMA='rtn_private'
  AND rtn_private.allowed_redaction(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'rtn_history_is_immutable' USING ERRCODE='42501';END;$body$;
 EXECUTE replace(p.definition,p.prosrc,body);
 SELECT * INTO STRICT p FROM pg_temp.rtn_erasure_old_functions WHERE oid='rtn_private.freeze_attempt()'::regprocedure;
 patched:=replace(p.prosrc,E'BEGIN\n',E'BEGIN\n IF TG_OP=''DELETE'' AND rtn_private.erasure_allowed(OLD.student_user_id) THEN RETURN OLD;END IF;\n');
 IF patched=p.prosrc OR position('NEW.total IS DISTINCT FROM OLD.total' IN p.prosrc)=0
 THEN RAISE EXCEPTION 'RTN_ERASURE_ATTEMPT_GUARD_PREIMAGE_CHANGED';END IF;
 EXECUTE replace(p.definition,p.prosrc,patched);
END;$immutable_patch$;

CREATE FUNCTION rtn_private.personal_link_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE before jsonb:=to_jsonb(OLD);after_row jsonb;subject uuid;allowed text[];BEGIN
 IF TG_OP='DELETE' THEN
  IF TG_TABLE_NAME='assignments' AND rtn_private.erasure_allowed(OLD.student_user_id) THEN RETURN OLD;END IF;
  RAISE EXCEPTION 'rtn_personal_link_delete_requires_confirmed_erasure' USING ERRCODE='42501';
 END IF;
 after_row:=to_jsonb(NEW);
 IF TG_TABLE_NAME='assignments' THEN
  IF NEW.assigned_by IS NOT DISTINCT FROM OLD.assigned_by THEN RETURN NEW;END IF;
  subject:=OLD.assigned_by;allowed:=ARRAY['assigned_by'];
  IF NEW.assigned_by IS NOT NULL THEN RAISE EXCEPTION 'rtn_assignment_attribution_is_immutable' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='settings' THEN
  IF NEW.updated_by IS NOT NULL OR NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by THEN RETURN NEW;END IF;
  subject:=OLD.updated_by;allowed:=ARRAY['updated_by'];
 ELSIF TG_TABLE_NAME='check_runs' THEN
  IF NEW.requested_by IS NOT DISTINCT FROM OLD.requested_by AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
   AND NEW.requester_erased IS NOT DISTINCT FROM OLD.requester_erased THEN RETURN NEW;END IF;
  subject:=OLD.requested_by;allowed:=ARRAY['requested_by','organization_id','requester_erased','error','result_metadata'];
  IF NEW.requested_by IS NOT NULL OR NEW.organization_id IS NOT NULL OR NOT NEW.requester_erased
   OR NEW.error IS NOT NULL OR NEW.result_metadata IS DISTINCT FROM '{"requester_redacted":true}'::jsonb
  THEN RAISE EXCEPTION 'rtn_check_attribution_redaction_invalid' USING ERRCODE='42501';END IF;
 ELSE RAISE EXCEPTION 'rtn_unknown_personal_link_guard' USING ERRCODE='42501';
 END IF;
 IF subject IS NOT NULL AND rtn_private.erasure_allowed(subject) AND before-allowed=after_row-allowed THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'rtn_personal_link_redaction_requires_confirmed_erasure' USING ERRCODE='42501';
END;$fn$;
CREATE TRIGGER rtn_assignment_personal_link BEFORE UPDATE OR DELETE ON rtn_private.assignments FOR EACH ROW EXECUTE FUNCTION rtn_private.personal_link_guard();
CREATE TRIGGER rtn_settings_personal_link BEFORE UPDATE ON rtn_private.settings FOR EACH ROW EXECUTE FUNCTION rtn_private.personal_link_guard();
CREATE TRIGGER rtn_check_personal_link BEFORE UPDATE ON rtn_private.check_runs FOR EACH ROW EXECUTE FUNCTION rtn_private.personal_link_guard();

CREATE FUNCTION rtn_private.erase_account_links(p_user uuid,p_request uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE job public.account_deletion_jobs%ROWTYPE;org uuid;BEGIN
 IF p_user IS NULL OR auth.role() IS DISTINCT FROM 'service_role'
  OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text
  OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 THEN RAISE EXCEPTION 'rtn_confirmed_account_erasure_required' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM public.account_deletion_jobs WHERE id=p_request AND user_id=p_user
  AND state='cleanup_pending' AND consent_version='full-personal-data-v1' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_confirmed_account_erasure_job_required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,42007));
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rtn_private.personal_counts(p_user))x WHERE x->>'column'='content_reference_requires_review')
 THEN RAISE EXCEPTION 'RTN_PERSONAL_CONTENT_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 INSERT INTO rtn_private.erasure_contexts VALUES(pg_backend_pid(),txid_current(),p_user,p_request);
 -- Anonymous quota/activity counters are deliberately NOT decremented.
 PERFORM rtn_private.erase_personal_usage(p_user);
 INSERT INTO rtn_private.erased_learning_totals(organization_id,bank_id,release_id,month_start,started_count,submitted_count,passed_count,score_sum)
 SELECT a.organization_id,a.bank_id,t.release_id,date_trunc('month',t.started_at AT TIME ZONE 'Europe/Moscow')::date,
  count(*),count(*)FILTER(WHERE t.status='submitted'),count(*)FILTER(WHERE t.passed),coalesce(sum(t.score)FILTER(WHERE t.status='submitted'),0)
 FROM rtn_private.attempts t JOIN rtn_private.assignments a ON a.id=t.assignment_id WHERE t.student_user_id=p_user
 GROUP BY a.organization_id,a.bank_id,t.release_id,date_trunc('month',t.started_at AT TIME ZONE 'Europe/Moscow')::date
 ORDER BY a.organization_id,a.bank_id,t.release_id,date_trunc('month',t.started_at AT TIME ZONE 'Europe/Moscow')::date
 ON CONFLICT(organization_id,bank_id,release_id,month_start) DO UPDATE SET
  started_count=rtn_private.erased_learning_totals.started_count+excluded.started_count,
  submitted_count=rtn_private.erased_learning_totals.submitted_count+excluded.submitted_count,
  passed_count=rtn_private.erased_learning_totals.passed_count+excluded.passed_count,
  score_sum=rtn_private.erased_learning_totals.score_sum+excluded.score_sum;
 DELETE FROM rtn_private.attempts WHERE student_user_id=p_user; -- cascades target drafts only
 DELETE FROM rtn_private.assignments WHERE student_user_id=p_user;
 UPDATE rtn_private.assignments SET assigned_by=NULL WHERE assigned_by=p_user;
 UPDATE rtn_private.settings SET updated_by=NULL WHERE updated_by=p_user;
 UPDATE rtn_private.check_runs SET requested_by=NULL,organization_id=NULL,requester_erased=true,error=NULL,result_metadata='{"requester_redacted":true}' WHERE requested_by=p_user;
 UPDATE rtn_private.key_sets SET reviewed_by=NULL,review_note='Авторская атрибуция удалена по подтверждённому запросу.' WHERE reviewed_by=p_user;
 UPDATE rtn_private.releases SET published_by=NULL,release_note='Авторская атрибуция удалена по подтверждённому запросу.' WHERE published_by=p_user;
 UPDATE rtn_private.rollout_events SET actor_id=NULL,reason='Авторская атрибуция удалена по подтверждённому запросу.',evidence='{"redacted":true,"basis":"confirmed_account_erasure"}' WHERE actor_id=p_user;
 IF coalesce((job.snapshot->>'emptyOrganization')::boolean,false) THEN
  org:=(job.snapshot->>'organizationId')::uuid;
  -- Meaningful shared RTN history is a snapshot ownership blocker. Only
  -- empty-tenant preferences and technical pilot exceptions may disappear.
  IF rtn_private.organization_retention_count(org,p_user)>0 THEN RAISE EXCEPTION 'RTN_ORGANIZATION_OWNERSHIP_TRANSFER_REQUIRED' USING ERRCODE='P0001';END IF;
  DELETE FROM rtn_private.settings WHERE organization_id=org;
  DELETE FROM rtn_private.pilot_grants WHERE organization_id=org;
 END IF;
 IF rtn_private.personal_counts(p_user)<>'[]'::jsonb THEN RAISE EXCEPTION 'RTN_PERSONAL_ERASURE_INCOMPLETE' USING ERRCODE='P0001';END IF;
 DELETE FROM rtn_private.erasure_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND subject_user_id=p_user AND request_id=p_request;
END;$fn$;

DO $bridges$ DECLARE old record;definition text;body text;anchor text;BEGIN
 SELECT * INTO STRICT old FROM pg_temp.rtn_erasure_old_functions WHERE oid='public.account_deletion_erase_data(uuid,text)'::regprocedure;
 anchor:=' PERFORM pg_advisory_xact_lock(hashtextextended(u::text,42007));';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_ERASURE_CORE_SUBJECT_LOCK_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,anchor||E'\n SELECT organization_id INTO v_org FROM public.profiles WHERE user_id=u;\n IF v_org IS NOT NULL THEN\n  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,42));\n  PERFORM 1 FROM public.organizations WHERE id=v_org FOR UPDATE;\n END IF;');
 anchor:=' DELETE FROM public.profiles WHERE user_id=u;';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_ERASURE_EARLY_HOOK_ANCHOR_CHANGED';END IF;
 body:=replace(body,anchor,E' PERFORM rtn_private.erase_account_links(u,j.id);\n'||anchor);
 EXECUTE replace(old.definition,old.prosrc,body);
 SELECT * INTO STRICT old FROM pg_temp.rtn_erasure_old_functions WHERE oid='public.uc_scoped_journal_personal_counts(uuid)'::regprocedure;
 IF right(btrim(old.prosrc),1)=';' THEN RAISE EXCEPTION 'RTN_ERASURE_COUNT_EXPRESSION_CHANGED';END IF;
 body:=E'\n SELECT ('||old.prosrc||E') || rtn_private.personal_counts(p_user)\n';
 EXECUTE replace(old.definition,old.prosrc,body);
 SELECT * INTO STRICT old FROM pg_temp.rtn_erasure_old_functions WHERE oid='public.account_deletion_snapshot(uuid)'::regprocedure;
 body:=old.prosrc;
 anchor:=' IF v_org_shared>0 THEN v_blockers:=';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_ERASURE_ORGANIZATION_SNAPSHOT_ANCHOR_CHANGED';END IF;
 body:=replace(body,anchor,E' v_org_shared:=v_org_shared+rtn_private.organization_retention_count(v_org,p_user_id);\n'||anchor);
 anchor:=' v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''security_record''';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_ERASURE_PERSONAL_SNAPSHOT_ANCHOR_CHANGED';END IF;
 body:=replace(body,anchor,$addition$ SELECT coalesce(sum((x->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(rtn_private.personal_counts(p_user_id))x;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','rtn_training','label','Ростехнадзор: личные назначения и попытки удаляются, атрибуция обезличивается; анонимная статистика сохраняется','count',v_count,'action','delete_or_anonymize'));END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rtn_private.personal_counts(p_user_id))x WHERE x->>'column'='content_reference_requires_review')THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RTN_PERSONAL_CONTENT_RETENTION_REVIEW_REQUIRED','message','Есть личная ссылка в общей учебной редакции. До удаления нужна отдельная проверка; материалы и результаты других лиц не изменяются.'));
 END IF;
$addition$||anchor);
 EXECUTE replace(old.definition,old.prosrc,body);
END;$bridges$;

-- Newly created helpers/tables remain owner-only, including environments with
-- provider-specific default grants. Existing erasure entrypoint ACLs stay exact.
DO $new_acl$ DECLARE r record;g record;BEGIN
 FOR r IN SELECT p.oid,p.proowner,p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='rtn_private' AND p.proname IN('lock_actor','erasure_allowed','personal_counts','organization_retention_count','allowed_redaction','personal_link_guard','erase_account_links') LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=r.oid),acldefault('f',r.proowner)))a WHERE a.grantee<>r.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
 FOR r IN SELECT c.oid,c.relowner,c.oid::regclass::text identity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rtn_private' AND c.relname IN('erasure_contexts','erased_learning_totals') LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid=r.oid),acldefault('r',r.relowner)))a WHERE a.grantee<>r.relowner LOOP
   EXECUTE format('REVOKE ALL ON TABLE %s FROM %s',r.identity,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
END;$new_acl$;
DO $postimage$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.rtn_erasure_old_functions old LEFT JOIN pg_proc p ON p.oid=old.oid WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc' IS DISTINCT FROM old.metadata)
 THEN RAISE EXCEPTION 'RTN_ERASURE_EXISTING_FUNCTION_AUTHORITY_CHANGED';END IF;
 IF position('rtn_private.erase_account_links(u,j.id)' IN pg_get_functiondef('public.account_deletion_erase_data(uuid,text)'::regprocedure))=0
  OR position('rtn_private.personal_counts(p_user)' IN pg_get_functiondef('public.uc_scoped_journal_personal_counts(uuid)'::regprocedure))=0
 THEN RAISE EXCEPTION 'RTN_ERASURE_BRIDGE_INCOMPLETE';END IF;
END;$postimage$;
UPDATE rtn_private.rollout_state SET privacy_integration_ready=true WHERE id=1;
COMMIT;
