-- Current executor diagnostics, no credentials. Ownership checks above use actual role membership.
SELECT current_user AS executor,current_role AS active_role,current_setting('server_version') AS server_version,r.rolsuper,r.rolinherit FROM pg_roles r WHERE r.rolname=current_user;

-- Recovery metadata only, no student rows. Compare against saved source.
SELECT p.oid::regprocedure::text AS signature, md5(replace(p.prosrc,chr(13)||chr(10),chr(10))) AS source_md5,
  p.prosecdef, p.provolatile, p.proconfig, pg_get_function_result(p.oid) AS result_type,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
  FROM pg_proc p WHERE p.oid IN (to_regprocedure('public.start_test_attempt(uuid,uuid)'),to_regprocedure('public.submit_test_attempt(uuid,jsonb)'),to_regprocedure('public.get_student_test_state(uuid)')) ORDER BY signature;
