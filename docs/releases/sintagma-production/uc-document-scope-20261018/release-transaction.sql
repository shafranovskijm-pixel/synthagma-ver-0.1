-- Generated stage2 only. Submit this ENTIRE file in ONE request; no historical bulk migrations.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (-- Read-only. Never inspect or emit a scheduled command/credential.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE (version='20261018100000' AND name='uc_document_access_boundaries' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='455f5c4069200f225124bfd58adc948c') OR (version='20261018101000' AND name='uc_signature_integrity' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='1a7d1d39332388314cc8ebf0eaaef885') OR (version='20261018102000' AND name='uc_document_versions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='485580713e67f5bbf40210836f757a8b') OR (version='20261018103000' AND name='uc_document_cleanup_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='5d690c2e4284a79f12901a7deabdf736')) AS exact_foundation_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN('20261018104000','20261018105000','20261018106000','20261018107000')) AS migrations_absent,
 to_regclass('public.org_staff_document_groups') IS NULL AND to_regclass('public.uc_goreltech_document_stages') IS NULL AS new_state_absent,
 md5(pg_get_functiondef('public.can_access_organization(uuid,text)'::regprocedure))='2e11495f3d3e6ca261af8a08ed874269' AS canonical_access_reviewed,
 md5(pg_get_functiondef('public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure))='201600eaeb4cb37dcea7791d0716dbb2'
 AND md5(pg_get_functiondef('public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[])'::regprocedure))='72c0bc7f4b6feaba492b305887bafb32' AS compiler_functions_reviewed,
 (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('student_group_memberships_effective','student_group_profiles_effective') AND c.relkind='v' AND 'security_invoker=true'=ANY(c.reloptions)) AS membership_views_invoker,
 (SELECT count(*)=1 AND bool_and(active AND md5(command)='2d7b7e801492efbdf6bfac7f29731273' AND username=current_user AND database=current_database()) FROM cron.job WHERE jobname='process-document-expiry-reminders-daily') AS reminder_job_reviewed,
 has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') AS cron_api_allowed) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'UC stage2 preflight failed: %',r;END IF;END $assert$;
LOCK TABLE public.org_documents,public.incoming_documents,public.education_document_records,public.document_issuance_log,public.program_documents,public.program_folders,public.program_categories,public.program_training_plans,public.frdo_signed_documents,public.student_documents,public.student_identity_documents,public.company_documents,public.group_documents,public.document_signatures,public.signature_revisions,public.signature_comments,public.pep_agreements,public.org_document_versions,public.document_number_sequences,public.organizations,public.profiles,public.companies,public.enrollments,storage.objects,storage.buckets,public.org_staff,public.admin_staff,public.user_roles,public.courses,public.lessons,public.student_groups,public.student_group_memberships,public.enrollment_history,public.test_attempts,public.lesson_progress,public.student_frdo_data,public.journal_instances,public.journal_entries,public.group_class_journal_marks,public.org_contracts,public.goreltech_document_operations IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_scope_before(table_name text PRIMARY KEY,column_list text,row_count bigint,row_hash text) ON COMMIT DROP;
CREATE TEMP TABLE uc_scope_restrictive_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE permissive='RESTRICTIVE' AND schemaname IN('public','storage');
CREATE TEMP TABLE uc_scope_cron_before ON COMMIT DROP AS SELECT jobid,md5((to_jsonb(j)-CASE WHEN jobname='process-document-expiry-reminders-daily' THEN 'active' ELSE '__unchanged__' END)::text) hash FROM cron.job j;
DO $snapshot$ DECLARE t text;cols text;n bigint;h text;BEGIN
 FOREACH t IN ARRAY ARRAY['public.org_documents','public.incoming_documents','public.education_document_records','public.document_issuance_log','public.program_documents','public.program_folders','public.program_categories','public.program_training_plans','public.frdo_signed_documents','public.student_documents','public.student_identity_documents','public.company_documents','public.group_documents','public.document_signatures','public.signature_revisions','public.signature_comments','public.pep_agreements','public.org_document_versions','public.document_number_sequences','public.organizations','public.profiles','public.companies','public.enrollments','storage.objects','storage.buckets','public.org_staff','public.admin_staff','public.user_roles','public.courses','public.lessons','public.student_groups','public.student_group_memberships','public.enrollment_history','public.test_attempts','public.lesson_progress','public.student_frdo_data','public.journal_instances','public.journal_entries','public.group_class_journal_marks','public.org_contracts','public.goreltech_document_operations'] LOOP
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=t::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\n'' ORDER BY to_jsonb(r)::text),'''')) FROM (SELECT %s FROM %s) r',cols,t) INTO n,h;
 INSERT INTO uc_scope_before VALUES(t,cols,n,h);END LOOP;END $snapshot$;
DO $migration_0$ DECLARE source text:=$source_20261018104000$-- UC-003: explicit staff assignments. No inferred/backfilled assignments or document changes.
BEGIN;
DO $preflight$ DECLARE v_name text;BEGIN
 IF to_regprocedure('public.uc_document_org_access(uuid,boolean)') IS NULL
 OR to_regprocedure('public.uc_signature_actor_allowed(uuid,boolean,boolean)') IS NULL
 OR to_regclass('public.org_document_versions') IS NULL
 OR md5(pg_get_functiondef('public.can_access_organization(uuid,text)'::regprocedure))<>'2e11495f3d3e6ca261af8a08ed874269'
 THEN RAISE EXCEPTION 'UC scope foundation baseline missing or changed'; END IF;
 FOREACH v_name IN ARRAY ARRAY['student_group_memberships_effective','student_group_profiles_effective'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=v_name AND c.relkind='v' AND c.reloptions @> ARRAY['security_invoker=true'])
  THEN RAISE EXCEPTION 'UC scope requires security-invoker membership views'; END IF;
 END LOOP;
END;$preflight$;

CREATE UNIQUE INDEX org_staff_document_tenant_key ON public.org_staff(id,organization_id);
CREATE TABLE public.org_staff_document_scopes(
 staff_id uuid PRIMARY KEY,organization_id uuid NOT NULL,revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(staff_id,organization_id) REFERENCES public.org_staff(id,organization_id) ON DELETE CASCADE,
 UNIQUE(staff_id,organization_id));
CREATE TABLE public.org_staff_document_groups(
 staff_id uuid NOT NULL,organization_id uuid NOT NULL,group_id uuid NOT NULL,
 PRIMARY KEY(staff_id,group_id),
 FOREIGN KEY(staff_id,organization_id) REFERENCES public.org_staff_document_scopes(staff_id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(group_id,organization_id) REFERENCES public.student_groups(id,organization_id) ON DELETE CASCADE);
CREATE INDEX org_staff_document_groups_tenant ON public.org_staff_document_groups(organization_id,group_id,staff_id);
CREATE TABLE public.org_staff_document_scope_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),staff_id uuid NOT NULL,organization_id uuid NOT NULL,
 revision bigint NOT NULL,actor_id uuid NOT NULL,old_group_ids uuid[] NOT NULL,new_group_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(staff_id,revision));
ALTER TABLE public.org_staff_document_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_staff_document_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_staff_document_scope_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_staff_document_scopes,public.org_staff_document_groups,public.org_staff_document_scope_events FROM PUBLIC,anon,authenticated,service_role;

-- A global admin with an explicit platform staff row does not inherit mutation rights.
-- Legacy platform owners without a staff row retain their existing access.
CREATE FUNCTION public.uc_document_staff_manager(p_org uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND public.can_access_organization(p_org,CASE WHEN p_write THEN 'staff.write' ELSE 'staff.read' END)
 AND (NOT public.has_role(auth.uid(),'admin'::public.app_role)
 OR NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=auth.uid()
   AND (a.expires_at IS NULL OR a.expires_at>now()) AND (NOT p_write OR a.role IN('super_admin','admin'))));
$fn$;

-- This predicate only narrows existing grants. Being a teacher is not an authorization grant.
CREATE FUNCTION public.uc_document_teacher_limited(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT NOT public.has_role(auth.uid(),'admin'::public.app_role)
 AND EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid() AND s.role='teacher')
 AND NOT public.is_org_owner(auth.uid(),p_org)
 AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid() AND s.organization_id=p_org AND s.role<>'teacher'
  AND (s.expires_at IS NULL OR s.expires_at>now()));
$fn$;
CREATE FUNCTION public.uc_document_scope_allowed(p_org uuid,p_group uuid DEFAULT NULL,p_enrollment uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid;v_course uuid;v_group_course uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR p_org IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org) THEN RETURN false; END IF;
 IF p_group IS NOT NULL THEN
  SELECT course_id INTO v_group_course FROM public.student_groups WHERE id=p_group AND organization_id=p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_group_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=v_group_course AND c.organization_id=p_org) THEN RETURN false; END IF;
 END IF;
 IF p_enrollment IS NOT NULL THEN
  SELECT e.user_id,e.course_id INTO v_user,v_course FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
   WHERE e.id=p_enrollment AND c.organization_id=p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_group IS NOT NULL AND (v_group_course IS DISTINCT FROM v_course OR NOT EXISTS(
   SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=v_user))
  THEN RETURN false; END IF;
 END IF;
 IF public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_org_owner(auth.uid(),p_org) THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=auth.uid()
   AND (s.expires_at IS NULL OR s.expires_at>now())) THEN RETURN false; END IF;
 IF NOT public.uc_document_teacher_limited(p_org) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.org_staff s JOIN public.org_staff_document_groups a ON a.staff_id=s.id AND a.organization_id=s.organization_id
  JOIN public.student_groups g ON g.id=a.group_id AND g.organization_id=a.organization_id
  WHERE s.organization_id=p_org AND s.user_id=auth.uid() AND (s.expires_at IS NULL OR s.expires_at>now())
   AND (p_group IS NULL OR g.id=p_group)
   AND (p_enrollment IS NULL OR (g.course_id=v_course AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m
     WHERE m.organization_id=p_org AND m.group_id=g.id AND m.user_id=v_user)))
   AND (p_group IS NOT NULL OR p_enrollment IS NOT NULL));
END;$fn$;
CREATE FUNCTION public.uc_document_record_scope(p_org uuid,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_enrollment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
  WHERE e.id=p_enrollment AND c.organization_id=p_org AND (p_user IS NULL OR e.user_id=p_user) AND (p_course IS NULL OR e.course_id=p_course)) THEN RETURN false; END IF;
 IF p_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p_course AND c.organization_id=p_org) THEN RETURN false; END IF;
 IF p_group IS NOT NULL AND p_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=p_group AND g.organization_id=p_org AND g.course_id=p_course) THEN RETURN false; END IF;
 IF p_group IS NOT NULL AND p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m
  WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=p_user) THEN RETURN false; END IF;
 RETURN public.uc_document_scope_allowed(p_org,p_group,p_enrollment);
END;$fn$;
CREATE FUNCTION public.uc_document_student_scope_allowed(p_org uuid,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND (
 p_user=auth.uid() OR (NOT public.uc_document_teacher_limited(p_org)) OR EXISTS(
  SELECT 1 FROM public.student_group_memberships_effective m
  WHERE m.organization_id=p_org AND m.user_id=p_user AND public.uc_document_scope_allowed(p_org,m.group_id,NULL)));
$fn$;
CREATE FUNCTION public.uc_document_own_group(p_org uuid,p_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND public.has_role(auth.uid(),'student'::public.app_role)
 AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=auth.uid());
$fn$;
CREATE FUNCTION public.uc_document_contract_scope(p_org uuid,p_group uuid,p_user uuid,p_company uuid,p_students jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE item jsonb;v_user uuid;
BEGIN
 IF p_company IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.id=p_company AND c.organization_id=p_org) THEN RETURN false; END IF;
 IF p_user IS NOT NULL AND p_group IS NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_org)
 AND NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.user_id=p_user AND c.organization_id=p_org)
 THEN RETURN false; END IF;
 IF p_students IS NULL OR jsonb_typeof(p_students)<>'array' THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_students) LOOP
  v_user:=public.storage_try_uuid(item->>'user_id');
  IF v_user IS NULL THEN
   IF public.uc_document_teacher_limited(p_org) OR nullif(item->>'user_id','') IS NOT NULL THEN RETURN false; END IF;
  ELSIF p_group IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=v_user) THEN RETURN false; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=v_user AND p.organization_id=p_org) THEN RETURN false;
  END IF;
 END LOOP;
 RETURN public.uc_document_record_scope(p_org,p_group,NULL,p_user,NULL);
END;$fn$;
CREATE FUNCTION public.uc_document_contract_party(p_org uuid,p_user uuid,p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND
 (p_user=auth.uid() OR EXISTS(SELECT 1 FROM public.companies c WHERE c.id=p_company AND c.organization_id=p_org AND c.user_id=auth.uid()));
$fn$;
CREATE FUNCTION public.uc_document_course_scope_allowed(p_org uuid,p_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND (NOT public.uc_document_teacher_limited(p_org) OR EXISTS(
 SELECT 1 FROM public.student_groups g WHERE g.organization_id=p_org AND g.course_id=p_course
 AND public.uc_document_scope_allowed(p_org,g.id,NULL)));
$fn$;
CREATE FUNCTION public.uc_document_user_course_scope(p_org uuid,p_user uuid,p_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND (p_user=auth.uid()
 OR NOT public.uc_document_teacher_limited(p_org) OR EXISTS(
 SELECT 1 FROM public.enrollments e WHERE e.user_id=p_user AND e.course_id=p_course
 AND public.uc_document_scope_allowed(p_org,NULL,e.id)));
$fn$;

CREATE FUNCTION public.get_org_staff_document_scope(p_organization_id uuid,p_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.org_staff;v_manager boolean;v_groups uuid[];v_available jsonb;v_revision bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'staff_scope_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.org_staff WHERE id=p_staff_id AND organization_id=p_organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_scope_access_denied' USING ERRCODE='42501'; END IF;
 v_manager:=public.uc_document_staff_manager(p_organization_id,false) OR public.uc_document_staff_manager(p_organization_id,true);
 IF NOT v_manager AND NOT (s.user_id=auth.uid() AND (s.expires_at IS NULL OR s.expires_at>now()))
 THEN RAISE EXCEPTION 'staff_scope_access_denied' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(group_id ORDER BY group_id),'{}'::uuid[]) INTO v_groups FROM public.org_staff_document_groups WHERE staff_id=s.id;
 SELECT revision INTO v_revision FROM public.org_staff_document_scopes WHERE staff_id=s.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) ORDER BY g.name,g.id),'[]'::jsonb) INTO v_available
 FROM public.student_groups g WHERE g.organization_id=p_organization_id AND (v_manager OR g.id=ANY(v_groups));
 RETURN jsonb_build_object('staff_id',s.id,'organization_id',s.organization_id,'revision',coalesce(v_revision,0),
 'scope',CASE WHEN s.role='teacher' THEN 'assigned_groups' ELSE 'organization' END,'group_ids',v_groups,'available_groups',v_available);
END;$fn$;
CREATE FUNCTION public.set_org_staff_document_groups(p_organization_id uuid,p_staff_id uuid,p_group_ids uuid[],p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.org_staff;v_groups uuid[];v_old uuid[];v_revision bigint;v_group uuid;
BEGIN
 IF NOT public.uc_document_staff_manager(p_organization_id,true) THEN RAISE EXCEPTION 'staff_scope_access_denied' USING ERRCODE='42501'; END IF;
 IF p_group_ids IS NULL OR array_position(p_group_ids,NULL) IS NOT NULL OR cardinality(p_group_ids)>500
 OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'invalid_staff_scope_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.org_staff WHERE id=p_staff_id AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=s.user_id)
 THEN RAISE EXCEPTION 'staff_scope_access_denied' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}'::uuid[]) INTO v_groups FROM unnest(p_group_ids) x;
 FOREACH v_group IN ARRAY v_groups LOOP
  PERFORM 1 FROM public.student_groups WHERE id=v_group AND organization_id=p_organization_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_scope_group_not_in_organization' USING ERRCODE='42501'; END IF;
 END LOOP;
 SELECT revision INTO v_revision FROM public.org_staff_document_scopes WHERE staff_id=s.id FOR UPDATE;
 v_revision:=coalesce(v_revision,0);
 IF v_revision<>p_expected_revision THEN RAISE EXCEPTION 'staff_scope_revision_conflict' USING ERRCODE='40001'; END IF;
 SELECT coalesce(array_agg(group_id ORDER BY group_id),'{}'::uuid[]) INTO v_old FROM public.org_staff_document_groups WHERE staff_id=s.id;
 -- Repeating an unchanged value with the CURRENT revision is a no-op, not another event.
 IF v_old=v_groups THEN RETURN public.get_org_staff_document_scope(p_organization_id,p_staff_id); END IF;
 INSERT INTO public.org_staff_document_scopes(staff_id,organization_id,revision,updated_by) VALUES(s.id,s.organization_id,v_revision+1,auth.uid())
 ON CONFLICT(staff_id) DO UPDATE SET revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,updated_at=now();
 DELETE FROM public.org_staff_document_groups WHERE staff_id=s.id;
 INSERT INTO public.org_staff_document_groups(staff_id,organization_id,group_id) SELECT s.id,s.organization_id,x FROM unnest(v_groups) x;
 INSERT INTO public.org_staff_document_scope_events(staff_id,organization_id,revision,actor_id,old_group_ids,new_group_ids)
 VALUES(s.id,s.organization_id,v_revision+1,auth.uid(),v_old,v_groups);
 RETURN public.get_org_staff_document_scope(p_organization_id,p_staff_id);
END;$fn$;

-- Exact, existing document provenance; no inference from a title, uploader or recipient name.
CREATE FUNCTION public.uc_document_signature_source_scope(p_org uuid,p_document uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND (
 public.uc_document_scope_allowed(p_org,NULL,NULL)
 OR EXISTS(SELECT 1 FROM public.group_documents d WHERE d.id=p_document AND d.organization_id=p_org
   AND public.uc_document_record_scope(d.organization_id,d.group_id,NULL,d.student_user_id,NULL))
 OR EXISTS(SELECT 1 FROM public.education_document_records d WHERE d.id=p_document AND d.organization_id=p_org
   AND public.uc_document_record_scope(d.organization_id,d.group_id,d.enrollment_id,d.user_id,d.course_id))
 OR EXISTS(SELECT 1 FROM public.student_documents d JOIN public.enrollments e ON e.id=d.enrollment_id JOIN public.courses c ON c.id=e.course_id
   WHERE d.id=p_document AND c.organization_id=p_org AND public.uc_document_scope_allowed(c.organization_id,NULL,e.id))
 OR EXISTS(SELECT 1 FROM public.org_contracts d WHERE d.id=p_document AND d.organization_id=p_org
   AND public.uc_document_contract_scope(d.organization_id,d.student_group_id,d.student_user_id,d.company_id,d.students)));
$fn$;
CREATE FUNCTION public.uc_document_signature_scope(p_signature_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature_id
 AND public.uc_document_signature_source_scope(s.organization_id,s.document_id));
$fn$;
-- Personal recipient access is deliberately separate from organization action scope.
CREATE FUNCTION public.uc_document_signature_read_scope(p_signature_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND
 (public.uc_document_signature_scope(p_signature_id) OR EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature_id AND s.recipient_user_id=auth.uid()));
$fn$;

DO $read_policies$ DECLARE t text;expr text;
BEGIN
 FOREACH t IN ARRAY ARRAY['org_documents','incoming_documents','program_documents','program_folders','program_categories','frdo_signed_documents','education_document_records','document_issuance_log','student_identity_documents','group_documents','program_training_plans'] LOOP
  expr:='NOT public.uc_document_teacher_limited(organization_id)';
  IF t='education_document_records' THEN expr:='user_id=auth.uid() OR public.uc_document_owns_enrollment(enrollment_id,organization_id) OR public.uc_document_record_scope(organization_id,group_id,enrollment_id,user_id,course_id)';
  ELSIF t='document_issuance_log' THEN expr:='user_id=auth.uid() OR public.uc_document_owns_enrollment(enrollment_id,organization_id) OR public.uc_document_record_scope(organization_id,NULL,enrollment_id,user_id,NULL)';
  ELSIF t='student_identity_documents' THEN expr:='public.uc_document_student_scope_allowed(organization_id,user_id)';
  ELSIF t='group_documents' THEN expr:='public.uc_document_record_scope(organization_id,group_id,NULL,student_user_id,NULL)';
  ELSIF t='program_training_plans' THEN expr:='public.uc_document_course_scope_allowed(organization_id,course_id)'; END IF;
  EXECUTE format('CREATE POLICY uc_document_assigned_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)',t,expr);
 END LOOP;
END;$read_policies$;
DO $contracts_preflight$ BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='org_contracts' AND permissive='PERMISSIVE' AND cmd IN('SELECT','ALL'))<>1
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='org_contracts' AND policyname='Org members can view own contracts'
 AND cmd='SELECT' AND qual='((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))')
 THEN RAISE EXCEPTION 'UC scope unreviewed org contracts read policy'; END IF;
END;$contracts_preflight$;
DROP POLICY "Org members can view own contracts" ON public.org_contracts;
CREATE POLICY uc_contract_document_read ON public.org_contracts FOR SELECT TO authenticated
 USING(public.uc_document_org_access(organization_id,false) OR public.uc_document_contract_party(organization_id,student_user_id,company_id));
CREATE POLICY uc_document_assigned_read ON public.org_contracts AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.uc_document_contract_scope(organization_id,student_group_id,student_user_id,company_id,students)
 OR public.uc_document_contract_party(organization_id,student_user_id,company_id));
CREATE POLICY uc_document_assigned_read ON public.student_documents AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=student_documents.enrollment_id
 AND (e.user_id=auth.uid() OR public.uc_document_scope_allowed(c.organization_id,NULL,e.id))));
CREATE POLICY uc_document_assigned_read ON public.company_documents AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.companies c WHERE c.id=company_documents.company_id AND (c.user_id=auth.uid() OR NOT public.uc_document_teacher_limited(c.organization_id))));
CREATE POLICY uc_document_assigned_read ON public.org_document_versions AS RESTRICTIVE FOR SELECT TO authenticated
 USING(NOT public.uc_document_teacher_limited(organization_id));
CREATE POLICY uc_document_assigned_read ON public.document_signatures AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.uc_document_signature_read_scope(id));
CREATE POLICY uc_document_assigned_read ON public.signature_revisions AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.uc_document_signature_read_scope(signature_id));
CREATE POLICY uc_document_assigned_read ON public.signature_comments AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.uc_document_signature_read_scope(signature_id));

-- Journal sources are direct PostgREST reads; a UI group filter cannot be a privacy boundary.
CREATE POLICY uc_document_assigned_read ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.uc_document_student_scope_allowed(organization_id,user_id));
CREATE POLICY uc_document_assigned_read ON public.student_groups AS RESTRICTIVE FOR SELECT TO authenticated
 USING(NOT public.uc_document_teacher_limited(organization_id) OR public.uc_document_scope_allowed(organization_id,id,NULL) OR public.uc_document_own_group(organization_id,id));
CREATE POLICY uc_document_assigned_group_visibility ON public.student_groups FOR SELECT TO authenticated
 USING(public.uc_document_teacher_limited(organization_id)
 AND public.can_access_organization(organization_id,'students.read') AND public.uc_document_scope_allowed(organization_id,id,NULL));
CREATE POLICY uc_document_assigned_read ON public.student_group_memberships AS RESTRICTIVE FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR NOT public.uc_document_teacher_limited(organization_id) OR public.uc_document_scope_allowed(organization_id,group_id,NULL));
CREATE POLICY uc_document_assigned_read ON public.enrollments AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.courses c WHERE c.id=enrollments.course_id AND public.uc_document_user_course_scope(c.organization_id,user_id,c.id)));
CREATE POLICY uc_document_assigned_read ON public.enrollment_history AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.courses c WHERE c.id=enrollment_history.course_id AND public.uc_document_user_course_scope(c.organization_id,user_id,c.id)));
CREATE POLICY uc_document_assigned_history_visibility ON public.enrollment_history FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.courses c WHERE c.id=enrollment_history.course_id
 AND public.uc_document_teacher_limited(c.organization_id) AND public.can_access_organization(c.organization_id,'students.read')
 AND public.uc_document_user_course_scope(c.organization_id,enrollment_history.user_id,c.id)));
CREATE POLICY uc_document_assigned_read ON public.test_attempts AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id=l.course_id WHERE l.id=test_attempts.lesson_id AND public.uc_document_user_course_scope(c.organization_id,user_id,c.id)));
CREATE POLICY uc_document_assigned_read ON public.lesson_progress AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id=l.course_id WHERE l.id=lesson_progress.lesson_id AND public.uc_document_user_course_scope(c.organization_id,user_id,c.id)));
CREATE POLICY uc_document_assigned_read ON public.student_frdo_data AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.uc_document_student_scope_allowed(organization_id,user_id));
CREATE POLICY uc_document_assigned_read ON public.journal_instances AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.uc_document_course_scope_allowed(organization_id,course_id));
CREATE POLICY uc_document_assigned_read ON public.journal_entries AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_entries.journal_id
 AND public.uc_document_student_scope_allowed(j.organization_id,user_id)
 AND public.uc_document_user_course_scope(j.organization_id,user_id,j.course_id)));
CREATE POLICY uc_document_assigned_read ON public.group_class_journal_marks AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.uc_document_scope_allowed(organization_id,group_id,NULL));
CREATE FUNCTION public.uc_document_journal_write_scope(p_org uuid,p_course uuid,p_user uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND public.can_access_organization(p_org,'journals.write')
 AND (NOT public.has_role(auth.uid(),'admin'::public.app_role)
   OR NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=auth.uid())
   OR EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=auth.uid() AND a.role IN('super_admin','admin') AND (a.expires_at IS NULL OR a.expires_at>now())))
 AND CASE WHEN p_user IS NULL THEN public.uc_document_course_scope_allowed(p_org,p_course)
 ELSE public.uc_document_user_course_scope(p_org,p_user,p_course) END;
$fn$;
DO $journal_writes$ DECLARE op text;expr text;t text;BEGIN
 FOREACH t IN ARRAY ARRAY['journal_instances','journal_entries'] LOOP
  expr:=CASE WHEN t='journal_instances' THEN 'public.uc_document_journal_write_scope(organization_id,course_id,NULL)'
   ELSE 'EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_entries.journal_id AND public.uc_document_journal_write_scope(j.organization_id,j.course_id,journal_entries.user_id))' END;
  FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
   EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated%s%s',
   'uc_document_assigned_'||lower(op),t,op,CASE WHEN op<>'INSERT' THEN ' USING ('||expr||')' ELSE '' END,
   CASE WHEN op<>'DELETE' THEN ' WITH CHECK ('||expr||')' ELSE '' END);
  END LOOP;
 END LOOP;
END;$journal_writes$;

-- Existing private bucket paths are retained. Unbound organization-wide blobs cannot be
-- promoted to a teacher's group merely by knowing a path or being the original uploader.
CREATE FUNCTION public.uc_document_storage_scope(p_bucket text,p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_org uuid;v_user uuid;v_enrollment uuid;v_group uuid;
BEGIN
 IF p_bucket NOT IN('student-documents','company-documents','billing-documents','org-documents','incoming-documents','program-documents','frdo-documents','signed-documents','external-contracts') THEN RETURN true; END IF;
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid() AND s.role='teacher')
 OR public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN true; END IF;
 IF p_bucket='student-documents' THEN
  IF split_part(p_name,'/',1)='students' THEN
   v_enrollment:=public.storage_try_uuid(split_part(p_name,'/',2));
   SELECT c.organization_id,e.user_id INTO v_org,v_user FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=v_enrollment;
   RETURN v_user=auth.uid() OR (v_org IS NOT NULL AND (NOT public.uc_document_teacher_limited(v_org) OR public.uc_document_scope_allowed(v_org,NULL,v_enrollment)));
  END IF;
  IF split_part(p_name,'/',1) IN('avatars','support') THEN
   v_user:=public.storage_try_uuid(split_part(split_part(p_name,'/',2),'.',1));
  ELSE v_user:=public.storage_try_uuid(split_part(p_name,'/',1)); END IF;
  IF v_user=auth.uid() THEN RETURN true; END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE user_id=v_user;
  RETURN v_org IS NOT NULL AND public.uc_document_student_scope_allowed(v_org,v_user);
 ELSIF p_bucket='company-documents' THEN
  SELECT c.organization_id,c.user_id INTO v_org,v_user FROM public.companies c WHERE c.id=public.storage_try_uuid(split_part(p_name,'/',1));
  RETURN v_user=auth.uid() OR (v_org IS NOT NULL AND NOT public.uc_document_teacher_limited(v_org));
 ELSIF p_bucket IN('signed-documents','external-contracts') AND EXISTS(
  SELECT 1 FROM public.document_signatures s WHERE public.uc_document_signature_read_scope(s.id) AND s.organization_id::text=split_part(p_name,'/',1)
   AND (s.signed_document_path=p_name AND p_bucket='signed-documents'
     OR s.handwritten_scan_path=p_name AND p_bucket='external-contracts'
     OR s.signed_source_bucket=p_bucket AND s.signed_source_path=p_name
     OR p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.signature_revisions r WHERE r.signature_id=s.id
       AND (r.file_url=p_name OR right(split_part(r.file_url,'?',1),length('/external-contracts/'||p_name))='/external-contracts/'||p_name))))
 THEN RETURN true;
 END IF;
 IF p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.document_signatures s
  WHERE s.recipient_user_id=auth.uid() AND s.deleted_at IS NULL AND s.expires_at>now()
   AND s.status IN('sent','viewed','in_review') AND
   left(p_name,length(s.organization_id::text||'/signed-scans/'||s.id::text||'-'))=s.organization_id::text||'/signed-scans/'||s.id::text||'-')
 THEN RETURN true; END IF;
 IF split_part(p_name,'/',1)='organizations' THEN
  v_org:=public.storage_try_uuid(split_part(p_name,'/',2));
  IF p_bucket='billing-documents' AND split_part(p_name,'/',3)='group-documents' THEN
   v_group:=public.storage_try_uuid(split_part(p_name,'/',4));
   RETURN public.uc_document_scope_allowed(v_org,v_group,NULL) AND v_group IS NOT NULL AND split_part(p_name,'/',5)<>'';
  END IF;
 ELSE v_org:=public.storage_try_uuid(split_part(p_name,'/',1)); END IF;
 IF v_org IS NULL THEN RETURN false; END IF;
 IF NOT public.uc_document_teacher_limited(v_org) THEN RETURN true; END IF;
 IF p_bucket='billing-documents' THEN
  IF split_part(p_name,'/',2)='contracts' AND split_part(p_name,'/',4)<>'' AND split_part(p_name,'/',5)<>'' THEN
   v_group:=public.storage_try_uuid(split_part(p_name,'/',3));
   RETURN v_group IS NOT NULL AND public.uc_document_scope_allowed(v_org,v_group,NULL);
  END IF;
  RETURN EXISTS(SELECT 1 FROM public.group_documents d WHERE d.organization_id=v_org AND d.file_path=p_name
   AND public.uc_document_record_scope(d.organization_id,d.group_id,NULL,d.student_user_id,NULL))
   OR EXISTS(SELECT 1 FROM public.org_contracts d WHERE d.organization_id=v_org AND p_name IN(d.file_path,d.docx_path,d.pdf_path)
   AND public.uc_document_contract_scope(d.organization_id,d.student_group_id,d.student_user_id,d.company_id,d.students));
 END IF;
 RETURN false;
END;$fn$;
CREATE POLICY uc_document_assigned_storage_read ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(public.uc_document_storage_scope(bucket_id,name));
CREATE POLICY uc_document_assigned_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(public.uc_document_storage_scope(bucket_id,name));
CREATE POLICY uc_document_assigned_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(public.uc_document_storage_scope(bucket_id,name)) WITH CHECK(public.uc_document_storage_scope(bucket_id,name));
CREATE POLICY uc_document_assigned_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(public.uc_document_storage_scope(bucket_id,name));

DO $acl$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('uc_document_staff_manager','uc_document_teacher_limited','uc_document_scope_allowed',
 'uc_document_student_scope_allowed','uc_document_course_scope_allowed','uc_document_user_course_scope','get_org_staff_document_scope',
 'set_org_staff_document_groups','uc_document_signature_source_scope','uc_document_signature_scope','uc_document_signature_read_scope','uc_document_storage_scope','uc_document_journal_write_scope','uc_document_record_scope','uc_document_own_group','uc_document_contract_scope','uc_document_contract_party') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',f.signature);
 END LOOP;
END;$acl$;
-- Safe for unrelated public buckets; the function explicitly denies unauthenticated document access.
GRANT EXECUTE ON FUNCTION public.uc_document_storage_scope(text,text) TO anon;

-- Preserve pagination and business calculations while closing SECURITY DEFINER read bypasses.
DO $rpc_scope$ DECLARE src text; BEGIN
 SELECT pg_get_functiondef('public.get_documents_kpi(uuid)'::regprocedure) INTO src;
 IF md5(src)<>'73c86ecdf4d6f5205cbe40e50c61f48c' THEN RAISE EXCEPTION 'UC scope unreviewed RPC get_documents_kpi'; END IF;
 IF (length(src)-length(replace(src,$old$BEGIN
$old$,'')))/length($old$BEGIN
$old$)<>1 THEN RAISE EXCEPTION 'UC scope RPC marker changed'; END IF;
 src:=replace(src,$old$BEGIN
$old$,$new$BEGIN
  IF NOT public.uc_document_scope_allowed(p_organization_id,NULL,NULL) THEN RAISE EXCEPTION 'organization_wide_document_scope_required' USING ERRCODE='42501'; END IF;
$new$);
 EXECUTE src;
 SELECT pg_get_functiondef('public.get_frdo_export_readiness(uuid)'::regprocedure) INTO src;
 IF md5(src)<>'728c414ddc92c8f3186e8e78991ac194' THEN RAISE EXCEPTION 'UC scope unreviewed RPC get_frdo_export_readiness'; END IF;
 IF (length(src)-length(replace(src,$old$BEGIN
$old$,'')))/length($old$BEGIN
$old$)<>1 THEN RAISE EXCEPTION 'UC scope RPC marker changed'; END IF;
 src:=replace(src,$old$BEGIN
$old$,$new$BEGIN
  IF NOT public.uc_document_scope_allowed(p_organization_id,NULL,NULL) THEN RAISE EXCEPTION 'organization_wide_document_scope_required' USING ERRCODE='42501'; END IF;
$new$);
 EXECUTE src;
 SELECT pg_get_functiondef('public.list_recycle_bin(uuid,text,integer,integer)'::regprocedure) INTO src;
 IF md5(src)<>'6d7ef80fe942d4b9fe916639732e52a2' THEN RAISE EXCEPTION 'UC scope unreviewed RPC list_recycle_bin'; END IF;
 IF (length(src)-length(replace(src,$old$BEGIN
$old$,'')))/length($old$BEGIN
$old$)<>1 THEN RAISE EXCEPTION 'UC scope RPC marker changed'; END IF;
 src:=replace(src,$old$BEGIN
$old$,$new$BEGIN
  IF NOT public.uc_document_scope_allowed(p_organization_id,NULL,NULL) THEN RAISE EXCEPTION 'organization_wide_document_scope_required' USING ERRCODE='42501'; END IF;
$new$);
 EXECUTE src;
 SELECT pg_get_functiondef('public.get_course_students_page(uuid,integer,integer,text,text)'::regprocedure) INTO src;
 IF md5(src)<>'5bbd759bb24c96ce777c9d7a4d45e62b' THEN RAISE EXCEPTION 'UC scope unreviewed RPC get_course_students_page'; END IF;
 IF (length(src)-length(replace(src,$old$WHERE e.course_id = p_course_id AND NOT EXISTS$old$,'')))/length($old$WHERE e.course_id = p_course_id AND NOT EXISTS$old$)<>2 THEN RAISE EXCEPTION 'UC scope RPC marker changed'; END IF;
 src:=replace(src,$old$WHERE e.course_id = p_course_id AND NOT EXISTS$old$,$new$WHERE e.course_id = p_course_id AND public.uc_document_scope_allowed(v_org,NULL,e.id) AND NOT EXISTS$new$);
 EXECUTE src;
 SELECT pg_get_functiondef('public.get_organization_student_group_counts(uuid)'::regprocedure) INTO src;
 IF md5(src)<>'2ac1ed379fbd78efd661e1a072604f3a' THEN RAISE EXCEPTION 'UC scope unreviewed RPC get_organization_student_group_counts'; END IF;
 IF (length(src)-length(replace(src,$old$FROM bindings b GROUP BY b.group_id$old$,'')))/length($old$FROM bindings b GROUP BY b.group_id$old$)<>1 THEN RAISE EXCEPTION 'UC scope RPC marker changed'; END IF;
 src:=replace(src,$old$FROM bindings b GROUP BY b.group_id$old$,$new$FROM bindings b WHERE NOT public.uc_document_teacher_limited(p_organization_id) OR public.uc_document_scope_allowed(p_organization_id,b.group_id,NULL) GROUP BY b.group_id$new$);
 EXECUTE src;
 SELECT pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure) INTO src;
 IF md5(src)<>'ee40a538ea07e51b2ffad3ef65c07017' THEN RAISE EXCEPTION 'UC scope unreviewed RPC get_organization_students_page'; END IF;
 IF (length(src)-length(replace(src,$old$WHERE p.organization_id = p_organization_id AND NOT EXISTS$old$,'')))/length($old$WHERE p.organization_id = p_organization_id AND NOT EXISTS$old$)<>2 THEN RAISE EXCEPTION 'UC scope RPC marker changed'; END IF;
 src:=replace(src,$old$WHERE p.organization_id = p_organization_id AND NOT EXISTS$old$,$new$WHERE p.organization_id = p_organization_id AND public.uc_document_student_scope_allowed(p_organization_id,p.user_id) AND NOT EXISTS$new$);
 IF (length(src)-length(replace(src,$old$WHERE c.organization_id = p_organization_id
$old$,'')))/length($old$WHERE c.organization_id = p_organization_id
$old$)<>1 THEN RAISE EXCEPTION 'UC scope RPC marker changed'; END IF;
 src:=replace(src,$old$WHERE c.organization_id = p_organization_id
$old$,$new$WHERE c.organization_id = p_organization_id AND public.uc_document_scope_allowed(p_organization_id,NULL,e.id)
$new$);
 IF (length(src)-length(replace(src,$old$p.student_group_id, p.last_visit_at$old$,'')))/length($old$p.student_group_id, p.last_visit_at$old$)<>1 THEN RAISE EXCEPTION 'UC scope RPC marker changed'; END IF;
 src:=replace(src,$old$p.student_group_id, p.last_visit_at$old$,$new$CASE WHEN public.uc_document_teacher_limited(p.organization_id) AND NOT public.uc_document_scope_allowed(p.organization_id,p.student_group_id,NULL) THEN NULL ELSE p.student_group_id END AS student_group_id, p.last_visit_at$new$);
 EXECUTE src;
END;$rpc_scope$;

-- Existing cell CAS, primary membership and group/date locks remain unchanged.
DO $journal_rpc$ DECLARE src text;BEGIN
 SELECT pg_get_functiondef('public.save_group_class_journal_mark(uuid,uuid,uuid,uuid,integer,text,integer,text)'::regprocedure) INTO src;
 IF md5(src)<>'c4b6249a0a343bd3f4902137bc5196c0' THEN RAISE EXCEPTION 'UC scope unreviewed journal RPC'; END IF;
 src:=replace(src,$old$BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
$old$,$new$BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.uc_document_scope_allowed(p_organization_id,p_group_id,NULL)
   OR NOT public.uc_document_org_access(p_organization_id,true)
   OR (public.has_role(auth.uid(),'admin'::public.app_role)
     AND EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=auth.uid())
     AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=auth.uid()
       AND a.role IN('super_admin','admin') AND (a.expires_at IS NULL OR a.expires_at>now())))
  THEN RAISE EXCEPTION 'group_journal_scope_denied' USING ERRCODE='42501'; END IF;
$new$);
 EXECUTE src;
END;$journal_rpc$;
DO $postcheck$ BEGIN
 IF EXISTS(SELECT 1 FROM public.org_staff_document_groups) OR EXISTS(SELECT 1 FROM public.org_staff_document_scopes)
 OR EXISTS(SELECT 1 FROM public.org_staff_document_scope_events) THEN RAISE EXCEPTION 'UC scope unexpected assignment backfill'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE policyname='uc_document_assigned_read')<>29
 THEN RAISE EXCEPTION 'UC scope read fence count mismatch'; END IF;
END;$postcheck$;
COMMIT;

$source_20261018104000$;executable text;BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'c5d0538638fbaf0343612c13e7583510' THEN RAISE EXCEPTION 'Source hash mismatch 20261018104000';END IF;
 executable:=regexp_replace(regexp_replace(source,E'(?m)^BEGIN( ISOLATION LEVEL REPEATABLE READ)?;\r?$','','g'),E'(?m)^COMMIT;\r?$','','g');
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'320307b1ec9d392f8a75e7356b73fcc2' THEN RAISE EXCEPTION 'Executable hash mismatch 20261018104000';END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018104000','uc_document_staff_scope',ARRAY[source]);
 END $migration_0$;
DO $migration_1$ DECLARE source text:=$source_20261018105000$-- UC-003 stage 2. New action grants; no permission JSON or business-row backfill.
-- Requires released foundation 100--103 and reviewed group scopes 104.
DO $prerequisites$
BEGIN
 IF to_regprocedure('public.uc_document_scope_allowed(uuid,uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_document_signature_scope(uuid)') IS NULL
  OR to_regprocedure('public.uc_document_signature_source_scope(uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_document_record_scope(uuid,uuid,uuid,uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_document_contract_scope(uuid,uuid,uuid,uuid,jsonb)') IS NULL
  OR to_regprocedure('public.uc_document_student_scope_allowed(uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text)') IS NULL THEN
  RAISE EXCEPTION 'UC action permissions require the released foundation and group scopes'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('public.org_role_default_permissions(text)','f2b39953a0c439d75079d72d5e103247'),
  ('public.uc_guard_signature_integrity()','65d9e7ac959c7af8e3d7729837d426e4'),
  ('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','069a8805ac893e668811954b0020b9e6'),
  ('public.get_next_document_number(uuid,text,integer)','8912e499fc96392d7b17596c8cbc4f22'),
  ('public.next_reg_number(uuid,text,integer)','05a451485383ac5d51f9812aae0ade29')
 ) expected(signature,definition_md5) WHERE to_regprocedure(signature) IS NULL
  OR md5(pg_get_functiondef(to_regprocedure(signature)))<>definition_md5) THEN
  RAISE EXCEPTION 'UC action permissions: unreviewed released foundation'; END IF;
END;$prerequisites$;

CREATE FUNCTION public.uc_platform_document_action_allowed(p_user uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_user IS NOT NULL AND p_action IN ('read','write','sign','issue')
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (NOT public.has_role('admin'::public.app_role,p_user)
  OR NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user)
  OR EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user AND
     (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager'))
     AND (expires_at IS NULL OR expires_at>now()))
   AND NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user
     AND (NOT (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager')) OR expires_at<=now())))
$fn$;
CREATE FUNCTION public.uc_platform_sales_action_allowed(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (NOT public.has_role('admin'::public.app_role,p_user)
  OR NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user)
  OR EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user AND role IN ('super_admin','admin','sales_manager')
     AND (expires_at IS NULL OR expires_at>now()))
   AND NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user
     AND (role NOT IN ('super_admin','admin','sales_manager') OR expires_at<=now())))
$fn$;
CREATE FUNCTION public.uc_document_has_action(p_org uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_platform_document_action_allowed(auth.uid(),p_action)
  AND public.account_deletion_access_allowed()
  AND p_org IS NOT NULL AND p_action IN ('read','write','sign','issue')
  AND coalesce(public.can_access_organization(p_org,'documents.'||p_action),false)
$fn$;
CREATE FUNCTION public.uc_document_action_allowed(p_org uuid,p_action text,p_group uuid DEFAULT NULL,p_enrollment uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_document_has_action(p_org,p_action)
  AND public.uc_document_scope_allowed(p_org,p_group,p_enrollment)
$fn$;
CREATE FUNCTION public.uc_document_commercial_creation_allowed(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_platform_sales_action_allowed(auth.uid()) AND public.account_deletion_access_allowed()
  AND coalesce(public.can_access_organization(p_org,'sales.write'),false)
  AND public.uc_document_scope_allowed(p_org,NULL,NULL)
$fn$;
REVOKE ALL ON FUNCTION public.uc_platform_document_action_allowed(uuid,text),public.uc_platform_sales_action_allowed(uuid),
 public.uc_document_has_action(uuid,text),public.uc_document_action_allowed(uuid,text,uuid,uuid),
 public.uc_document_commercial_creation_allowed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_platform_document_action_allowed(uuid,text),public.uc_platform_sales_action_allowed(uuid),
 public.uc_document_has_action(uuid,text),public.uc_document_action_allowed(uuid,text,uuid,uuid),
 public.uc_document_commercial_creation_allowed(uuid) TO authenticated,service_role;

-- Existing canonical aliases still normalize only view/manage. Write never
-- implies sign or issue; adding role defaults does not rewrite stored grants.
DO $defaults$ DECLARE source text; replacement text; needle text;
BEGIN
 source:=pg_get_functiondef('public.org_role_default_permissions(text)'::regprocedure);
 needle:='''documents.read'',''documents.write'',''journals.read''';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>2 THEN
  RAISE EXCEPTION 'Unreviewed organization role defaults'; END IF;
 replacement:=replace(source,needle,'''documents.read'',''documents.write'',''documents.sign'',''documents.issue'',''journals.read''');
 EXECUTE replacement;
END;$defaults$;
CREATE OR REPLACE FUNCTION public.uc_document_org_access(p_org uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_document_has_action(p_org,CASE WHEN p_write THEN 'write' ELSE 'read' END)
$fn$;

CREATE FUNCTION public.uc_signature_commercial_sender_allowed(p_signature uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND EXISTS(SELECT 1 FROM public.document_signatures s
  WHERE s.id=p_signature AND s.deleted_at IS NULL AND s.sender_user_id=auth.uid()
   AND s.document_type IN ('contract','external_upload','act')
   AND public.uc_document_commercial_creation_allowed(s.organization_id))
$fn$;
CREATE FUNCTION public.uc_signature_action_allowed(p_signature uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_action IN ('read','write','sign') AND public.account_deletion_access_allowed()
  AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature AND s.deleted_at IS NULL
   AND (public.uc_document_has_action(s.organization_id,p_action) AND public.uc_document_signature_scope(s.id)
    OR public.uc_signature_commercial_sender_allowed(s.id)))
$fn$;
CREATE OR REPLACE FUNCTION public.uc_signature_actor_allowed(p_signature_id uuid,p_write boolean DEFAULT false,p_recipient boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND (
  public.uc_signature_action_allowed(p_signature_id,CASE WHEN p_write THEN 'write' ELSE 'read' END)
  OR p_recipient AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature_id
   AND s.deleted_at IS NULL AND s.recipient_user_id=auth.uid()))
$fn$;
REVOKE ALL ON FUNCTION public.uc_signature_commercial_sender_allowed(uuid),public.uc_signature_action_allowed(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_signature_commercial_sender_allowed(uuid),public.uc_signature_action_allowed(uuid,text) TO authenticated,service_role;
DROP POLICY uc_signatures_read ON public.document_signatures;
CREATE POLICY uc_signatures_read ON public.document_signatures FOR SELECT TO authenticated
 USING(public.uc_signature_actor_allowed(id,false,true));

-- A sign-only original sender may countersign through the narrow RPC without
-- acquiring edit rights. Keep every released immutable-evidence check intact.
DO $signature_guard$ DECLARE source text; replacement text; needle text;
BEGIN
 source:=pg_get_functiondef('public.uc_guard_signature_integrity()'::regprocedure);
 needle:='IF NOT v_service AND NOT public.uc_signature_actor_allowed(OLD.id,true,false) THEN';
 replacement:=replace(source,needle,
  'IF NOT v_service AND NOT public.uc_signature_actor_allowed(OLD.id,true,false) AND NOT ('||
  'OLD.status=''signed'' AND public.uc_signature_action_allowed(OLD.id,''sign'') AND '||
  'current_setting(''sintagma.signature_countersigning_id'',true)=OLD.id::text AND '||
  '(to_jsonb(NEW)-ARRAY[''sender_signed_at'',''sender_signed_ip'',''sender_signed_user_agent'',''updated_at''])='||
  '(to_jsonb(OLD)-ARRAY[''sender_signed_at'',''sender_signed_ip'',''sender_signed_user_agent'',''updated_at''])) THEN');
 IF replacement=source THEN RAISE EXCEPTION 'Unreviewed released signature guard entry'; END IF;
 source:=replacement;
 replacement:=replace(source,'AND public.uc_signature_actor_allowed(OLD.id,true,false) THEN',
  'AND public.uc_signature_action_allowed(OLD.id,''sign'') THEN');
 IF replacement=source THEN RAISE EXCEPTION 'Unreviewed released countersign append guard'; END IF;
 EXECUTE replacement;
END;$signature_guard$;
CREATE OR REPLACE FUNCTION public.sender_countersign(p_signature_id uuid,p_ip text DEFAULT NULL,p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE; h jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'Auth required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE id=p_signature_id FOR UPDATE;
 IF NOT FOUND OR s.deleted_at IS NOT NULL OR s.sender_user_id IS DISTINCT FROM auth.uid()
  OR NOT public.uc_signature_action_allowed(s.id,'sign') THEN RAISE EXCEPTION 'Document sign permission required' USING ERRCODE='42501'; END IF;
 IF s.status<>'signed' THEN RAISE EXCEPTION 'Recipient must sign first' USING ERRCODE='55000'; END IF;
 IF s.sender_signed_at IS NOT NULL THEN RETURN; END IF;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 PERFORM set_config('sintagma.signature_countersigning_id',s.id::text,true);
 UPDATE public.document_signatures SET sender_signed_at=clock_timestamp(),
  sender_signed_ip=left(trim(split_part(h->>'x-forwarded-for',',',1)),200),
  sender_signed_user_agent=left(h->>'user-agent',2000) WHERE id=s.id AND sender_signed_at IS NULL;
END;$fn$;

CREATE FUNCTION public.uc_guard_signature_actions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_service boolean:=coalesce(auth.role(),'')='service_role'; v_id uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  -- The service sales handler verifies the actual sender via the user client.
  -- Even service inserts cannot appoint a read-only platform viewer as sender.
  IF NOT public.uc_platform_document_action_allowed(NEW.sender_user_id,'write')
    AND NOT (NEW.document_type IN ('contract','external_upload','act') AND public.uc_platform_sales_action_allowed(NEW.sender_user_id)) THEN
   RAISE EXCEPTION 'Sender platform document access denied' USING ERRCODE='42501'; END IF;
  IF NOT v_service AND NOT (public.uc_document_has_action(NEW.organization_id,'write') AND public.uc_document_signature_source_scope(NEW.organization_id,NEW.document_id)
    OR NEW.document_type IN ('contract','external_upload','act') AND public.uc_document_commercial_creation_allowed(NEW.organization_id)) THEN
   RAISE EXCEPTION 'Document write scope required' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 v_id:=OLD.id;
 IF TG_OP='UPDATE' AND NEW.document_id IS DISTINCT FROM OLD.document_id AND NOT (
   (public.uc_document_has_action(NEW.organization_id,'write') OR public.uc_signature_commercial_sender_allowed(v_id))
   AND public.uc_document_signature_source_scope(NEW.organization_id,NEW.document_id)) THEN
  RAISE EXCEPTION 'New signature source scope denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.sender_signed_at,NEW.sender_signed_ip,NEW.sender_signed_user_agent)
   IS DISTINCT FROM (OLD.sender_signed_at,OLD.sender_signed_ip,OLD.sender_signed_user_agent) THEN
  IF NOT public.uc_signature_action_allowed(v_id,'sign') OR current_setting('sintagma.signature_countersigning_id',true) IS DISTINCT FROM v_id::text THEN
   RAISE EXCEPTION 'Use authorized countersign RPC' USING ERRCODE='42501'; END IF;
 ELSIF NOT v_service THEN
  IF TG_OP='UPDATE' AND OLD.recipient_user_id=auth.uid() AND
   (to_jsonb(NEW)-ARRAY['hidden_for_recipient','updated_at'])=(to_jsonb(OLD)-ARRAY['hidden_for_recipient','updated_at']) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.status='changes_requested' AND
   (to_jsonb(NEW)-ARRAY['status','rejection_reason','updated_at'])=(to_jsonb(OLD)-ARRAY['status','rejection_reason','updated_at']) THEN RETURN NEW; END IF;
  -- An authenticated recipient may supply the reviewed revision; invitation
  -- token finalization itself remains protected by the released service RPC.
  IF TG_OP='UPDATE' AND OLD.recipient_user_id=auth.uid() AND OLD.status IN ('sent','viewed','in_review','changes_requested')
    AND (to_jsonb(NEW)-ARRAY['document_html','document_hash','current_revision_id','status','updated_at'])=
        (to_jsonb(OLD)-ARRAY['document_html','document_hash','current_revision_id','status','updated_at']) THEN RETURN NEW; END IF;
  IF NOT public.uc_signature_action_allowed(v_id,'write') THEN RAISE EXCEPTION 'Document write scope required' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_signature_actions() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_signature_operation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_signatures
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_actions();

-- Action checks also cover SECURITY DEFINER triggers/RPCs and soft-delete RPCs.
-- Rejecting the legacy auto-issuer rolls back its subtransaction/counters; its
-- existing EXCEPTION handler preserves the learner's completed enrollment.
CREATE FUNCTION public.uc_document_row_action_allowed(p_table text,p_row jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_org uuid; v_enrollment uuid; v_group uuid; v_user uuid; v_action text:='write';
BEGIN
 v_org:=nullif(p_row->>'organization_id','')::uuid;
 v_enrollment:=nullif(p_row->>'enrollment_id','')::uuid;
 v_group:=nullif(p_row->>'group_id','')::uuid;
 v_user:=nullif(p_row->>'user_id','')::uuid;
 IF p_table IN ('education_document_records','document_issuance_log') THEN v_action:='issue';
 ELSIF p_table='group_documents' AND p_row->>'doc_status'='final' AND p_row->>'doc_type' IN ('enrollment_order','expulsion_order') THEN v_action:='issue'; END IF;
 IF p_table='company_documents' THEN SELECT organization_id INTO v_org FROM public.companies WHERE id=(p_row->>'company_id')::uuid;
 ELSIF p_table='org_contracts' THEN
  RETURN public.uc_document_has_action(v_org,'write') AND public.uc_document_contract_scope(v_org,
   nullif(p_row->>'student_group_id','')::uuid,nullif(p_row->>'student_user_id','')::uuid,nullif(p_row->>'company_id','')::uuid,p_row->'students');
 ELSIF p_table='program_training_plans' THEN SELECT organization_id INTO v_org FROM public.courses WHERE id=(p_row->>'course_id')::uuid;
 ELSIF p_table='student_documents' THEN SELECT c.organization_id INTO v_org FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=v_enrollment;
 ELSIF p_table='student_identity_documents' THEN
  RETURN public.account_deletion_access_allowed() AND (
   v_user=auth.uid() AND public.uc_document_student_in_org(v_user,v_org)
   OR public.uc_document_has_action(v_org,'write') AND public.uc_document_student_scope_allowed(v_org,v_user));
 END IF;
 IF p_table IN ('education_document_records','document_issuance_log') THEN
  RETURN public.uc_document_has_action(v_org,'issue') AND public.uc_document_record_scope(v_org,v_group,v_enrollment,v_user,nullif(p_row->>'course_id','')::uuid);
 ELSIF p_table='group_documents' THEN
  RETURN public.uc_document_has_action(v_org,v_action) AND public.uc_document_record_scope(v_org,v_group,NULL,nullif(p_row->>'student_user_id','')::uuid,NULL);
 END IF;
 RETURN public.uc_document_action_allowed(v_org,v_action,v_group,v_enrollment);
END;$fn$;
CREATE FUNCTION public.uc_guard_document_actions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_TABLE_NAME='group_documents' AND TG_OP='UPDATE' AND
  (to_jsonb(NEW)-ARRAY['is_current','updated_at'])=(to_jsonb(OLD)-ARRAY['is_current','updated_at']) THEN
  IF NOT public.uc_document_action_allowed(OLD.organization_id,'write',OLD.group_id,NULL) THEN
   RAISE EXCEPTION 'Document version scope denied' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND NOT public.uc_document_row_action_allowed(TG_TABLE_NAME,to_jsonb(OLD)) THEN
  RAISE EXCEPTION 'Document action or group scope denied' USING ERRCODE='42501'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND NOT public.uc_document_row_action_allowed(TG_TABLE_NAME,to_jsonb(NEW)) THEN
  RAISE EXCEPTION 'Document action or group scope denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_document_row_action_allowed(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_document_row_action_allowed(text,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.uc_guard_document_actions() FROM PUBLIC,anon,authenticated;
DO $row_actions$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents',
  'program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents','org_contracts'] LOOP
  EXECUTE format('CREATE TRIGGER uc_document_action_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_guard_document_actions()',t);
  -- Issue-only grants need a permissive insert/update path independent of write;
  -- action triggers and 104 restrictive scopes remain an additional boundary.
  IF t IN ('education_document_records','document_issuance_log') THEN
   EXECUTE format('DROP POLICY uc_documents_insert ON public.%I',t);
   EXECUTE format('DROP POLICY uc_documents_update ON public.%I',t);
   EXECUTE format('DROP POLICY uc_documents_delete ON public.%I',t);
   EXECUTE format('CREATE POLICY uc_documents_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(public.uc_document_row_action_allowed(%L,to_jsonb(%I.*)))',t,t,t);
   EXECUTE format('CREATE POLICY uc_documents_update ON public.%I FOR UPDATE TO authenticated USING(public.uc_document_row_action_allowed(%L,to_jsonb(%I.*))) WITH CHECK(public.uc_document_row_action_allowed(%L,to_jsonb(%I.*)))',t,t,t,t,t);
   EXECUTE format('CREATE POLICY uc_documents_delete ON public.%I FOR DELETE TO authenticated USING(public.uc_document_row_action_allowed(%L,to_jsonb(%I.*)))',t,t,t);
  END IF;
 END LOOP;
END;$row_actions$;
DO $contracts_write_preflight$
BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='org_contracts' AND permissive='PERMISSIVE' AND cmd IN('INSERT','UPDATE','DELETE','ALL'))<>3
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='org_contracts' AND permissive='PERMISSIVE' AND cmd IN('INSERT','UPDATE','DELETE') AND
   (roles<>ARRAY['authenticated']::name[] OR policyname<>CASE cmd WHEN 'INSERT' THEN 'Org members can insert own contracts' WHEN 'UPDATE' THEN 'Org members can update own contracts' ELSE 'Org members can delete own contracts' END
    OR coalesce(qual,with_check)<>'((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))')) THEN
  RAISE EXCEPTION 'UC actions unreviewed org contracts write policies'; END IF;
END;$contracts_write_preflight$;
DROP POLICY "Org members can insert own contracts" ON public.org_contracts;
DROP POLICY "Org members can update own contracts" ON public.org_contracts;
DROP POLICY "Org members can delete own contracts" ON public.org_contracts;
CREATE POLICY uc_contract_documents_insert ON public.org_contracts FOR INSERT TO authenticated
 WITH CHECK(public.uc_document_row_action_allowed('org_contracts',to_jsonb(org_contracts.*)));
CREATE POLICY uc_contract_documents_update ON public.org_contracts FOR UPDATE TO authenticated
 USING(public.uc_document_row_action_allowed('org_contracts',to_jsonb(org_contracts.*)))
 WITH CHECK(public.uc_document_row_action_allowed('org_contracts',to_jsonb(org_contracts.*)));
CREATE POLICY uc_contract_documents_delete ON public.org_contracts FOR DELETE TO authenticated
 USING(public.uc_document_row_action_allowed('org_contracts',to_jsonb(org_contracts.*)));

-- Three reviewed public namespaces only. Draft contracts keep write permission;
-- final group orders require issue. Education counters are issuer-internal.
CREATE FUNCTION public.reserve_group_document_number(p_org uuid,p_group uuid,p_doc_type text,p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_action text; v_next integer; v_year integer:=coalesce(p_year,extract(year FROM now())::integer);
BEGIN
 v_action:=CASE WHEN p_doc_type IN ('contract','group_contract') THEN 'write' WHEN p_doc_type='group_order' THEN 'issue' END;
 IF v_action IS NULL OR v_year NOT BETWEEN 2000 AND 2200 OR NOT public.uc_document_action_allowed(p_org,v_action,p_group,NULL) THEN
  RAISE EXCEPTION 'Number namespace, action or group scope denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.document_number_sequences(organization_id,doc_type,year,last_number) VALUES(p_org,p_doc_type,v_year,1)
 ON CONFLICT(organization_id,doc_type,year) DO UPDATE SET last_number=document_number_sequences.last_number+1,updated_at=now()
 RETURNING last_number INTO v_next;
 RETURN v_next;
END;$fn$;
CREATE OR REPLACE FUNCTION public.get_next_document_number(p_org uuid,p_doc_type text,p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.reserve_group_document_number(p_org,NULL,p_doc_type,p_year)
$fn$;

-- The legacy education editor has its own registration counter. Keep its
-- formatting/namespace unchanged, but close its former auth-only tenant bypass.
CREATE FUNCTION public.reserve_education_registration_number(p_org uuid,p_group uuid,p_doc_type text,p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_year integer:=coalesce(p_year,extract(year FROM now())::integer); v_next integer;
BEGIN
 IF p_doc_type NOT IN ('certificate','diploma','qualification') OR p_doc_type IS NULL
  OR v_year NOT BETWEEN 2000 AND 2200 OR NOT public.uc_document_action_allowed(p_org,'issue',p_group,NULL) THEN
  RAISE EXCEPTION 'Education registration action or scope denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_doc_type||':'||v_year::text,0));
 INSERT INTO public.document_number_sequences(organization_id,doc_type,year,last_number) VALUES(p_org,p_doc_type,v_year,1)
 ON CONFLICT(organization_id,doc_type,year) DO UPDATE SET last_number=document_number_sequences.last_number+1,updated_at=now()
 RETURNING last_number INTO v_next;
 RETURN v_next;
END;$fn$;
CREATE OR REPLACE FUNCTION public.next_reg_number(p_org uuid,p_doc_type text,p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.reserve_education_registration_number(p_org,NULL,p_doc_type,p_year)
$fn$;

CREATE FUNCTION public.set_org_staff_document_grants(p_org uuid,p_staff uuid,p_expected_role text,
 p_expected_sections_access jsonb,p_sign boolean,p_issue boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.org_staff%ROWTYPE; v_sections jsonb; v_old jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write')
  OR NOT public.can_access_organization(p_org,'staff.write')
  OR NOT public.uc_document_scope_allowed(p_org,NULL,NULL) THEN
  RAISE EXCEPTION 'Staff grant management denied' USING ERRCODE='42501'; END IF;
 IF p_sign IS NULL OR p_issue IS NULL THEN RAISE EXCEPTION 'Explicit grant values required' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.org_staff WHERE id=p_staff AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found' USING ERRCODE='P0002'; END IF;
 IF s.role IS DISTINCT FROM p_expected_role OR s.sections_access IS DISTINCT FROM p_expected_sections_access THEN
  RAISE EXCEPTION 'Staff grants changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF s.role IN ('owner','admin') THEN RAISE EXCEPTION 'Role supplies immutable default document actions' USING ERRCODE='55000'; END IF;
 v_old:=coalesce(s.sections_access,'[]'::jsonb);
 IF jsonb_typeof(v_old)<>'array' THEN RAISE EXCEPTION 'Unreviewed grant format' USING ERRCODE='22023'; END IF;
 IF p_sign AND NOT v_old ? 'documents.sign' AND NOT public.uc_document_action_allowed(p_org,'sign',NULL,NULL) THEN
  RAISE EXCEPTION 'Cannot delegate document sign permission' USING ERRCODE='42501'; END IF;
 IF p_issue AND NOT v_old ? 'documents.issue' AND NOT public.uc_document_action_allowed(p_org,'issue',NULL,NULL) THEN
  RAISE EXCEPTION 'Cannot delegate document issue permission' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO v_sections
 FROM jsonb_array_elements(v_old) WITH ORDINALITY e(value,ordinal)
 WHERE value NOT IN ('"documents.sign"'::jsonb,'"documents.issue"'::jsonb);
 IF p_sign THEN v_sections:=v_sections||'["documents.sign"]'::jsonb; END IF;
 IF p_issue THEN v_sections:=v_sections||'["documents.issue"]'::jsonb; END IF;
 UPDATE public.org_staff SET sections_access=v_sections WHERE id=s.id;
 RETURN jsonb_build_object('id',s.id,'organization_id',s.organization_id,'role',s.role,'sections_access',v_sections);
END;$fn$;

CREATE FUNCTION public.get_org_staff_document_grants(p_org uuid,p_staff uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.org_staff%ROWTYPE;
BEGIN
 IF NOT public.account_deletion_access_allowed() OR NOT public.uc_platform_document_action_allowed(auth.uid(),'read')
  OR NOT public.uc_document_scope_allowed(p_org,NULL,NULL)
  OR NOT (public.can_access_organization(p_org,'staff.read') OR public.can_access_organization(p_org,'staff.write')) THEN
  RAISE EXCEPTION 'Staff grants read denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.org_staff WHERE id=p_staff AND organization_id=p_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',s.id,'organization_id',s.organization_id,'role',s.role,'sections_access',s.sections_access);
END;$fn$;
CREATE FUNCTION public.validate_org_staff_document_assignment(p_org uuid,p_role text,p_sections_access jsonb DEFAULT '[]'::jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND public.uc_platform_document_action_allowed(auth.uid(),'write')
 AND public.can_access_organization(p_org,'staff.write') AND public.uc_document_scope_allowed(p_org,NULL,NULL)
 AND jsonb_typeof(coalesce(p_sections_access,'[]'))='array'
 AND (NOT ('documents.sign'=ANY(public.org_role_default_permissions(p_role)) OR coalesce(p_sections_access,'[]') ? 'documents.sign')
    OR public.uc_document_action_allowed(p_org,'sign',NULL,NULL))
 AND (NOT ('documents.issue'=ANY(public.org_role_default_permissions(p_role)) OR coalesce(p_sections_access,'[]') ? 'documents.issue')
    OR public.uc_document_action_allowed(p_org,'issue',NULL,NULL))
$fn$;
CREATE FUNCTION public.uc_guard_staff_document_grants() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_old_sign boolean:=false; v_old_issue boolean:=false; v_new_sign boolean; v_new_issue boolean;
BEGIN
 IF auth.role()='service_role' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write')
  OR NOT public.can_access_organization(NEW.organization_id,'staff.write')
  OR NOT public.uc_document_scope_allowed(NEW.organization_id,NULL,NULL) THEN
  RAISE EXCEPTION 'Staff permission management denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(coalesce(NEW.sections_access,'[]'))<>'array' THEN RAISE EXCEPTION 'Unreviewed grant format' USING ERRCODE='22023'; END IF;
 IF TG_OP='UPDATE' AND (OLD.organization_id,OLD.user_id) IS NOT DISTINCT FROM (NEW.organization_id,NEW.user_id) THEN
  v_old_sign:='documents.sign'=ANY(public.org_role_default_permissions(OLD.role)) OR coalesce(OLD.sections_access,'[]') ? 'documents.sign';
  v_old_issue:='documents.issue'=ANY(public.org_role_default_permissions(OLD.role)) OR coalesce(OLD.sections_access,'[]') ? 'documents.issue';
 END IF;
 v_new_sign:='documents.sign'=ANY(public.org_role_default_permissions(NEW.role)) OR coalesce(NEW.sections_access,'[]') ? 'documents.sign';
 v_new_issue:='documents.issue'=ANY(public.org_role_default_permissions(NEW.role)) OR coalesce(NEW.sections_access,'[]') ? 'documents.issue';
 IF v_new_sign AND NOT v_old_sign AND NOT public.uc_document_action_allowed(NEW.organization_id,'sign',NULL,NULL) THEN
  RAISE EXCEPTION 'Cannot delegate document sign permission' USING ERRCODE='42501'; END IF;
 IF v_new_issue AND NOT v_old_issue AND NOT public.uc_document_action_allowed(NEW.organization_id,'issue',NULL,NULL) THEN
  RAISE EXCEPTION 'Cannot delegate document issue permission' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_staff_document_grants() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_staff_document_grant_guard BEFORE INSERT OR UPDATE OF role,sections_access,user_id,organization_id ON public.org_staff
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_staff_document_grants();

CREATE FUNCTION public.commit_org_staff_document_assignment(p_org uuid,p_user uuid,p_role text,p_display_name text,
 p_visibility text DEFAULT 'all',p_can_receive_crm_tasks boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_role NOT IN('admin','school_editor','course_editor','teacher','sales_manager') OR p_role IS NULL
  OR p_visibility NOT IN('all','course_only','hidden') OR p_visibility IS NULL OR p_user IS NULL
  OR NOT public.validate_org_staff_document_assignment(p_org,p_role,'[]'::jsonb)
  OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user) THEN
  RAISE EXCEPTION 'Staff assignment access denied' USING ERRCODE='42501'; END IF;
 -- SECURITY DEFINER preserves the management path for staff.write-only actors;
 -- the ordinary caller identity remains in auth.uid for effective-grant guards.
 INSERT INTO public.org_staff(organization_id,user_id,role,display_name,visibility,can_receive_crm_tasks)
 VALUES(p_org,p_user,p_role,left(coalesce(p_display_name,''),500),p_visibility,coalesce(p_can_receive_crm_tasks,false))
 ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,display_name=excluded.display_name,
  visibility=excluded.visibility,can_receive_crm_tasks=excluded.can_receive_crm_tasks;
 RETURN true;
END;$fn$;
REVOKE ALL ON FUNCTION public.commit_org_staff_document_assignment(uuid,uuid,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_org_staff_document_assignment(uuid,uuid,text,text,text,boolean) TO authenticated;

-- The old table policies trusted global admin alone. Without these narrow
-- guards a viewer could promote/delete its admin_staff row (legacy escape),
-- or mint another unrestricted admin through user_roles.
CREATE FUNCTION public.uc_guard_platform_document_role_delegation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_admin_change boolean:=false;
BEGIN
 IF auth.role()='service_role' AND auth.uid() IS NULL THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='admin_staff' THEN
  IF auth.uid() IS NULL OR NOT public.has_role('admin'::public.app_role,auth.uid())
    OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write') THEN
   RAISE EXCEPTION 'Platform role delegation denied' USING ERRCODE='42501'; END IF;
 ELSE
  IF TG_OP IN ('UPDATE','DELETE') THEN v_admin_change:=OLD.role::text='admin'; END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_admin_change:=v_admin_change OR NEW.role::text='admin'; END IF;
  IF v_admin_change OR public.has_role('admin'::public.app_role,auth.uid()) THEN
   IF auth.uid() IS NULL OR NOT public.has_role('admin'::public.app_role,auth.uid())
     OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write') THEN
    RAISE EXCEPTION 'Platform role delegation denied' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_platform_document_role_delegation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_platform_document_role_guard BEFORE INSERT OR UPDATE OR DELETE ON public.admin_staff
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_platform_document_role_delegation();
CREATE TRIGGER uc_platform_document_user_role_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_platform_document_role_delegation();

CREATE FUNCTION public.uc_platform_document_storage_action_allowed(p_bucket text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND (
 public.uc_platform_document_action_allowed(auth.uid(),'write')
 OR p_bucket='student-documents' AND public.uc_document_storage_access(p_bucket,p_name,true) AND (
    public.storage_try_uuid(split_part(p_name,'/',1))=auth.uid()
    OR split_part(p_name,'/',1)='support' AND public.storage_try_uuid(split_part(p_name,'/',2))=auth.uid()
    OR split_part(p_name,'/',1)='avatars' AND public.storage_try_uuid(split_part(split_part(p_name,'/',2),'.',1))=auth.uid())
 OR p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.document_signatures s
    WHERE s.recipient_user_id=auth.uid() AND s.deleted_at IS NULL AND s.expires_at>now()
    AND s.status IN('sent','viewed','in_review') AND
    left(p_name,length(s.organization_id::text||'/signed-scans/'||s.id::text||'-'))=s.organization_id::text||'/signed-scans/'||s.id::text||'-')
 -- Existing external-contract uploader stages a random UUID file before its
 -- invitation exists; only the commercial sender workflow may use this key.
 OR p_bucket='external-contracts' AND p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.][A-Za-z0-9]+$'
    AND public.uc_document_commercial_creation_allowed(public.storage_try_uuid(split_part(p_name,'/',1))))
$fn$;
REVOKE ALL ON FUNCTION public.uc_platform_document_storage_action_allowed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_platform_document_storage_action_allowed(text,text) TO authenticated,service_role;
CREATE POLICY uc_platform_document_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id NOT IN('student-documents','company-documents','org-documents','signed-documents','external-contracts','billing-documents','frdo-documents','issued-documents')
  OR public.uc_platform_document_storage_action_allowed(bucket_id,name));
CREATE POLICY uc_platform_document_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id NOT IN('student-documents','company-documents','org-documents','signed-documents','external-contracts','billing-documents','frdo-documents','issued-documents')
  OR public.uc_platform_document_storage_action_allowed(bucket_id,name))
 WITH CHECK(bucket_id NOT IN('student-documents','company-documents','org-documents','signed-documents','external-contracts','billing-documents','frdo-documents','issued-documents')
  OR public.uc_platform_document_storage_action_allowed(bucket_id,name));
CREATE POLICY uc_platform_document_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id NOT IN('student-documents','company-documents','org-documents','signed-documents','external-contracts','billing-documents','frdo-documents','issued-documents')
  OR public.uc_platform_document_storage_action_allowed(bucket_id,name));

DO $issuer$ DECLARE source text; replacement text;
BEGIN
 source:=pg_get_functiondef('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure);
 replacement:=replace(source,'IF NOT public.uc_document_org_access(p_organization_id,true) THEN',
  'IF NOT public.uc_document_has_action(p_organization_id,''issue'') THEN');
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed released issuer entry'; END IF;
 source:=replacement;
 replacement:=replace(source,'v_enrollment_id := NULLIF(v_item->>''enrollment_id'', '''')::uuid;',
  'v_enrollment_id := NULLIF(v_item->>''enrollment_id'', '''')::uuid;'||chr(10)||
  '    IF NOT public.uc_document_action_allowed(p_organization_id,''issue'',p_group_id,v_enrollment_id) THEN RAISE EXCEPTION ''Issuance scope denied'' USING ERRCODE=''42501''; END IF;');
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed released issuer item binding'; END IF;
 EXECUTE replacement;
END;$issuer$;
REVOKE ALL ON FUNCTION public.reserve_group_document_number(uuid,uuid,text,integer),public.get_next_document_number(uuid,text,integer),public.sender_countersign(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_group_document_number(uuid,uuid,text,integer),public.get_next_document_number(uuid,text,integer),public.sender_countersign(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.reserve_education_registration_number(uuid,uuid,text,integer),public.next_reg_number(uuid,text,integer),
 public.set_org_staff_document_grants(uuid,uuid,text,jsonb,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_education_registration_number(uuid,uuid,text,integer),public.next_reg_number(uuid,text,integer),
 public.set_org_staff_document_grants(uuid,uuid,text,jsonb,boolean,boolean) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_org_staff_document_grants(uuid,uuid),public.validate_org_staff_document_assignment(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_org_staff_document_grants(uuid,uuid),public.validate_org_staff_document_assignment(uuid,text,jsonb) TO authenticated,service_role;
$source_20261018105000$;executable text;BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'6563e5305b0ea46bfead8f8098af4e3f' THEN RAISE EXCEPTION 'Source hash mismatch 20261018105000';END IF;
 executable:=source;
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'6563e5305b0ea46bfead8f8098af4e3f' THEN RAISE EXCEPTION 'Executable hash mismatch 20261018105000';END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018105000','uc_document_action_permissions',ARRAY[source]);
 END $migration_1$;
DO $migration_2$ DECLARE source text:=$source_20261018106000$-- UC-003: retain trusted compiler provenance while committing with the original actor.
-- Requires 104+105. No existing documents, receipts, or stored permissions are rewritten.
BEGIN;
DO $preflight$ BEGIN
 IF to_regprocedure('public.uc_document_action_allowed(uuid,text,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'UC106 requires action permissions'; END IF;
 IF md5(pg_get_functiondef('public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure))<>'201600eaeb4cb37dcea7791d0716dbb2'
 OR md5(pg_get_functiondef('public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[])'::regprocedure))<>'72c0bc7f4b6feaba492b305887bafb32'
 THEN RAISE EXCEPTION 'UC106 unreviewed compiler RPCs'; END IF;
END;$preflight$;

CREATE TABLE public.uc_goreltech_document_stages(
 actor_id uuid NOT NULL,organization_id uuid NOT NULL,group_id uuid NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes',
 consumed_at timestamptz,
 PRIMARY KEY(actor_id,organization_id,group_id,payload_sha256),
 CHECK(expires_at>created_at)
);
ALTER TABLE public.uc_goreltech_document_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_goreltech_document_stages FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.register_goreltech_group_document_stage(p_actor_id uuid,p_organization_id uuid,p_group_id uuid,p_docs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_hash text;v_stage public.uc_goreltech_document_stages%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL
 THEN RAISE EXCEPTION 'Trusted compiler service required' USING ERRCODE='42501'; END IF;
 IF p_actor_id IS NULL OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_id)
 OR p_organization_id IS DISTINCT FROM '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id AND regexp_replace(coalesce(o.inn,''),'\D','','g')='7806541216' AND o.name ~* 'ГОРЭЛТЕХ')
 OR NOT EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=p_group_id AND g.organization_id=p_organization_id)
 THEN RAISE EXCEPTION 'Invalid compiler stage actor or tenant' USING ERRCODE='42501'; END IF;
 IF p_docs IS NULL OR jsonb_typeof(p_docs)<>'array' THEN RAISE EXCEPTION 'Expected nine compiled drafts' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_docs)<>9 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_docs) d WHERE
  jsonb_typeof(d)<>'object' OR coalesce(d->>'doc_status','')<>'draft' OR nullif(btrim(d->>'document_number'),'') IS NOT NULL
  OR coalesce(d->>'layout_format','')<>'docx_ooxml' OR coalesce(d->>'generation_status','')<>'generated'
  OR coalesce(d->>'docx_sha256','') !~ '^[0-9a-fA-F]{64}$' OR coalesce(d->>'template_sha256','') !~ '^[0-9a-fA-F]{64}$'
  OR nullif(btrim(d->>'template_registry_key'),'') IS NULL OR nullif(btrim(d->>'template_version_label'),'') IS NULL
  OR coalesce(jsonb_typeof(d->'variables_snapshot'),'')<>'object'
  OR coalesce(d->>'file_path','') NOT LIKE 'organizations/'||p_organization_id::text||'/group-documents/'||p_group_id::text||'/%'
  OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='billing-documents' AND o.name=d->>'file_path'))
 THEN RAISE EXCEPTION 'Invalid compiled draft metadata or missing staged object' USING ERRCODE='22023'; END IF;
 -- JSONB textual form is canonical for object keys; array order is intentionally part of the payload.
 -- The trusted compiler, not this metadata query, computes/validates file and template hashes.
 v_hash:=encode(sha256(convert_to(p_docs::text,'UTF8')),'hex');
 INSERT INTO public.uc_goreltech_document_stages(actor_id,organization_id,group_id,payload_sha256)
 VALUES(p_actor_id,p_organization_id,p_group_id,v_hash) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT v_stage FROM public.uc_goreltech_document_stages
 WHERE actor_id=p_actor_id AND organization_id=p_organization_id AND group_id=p_group_id AND payload_sha256=v_hash FOR UPDATE;
 IF v_stage.consumed_at IS NOT NULL OR v_stage.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'Compiler stage already consumed or expired' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('payload_sha256',v_hash,'expires_at',v_stage.expires_at);
END;$fn$;
REVOKE ALL ON FUNCTION public.register_goreltech_group_document_stage(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_goreltech_group_document_stage(uuid,uuid,uuid,jsonb) TO service_role;

DO $replace_rpc$ DECLARE src text;old_auth text;new_auth text:=$new_auth$
  IF v_jwt_role IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid()
    OR NOT public.uc_document_action_allowed(p_organization_id,'write',p_group_id,NULL) THEN
    RAISE EXCEPTION 'authenticated document writer and exact actor/group required' USING ERRCODE='42501';
  END IF;
$new_auth$;needle text;
BEGIN
 SELECT pg_get_functiondef('public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure) INTO src;
 old_auth:=$old_auth$
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT (
    public.has_role(p_actor_id, 'admin'::app_role)
    OR public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.manage')
    OR public.is_org_owner(p_actor_id, p_organization_id)
  ) THEN
    RAISE EXCEPTION 'actor is not allowed to manage organization documents' USING ERRCODE = '42501';
  END IF;
$old_auth$;
 IF (length(src)-length(replace(src,old_auth,'')))/length(old_auth)<>1 THEN RAISE EXCEPTION 'UC106 auth source mismatch create_goreltech_group_document_batch'; END IF;
 src:=replace(src,old_auth,new_auth);
 needle:='  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || '':'' || p_group_id::text, 0));';
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'UC106 batch lock source mismatch'; END IF;
 src:=replace(src,needle,$consume$
  UPDATE public.uc_goreltech_document_stages SET consumed_at=clock_timestamp()
  WHERE actor_id=p_actor_id AND organization_id=p_organization_id AND group_id=p_group_id
    AND payload_sha256=encode(sha256(convert_to(p_docs::text,'UTF8')),'hex')
    AND consumed_at IS NULL AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact unexpired compiler stage required' USING ERRCODE='42501'; END IF;
$consume$||needle);
 EXECUTE src;
 SELECT pg_get_functiondef('public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[])'::regprocedure) INTO src;
 old_auth:=$old_auth$
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT COALESCE((
    public.has_role(p_actor_id, 'admin'::public.app_role)
    OR public.is_org_owner(p_actor_id, p_organization_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.org_staff s
        WHERE s.user_id = p_actor_id AND s.organization_id = p_organization_id
          AND (s.expires_at IS NULL OR s.expires_at > now())
      )
      AND public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.manage')
    )
  ), false) THEN
    RAISE EXCEPTION 'actor is not allowed to manage organization documents' USING ERRCODE = '42501';
  END IF;
$old_auth$;
 IF (length(src)-length(replace(src,old_auth,'')))/length(old_auth)<>1 THEN RAISE EXCEPTION 'UC106 auth source mismatch create_goreltech_group_document_batch_once'; END IF;
 src:=replace(src,old_auth,new_auth);

 EXECUTE src;
END;$replace_rpc$;
REVOKE ALL ON FUNCTION public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb),
 public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb),
 public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[]) TO authenticated;

DO $postcheck$ BEGIN
 IF EXISTS(SELECT 1 FROM public.uc_goreltech_document_stages)
 OR has_table_privilege('authenticated','public.uc_goreltech_document_stages','SELECT,INSERT,UPDATE,DELETE')
 OR has_function_privilege('anon','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('service_role','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'UC106 compiler boundary postcheck failed'; END IF;
END;$postcheck$;
COMMIT;
$source_20261018106000$;executable text;BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'8e953d5f20050d66ead5454349445b7a' THEN RAISE EXCEPTION 'Source hash mismatch 20261018106000';END IF;
 executable:=regexp_replace(regexp_replace(source,E'(?m)^BEGIN( ISOLATION LEVEL REPEATABLE READ)?;\r?$','','g'),E'(?m)^COMMIT;\r?$','','g');
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'76a9d136cd11f81cc60ef90ea0797a28' THEN RAISE EXCEPTION 'Executable hash mismatch 20261018106000';END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018106000','uc_gorel_draft_caller',ARRAY[source]);
 END $migration_2$;
DO $migration_3$ DECLARE source text:=$source_20261018107000$-- The legacy reminder job ignores document-update errors before emailing.
-- Pause only this exact job until a scoped, idempotent system workflow is ready.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $pause$
DECLARE j record; original jsonb;
BEGIN
 IF current_setting('transaction_isolation') NOT IN ('repeatable read','serializable')
   OR to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL
   OR NOT has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Document reminder pause requires supported cron API and repeatable-read transaction';
 END IF;
 IF (SELECT count(*) FROM cron.job WHERE jobname='process-document-expiry-reminders-daily')<>1 THEN
  RAISE EXCEPTION 'Expected exactly one legacy document reminder job';
 END IF;
 SELECT * INTO STRICT j FROM cron.job WHERE jobname='process-document-expiry-reminders-daily';
 IF NOT j.active OR j.username IS DISTINCT FROM current_user OR j.database IS DISTINCT FROM current_database()
   OR md5(j.command)<>'2d7b7e801492efbdf6bfac7f29731273'
   OR j.command NOT LIKE '%/functions/v1/process-document-expiry-reminders%' THEN
  RAISE EXCEPTION 'Unreviewed document reminder job; inspect safe metadata before release';
 END IF;
 original:=to_jsonb(j)-'active';
 PERFORM cron.alter_job(j.jobid,active:=false);
 SELECT * INTO STRICT j FROM cron.job WHERE jobname='process-document-expiry-reminders-daily';
 IF j.active OR (to_jsonb(j)-'active') IS DISTINCT FROM original THEN
  RAISE EXCEPTION 'Document reminder pause changed more than active';
 END IF;
END $pause$;
COMMIT;
$source_20261018107000$;executable text;BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'612d9b242bae5289b34b8598fc1361e4' THEN RAISE EXCEPTION 'Source hash mismatch 20261018107000';END IF;
 executable:=regexp_replace(regexp_replace(source,E'(?m)^BEGIN( ISOLATION LEVEL REPEATABLE READ)?;\r?$','','g'),E'(?m)^COMMIT;\r?$','','g');
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'8db77a7d9bc2798b93aadb3d871270ed' THEN RAISE EXCEPTION 'Executable hash mismatch 20261018107000';END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018107000','uc_document_reminder_scheduler',ARRAY[source]);
 END $migration_3$;
DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (-- Read-only deployment acceptance. Assignment/stage emptiness is checked only inside the release.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE (version='20261018104000' AND name='uc_document_staff_scope' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='c5d0538638fbaf0343612c13e7583510') OR (version='20261018105000' AND name='uc_document_action_permissions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='6563e5305b0ea46bfead8f8098af4e3f') OR (version='20261018106000' AND name='uc_gorel_draft_caller' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='8e953d5f20050d66ead5454349445b7a') OR (version='20261018107000' AND name='uc_document_reminder_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='612d9b242bae5289b34b8598fc1361e4')) AS exact_stage2_ledger,
 (SELECT count(*)=29 FROM pg_policies WHERE policyname='uc_document_assigned_read' AND permissive='RESTRICTIVE') AS assigned_read_boundaries,
 (SELECT count(*)=4 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'uc_document_assigned_storage_%' AND permissive='RESTRICTIVE') AS assigned_storage_boundaries,
 (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('student_group_memberships_effective','student_group_profiles_effective') AND 'security_invoker=true'=ANY(c.reloptions)) AS membership_views_invoker,
 (SELECT count(*)=14 FROM pg_trigger WHERE tgname='uc_document_action_guard' AND NOT tgisinternal AND tgenabled='O') AS document_action_guards,
 NOT has_table_privilege('authenticated','public.org_staff_document_groups','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','public.uc_goreltech_document_stages','SELECT,INSERT,UPDATE,DELETE') AS private_assignment_and_stage_state,
 NOT has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.register_goreltech_group_document_stage(uuid,uuid,uuid,jsonb)','EXECUTE') AS caller_and_compiler_separated,
 (SELECT count(*)=1 AND bool_and(NOT active AND md5(command)='2d7b7e801492efbdf6bfac7f29731273') FROM cron.job WHERE jobname='process-document-expiry-reminders-daily') AS unsafe_reminder_paused) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'UC stage2 postcheck failed: %',r;END IF;END $assert$;
DO $preserve$ DECLARE r record;n bigint;h text;BEGIN
 FOR r IN SELECT * FROM uc_scope_before LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' ORDER BY to_jsonb(x)::text),'''')) FROM (SELECT %s FROM %s) x',r.column_list,r.table_name) INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM uc_scope_restrictive_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing restrictive policy changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_scope_cron_before b FULL JOIN (SELECT jobid,md5((to_jsonb(j)-CASE WHEN jobname='process-document-expiry-reminders-daily' THEN 'active' ELSE '__unchanged__' END)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Unreviewed cron metadata changed';END IF;
 IF EXISTS(SELECT 1 FROM org_staff_document_groups) OR EXISTS(SELECT 1 FROM org_staff_document_scopes) OR EXISTS(SELECT 1 FROM org_staff_document_scope_events) OR EXISTS(SELECT 1 FROM uc_goreltech_document_stages) THEN RAISE EXCEPTION 'Unexpected assignment/stage backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
-- Read-only deployment acceptance. Assignment/stage emptiness is checked only inside the release.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE (version='20261018104000' AND name='uc_document_staff_scope' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='c5d0538638fbaf0343612c13e7583510') OR (version='20261018105000' AND name='uc_document_action_permissions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='6563e5305b0ea46bfead8f8098af4e3f') OR (version='20261018106000' AND name='uc_gorel_draft_caller' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='8e953d5f20050d66ead5454349445b7a') OR (version='20261018107000' AND name='uc_document_reminder_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='612d9b242bae5289b34b8598fc1361e4')) AS exact_stage2_ledger,
 (SELECT count(*)=29 FROM pg_policies WHERE policyname='uc_document_assigned_read' AND permissive='RESTRICTIVE') AS assigned_read_boundaries,
 (SELECT count(*)=4 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'uc_document_assigned_storage_%' AND permissive='RESTRICTIVE') AS assigned_storage_boundaries,
 (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('student_group_memberships_effective','student_group_profiles_effective') AND 'security_invoker=true'=ANY(c.reloptions)) AS membership_views_invoker,
 (SELECT count(*)=14 FROM pg_trigger WHERE tgname='uc_document_action_guard' AND NOT tgisinternal AND tgenabled='O') AS document_action_guards,
 NOT has_table_privilege('authenticated','public.org_staff_document_groups','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','public.uc_goreltech_document_stages','SELECT,INSERT,UPDATE,DELETE') AS private_assignment_and_stage_state,
 NOT has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.register_goreltech_group_document_stage(uuid,uuid,uuid,jsonb)','EXECUTE') AS caller_and_compiler_separated,
 (SELECT count(*)=1 AND bool_and(NOT active AND md5(command)='2d7b7e801492efbdf6bfac7f29731273') FROM cron.job WHERE jobname='process-document-expiry-reminders-daily') AS unsafe_reminder_paused;
