-- Restrict lesson mutations for every non-BYPASS role. All old SELECT/catalog and paid
-- policies, table ACLs, old functions, protected CSZ triggers and data remain.
CREATE FUNCTION public.lesson_write_guard_allowed(p_course_id uuid)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated'AND auth.uid()IS NOT NULL
 AND public.account_deletion_access_allowed()
 AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid()AND u.deleted_at IS NULL AND(u.banned_until IS NULL OR u.banned_until<=now()))
 AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()AND p.blocked_at IS NOT NULL)
 AND public.uc_platform_document_action_allowed(auth.uid(),'write')
 AND public.can_access_course(p_course_id,'courses.write'),false)
$fn$;
-- A policy predicate returns only a boolean; no data/mutation API is exposed.
-- Clear unexpected host defaults on this new function, then grant exactly the
-- authenticated role. Other non-BYPASS roles fail closed rather than retaining
-- an old permissive ALL-policy path; owner/service BYPASS semantics are unchanged.
DO $new_acl$ DECLARE g record;fn regprocedure:='public.lesson_write_guard_allowed(uuid)'::regprocedure;owner_id oid;BEGIN
 SELECT proowner INTO owner_id FROM pg_proc WHERE oid=fn;
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=fn AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.lesson_write_guard_allowed(uuid)FROM %s CASCADE',CASE WHEN g.grantee=0 THEN 'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END);
 END LOOP;
END;$new_acl$;
GRANT EXECUTE ON FUNCTION public.lesson_write_guard_allowed(uuid)TO authenticated;
CREATE POLICY lesson_write_guard_insert ON public.lessons AS RESTRICTIVE FOR INSERT TO PUBLIC
 WITH CHECK(public.lesson_write_guard_allowed(course_id));
CREATE POLICY lesson_write_guard_update ON public.lessons AS RESTRICTIVE FOR UPDATE TO PUBLIC
 USING(public.lesson_write_guard_allowed(course_id))WITH CHECK(public.lesson_write_guard_allowed(course_id));
CREATE POLICY lesson_write_guard_delete ON public.lessons AS RESTRICTIVE FOR DELETE TO PUBLIC
 USING(public.lesson_write_guard_allowed(course_id));
