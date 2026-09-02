-- Atomic structured import for the CSZ 178-hour course package.
-- A PostgreSQL function call is one transaction: any validation or INSERT
-- failure rolls back the course header and every dependent row.

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass
      AND conname = 'lessons_metadata_is_object'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_metadata_is_object
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;
END
$constraint$;

CREATE INDEX IF NOT EXISTS idx_lessons_final_assessment
  ON public.lessons (course_id, order_index)
  WHERE metadata @> '{"final_assessment": true}'::jsonb;

CREATE OR REPLACE FUNCTION public.import_csz_course_draft_v1(
  p_organization_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_modules jsonb;
  v_lessons jsonb;
  v_documents jsonb;
  v_module jsonb;
  v_lesson jsonb;
  v_question jsonb;
  v_document jsonb;
  v_metadata jsonb;
  v_questions jsonb;
  v_options jsonb;
  v_module_map jsonb := '{}'::jsonb;
  v_module_id uuid;
  v_lesson_id uuid;
  v_course_id uuid;
  v_module_key text;
  v_lesson_key text;
  v_lesson_type text;
  v_source_kind text;
  v_order_index integer;
  v_question_index integer;
  v_expected_questions integer;
  v_distinct_count integer;
  v_text_count integer;
  v_homework_count integer;
  v_test_count integer;
  v_question_count integer := 0;
  v_official_count integer;
  v_manufacturer_count integer;
  v_final_count integer;
  v_final_homework_count integer;
  v_final_test_count integer;
  v_actual_modules integer;
  v_actual_lessons integer;
  v_actual_questions integer;
  v_actual_documents integer;
  v_is_published boolean;
  v_is_final boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
     OR NOT public.can_access_organization(p_organization_id, 'courses.write')
  THEN
    RAISE EXCEPTION 'Insufficient permission to import course'
      USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_payload::text) > 10 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Payload exceeds 10 MB' USING ERRCODE = '22023';
  END IF;
  IF p_payload->>'schema_version' <> '1'
     OR p_payload->>'source_kind' <> 'csz-178h-html'
  THEN
    RAISE EXCEPTION 'Unsupported CSZ import schema' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_payload->>'title', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Course title is required' USING ERRCODE = '22023';
  END IF;

  v_modules := p_payload->'modules';
  v_lessons := p_payload->'lessons';
  v_documents := p_payload->'documents';
  IF jsonb_typeof(v_modules) <> 'array'
     OR jsonb_typeof(v_lessons) <> 'array'
     OR jsonb_typeof(v_documents) <> 'array'
  THEN
    RAISE EXCEPTION 'modules, lessons and documents must be arrays'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(v_modules) <> 11 THEN
    RAISE EXCEPTION 'CSZ import requires exactly 11 modules'
      USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(v_lessons) <> 46 THEN
    RAISE EXCEPTION 'CSZ import requires exactly 46 lessons'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT item->>'key')
    INTO v_distinct_count
  FROM jsonb_array_elements(v_modules) AS items(item);
  IF v_distinct_count <> 11 THEN
    RAISE EXCEPTION 'Module keys must be unique' USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT item->>'order_index')
    INTO v_distinct_count
  FROM jsonb_array_elements(v_modules) AS items(item);
  IF v_distinct_count <> 11 THEN
    RAISE EXCEPTION 'Module order indexes must be unique' USING ERRCODE = '23514';
  END IF;

  FOR v_module IN
    SELECT item
    FROM jsonb_array_elements(v_modules) AS items(item)
  LOOP
    IF jsonb_typeof(v_module) <> 'object'
       OR COALESCE(v_module->>'order_index', '') !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'Invalid module entry' USING ERRCODE = '22023';
    END IF;
    v_order_index := (v_module->>'order_index')::integer;
    v_module_key := btrim(COALESCE(v_module->>'key', ''));
    IF v_order_index < 0 OR v_order_index > 10
       OR v_module_key <> 'module-' || (v_order_index + 1)::text
       OR NULLIF(btrim(COALESCE(v_module->>'title', '')), '') IS NULL
    THEN
      RAISE EXCEPTION 'Invalid module key, title or order'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT count(DISTINCT item->>'key')
    INTO v_distinct_count
  FROM jsonb_array_elements(v_lessons) AS items(item);
  IF v_distinct_count <> 46 THEN
    RAISE EXCEPTION 'Lesson keys must be unique' USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT item->>'order_index')
    INTO v_distinct_count
  FROM jsonb_array_elements(v_lessons) AS items(item);
  IF v_distinct_count <> 46 THEN
    RAISE EXCEPTION 'Lesson order indexes must be unique' USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) FILTER (WHERE item->>'type' = 'text'),
    count(*) FILTER (WHERE item->>'type' = 'homework'),
    count(*) FILTER (WHERE item->>'type' = 'test')
  INTO v_text_count, v_homework_count, v_test_count
  FROM jsonb_array_elements(v_lessons) AS items(item);
  IF v_text_count <> 22 OR v_homework_count <> 12 OR v_test_count <> 12 THEN
    RAISE EXCEPTION 'CSZ lesson types must be text=22, homework=12, test=12'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE item->>'type' = 'homework'),
    count(*) FILTER (WHERE item->>'type' = 'test')
  INTO v_final_count, v_final_homework_count, v_final_test_count
  FROM jsonb_array_elements(v_lessons) AS items(item)
  WHERE item->'metadata'->'final_assessment' = 'true'::jsonb;
  IF v_final_count <> 2 OR v_final_homework_count <> 1 OR v_final_test_count <> 1 THEN
    RAISE EXCEPTION 'Final assessment must contain one homework and one test'
      USING ERRCODE = '23514';
  END IF;

  FOR v_module IN
    SELECT item
    FROM jsonb_array_elements(v_modules) AS modules(item)
  LOOP
    SELECT
      count(*),
      count(*) FILTER (WHERE item->>'type' = 'text'),
      count(*) FILTER (WHERE item->>'type' = 'homework'),
      count(*) FILTER (WHERE item->>'type' = 'test')
    INTO v_actual_lessons, v_text_count, v_homework_count, v_test_count
    FROM jsonb_array_elements(v_lessons) AS lessons(item)
    WHERE item->>'module_key' = v_module->>'key'
      AND COALESCE(item->'metadata'->'final_assessment', 'false'::jsonb) <> 'true'::jsonb;
    IF v_actual_lessons <> 4
       OR v_text_count <> 2
       OR v_homework_count <> 1
       OR v_test_count <> 1
    THEN
      RAISE EXCEPTION 'Module % must contain two text lessons, one homework and one test', v_module->>'key'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  FOR v_lesson IN
    SELECT item
    FROM jsonb_array_elements(v_lessons) AS items(item)
  LOOP
    IF jsonb_typeof(v_lesson) <> 'object'
       OR COALESCE(v_lesson->>'order_index', '') !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'Invalid lesson entry' USING ERRCODE = '22023';
    END IF;

    v_lesson_key := btrim(COALESCE(v_lesson->>'key', ''));
    v_module_key := btrim(COALESCE(v_lesson->>'module_key', ''));
    v_lesson_type := v_lesson->>'type';
    v_order_index := (v_lesson->>'order_index')::integer;
    v_metadata := COALESCE(v_lesson->'metadata', '{}'::jsonb);
    v_questions := COALESCE(v_lesson->'questions', '[]'::jsonb);

    IF v_order_index < 0 OR v_order_index > 45
       OR NULLIF(v_lesson_key, '') IS NULL
       OR NULLIF(btrim(COALESCE(v_lesson->>'title', '')), '') IS NULL
       OR v_lesson_type NOT IN ('text', 'homework', 'test')
       OR COALESCE(v_lesson->>'test_passing_score', '') !~ '^[0-9]+$'
       OR (v_lesson->>'test_passing_score')::integer < 0
       OR (v_lesson->>'test_passing_score')::integer > 100
       OR jsonb_typeof(v_metadata) <> 'object'
       OR jsonb_typeof(v_questions) <> 'array'
    THEN
      RAISE EXCEPTION 'Invalid lesson key, title, type, metadata or questions'
        USING ERRCODE = '23514';
    END IF;

    IF v_lesson_type <> 'test'
       AND (
         NULLIF(v_lesson->>'content', '') IS NULL
         OR jsonb_typeof((v_lesson->>'content')::jsonb) <> 'array'
       )
    THEN
      RAISE EXCEPTION 'Lesson % content must be a JSON block array', v_lesson_key
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_modules) AS modules(item)
      WHERE item->>'key' = v_module_key
    ) THEN
      RAISE EXCEPTION 'Lesson % references an unknown module', v_lesson_key
        USING ERRCODE = '23514';
    END IF;

    v_is_final := v_metadata->'final_assessment' = 'true'::jsonb;
    IF v_is_final AND v_module_key <> 'module-11' THEN
      RAISE EXCEPTION 'Final assessment lessons must belong to module-11'
        USING ERRCODE = '23514';
    END IF;

    IF v_lesson_type = 'test' THEN
      v_expected_questions := CASE WHEN v_is_final THEN 12 ELSE 5 END;
    ELSE
      v_expected_questions := 0;
    END IF;
    IF jsonb_array_length(v_questions) <> v_expected_questions THEN
      RAISE EXCEPTION 'Lesson % must have % questions', v_lesson_key, v_expected_questions
        USING ERRCODE = '23514';
    END IF;

    FOR v_question, v_question_index IN
      SELECT item, (ordinality - 1)::integer
      FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS questions(item, ordinality)
    LOOP
      v_options := v_question->'options';
      IF jsonb_typeof(v_question) <> 'object'
         OR NULLIF(btrim(COALESCE(v_question->>'question', '')), '') IS NULL
         OR jsonb_typeof(v_options) <> 'array'
         OR jsonb_array_length(v_options) <> 4
         OR COALESCE(v_question->>'correct_answer', '') !~ '^[0-3]$'
         OR COALESCE(v_question->>'order_index', '') !~ '^[0-9]+$'
         OR (v_question->>'order_index')::integer <> v_question_index
      THEN
        RAISE EXCEPTION 'Invalid question in lesson %', v_lesson_key
          USING ERRCODE = '23514';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_options) AS options(item)
        WHERE jsonb_typeof(item) <> 'object'
           OR NULLIF(btrim(COALESCE(item->>'text', '')), '') IS NULL
      ) THEN
        RAISE EXCEPTION 'Question options must contain four non-empty texts'
          USING ERRCODE = '23514';
      END IF;
      v_question_count := v_question_count + 1;
    END LOOP;
  END LOOP;

  IF v_question_count <> 67 THEN
    RAISE EXCEPTION 'CSZ import requires exactly 67 test questions'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) FILTER (WHERE item->>'source_kind' = 'official'),
    count(*) FILTER (WHERE item->>'source_kind' = 'manufacturer')
  INTO v_official_count, v_manufacturer_count
  FROM jsonb_array_elements(v_documents) AS documents(item);
  IF v_official_count <> 8 OR v_manufacturer_count <> 20 THEN
    RAISE EXCEPTION 'Exactly 8 official and 20 manufacturer resources are required'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT item->>'file_url')
    INTO v_distinct_count
  FROM jsonb_array_elements(v_documents) AS documents(item);
  IF v_distinct_count <> jsonb_array_length(v_documents) THEN
    RAISE EXCEPTION 'Resource URLs must be unique' USING ERRCODE = '23514';
  END IF;

  FOR v_document IN
    SELECT item
    FROM jsonb_array_elements(v_documents) AS documents(item)
  LOOP
    v_source_kind := v_document->>'source_kind';
    IF jsonb_typeof(v_document) <> 'object'
       OR v_source_kind NOT IN ('official', 'manufacturer')
       OR NULLIF(btrim(COALESCE(v_document->>'name', '')), '') IS NULL
       OR COALESCE(v_document->>'file_url', '') !~ '^https://'
       OR (
         v_source_kind = 'manufacturer'
         AND (
           COALESCE(v_document->>'source_module_number', '') !~ '^[0-9]+$'
           OR (v_document->>'source_module_number')::integer NOT BETWEEN 2 AND 11
         )
       )
    THEN
      RAISE EXCEPTION 'Invalid course resource' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM generate_series(2, 11) AS required(module_number)
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_documents) AS documents(item)
      WHERE item->>'source_kind' = 'manufacturer'
        AND COALESCE(item->>'source_module_number', '') ~ '^[0-9]+$'
        AND (item->>'source_module_number')::integer = required.module_number
    )
  ) THEN
    RAISE EXCEPTION 'Manufacturer resources must cover every module from 2 through 11'
      USING ERRCODE = '23514';
  END IF;

  -- The tariff trigger on courses runs inside this same transaction.
  INSERT INTO public.courses (
    organization_id,
    title,
    description,
    is_published
  )
  VALUES (
    p_organization_id,
    btrim(p_payload->>'title'),
    NULLIF(btrim(COALESCE(p_payload->>'description', '')), ''),
    false
  )
  RETURNING id INTO v_course_id;

  FOR v_module IN
    SELECT item
    FROM jsonb_array_elements(v_modules) AS modules(item)
    ORDER BY (item->>'order_index')::integer
  LOOP
    v_module_key := v_module->>'key';
    INSERT INTO public.course_modules (course_id, title, order_index)
    VALUES (
      v_course_id,
      btrim(v_module->>'title'),
      (v_module->>'order_index')::integer
    )
    RETURNING id INTO v_module_id;
    v_module_map := v_module_map || jsonb_build_object(v_module_key, v_module_id::text);
  END LOOP;

  FOR v_lesson IN
    SELECT item
    FROM jsonb_array_elements(v_lessons) AS lessons(item)
    ORDER BY (item->>'order_index')::integer
  LOOP
    v_module_key := v_lesson->>'module_key';
    v_lesson_type := v_lesson->>'type';
    v_metadata := COALESCE(v_lesson->'metadata', '{}'::jsonb);
    v_questions := COALESCE(v_lesson->'questions', '[]'::jsonb);

    INSERT INTO public.lessons (
      course_id,
      module_id,
      title,
      type,
      content,
      order_index,
      test_passing_score,
      test_questions_count,
      test_questions_to_show,
      test_show_answers,
      is_locked,
      metadata
    )
    VALUES (
      v_course_id,
      (v_module_map->>v_module_key)::uuid,
      btrim(v_lesson->>'title'),
      v_lesson_type,
      NULLIF(v_lesson->>'content', ''),
      (v_lesson->>'order_index')::integer,
      COALESCE((v_lesson->>'test_passing_score')::integer, 60),
      CASE WHEN v_lesson_type = 'test' THEN jsonb_array_length(v_questions) ELSE NULL END,
      NULL,
      true,
      false,
      v_metadata
    )
    RETURNING id INTO v_lesson_id;

    FOR v_question IN
      SELECT item
      FROM jsonb_array_elements(v_questions) AS questions(item)
      ORDER BY (item->>'order_index')::integer
    LOOP
      INSERT INTO public.test_questions (
        lesson_id,
        question,
        options,
        correct_answer,
        order_index,
        explanation,
        is_bank_question
      )
      VALUES (
        v_lesson_id,
        btrim(v_question->>'question'),
        v_question->'options',
        (v_question->>'correct_answer')::integer,
        (v_question->>'order_index')::integer,
        NULLIF(btrim(COALESCE(v_question->>'explanation', '')), ''),
        false
      );
    END LOOP;
  END LOOP;

  FOR v_document IN
    SELECT item
    FROM jsonb_array_elements(v_documents) AS documents(item)
  LOOP
    v_source_kind := v_document->>'source_kind';
    INSERT INTO public.course_documents (
      course_id,
      name,
      type,
      description,
      file_url
    )
    VALUES (
      v_course_id,
      btrim(v_document->>'name'),
      'link',
      '[source_kind=' || v_source_kind
        || CASE
          WHEN COALESCE(v_document->>'source_module_number', '') ~ '^[0-9]+$'
          THEN '; module=' || (v_document->>'source_module_number')
          ELSE ''
        END
        || '] ' || btrim(COALESCE(v_document->>'description', '')),
      v_document->>'file_url'
    );
  END LOOP;

  SELECT is_published
    INTO v_is_published
  FROM public.courses
  WHERE id = v_course_id;
  SELECT count(*) INTO v_actual_modules
    FROM public.course_modules WHERE course_id = v_course_id;
  SELECT count(*) INTO v_actual_lessons
    FROM public.lessons WHERE course_id = v_course_id;
  SELECT count(*) INTO v_actual_questions
    FROM public.test_questions q
    JOIN public.lessons l ON l.id = q.lesson_id
    WHERE l.course_id = v_course_id;
  SELECT count(*) INTO v_actual_documents
    FROM public.course_documents WHERE course_id = v_course_id;

  IF v_is_published
     OR v_actual_modules <> 11
     OR v_actual_lessons <> 46
     OR v_actual_questions <> 67
     OR v_actual_documents <> jsonb_array_length(v_documents)
  THEN
    RAISE EXCEPTION 'Post-import verification failed' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'course_id', v_course_id,
    'is_published', false,
    'module_count', v_actual_modules,
    'lesson_count', v_actual_lessons,
    'question_count', v_actual_questions,
    'document_count', v_actual_documents
  );
END
$function$;

REVOKE ALL ON FUNCTION public.import_csz_course_draft_v1(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_csz_course_draft_v1(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_csz_course_draft_v1(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.import_csz_course_draft_v1(uuid, jsonb) IS
  'Atomically imports the validated CSZ 178-hour course as an unpublished draft.';
