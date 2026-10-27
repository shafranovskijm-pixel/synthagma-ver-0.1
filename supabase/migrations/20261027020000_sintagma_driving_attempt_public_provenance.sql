-- Source companion for migration version 20261027020000; not yet applied.
-- One existing driving attempt writer, with exact old/new body and complete header/ACL guards.
-- New entries capture configured programme/visible-question metadata at submission.
-- Execute atomically through migration tooling; ledger handling belongs to the runner.
-- No historical rewrite, private bank, QA fixture, new grant or production acceptance receipt.
DO $as004_one_attempt_provenance$
DECLARE
 function_oid oid;
 before_header jsonb;
 after_header jsonb;
 replacement constant text := $as004_exact_replacement$CREATE OR REPLACE FUNCTION public.driving_submit_attempt(_organization_id uuid, _course_id uuid, _answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text; v_student_id uuid; v_student public.driving_students;
  v_course public.driving_courses; v_total integer; v_correct integer;
  v_program public.driving_programs; v_public_projection jsonb;
  v_public_hash text; v_public_digest_status text;
  v_score integer; v_passed boolean; v_id uuid; v_data jsonb;
  v_index integer; v_answer numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('driving:' || _organization_id::text, 0));
  SELECT m.role::text, m.student_id INTO v_role, v_student_id
  FROM public.driving_membership(_organization_id) m;
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: тест проходит ученик автошколы' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_student FROM public.driving_students
  WHERE organization_id = _organization_id AND id = v_student_id;
  SELECT * INTO v_course FROM public.driving_courses
  WHERE organization_id = _organization_id AND id = _course_id;
  IF v_course.id IS NULL OR v_course.program_id <> v_student.program_id THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: этот курс не назначен' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_program FROM public.driving_programs
  WHERE organization_id = _organization_id AND id = v_student.program_id;
  IF v_program.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: назначенная программа не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: ответы должны быть массивом' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(v_course.questions);
  IF v_total < 1 OR jsonb_array_length(_answers) <> v_total THEN
    RAISE EXCEPTION 'DRIVING_INVALID: ответьте на все вопросы' USING ERRCODE = '22023';
  END IF;
  FOR v_index IN 0..v_total-1 LOOP
    IF jsonb_typeof(_answers->v_index) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'DRIVING_INVALID: выберите ответ на каждый вопрос' USING ERRCODE = '22023';
    END IF;
    v_answer := (_answers->>v_index)::numeric;
    IF v_answer <> trunc(v_answer) OR v_answer < 0
       OR v_answer >= jsonb_array_length(v_course.questions->v_index->'options') THEN
      RAISE EXCEPTION 'DRIVING_INVALID: номер ответа вне диапазона вариантов' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT COUNT(*)::integer INTO v_correct
  FROM jsonb_array_elements(v_course.questions) WITH ORDINALITY AS q(item, ord)
  WHERE (q.item->>'correct')::numeric = (_answers->>((q.ord - 1)::integer))::numeric;
  v_score := ROUND((v_correct::numeric / v_total) * 100)::integer;
  v_passed := v_score >= v_course.pass_percent;
  -- A public digest must never attest the answer key: short banks make full-key hashes enumerable.
  -- Malformed legacy projections keep the existing grade and explicitly have no digest.
  v_public_digest_status := 'unavailable_invalid_public_projection';
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_course.questions) q(item)
    WHERE jsonb_typeof(q.item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(q.item->'text') IS DISTINCT FROM 'string'
      OR jsonb_typeof(q.item->'options') IS DISTINCT FROM 'array'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_course.questions) q(item)
      CROSS JOIN LATERAL jsonb_array_elements(q.item->'options') o(item)
      WHERE jsonb_typeof(o.item) IS DISTINCT FROM 'string'
    ) THEN
      SELECT jsonb_agg(jsonb_build_object('text',q.item->'text','options',q.item->'options') ORDER BY q.ord)
        INTO v_public_projection
      FROM jsonb_array_elements(v_course.questions) WITH ORDINALITY q(item,ord);
      v_public_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_public_projection::text,'UTF8')),'hex');
      v_public_digest_status := 'captured';
    END IF;
  END IF;
  v_data := jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name,
    'score', v_score, 'passed', v_passed, 'answers', _answers,
    'assessment_evidence', jsonb_build_object(
      'schema_version', 1,
      'basis', 'configured_at_submission',
      'captured_at', to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'assigned_program', jsonb_build_object('id',v_program.id,'name',v_program.name,
        'version',v_program.version,'category',v_program.category,'transmission',v_program.transmission),
      'course', jsonb_build_object('id',v_course.id,'program_id',v_course.program_id,
        'pass_percent',v_course.pass_percent,'question_count',v_total),
      'scoring', jsonb_build_object('correct_count',v_correct,'rule','round_correct_count_over_question_count_percent_v1'),
      'public_digest_scope', 'question_text_options_v1',
      'public_digest_algorithm', 'sha256_jsonb_utf8',
      'public_digest_status', v_public_digest_status,
      'public_question_set_hash', v_public_hash));
  INSERT INTO public.driving_entries(organization_id, student_id, kind, data, created_by)
  VALUES (_organization_id, v_student.id, 'attempt', v_data, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.driving_log(_organization_id, 'test_attempt', v_id::text,
    jsonb_build_object('score', v_score, 'passed', v_passed));
  RETURN jsonb_build_object('id', v_id, 'score', v_score, 'passed', v_passed);
END; $function$;
$as004_exact_replacement$;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' OR session_user IS DISTINCT FROM 'postgres'
   OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
   OR current_setting('session_replication_role') IS DISTINCT FROM 'origin' THEN
   RAISE EXCEPTION 'AS004_ROOT_READ_COMMITTED_ORIGIN_REQUIRED' USING ERRCODE = '55000';
 END IF;
 function_oid := to_regprocedure('public.driving_submit_attempt(uuid,uuid,jsonb)');
 IF function_oid IS NULL OR (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
   FROM pg_proc p WHERE p.oid = function_oid) IS DISTINCT FROM 'c3c9995bf9bb6e98294487e06c56207345e22b8f8fa0d8430c3bf2b147d92f5d'
   OR (SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') FROM pg_proc p WHERE p.oid = function_oid)
     IS DISTINCT FROM 'a779edc4c51226c21e2d054373e17816bd1d87e5879600a58da7cdd3168f1879' THEN
   RAISE EXCEPTION 'AS004_EXACT_CURRENT_SUBMIT_ATTEMPT_REQUIRED' USING ERRCODE = '55000';
 END IF;
 IF (SELECT p.prokind = 'f' AND pg_get_userbyid(p.proowner) = 'postgres' AND p.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::text[]
   AND p.prorettype = 'jsonb'::regtype AND NOT p.proretset
   AND has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
   FROM pg_proc p WHERE p.oid = function_oid) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'AS004_CURRENT_SUBMIT_OWNER_HEADER_ACL_REQUIRED' USING ERRCODE = '55000';
 END IF;
 SELECT to_jsonb(p)-'prosrc' INTO before_header FROM pg_proc p WHERE p.oid = function_oid;
 EXECUTE replacement;
 SELECT to_jsonb(p)-'prosrc' INTO after_header FROM pg_proc p WHERE p.oid = function_oid;
 IF after_header IS DISTINCT FROM before_header
   OR (SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') FROM pg_proc p WHERE p.oid = function_oid)
     IS DISTINCT FROM '23429ed7d8b70b84f384a9144cafb3f196608e682eca8fa7817fa8a11f240cd5' THEN
   RAISE EXCEPTION 'AS004_SUBMIT_HEADER_ACL_OR_NEW_BODY_MISMATCH' USING ERRCODE = '55000';
 END IF;
END;
$as004_one_attempt_provenance$;
