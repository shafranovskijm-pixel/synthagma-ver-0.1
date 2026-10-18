-- UC-003: explicit staff assignments. No inferred/backfilled assignments or document changes.
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

