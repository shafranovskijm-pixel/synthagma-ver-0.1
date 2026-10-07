-- S041 only. Both exact source migrations are atomic; no learner rows are removed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $s041_release$
DECLARE v_failures text;
 v_source_0 text := $s041_source_0$-- Removing an archived learner is a roster operation, not erasure of learning
-- evidence. Markers are tenant-scoped; enrollments, attempts and billing stay intact.
CREATE TABLE IF NOT EXISTS public.student_roster_removals (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
ALTER TABLE public.student_roster_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_roster_removals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.student_roster_removals TO authenticated;
GRANT ALL ON public.student_roster_removals TO service_role;
CREATE POLICY student_roster_removals_read ON public.student_roster_removals
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_org_owner(auth.uid(), organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = auth.uid()
      AND s.organization_id = student_roster_removals.organization_id
      AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(auth.uid(), organization_id, 'students.read'))
  );

CREATE OR REPLACE FUNCTION public.set_archived_student_removed(
  p_organization_id uuid, p_user_id uuid, p_removed boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_profile public.profiles; v_changed integer; v_removed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE((
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_org_owner(auth.uid(), p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = auth.uid()
      AND s.organization_id = p_organization_id AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(auth.uid(), p_organization_id, 'students.write'))
  ), false) THEN RAISE EXCEPTION 'student_removal_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_removed IS NULL THEN RAISE EXCEPTION 'invalid_removal_state' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_profile FROM public.profiles p WHERE p.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.organization_id IS DISTINCT FROM p_organization_id
    OR NOT public.is_student_profile(p_user_id, p_organization_id) THEN
    RAISE EXCEPTION 'student_not_in_organization' USING ERRCODE = '42501';
  END IF;
  IF p_removed AND v_profile.archived_at IS NULL THEN
    RAISE EXCEPTION 'student_must_be_archived' USING ERRCODE = '22023';
  END IF;
  IF p_removed THEN
    INSERT INTO public.student_roster_removals(organization_id, user_id, removed_by)
      VALUES (p_organization_id, p_user_id, auth.uid()) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    SELECT r.removed_at INTO v_removed_at FROM public.student_roster_removals r
      WHERE r.organization_id = p_organization_id AND r.user_id = p_user_id;
  ELSE
    DELETE FROM public.student_roster_removals r
      WHERE r.organization_id = p_organization_id AND r.user_id = p_user_id;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF v_changed > 0 THEN
      UPDATE public.profiles SET archived_at = COALESCE(archived_at, now()) WHERE user_id = p_user_id;
    END IF;
  END IF;
  IF v_changed > 0 THEN
    INSERT INTO public.student_deletion_log(student_id, student_full_name, student_login,
      student_email, organization_id, deleted_by, deletion_type, reason, metadata)
    VALUES (p_user_id, v_profile.full_name, v_profile.login, v_profile.email,
      p_organization_id, auth.uid(), CASE WHEN p_removed THEN 'soft' ELSE 'archive' END,
      CASE WHEN p_removed THEN 'removed_from_archive' ELSE 'restored_to_archive' END,
      jsonb_build_object('history_preserved', true, 'roster_removed', p_removed));
  END IF;
  RETURN jsonb_build_object('organization_id', p_organization_id, 'user_id', p_user_id,
    'removed', p_removed, 'removed_at', v_removed_at, 'changed', v_changed > 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_archived_student_removed(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_archived_student_removed(uuid,uuid,boolean) TO authenticated;

-- Patch the deployed definitions to preserve prior pagination/group fixes.
-- Every replacement is bounded to a known predicate and fails on schema drift.
DO $migration$
DECLARE v_signature text; v_original text; v_updated text;
  v_predicate text := 'p.organization_id = p_organization_id';
  v_filter text := 'p.organization_id = p_organization_id AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = p_organization_id AND srr.user_id = p.user_id)';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)',
    'public.get_organization_students_counts(uuid)',
    'public.get_organization_student_group_counts(uuid)',
    'public.get_organization_dashboard_summary(uuid)',
    'public.get_organization_course_overview(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_original;
    IF position('student_roster_removals' IN v_original) > 0 THEN CONTINUE; END IF;
    v_updated := replace(v_original, v_predicate, v_filter);
    IF v_updated = v_original THEN RAISE EXCEPTION 'student_roster_filter_drift: %', v_signature; END IF;
    EXECUTE v_updated;
  END LOOP;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_course_student_test_results_page(uuid,integer,integer,text,text,text)',
    'public.get_course_students_page(uuid,integer,integer,text,text)',
    'public.get_course_students_stats(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_original;
    IF position('student_roster_removals' IN v_original) > 0 THEN CONTINUE; END IF;
    -- This predicate is shared by the result rows and course counters.
    v_updated := replace(v_original, 'WHERE e.course_id = p_course_id',
      'WHERE e.course_id = p_course_id AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = v_org AND srr.user_id = e.user_id)');
    IF v_updated = v_original THEN RAISE EXCEPTION 'student_roster_filter_drift: %', v_signature; END IF;
    EXECUTE v_updated;
  END LOOP;
END;
$migration$;
$s041_source_0$;
 v_source_1 text := $s041_source_1$-- One learner's complete course summary, without fetching every other learner.
CREATE OR REPLACE FUNCTION public.get_student_learning_results(p_organization_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE((
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_org_owner(auth.uid(), p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = auth.uid()
      AND s.organization_id = p_organization_id AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(auth.uid(), p_organization_id, 'students.read'))
  ), false) THEN RAISE EXCEPTION 'student_results_forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id
    AND p.organization_id = p_organization_id AND public.is_student_profile(p.user_id, p_organization_id)) THEN
    RAISE EXCEPTION 'student_not_in_organization' USING ERRCODE = '42501';
  END IF;
  WITH course_results AS (
    SELECT e.id AS enrollment_id, e.course_id, c.title AS course_title,
      COALESCE(e.progress, 0) AS progress, e.status, e.started_at, e.completed_at,
      COALESCE(e.time_spent, 0) AS time_spent, mc.credited_at AS manual_credited_at,
      COALESCE(t.tests, '[]'::jsonb) AS tests
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id AND c.organization_id = p_organization_id
    LEFT JOIN public.course_manual_credits mc ON mc.enrollment_id = e.id AND mc.revoked_at IS NULL
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'lesson_id', l.id, 'lesson_title', l.title,
        'score', a.score, 'max_score', a.max_score,
        'percent', CASE WHEN a.max_score > 0 THEN round(a.score::numeric * 100 / a.max_score)::integer ELSE NULL END,
        'passing_score', COALESCE(a.passing_score, l.test_passing_score, 70),
        'passed', CASE WHEN mc.credited_at IS NOT NULL THEN true
          WHEN a.id IS NULL THEN NULL ELSE COALESCE(a.passed,
            CASE WHEN a.max_score > 0 THEN round(a.score::numeric * 100 / a.max_score) >= COALESCE(a.passing_score, l.test_passing_score, 70) ELSE false END) END,
        'attempts_used', (SELECT count(*) FROM public.test_attempts ta WHERE ta.user_id = p_user_id AND ta.lesson_id = l.id),
        'completed_at', a.completed_at,
        'manual_credited_at', mc.credited_at
      ) ORDER BY l.order_index NULLS LAST, l.id) AS tests
      FROM public.lessons l
      LEFT JOIN LATERAL (SELECT ta.id, ta.score, ta.max_score, ta.passed, ta.passing_score, ta.completed_at
        FROM public.test_attempts ta WHERE ta.user_id = p_user_id AND ta.lesson_id = l.id
        ORDER BY ta.completed_at DESC NULLS LAST, ta.id DESC LIMIT 1) a ON true
      WHERE l.course_id = e.course_id AND l.type = 'test'
    ) t ON true
    WHERE e.user_id = p_user_id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.course_title, r.course_id), '[]'::jsonb)
    INTO v_result FROM course_results r;
  RETURN jsonb_build_object('organization_id', p_organization_id, 'user_id', p_user_id, 'courses', v_result);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_student_learning_results(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_learning_results(uuid,uuid) TO authenticated;
$s041_source_1$;
BEGIN
 IF md5(replace(v_source_0,chr(13)||chr(10),chr(10)))<>'8fb90b0b12d80b372f929897fdad5d46' THEN RAISE EXCEPTION 'S041 embedded source 0 changed'; END IF;
 IF md5(replace(v_source_1,chr(13)||chr(10),chr(10)))<>'b0f57a122a371e12f49822ae7f57753d' THEN RAISE EXCEPTION 'S041 embedded source 1 changed'; END IF;
WITH expected_functions(signature,expected_md5) AS (VALUES ('public.get_course_student_test_results_page(uuid,integer,integer,text,text,text)','9009d8f0b0480aeeff590b63dccacbc3'),
 ('public.get_course_students_page(uuid,integer,integer,text,text)','7eba308561b797a6959168e37d85a931'),
 ('public.get_course_students_stats(uuid)','c7d78df2a8a802e6b77d4dafde85205b'),
 ('public.get_organization_course_overview(uuid)','8d7e1374ac51f0600baee68d3a57d155'),
 ('public.get_organization_dashboard_summary(uuid)','1986673325d4e4e66e0fc690a1b00424'),
 ('public.get_organization_student_group_counts(uuid)','c8ef4b60f5981e5c1d332486e8c0e867'),
 ('public.get_organization_students_counts(uuid)','e139f9f9cddeabc78434bf0f861936e0'),
 ('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)','79178b91a3749a6f5e3f3d379306c846')),
required_columns(table_name,column_name,type_name) AS (VALUES ('profiles','user_id','uuid'),
 ('profiles','organization_id','uuid'),
 ('profiles','archived_at','timestamp with time zone'),
 ('profiles','full_name','text'),
 ('profiles','email','text'),
 ('profiles','login','text'),
 ('org_staff','user_id','uuid'),
 ('org_staff','organization_id','uuid'),
 ('org_staff','expires_at','timestamp with time zone'),
 ('courses','id','uuid'),
 ('courses','organization_id','uuid'),
 ('courses','title','text'),
 ('enrollments','id','uuid'),
 ('enrollments','user_id','uuid'),
 ('enrollments','course_id','uuid'),
 ('enrollments','progress','integer'),
 ('enrollments','status','text'),
 ('enrollments','started_at','timestamp with time zone'),
 ('enrollments','completed_at','timestamp with time zone'),
 ('enrollments','time_spent','integer'),
 ('lessons','id','uuid'),
 ('lessons','course_id','uuid'),
 ('lessons','type','text'),
 ('lessons','title','text'),
 ('lessons','order_index','integer'),
 ('lessons','test_passing_score','integer'),
 ('test_attempts','id','uuid'),
 ('test_attempts','user_id','uuid'),
 ('test_attempts','lesson_id','uuid'),
 ('test_attempts','score','integer'),
 ('test_attempts','max_score','integer'),
 ('test_attempts','passing_score','integer'),
 ('test_attempts','passed','boolean'),
 ('test_attempts','completed_at','timestamp with time zone'),
 ('course_manual_credits','enrollment_id','uuid'),
 ('course_manual_credits','credited_at','timestamp with time zone'),
 ('course_manual_credits','revoked_at','timestamp with time zone'),
 ('student_deletion_log','student_id','uuid'),
 ('student_deletion_log','organization_id','uuid'),
 ('student_deletion_log','deleted_by','uuid'),
 ('student_deletion_log','metadata','jsonb')),
checks(check_name,ok) AS (
 SELECT 'exact live definition: '||signature, COALESCE(md5(replace(pg_get_functiondef(to_regprocedure(signature)),chr(13)||chr(10),chr(10)))=expected_md5,false) FROM expected_functions
 UNION ALL SELECT 'function ownership: '||e.signature,COALESCE(pg_has_role(current_user,p.proowner,'USAGE'),false) FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 UNION ALL SELECT 'column: '||r.table_name||'.'||r.column_name,EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||r.table_name) AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r.type_name) FROM required_columns r
 UNION ALL SELECT 'required helpers',NOT EXISTS(SELECT 1 FROM (VALUES ('auth.uid()'),('public.has_role(uuid,public.app_role)'),('public.is_org_owner(uuid,uuid)'),('public.is_student_profile(uuid,uuid)'),('public.has_org_staff_permission(uuid,uuid,text)')) f(signature) WHERE to_regprocedure(signature) IS NULL)
 UNION ALL SELECT 'public schema create',has_schema_privilege(current_user,'public','CREATE')
 UNION ALL SELECT 'organizations reference permission',has_table_privilege(current_user,'public.organizations','REFERENCES')
 UNION ALL SELECT 'ledger access',has_table_privilege(current_user,'supabase_migrations.schema_migrations','SELECT') AND has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT')
 UNION ALL SELECT 'both ledger rows absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261007100000','20261007101000'))
 UNION ALL SELECT 'marker table absent',to_regclass('public.student_roster_removals') IS NULL
 UNION ALL SELECT 'new RPCs absent',to_regprocedure('public.set_archived_student_removed(uuid,uuid,boolean)') IS NULL AND to_regprocedure('public.get_student_learning_results(uuid,uuid)') IS NULL
)
SELECT string_agg(check_name,', ' ORDER BY check_name) INTO v_failures FROM checks WHERE ok IS DISTINCT FROM true;
IF v_failures IS NOT NULL THEN RAISE EXCEPTION 'S041 preconditions failed: %',v_failures; END IF;
 EXECUTE v_source_0;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261007100000','student_archive_removal',ARRAY[v_source_0]);
 EXECUTE v_source_1;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261007101000','student_learning_results',ARRAY[v_source_1]);
WITH expected_bodies(signature,expected_md5) AS (VALUES ('public.get_course_student_test_results_page(uuid,integer,integer,text,text,text)','3b0477021dab332faf915c4068b645cd'),
 ('public.get_course_students_page(uuid,integer,integer,text,text)','96c769a4aef12c31a26cf60ed5fee3a6'),
 ('public.get_course_students_stats(uuid)','d2c479644a57371ea661375aeb2b49cf'),
 ('public.get_organization_course_overview(uuid)','1574858ae7f1160d9fb878b9d9d957d5'),
 ('public.get_organization_dashboard_summary(uuid)','356209e0c2140498976ce0e120692b3f'),
 ('public.get_organization_student_group_counts(uuid)','44fa97c91b5b3d2a4189c7be1ea23114'),
 ('public.get_organization_students_counts(uuid)','9f1698ff10ee1259ae3612c83b0b59a4'),
 ('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)','da30d027a3965293a07917a0fed51cf6'),
 ('public.set_archived_student_removed(uuid,uuid,boolean)','6f4d6ca9ec126765dfb7357b0a6984f8'),
 ('public.get_student_learning_results(uuid,uuid)','3513cc3b320806f392e672b15e57fb5b')),
new_functions AS (SELECT * FROM pg_proc WHERE oid IN (to_regprocedure('public.set_archived_student_removed(uuid,uuid,boolean)'),to_regprocedure('public.get_student_learning_results(uuid,uuid)'))),
checks(check_name,ok) AS (
 SELECT 'exact RPC body: '||e.signature,COALESCE(md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.expected_md5,false) FROM expected_bodies e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 UNION ALL SELECT 'marker RLS',COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.student_roster_removals')),false)
 UNION ALL SELECT 'no direct authenticated marker writes',NOT has_table_privilege('authenticated','public.student_roster_removals','INSERT,UPDATE,DELETE')
 UNION ALL SELECT 'no anon marker access',NOT has_table_privilege('anon','public.student_roster_removals','SELECT,INSERT,UPDATE,DELETE')
 UNION ALL SELECT 'new RPC security definer and fixed path',count(*)=2 AND bool_and(prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp']) FROM new_functions
 UNION ALL SELECT 'new RPC authenticated execute',count(*)=2 AND bool_and(has_function_privilege('authenticated',oid,'EXECUTE')) FROM new_functions
 UNION ALL SELECT 'new RPC anon denied',count(*)=2 AND bool_and(NOT has_function_privilege('anon',oid,'EXECUTE')) FROM new_functions
 UNION ALL SELECT 'new RPC PUBLIC denied',NOT EXISTS(SELECT 1 FROM new_functions f,LATERAL aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
 UNION ALL SELECT 'exact ledger: 20261007100000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007100000' AND name='student_archive_removal' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='8fb90b0b12d80b372f929897fdad5d46')
 UNION ALL SELECT 'exact ledger: 20261007101000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007101000' AND name='student_learning_results' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='b0f57a122a371e12f49822ae7f57753d')
)
SELECT string_agg(check_name,', ' ORDER BY check_name) INTO v_failures FROM checks WHERE ok IS DISTINCT FROM true;
IF v_failures IS NOT NULL THEN RAISE EXCEPTION 'S041 postconditions failed: %',v_failures; END IF;
END;
$s041_release$;
NOTIFY pgrst,'reload schema';
COMMIT;
