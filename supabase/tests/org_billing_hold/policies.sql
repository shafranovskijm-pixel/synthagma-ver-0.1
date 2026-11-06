-- Representative original permissive RLS + the actual common restrictive fence.
GRANT SELECT ON public.profiles,public.user_roles,public.org_staff,public.organizations,
 public.courses,public.course_modules,public.enrollments,public.lesson_progress,public.test_attempts TO authenticated;
GRANT INSERT ON public.lesson_progress TO authenticated;
DO $p$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','user_roles','org_staff','organizations','courses','course_modules','enrollments','lesson_progress','test_attempts']LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY common_fence ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.account_deletion_access_allowed()) WITH CHECK(public.account_deletion_access_allowed())',t);
 END LOOP;
END;$p$;
CREATE POLICY own_profile ON public.profiles FOR SELECT TO authenticated USING(user_id=auth.uid()OR public.can_access_organization(organization_id));
CREATE POLICY own_roles ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY own_staff ON public.org_staff FOR SELECT TO authenticated USING(user_id=auth.uid()OR public.can_access_organization(organization_id));
CREATE POLICY tenant_org ON public.organizations FOR SELECT TO authenticated USING(public.can_access_organization(id));
CREATE POLICY tenant_courses ON public.courses FOR SELECT TO authenticated USING(public.can_access_organization(organization_id,'courses.read')OR public.can_access_course_as_learner(id));
CREATE POLICY tenant_modules ON public.course_modules FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.courses c WHERE c.id=course_id));
CREATE POLICY own_enrollment ON public.enrollments FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY own_progress ON public.lesson_progress FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY own_progress_insert ON public.lesson_progress FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY own_attempts ON public.test_attempts FOR SELECT TO authenticated USING(user_id=auth.uid());
-- Model a real SECURITY DEFINER learner-reader bypass; patched released helper must deny it.
CREATE FUNCTION public.lab_learner_content(p_course uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE value text;BEGIN
 IF NOT public.can_access_course_as_learner(p_course)THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;
 SELECT title INTO value FROM public.courses WHERE id=p_course;RETURN value;
END;$fn$;
GRANT EXECUTE ON FUNCTION public.lab_learner_content(uuid) TO authenticated;
-- Model an extra deployment DDL grant wrapper on CREATE FUNCTION.
RESET ROLE;
CREATE FUNCTION public.lab_ddl_watch() RETURNS event_trigger LANGUAGE plpgsql AS $fn$
DECLARE command record;BEGIN
 FOR command IN SELECT * FROM pg_event_trigger_ddl_commands()LOOP
  IF command.command_tag='CREATE FUNCTION'AND command.object_type='function' THEN
   INSERT INTO public.lab_ddl_events(identity)VALUES(command.object_identity);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO billing_lab_observer',command.object_identity);
  END IF;
 END LOOP;
END;$fn$;
CREATE EVENT TRIGGER billing_lab_ddl_watch ON ddl_command_end EXECUTE FUNCTION public.lab_ddl_watch();
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO billing_lab_observer;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON TABLES TO billing_lab_observer;
GRANT EXECUTE ON FUNCTION public.account_deletion_access_allowed(),public.can_access_organization(uuid,text),
 public.is_user_blocked(uuid),public.has_role(uuid,public.app_role),public.has_role(public.app_role,uuid),
 public.can_access_course_as_learner(uuid),public.get_user_role(uuid),public.is_org_owner(uuid,uuid),
 public.has_org_staff_permission(uuid,uuid,text),public.transfer_org_ownership_atomic(uuid,uuid) TO authenticated,service_role,billing_lab_observer;
GRANT EXECUTE ON FUNCTION public.account_deletion_access_allowed(),public.can_access_organization(uuid,text),
 public.is_user_blocked(uuid),public.has_role(uuid,public.app_role),public.has_role(public.app_role,uuid),public.get_user_role(uuid),
 public.is_org_owner(uuid,uuid),public.has_org_staff_permission(uuid,uuid,text) TO anon;
REVOKE EXECUTE ON FUNCTION public.account_deletion_access_allowed(),public.can_access_course_as_learner(uuid),
 public.is_org_owner(uuid,uuid),public.transfer_org_ownership_atomic(uuid,uuid) FROM PUBLIC;
-- Execute the actual migration as the reviewed non-superuser BYPASSRLS owner.
SET ROLE postgres;

