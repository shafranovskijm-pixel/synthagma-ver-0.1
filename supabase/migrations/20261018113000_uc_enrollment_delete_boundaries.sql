-- Narrow enrollment DELETE authorization. No learning, file or history backfill.
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES
 ('public.uc_student_frdo_staff_org_allowed(uuid,uuid,text)','541b10208fdf1b4788ce4eae588110a6'),
 ('public.uc_document_scope_allowed(uuid,uuid,uuid)','2a7407e7d178c7561b1d390f0884c6b6'),
 ('public.uc_platform_document_action_allowed(uuid,text)','e5a1436d0cc46218d379c3ffec8c0d0d'),
 ('public.cancel_course_assignment(uuid,uuid)','ef93d58bd6e7904d622035799681bf67'),
 ('public.admin_delete_organization(uuid)','96cbed53e3ffbf14bea30f6c8be322bc'),
 ('public.account_deletion_erase_data(uuid,text)','d0279bdfbfc4d97a1f0b32c47cc475ab'),
 ('public.csz_guard_enrollment()','292b6f3a1e462bd6a2e45689bfc22436')
 )f(signature,hash) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash) THEN RAISE EXCEPTION 'Enrollment DELETE: unreviewed authority or caller baseline';END IF;
 IF(SELECT count(*) FROM pg_policies p WHERE schemaname='public' AND tablename='enrollments' AND(
  policyname='Org staff can delete enrollments' AND md5(to_jsonb(p)::text)='e31cb35c15600bcc8506cecb1a8233c3'
  OR policyname='Org users and admins can delete enrollments' AND md5(to_jsonb(p)::text)='1bd42b9d43a787f95c1e8a4c0d84846e'
  OR policyname='account_deletion_no_revoked_access' AND md5(to_jsonb(p)::text)='2cc11fdbb2bf044ff8e48e7e5c27472a'))<>3 THEN RAISE EXCEPTION 'Enrollment DELETE: unreviewed policy baseline';END IF;
END $preflight$;

-- Prospective cascade witnesses contain UUID authority metadata only. A witness
-- records authorization while the parent/course/profile/group rows still exist;
-- it never claims that those rows can be joined again after a parent deletion.
CREATE TABLE public.uc_enrollment_delete_witnesses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN('course','organization')),
 parent_id uuid NOT NULL,organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,actor_id uuid NOT NULL,
 transaction_id bigint NOT NULL DEFAULT txid_current(),backend_pid integer NOT NULL DEFAULT pg_backend_pid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(kind,parent_id,transaction_id,backend_pid,enrollment_id,actor_id)
);
CREATE INDEX uc_enrollment_delete_witness_lookup ON public.uc_enrollment_delete_witnesses(transaction_id,backend_pid,actor_id,enrollment_id,user_id,course_id);
ALTER TABLE public.uc_enrollment_delete_witnesses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_enrollment_delete_witnesses FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.uc_enrollment_delete_actor_writable()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND auth.uid() IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
 AND public.uc_platform_document_action_allowed(auth.uid(),'write')
 AND NOT public.has_role(auth.uid(),'sales_manager'::public.app_role)
 AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=auth.uid() AND(a.role NOT IN('super_admin','admin') OR a.expires_at<=now())),false)
$fn$;
-- Preserve the reviewed admin workflow and its grants. Only add the same
-- current global write fence before its original authorization and mutations.
DO $admin_entry$ DECLARE original text;patched text;BEGIN
 original:=pg_get_functiondef('public.admin_delete_organization(uuid)'::regprocedure);
 IF md5(original)<>'96cbed53e3ffbf14bea30f6c8be322bc' THEN RAISE EXCEPTION 'Enrollment DELETE: unreviewed admin organization caller';END IF;
 patched:=replace(original,E'BEGIN\n  -- Permission check: only global admins',E'BEGIN\n  IF NOT public.uc_enrollment_delete_actor_writable() THEN\n    RAISE EXCEPTION ''organization_delete_access_denied'' USING ERRCODE=''42501'';\n  END IF;\n  -- Permission check: only global admins');
 IF patched=original THEN RAISE EXCEPTION 'Enrollment DELETE: admin entry patch not applied';END IF;
 EXECUTE patched;
END $admin_entry$;
CREATE FUNCTION public.uc_enrollment_delete_live_allowed(p_enrollment uuid,p_user uuid,p_course uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_enrollment_delete_actor_writable()
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id JOIN public.profiles p ON p.user_id=e.user_id AND p.organization_id=c.organization_id
 WHERE e.id=p_enrollment AND e.user_id=p_user AND e.course_id=p_course
 AND public.uc_student_frdo_staff_org_allowed(auth.uid(),c.organization_id,'students.write')
 AND public.uc_document_scope_allowed(c.organization_id,NULL,e.id))
$fn$;
CREATE FUNCTION public.uc_enrollment_delete_has_witness(p_enrollment uuid,p_user uuid,p_course uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_enrollment_delete_actor_writable()
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND EXISTS(SELECT 1 FROM public.uc_enrollment_delete_witnesses w WHERE w.transaction_id=txid_current() AND w.backend_pid=pg_backend_pid() AND w.actor_id=auth.uid()
 AND w.enrollment_id=p_enrollment AND w.user_id=p_user AND w.course_id=p_course)
$fn$;
CREATE FUNCTION public.can_delete_course_enrollment(p_enrollment_id uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce((SELECT public.uc_enrollment_delete_live_allowed(e.id,e.user_id,e.course_id) OR public.uc_enrollment_delete_has_witness(e.id,e.user_id,e.course_id)
 FROM public.enrollments e WHERE e.id=p_enrollment_id),false)
$fn$;
CREATE FUNCTION public.uc_guard_enrollment_delete()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role()='service_role' AND auth.uid() IS NULL AND current_setting('sintagma.account_deletion_erase_user',true)=OLD.user_id::text
 AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=OLD.user_id) THEN RETURN OLD;END IF;
 IF public.uc_enrollment_delete_has_witness(OLD.id,OLD.user_id,OLD.course_id) OR public.uc_enrollment_delete_live_allowed(OLD.id,OLD.user_id,OLD.course_id) THEN RETURN OLD;END IF;
 RAISE EXCEPTION 'enrollment_delete_access_denied' USING ERRCODE='42501';
END;$fn$;
CREATE FUNCTION public.uc_capture_enrollment_delete_parent()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r record;v_kind text:=CASE TG_TABLE_NAME WHEN 'courses' THEN 'course' WHEN 'organizations' THEN 'organization' END;
BEGIN
 IF v_kind IS NULL THEN RAISE EXCEPTION 'Unsupported enrollment DELETE parent';END IF;
 IF auth.role()='authenticated' AND NOT public.uc_enrollment_delete_actor_writable() THEN
  RAISE EXCEPTION 'enrollment_delete_parent_access_denied' USING ERRCODE='42501';END IF;
 FOR r IN SELECT e.id,e.user_id,e.course_id,c.organization_id FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
 WHERE(v_kind='course' AND c.id=OLD.id)OR(v_kind='organization' AND c.organization_id=OLD.id) ORDER BY e.id LOOP
  IF NOT(public.uc_enrollment_delete_live_allowed(r.id,r.user_id,r.course_id) OR public.uc_enrollment_delete_has_witness(r.id,r.user_id,r.course_id)) THEN
   RAISE EXCEPTION 'enrollment_delete_parent_access_denied' USING ERRCODE='42501';END IF;
  INSERT INTO public.uc_enrollment_delete_witnesses(kind,parent_id,organization_id,enrollment_id,user_id,course_id,actor_id)
  VALUES(v_kind,OLD.id,r.organization_id,r.id,r.user_id,r.course_id,auth.uid()) ON CONFLICT DO NOTHING;
 END LOOP;RETURN OLD;
END;$fn$;
CREATE FUNCTION public.uc_cleanup_enrollment_delete_parent()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 DELETE FROM public.uc_enrollment_delete_witnesses WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid()
 AND kind=CASE TG_TABLE_NAME WHEN 'courses' THEN 'course' WHEN 'organizations' THEN 'organization' END AND parent_id=OLD.id;
 RETURN OLD;
END;$fn$;

CREATE TRIGGER uc_enrollment_delete_guard BEFORE DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.uc_guard_enrollment_delete();
CREATE TRIGGER uc_enrollment_delete_parent_before BEFORE DELETE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.uc_capture_enrollment_delete_parent();
CREATE TRIGGER zzz_uc_enrollment_delete_parent_cleanup AFTER DELETE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.uc_cleanup_enrollment_delete_parent();
CREATE TRIGGER uc_enrollment_delete_parent_before BEFORE DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.uc_capture_enrollment_delete_parent();
CREATE TRIGGER zzz_uc_enrollment_delete_parent_cleanup AFTER DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.uc_cleanup_enrollment_delete_parent();
CREATE POLICY uc_enrollment_delete_boundary ON public.enrollments AS RESTRICTIVE FOR DELETE TO authenticated USING(public.can_delete_course_enrollment(id));
DO $grants$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(
 'uc_enrollment_delete_actor_writable','uc_enrollment_delete_live_allowed','uc_enrollment_delete_has_witness','can_delete_course_enrollment','uc_guard_enrollment_delete','uc_capture_enrollment_delete_parent','uc_cleanup_enrollment_delete_parent') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);
 IF f.proname='can_delete_course_enrollment' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure);END IF;END LOOP;
END $grants$;
