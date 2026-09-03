-- Atomic v2 importer for the learner-safe CSZ 178-hour package.
--
-- The v2 payload contains 35 lessons and a closed question bank. Test answers
-- are inserted into test_questions, never into learner lesson HTML. The eight
-- official HTTPS references are created as needs_review library cards and are
-- hidden from learners until an administrator verifies and activates them.

-- Disable the obsolete 46-lesson entrypoint as soon as v2 is installed. The
-- function is retained for migration history/audit but cannot be called by a
-- public, anonymous or authenticated client.
REVOKE ALL ON FUNCTION public.import_csz_course_draft_v1(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_csz_course_draft_v1(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.import_csz_course_draft_v1(uuid, jsonb) FROM authenticated;

CREATE OR REPLACE FUNCTION public.import_csz_course_draft_v2(
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
  v_questions jsonb;
  v_options jsonb;
  v_metadata jsonb;
  v_module_map jsonb := '{}'::jsonb;
  v_course_id uuid;
  v_module_id uuid;
  v_lesson_id uuid;
  v_library_document_id uuid;
  v_module_key text;
  v_expected_module_title text;
  v_lesson_key text;
  v_lesson_type text;
  v_order_index integer;
  v_module_number integer;
  v_question_index integer;
  v_expected_question_key text;
  v_expected_questions integer;
  v_is_final boolean;
  v_distinct_count integer;
  v_text_count integer;
  v_homework_count integer;
  v_test_count integer;
  v_question_count integer := 0;
  v_actual_modules integer;
  v_actual_lessons integer;
  v_actual_questions integer;
  v_actual_documents integer;
  v_is_published boolean;
  v_library_enabled boolean;
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
  IF p_payload->>'schema_version' <> '2'
     OR p_payload->>'source_kind' <> 'csz-178h-html-with-closed-keys'
  THEN
    RAISE EXCEPTION 'Unsupported CSZ import schema' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_payload->>'title', '')) <>
     'Деятельность по монтажу, техническому обслуживанию и ремонту средств обеспечения пожарной безопасности зданий и сооружений'
  THEN
    RAISE EXCEPTION 'Course title does not match the approved programme'
      USING ERRCODE = '23514';
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
  IF jsonb_array_length(v_modules) <> 11
     OR jsonb_array_length(v_lessons) <> 35
     OR jsonb_array_length(v_documents) <> 8
  THEN
    RAISE EXCEPTION 'CSZ v2 import requires 11 modules, 35 lessons and 8 official resources'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT item->>'key')
  INTO v_distinct_count
  FROM jsonb_array_elements(v_modules) AS modules(item);
  IF v_distinct_count <> 11 THEN
    RAISE EXCEPTION 'Module keys must be unique' USING ERRCODE = '23514';
  END IF;
  SELECT count(DISTINCT item->>'order_index')
  INTO v_distinct_count
  FROM jsonb_array_elements(v_modules) AS modules(item);
  IF v_distinct_count <> 11 THEN
    RAISE EXCEPTION 'Module order indexes must be unique' USING ERRCODE = '23514';
  END IF;

  FOR v_module IN
    SELECT item FROM jsonb_array_elements(v_modules) AS modules(item)
  LOOP
    IF jsonb_typeof(v_module) <> 'object'
       OR COALESCE(v_module->>'order_index', '') !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'Invalid module entry' USING ERRCODE = '22023';
    END IF;
    v_order_index := (v_module->>'order_index')::integer;
    v_module_key := btrim(COALESCE(v_module->>'key', ''));
    v_expected_module_title := CASE v_order_index + 1
      WHEN 1 THEN 'Модуль 1. Общепрофессиональный модуль'
      WHEN 2 THEN 'Модуль 2. Монтаж, техническое обслуживание и ремонт систем пожаротушения и их элементов, включая диспетчеризацию и проведение пусконаладочных работ'
      WHEN 3 THEN 'Модуль 3. Монтаж, техническое обслуживание и ремонт систем пожарной и охранно-пожарной сигнализации и их элементов, включая диспетчеризацию и проведение пусконаладочных работ'
      WHEN 4 THEN 'Модуль 4. Монтаж, техническое обслуживание и ремонт систем противопожарного водоснабжения и их элементов, включая диспетчеризацию и проведение пусконаладочных работ'
      WHEN 5 THEN 'Модуль 5. Монтаж, техническое обслуживание и ремонт автоматических систем (элементов автоматических систем) противодымной вентиляции, включая диспетчеризацию и проведение пусконаладочных работ'
      WHEN 6 THEN 'Модуль 6. Монтаж, техническое обслуживание и ремонт систем оповещения и эвакуации при пожаре и их элементов, включая диспетчеризацию и проведение пусконаладочных работ, в том числе фотолюминесцентных эвакуационных систем и их элементов'
      WHEN 7 THEN 'Модуль 7. Монтаж, техническое обслуживание и ремонт автоматических систем (элементов автоматических систем) передачи извещений о пожаре, включая диспетчеризацию и проведение пусконаладочных работ'
      WHEN 8 THEN 'Модуль 8. Монтаж, техническое обслуживание и ремонт противопожарных занавесов и завес, включая диспетчеризацию и проведение пусконаладочных работ'
      WHEN 9 THEN 'Модуль 9. Монтаж, техническое обслуживание и ремонт заполнений проемов в противопожарных преградах'
      WHEN 10 THEN 'Модуль 10. Выполнение работ по огнезащите материалов, изделий и конструкций'
      WHEN 11 THEN 'Модуль 11. Монтаж, техническое обслуживание и ремонт первичных средств пожаротушения'
      ELSE NULL
    END;
    IF v_order_index NOT BETWEEN 0 AND 10
       OR v_module_key <> 'module-' || (v_order_index + 1)::text
       OR btrim(COALESCE(v_module->>'title', '')) <> v_expected_module_title
    THEN
      RAISE EXCEPTION 'Invalid module key, title or order'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT count(DISTINCT item->>'key')
  INTO v_distinct_count
  FROM jsonb_array_elements(v_lessons) AS lessons(item);
  IF v_distinct_count <> 35 THEN
    RAISE EXCEPTION 'Lesson keys must be unique' USING ERRCODE = '23514';
  END IF;
  SELECT count(DISTINCT item->>'order_index')
  INTO v_distinct_count
  FROM jsonb_array_elements(v_lessons) AS lessons(item);
  IF v_distinct_count <> 35 THEN
    RAISE EXCEPTION 'Lesson order indexes must be unique' USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) FILTER (WHERE item->>'type' = 'text'),
    count(*) FILTER (WHERE item->>'type' = 'homework'),
    count(*) FILTER (WHERE item->>'type' = 'test')
  INTO v_text_count, v_homework_count, v_test_count
  FROM jsonb_array_elements(v_lessons) AS lessons(item);
  IF v_text_count <> 11 OR v_homework_count <> 12 OR v_test_count <> 12 THEN
    RAISE EXCEPTION 'CSZ v2 lesson types must be text=11, homework=12, test=12'
      USING ERRCODE = '23514';
  END IF;

  FOR v_module_number IN 1..11 LOOP
    v_module_key := 'module-' || v_module_number::text;
    SELECT item->>'title'
    INTO v_expected_module_title
    FROM jsonb_array_elements(v_modules) AS modules(item)
    WHERE item->>'key' = v_module_key;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lessons) AS lessons(item)
      WHERE item->>'key' = v_module_key || '-theory'
        AND item->>'module_key' = v_module_key
        AND item->>'type' = 'text'
        AND item->>'title' = v_expected_module_title
        AND (item->>'order_index')::integer = (v_module_number - 1) * 3
        AND item->'metadata'->>'module_number' = v_module_number::text
        AND COALESCE(item->'metadata'->'final_assessment', 'false'::jsonb) = 'false'::jsonb
    ) OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lessons) AS lessons(item)
      WHERE item->>'key' = v_module_key || '-practice'
        AND item->>'module_key' = v_module_key
        AND item->>'type' = 'homework'
        AND item->>'title' LIKE 'Практическое задание ' || v_module_number::text || '.%'
        AND (item->>'order_index')::integer = (v_module_number - 1) * 3 + 1
        AND item->'metadata'->>'module_number' = v_module_number::text
        AND COALESCE(item->'metadata'->'final_assessment', 'false'::jsonb) = 'false'::jsonb
    ) OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lessons) AS lessons(item)
      WHERE item->>'key' = v_module_key || '-test'
        AND item->>'module_key' = v_module_key
        AND item->>'type' = 'test'
        AND item->>'title' = 'Промежуточная аттестация. Модуль ' || v_module_number::text
        AND (item->>'order_index')::integer = (v_module_number - 1) * 3 + 2
        AND item->'metadata'->>'module_number' = v_module_number::text
        AND COALESCE(item->'metadata'->'final_assessment', 'false'::jsonb) = 'false'::jsonb
    ) THEN
      RAISE EXCEPTION 'Module % must contain exact theory, practice and test lessons', v_module_key
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_lessons) AS lessons(item)
    WHERE item->>'key' = 'final-practice'
      AND item->>'module_key' = 'module-11'
      AND item->>'type' = 'homework'
      AND item->>'title' = 'Итоговая практико-ориентированная задача'
      AND item->>'order_index' = '33'
      AND item->'metadata'->>'module_number' = '11'
      AND item->'metadata'->'final_assessment' = 'true'::jsonb
  ) OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_lessons) AS lessons(item)
    WHERE item->>'key' = 'final-test'
      AND item->>'module_key' = 'module-11'
      AND item->>'type' = 'test'
      AND item->>'title' = 'Итоговый тест'
      AND item->>'order_index' = '34'
      AND item->'metadata'->>'module_number' = '11'
      AND item->'metadata'->'final_assessment' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'Final assessment must be final-practice and final-test in module-11'
      USING ERRCODE = '23514';
  END IF;

  FOR v_lesson IN
    SELECT item
    FROM jsonb_array_elements(v_lessons) AS lessons(item)
    ORDER BY (item->>'order_index')::integer
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
    v_is_final := v_metadata->'final_assessment' = 'true'::jsonb;

    IF v_order_index NOT BETWEEN 0 AND 34
       OR NULLIF(v_lesson_key, '') IS NULL
       OR NULLIF(btrim(COALESCE(v_lesson->>'title', '')), '') IS NULL
       OR v_lesson_type NOT IN ('text', 'homework', 'test')
       OR v_lesson->>'test_passing_score' <> '70'
       OR jsonb_typeof(v_metadata) <> 'object'
       OR jsonb_typeof(v_questions) <> 'array'
    THEN
      RAISE EXCEPTION 'Invalid lesson key, title, score, type, metadata or questions'
        USING ERRCODE = '23514';
    END IF;

    IF v_lesson_type = 'test' THEN
      IF COALESCE(v_lesson->>'content', '') <> '' THEN
        RAISE EXCEPTION 'Test lesson HTML must be empty' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF NULLIF(v_lesson->>'content', '') IS NULL
         OR jsonb_typeof((v_lesson->>'content')::jsonb) <> 'array'
         OR (v_lesson->>'content') ~* '(<[[:space:]]*(script|form|video)|correct_(answer|index|option)|data-correct|youtube|rutube|видео)'
      THEN
        RAISE EXCEPTION 'Learner lesson % contains unsafe or answer-key content', v_lesson_key
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_modules) AS modules(item)
      WHERE item->>'key' = v_module_key
    ) THEN
      RAISE EXCEPTION 'Lesson % references an unknown module', v_lesson_key
        USING ERRCODE = '23514';
    END IF;

    v_module_number := (v_metadata->>'module_number')::integer;
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
      v_expected_question_key := CASE
        WHEN v_is_final THEN 'F-Q' || lpad((v_question_index + 1)::text, 2, '0')
        ELSE 'M' || lpad(v_module_number::text, 2, '0')
          || '-Q' || lpad((v_question_index + 1)::text, 2, '0')
      END;
      IF jsonb_typeof(v_question) <> 'object'
         OR v_question->>'key' <> v_expected_question_key
         OR NULLIF(btrim(COALESCE(v_question->>'question', '')), '') IS NULL
         OR jsonb_typeof(v_options) <> 'array'
         OR jsonb_array_length(v_options) <> 4
         OR COALESCE(v_question->>'correct_answer', '') !~ '^[0-3]$'
         OR COALESCE(v_question->>'correct_option', '') <>
              substring('ABCD' FROM ((v_question->>'correct_answer')::integer + 1) FOR 1)
         OR COALESCE(v_question->>'order_index', '') !~ '^[0-9]+$'
         OR (v_question->>'order_index')::integer <> v_question_index
      THEN
        RAISE EXCEPTION 'Invalid question in lesson %', v_lesson_key
          USING ERRCODE = '23514';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_options) AS options(item)
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
    RAISE EXCEPTION 'CSZ v2 import requires exactly 67 test questions'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT item->>'file_url')
  INTO v_distinct_count
  FROM jsonb_array_elements(v_documents) AS documents(item);
  IF v_distinct_count <> 8 THEN
    RAISE EXCEPTION 'Official resource URLs must be unique' USING ERRCODE = '23514';
  END IF;
  FOR v_document IN
    SELECT item FROM jsonb_array_elements(v_documents) AS documents(item)
  LOOP
    IF jsonb_typeof(v_document) <> 'object'
       OR v_document->>'source_kind' <> 'official'
       OR NULLIF(btrim(COALESCE(v_document->>'name', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(v_document->>'source_name', '')), '') IS NULL
       OR COALESCE(v_document->>'file_url', '') !~* '^https://[^[:space:]@]+(/|$)'
       OR NOT (v_document ? 'source_module_number')
       OR v_document->'source_module_number' <> 'null'::jsonb
       OR v_document->>'library_category' <> 'legal_acts'
       OR v_document->>'usage_basis' <> 'official_open_source'
       OR v_document->>'library_status' <> 'needs_review'
    THEN
      RAISE EXCEPTION 'Invalid official electronic-library resource'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  INSERT INTO public.courses (
    organization_id,
    title,
    description,
    is_published,
    landing_content
  ) VALUES (
    p_organization_id,
    btrim(p_payload->>'title'),
    NULLIF(btrim(COALESCE(p_payload->>'description', '')), ''),
    false,
    jsonb_build_object('electronic_library', jsonb_build_object('enabled', true))
  )
  RETURNING id INTO v_course_id;

  FOR v_module IN
    SELECT item
    FROM jsonb_array_elements(v_modules) AS modules(item)
    ORDER BY (item->>'order_index')::integer
  LOOP
    v_module_key := v_module->>'key';
    INSERT INTO public.course_modules (course_id, title, order_index)
    VALUES (v_course_id, btrim(v_module->>'title'), (v_module->>'order_index')::integer)
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
    v_metadata := v_lesson->'metadata';
    v_questions := v_lesson->'questions';
    INSERT INTO public.lessons (
      course_id, module_id, title, type, content, order_index,
      test_passing_score, test_questions_count, test_questions_to_show,
      test_show_answers, is_locked, metadata
    ) VALUES (
      v_course_id,
      (v_module_map->>v_module_key)::uuid,
      btrim(v_lesson->>'title'),
      v_lesson_type,
      NULLIF(v_lesson->>'content', ''),
      (v_lesson->>'order_index')::integer,
      70,
      CASE WHEN v_lesson_type = 'test' THEN jsonb_array_length(v_questions) ELSE NULL END,
      NULL,
      false,
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
        lesson_id, question, options, correct_answer, order_index,
        explanation, is_bank_question
      ) VALUES (
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

  FOR v_document, v_order_index IN
    SELECT item, (ordinality - 1)::integer
    FROM jsonb_array_elements(v_documents) WITH ORDINALITY AS documents(item, ordinality)
    ORDER BY ordinality
  LOOP
    INSERT INTO public.library_documents (
      organization_id, name, type, description, file_url,
      source_name, external_url, usage_basis, library_status, created_by
    ) VALUES (
      p_organization_id,
      btrim(v_document->>'name'),
      'link',
      NULLIF(btrim(COALESCE(v_document->>'description', '')), ''),
      NULL,
      btrim(v_document->>'source_name'),
      v_document->>'file_url',
      'official_open_source',
      'needs_review',
      auth.uid()
    )
    RETURNING id INTO v_library_document_id;

    INSERT INTO public.course_documents (
      course_id, name, type, description, file_url,
      library_document_id, module_id, library_category,
      sort_order, visible_to_students, allow_download
    ) VALUES (
      v_course_id,
      btrim(v_document->>'name'),
      'link',
      NULLIF(btrim(COALESCE(v_document->>'description', '')), ''),
      NULL,
      v_library_document_id,
      NULL,
      'legal_acts',
      v_order_index,
      false,
      false
    );
  END LOOP;

  SELECT is_published,
         COALESCE(landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb, false)
  INTO v_is_published, v_library_enabled
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
  FROM public.course_documents
  WHERE course_id = v_course_id
    AND library_document_id IS NOT NULL;

  IF v_is_published
     OR NOT v_library_enabled
     OR v_actual_modules <> 11
     OR v_actual_lessons <> 35
     OR v_actual_questions <> 67
     OR v_actual_documents <> 8
  THEN
    RAISE EXCEPTION 'CSZ v2 post-import verification failed'
      USING ERRCODE = '23514';
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

REVOKE ALL ON FUNCTION public.import_csz_course_draft_v2(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_csz_course_draft_v2(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_csz_course_draft_v2(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.import_csz_course_draft_v2(uuid, jsonb) IS
  'Atomically imports the learner-safe CSZ 178-hour package as an unpublished 35-lesson draft with a gated electronic library.';
