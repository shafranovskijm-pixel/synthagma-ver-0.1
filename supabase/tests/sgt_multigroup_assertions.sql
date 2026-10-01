SET test.uid = '30000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $test$
DECLARE
  n integer;
  org uuid := '10000000-0000-0000-0000-000000000001';
  s1 uuid := '30000000-0000-0000-0000-000000000002';
  s2 uuid := '30000000-0000-0000-0000-000000000003';
  g1 uuid := '20000000-0000-0000-0000-000000000001';
  g2 uuid := '20000000-0000-0000-0000-000000000002';
  g3 uuid := '20000000-0000-0000-0000-000000000003';
BEGIN
  SELECT count(*) INTO n FROM add_students_to_groups(org,ARRAY[s1,s1,s2],ARRAY[g1,g2,g2,g3]);
  IF n<>6 THEN RAISE EXCEPTION 'distinct bulk pairs failed: %',n; END IF;
  SELECT count(*) INTO n FROM add_students_to_groups(org,ARRAY[s1,s2],ARRAY[g1,g2,g3]);
  IF n<>6 THEN RAISE EXCEPTION 'idempotent repeated response failed'; END IF;
  SELECT count(*) INTO n FROM student_group_memberships;
  IF n<>5 THEN RAISE EXCEPTION 'duplicate or unnecessary primary membership stored'; END IF;
  IF (SELECT student_group_id FROM profiles WHERE user_id=s1) IS DISTINCT FROM g1
    OR (SELECT department FROM profiles WHERE user_id=s1)<>'Department A'
    OR (SELECT generated_password FROM profiles WHERE user_id=s1)<>'Fixture preserved password'
    OR (SELECT progress FROM enrollments WHERE user_id=s1)<>73
    OR (SELECT count(*) FROM enrollments)<>1 THEN
    RAISE EXCEPTION 'primary, account, department or enrollment changed';
  END IF;
  IF (SELECT count(*) FROM student_group_profiles_effective WHERE group_id=g2 AND organization_id=org)<>2 THEN
    RAISE EXCEPTION 'second group roster incorrect';
  END IF;
  IF (SELECT active_count FROM get_organization_student_group_counts(org) WHERE group_id=g2)<>2 THEN
    RAISE EXCEPTION 'group count incorrect';
  END IF;
  SELECT count(*) INTO n FROM get_organization_students_page(org,p_group_filter=>g2::text);
  IF n<>2 THEN RAISE EXCEPTION 'pagination group filter lost additional members'; END IF;
  SELECT count(*) INTO n FROM get_organization_students_page(org,p_group_filter=>'no_group');
  IF n<>0 THEN RAISE EXCEPTION 'no_group includes additional member'; END IF;
  SELECT count(*) INTO n FROM get_organization_students_page(org,p_group_filter=>'all');
  IF n<>2 THEN RAISE EXCEPTION 'organization list duplicates a multi-group student'; END IF;
  BEGIN
    PERFORM add_students_to_groups(org,ARRAY[s1,'30000000-0000-0000-0000-000000000005'::uuid],ARRAY[g3]);
    RAISE EXCEPTION 'foreign student accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM add_students_to_groups(org,ARRAY[s1],ARRAY['20000000-0000-0000-0000-000000000004'::uuid]);
    RAISE EXCEPTION 'foreign group accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM add_students_to_groups(org,ARRAY['30000000-0000-0000-0000-000000000004'::uuid],ARRAY[g3]);
    RAISE EXCEPTION 'archived student accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  SELECT count(*) INTO n FROM issue_education_document_batch(org,g2,'50000000-0000-0000-0000-000000000001',
    '[{"user_id":"30000000-0000-0000-0000-000000000002","enrollment_id":"60000000-0000-0000-0000-000000000001","document_type":"certificate","issue_date":"2026-10-01","full_name":"Fixture student A"}]');
  IF n<>1 THEN RAISE EXCEPTION 'additional group document issuance rejected'; END IF;
  RAISE NOTICE 'PASS: distinct/idempotent bulk, preserved primary/account/enrollment, second-group roster/count/pagination/document access, tenant/archive rejection';
END;
$test$;

SET test.uid = '30000000-0000-0000-0000-000000000002';
DO $test$
BEGIN
  IF NOT public.can_access_organization('10000000-0000-0000-0000-000000000001','students.read') THEN
    RAISE EXCEPTION 'fixture no longer exercises permissive legacy organization ACL';
  END IF;
  IF (SELECT count(*) FROM student_group_memberships WHERE user_id <> auth.uid()) <> 0 THEN
    RAISE EXCEPTION 'ordinary learner can read another learner additional memberships';
  END IF;
  IF (SELECT count(*) FROM student_group_memberships WHERE user_id = auth.uid()) <> 2 THEN
    RAISE EXCEPTION 'ordinary learner cannot read own additional memberships';
  END IF;
  -- Group 2 has no primary members, so these reads specifically exercise the
  -- junction policy through both security-invoker views, not legacy profile ACL.
  IF (SELECT count(*) FROM student_group_memberships_effective
      WHERE group_id='20000000-0000-0000-0000-000000000002' AND user_id <> auth.uid()) <> 0
    OR (SELECT count(*) FROM student_group_profiles_effective
      WHERE group_id='20000000-0000-0000-0000-000000000002' AND user_id <> auth.uid()) <> 0 THEN
    RAISE EXCEPTION 'security-invoker view exposes another learner additional membership';
  END IF;
  IF (SELECT count(*) FROM student_group_profiles_effective
      WHERE group_id='20000000-0000-0000-0000-000000000002' AND user_id = auth.uid()) <> 1 THEN
    RAISE EXCEPTION 'security-invoker view hides learner own additional membership';
  END IF;
  RAISE NOTICE 'PASS: authenticated learner reads only own additional memberships; security-invoker views preserve junction RLS';
  BEGIN
    PERFORM add_students_to_groups('10000000-0000-0000-0000-000000000001',ARRAY['30000000-0000-0000-0000-000000000003'::uuid],ARRAY['20000000-0000-0000-0000-000000000003'::uuid]);
    RAISE EXCEPTION 'student could manage group memberships through legacy broad ACL';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: student denied despite legacy can_access_organization=true';
END;
$test$;

SET test.uid = '30000000-0000-0000-0000-000000000006';
DO $test$
BEGIN
  IF (SELECT count(*) FROM student_group_memberships) <> 5 THEN
    RAISE EXCEPTION 'active students.read staff cannot read organization memberships';
  END IF;
  PERFORM add_students_to_groups('10000000-0000-0000-0000-000000000001',ARRAY['30000000-0000-0000-0000-000000000002'::uuid],ARRAY['20000000-0000-0000-0000-000000000003'::uuid]);
  RAISE NOTICE 'PASS: active students.write staff allowed';
END;
$test$;
RESET ROLE;
UPDATE org_staff SET expires_at=now()-interval '1 hour';
SET ROLE authenticated;
DO $test$
BEGIN
  IF (SELECT count(*) FROM student_group_memberships) <> 0 THEN
    RAISE EXCEPTION 'expired staff can read other learner additional memberships';
  END IF;
  BEGIN
    PERFORM add_students_to_groups('10000000-0000-0000-0000-000000000001',ARRAY['30000000-0000-0000-0000-000000000002'::uuid],ARRAY['20000000-0000-0000-0000-000000000003'::uuid]);
    RAISE EXCEPTION 'expired staff accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: expired staff denied';
END;
$test$;
RESET ROLE;
DO $test$
BEGIN
  BEGIN
    INSERT INTO student_group_memberships(organization_id,group_id,user_id) VALUES
      ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000005');
    RAISE EXCEPTION 'composite tenant FK bypassed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  DELETE FROM student_groups WHERE id='20000000-0000-0000-0000-000000000002';
  IF (SELECT count(*) FROM profiles)<>6 OR (SELECT count(*) FROM enrollments)<>1
    OR (SELECT count(*) FROM student_group_memberships_effective WHERE group_id='20000000-0000-0000-0000-000000000003')<>2 THEN
    RAISE EXCEPTION 'group deletion damaged other groups/accounts/enrollments';
  END IF;
  RAISE NOTICE 'PASS: composite tenant FK, deleting one group preserves other memberships/accounts/enrollments';
END;
$test$;
