-- Run only against the local sgt_import_test fixture, never the working database.
BEGIN;
UPDATE public.profiles SET login='Own.Login',full_name='Семёнов Иван' WHERE user_id='30000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET full_name='семенов  Иван' WHERE user_id='30000000-0000-0000-0000-000000000003';
UPDATE public.profiles SET login='Foreign.Login',full_name='Foreign name' WHERE user_id='30000000-0000-0000-0000-000000000005';
UPDATE public.org_staff SET expires_at=NULL,permissions=ARRAY['students.write','students.read'] WHERE user_id='30000000-0000-0000-0000-000000000006';
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS
  $$ SELECT jsonb_build_object('role',COALESCE(NULLIF(current_setting('test.role',true),''),'authenticated')) $$;
SET LOCAL ROLE authenticated;
SELECT set_config('test.uid','30000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001',
    '[{"row_index":1,"login":" own.login ","full_name":"СЕМЕНОВ Иван"}]');
  IF NOT r.login_taken OR r.name_matches <> 2 THEN RAISE EXCEPTION 'own login/name normalization failed: login=%, matches=%',r.login_taken,r.name_matches; END IF;
  SELECT * INTO r FROM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001',
    '[{"row_index":1,"login":"foreign.login","full_name":"Foreign name"}]');
  IF NOT r.login_taken OR r.name_matches <> 0 THEN RAISE EXCEPTION 'foreign identity privacy failed'; END IF;
  BEGIN
    PERFORM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001','[{"row_index":1,"password":"fixture-only"}]');
    RAISE EXCEPTION 'password unexpectedly accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('test.uid','30000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001','[{"row_index":1}]');
    RAISE EXCEPTION 'student unexpectedly authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001','[{"row_index":1}]','30000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'spoofed actor unexpectedly authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.uid','30000000-0000-0000-0000-000000000006',true);
DO $$ BEGIN
  PERFORM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001','[{"row_index":1}]');
  BEGIN
    PERFORM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000002','[{"row_index":1}]');
    RAISE EXCEPTION 'foreign tenant unexpectedly authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.org_staff SET expires_at=now()-interval '1 minute';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001','[{"row_index":1}]');
    RAISE EXCEPTION 'expired staff unexpectedly authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  BEGIN
    UPDATE public.profiles SET login='own.login' WHERE user_id='30000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'normalized duplicate unexpectedly written';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SET LOCAL ROLE service_role;
SELECT set_config('test.role','service_role',true),set_config('test.uid','',true);
DO $$ BEGIN
  PERFORM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001','[{"row_index":1}]','30000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.student_import_identity_preflight('10000000-0000-0000-0000-000000000001','[{"row_index":1}]','30000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'service plain student unexpectedly authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: import normalization, homonyms, cross-tenant privacy, actor/role ACL, forbidden password input, normalized uniqueness' AS result;
ROLLBACK;
