\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'license_edu@student.local'),
  ('10000000-0000-4000-8000-000000000003', 'other@student.local');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('10000000-0000-4000-8000-000000000001', 'admin'),
  ('10000000-0000-4000-8000-000000000002', 'student'),
  ('10000000-0000-4000-8000-000000000003', 'student');

INSERT INTO public.organizations (id, name, email) VALUES
  ('20000000-0000-4000-8000-000000000001', 'ЦСЗ', 'csz@example.test'),
  ('20000000-0000-4000-8000-000000000002', 'Другая организация', 'other@example.test');

INSERT INTO public.profiles (user_id, organization_id, full_name, email, login) VALUES
  ('10000000-0000-4000-8000-000000000001', NULL, 'Администратор', 'admin@example.test', 'admin'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Проверяющий', NULL, 'license_edu'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'Другой пользователь', NULL, 'other');

INSERT INTO public.courses (id, organization_id, title, description, duration, is_published) VALUES
  ('7630559a-6caf-42e7-97f9-1cd0e4598c39', '20000000-0000-4000-8000-000000000001', 'Курс ЦСЗ', 'Черновик для проверки', '178 часов', false),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Чужой курс', NULL, '72 часа', false);

INSERT INTO public.course_modules (id, course_id, title, order_index)
SELECT
  ('40000000-0000-4000-8000-' || lpad(module_no::text, 12, '0'))::uuid,
  '7630559a-6caf-42e7-97f9-1cd0e4598c39',
  'Модуль ' || module_no,
  module_no - 1
FROM generate_series(1, 11) module_no;

INSERT INTO public.lessons (
  id, course_id, module_id, title, type, content, order_index,
  is_locked, test_passing_score, metadata
)
SELECT
  ('50000000-0000-4000-8000-' || lpad(lesson_no::text, 12, '0'))::uuid,
  '7630559a-6caf-42e7-97f9-1cd0e4598c39',
  ('40000000-0000-4000-8000-' || lpad((((lesson_no - 1) % 11) + 1)::text, 12, '0'))::uuid,
  CASE
    WHEN lesson_no <= 11 THEN 'Лекция ' || lesson_no
    WHEN lesson_no <= 23 THEN 'Письменное задание ' || (lesson_no - 11)
    ELSE 'Тест ' || (lesson_no - 23)
  END,
  CASE WHEN lesson_no <= 11 THEN 'text' WHEN lesson_no <= 23 THEN 'homework' ELSE 'test' END,
  CASE WHEN lesson_no = 1 THEN
    '[{"id":"embedded-quiz","type":"quiz","content":"","quizQuestion":"Проверка","quizExplanation":"Скрытый ключ","pendingAI":"ai-quiz","quizOptions":[{"text":"Безопасный вариант","isCorrect":true},{"text":"Другой вариант","isCorrect":false}]}]'
    WHEN lesson_no = 2 THEN
    '[{"type":"quiz","correct_answer":0,"quizExplanation":"Скрытый ключ"'
    WHEN lesson_no = 3 THEN
    '[{"id":"nested-object","type":"paragraph","content":{"correct_answer":0}},'
      || '{"id":"bad-table","type":"table","tableRows":[{"isCorrect":true},["Безопасная ячейка",{"quizExplanation":"Скрыто"}]]},'
      || '{"id":"bad-slide","type":"slider","sliderSlides":[{"id":"slide-1","title":"Безопасный слайд","content":{"correct_answer":1},"imageUrl":false}]}]'
    WHEN lesson_no = 4 THEN
    chr(160) || chr(8195) || E'\n\t'
      || '[{"id":"leading-space-quiz","type":"quiz","quizQuestion":"Проверка пробела","quizOptions":[{"text":"Вариант А","isCorrect":true},{"text":"Вариант Б","isCorrect":false}]}]'
    ELSE '[{"id":"content","type":"paragraph","content":"Материал только для чтения"}]'
  END,
  lesson_no - 1,
  false,
  70,
  jsonb_build_object(
    'module_number', ((lesson_no - 1) % 11) + 1,
    'final_assessment', lesson_no = 35,
    'source_article_id', 'lesson-' || lesson_no
  )
FROM generate_series(1, 35) lesson_no;

WITH question_rows AS (
  SELECT lesson_no, question_no,
    row_number() OVER (ORDER BY lesson_no, question_no) AS global_no
  FROM generate_series(24, 35) lesson_no
  CROSS JOIN LATERAL generate_series(1, CASE WHEN lesson_no <= 30 THEN 6 ELSE 5 END) question_no
)
INSERT INTO public.test_questions (
  id, lesson_id, question, options, correct_answer, order_index, explanation
)
SELECT
  ('60000000-0000-4000-8000-' || lpad(global_no::text, 12, '0'))::uuid,
  ('50000000-0000-4000-8000-' || lpad(lesson_no::text, 12, '0'))::uuid,
  'Вопрос ' || global_no,
  CASE WHEN global_no = 1
    THEN '[{"text":"Безопасный А","isCorrect":true,"score":100},{"text":"Безопасный Б","isCorrect":false}]'::jsonb
    ELSE '["Вариант А","Вариант Б"]'::jsonb
  END,
  0,
  question_no - 1,
  'Скрытое объяснение правильного ответа'
FROM question_rows;

INSERT INTO public.lesson_attachments (
  id, lesson_id, name, file_url, file_type, file_size, category, order_index
) VALUES (
  '70000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'Материал лекции', 'https://example.test/material.pdf', 'pdf', 1000, 'lecture', 0
);

INSERT INTO public.library_documents (
  id, organization_id, name, type, description, source_name, external_url,
  usage_basis, library_status
) VALUES
  (
    '80000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Скрытый документ', 'link', 'Скрытая карточка', 'МЧС России',
    'https://example.test/hidden', 'official_open_source', 'active'
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Документ на проверке', 'link', 'Не готов к предъявлению', 'МЧС России',
    'https://example.test/needs-review', 'official_open_source', 'needs_review'
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    'Архивный документ', 'link', 'Архивная карточка', 'МЧС России',
    'https://example.test/archive', 'official_open_source', 'archive'
  ),
  (
    '80000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    'Нормативный документ', 'link', 'Официальный источник', 'МЧС России',
    'https://example.test/legal', 'official_open_source', 'active'
  );

INSERT INTO public.course_documents (
  id, course_id, name, type, description, library_document_id,
  library_category, sort_order, visible_to_students, allow_download
) VALUES
  (
    '90000000-0000-4000-8000-000000000001',
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    'Скрытый документ', 'link', 'Скрытая карточка',
    '80000000-0000-4000-8000-000000000001',
    'legal_acts', 0, false, false
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    'Документ на проверке', 'link', 'Не готов к предъявлению',
    '80000000-0000-4000-8000-000000000002',
    'legal_acts', 1, true, false
  ),
  (
    '90000000-0000-4000-8000-000000000003',
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    'Архивный документ', 'link', 'Архивная карточка',
    '80000000-0000-4000-8000-000000000003',
    'legal_acts', 2, true, false
  ),
  (
    '90000000-0000-4000-8000-000000000004',
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    'Нормативный документ', 'link', 'Официальный источник',
    '80000000-0000-4000-8000-000000000004',
    'legal_acts', 3, true, true
  );

CREATE TEMP TABLE reviewer_mutation_baseline AS
SELECT
  (SELECT count(*) FROM public.enrollments) AS enrollments,
  (SELECT count(*) FROM public.lesson_progress) AS progress,
  (SELECT count(*) FROM public.test_attempts) AS attempts,
  (SELECT count(*) FROM public.homework_submissions) AS homework;

-- Only an authenticated admin can resolve the existing login and create the
-- exact grant. Repeating the same action must not create or alter another row.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT public.admin_upsert_course_review_grant(
  '7630559a-6caf-42e7-97f9-1cd0e4598c39',
  'license_edu',
  date_trunc('second', now() + interval '14 days')
);
SELECT public.admin_upsert_course_review_grant(
  '7630559a-6caf-42e7-97f9-1cd0e4598c39',
  'license_edu',
  date_trunc('second', now() + interval '14 days')
);
RESET ROLE;

SELECT public.test_assert(
  (SELECT count(*) = 1
   FROM public.course_review_grants
   WHERE course_id = '7630559a-6caf-42e7-97f9-1cd0e4598c39'
     AND user_id = '10000000-0000-4000-8000-000000000002'),
  'idempotent admin action creates one exact login/course grant'
);

-- A non-admin cannot create or revive a grant.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.admin_upsert_course_review_grant(
      '30000000-0000-4000-8000-000000000002', 'other', now() + interval '1 day'
    );
    RAISE EXCEPTION 'FAIL: non-admin grant action succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Course review administration is unavailable' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

-- The exact reviewer receives the complete shell and every test question, but
-- never an answer key or explanation.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  snapshot jsonb;
  lesson_payload jsonb;
  sanitized_blocks jsonb;
  question_total integer := 0;
  lesson_no integer;
BEGIN
  snapshot := public.get_course_review_snapshot('7630559a-6caf-42e7-97f9-1cd0e4598c39');
  PERFORM public.test_assert(snapshot->'counts' = '{"modules":11,"elements":35,"homework":12,"tests":12,"questions":67}'::jsonb,
    'snapshot reports the exact 11/35/12/12/67 structure');
  PERFORM public.test_assert(jsonb_array_length(snapshot->'modules') = 11
    AND jsonb_array_length(snapshot->'lessons') = 35,
    'snapshot contains every module and element');
  PERFORM public.test_assert(
    snapshot->'lessons'->0->>'id' = '50000000-0000-4000-8000-000000000001'
      AND snapshot->'lessons'->1->>'id' = '50000000-0000-4000-8000-000000000012'
      AND snapshot->'lessons'->2->>'id' = '50000000-0000-4000-8000-000000000023'
      AND snapshot->'lessons'->3->>'id' = '50000000-0000-4000-8000-000000000034'
      AND snapshot->'lessons'->4->>'id' = '50000000-0000-4000-8000-000000000002',
    'snapshot orders elements by module order and then lesson order'
  );
  PERFORM public.test_assert(
    jsonb_array_length(snapshot->'library') = 1
      AND snapshot->'library'->0->>'id' = '90000000-0000-4000-8000-000000000004',
    'reviewer sees only active visible course library records'
  );
  PERFORM public.test_assert(
    (snapshot->'library')::text NOT LIKE '%Скрытый документ%'
      AND (snapshot->'library')::text NOT LIKE '%Документ на проверке%'
      AND (snapshot->'library')::text NOT LIKE '%Архивный документ%',
    'hidden, needs-review and archived library records stay private'
  );
  PERFORM public.test_assert(snapshot->'course'->>'is_published' = 'false',
    'review does not publish the course');

  lesson_payload := public.get_course_review_lesson(
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    '50000000-0000-4000-8000-000000000001'
  );
  PERFORM public.test_assert(
    lesson_payload->'lesson'->>'content' NOT LIKE '%isCorrect%'
      AND lesson_payload->'lesson'->>'content' NOT LIKE '%quizExplanation%'
      AND lesson_payload->'lesson'->>'content' NOT LIKE '%Скрытый ключ%',
    'embedded mini-quiz keys and explanation are removed'
  );

  lesson_payload := public.get_course_review_lesson(
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    '50000000-0000-4000-8000-000000000002'
  );
  PERFORM public.test_assert(
    lesson_payload->'lesson'->'content' = 'null'::jsonb,
    'malformed JSON-looking lesson content fails closed'
  );

  lesson_payload := public.get_course_review_lesson(
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    '50000000-0000-4000-8000-000000000003'
  );
  sanitized_blocks := (lesson_payload->'lesson'->>'content')::jsonb;
  PERFORM public.test_assert(
    sanitized_blocks::text NOT LIKE '%correct_answer%'
      AND sanitized_blocks::text NOT LIKE '%isCorrect%'
      AND sanitized_blocks::text NOT LIKE '%quizExplanation%',
    'nested answer-like objects cannot cross allowlisted content fields'
  );
  PERFORM public.test_assert(
    NOT (sanitized_blocks->0 ? 'content')
      AND sanitized_blocks->1->'tableRows' = '[["Безопасная ячейка", ""]]'::jsonb
      AND sanitized_blocks->2->'sliderSlides'->0 = '{"id":"slide-1","title":"Безопасный слайд"}'::jsonb,
    'malformed table cells and slider fields are reduced to runtime-safe types'
  );

  lesson_payload := public.get_course_review_lesson(
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    '50000000-0000-4000-8000-000000000004'
  );
  sanitized_blocks := (lesson_payload->'lesson'->>'content')::jsonb;
  PERFORM public.test_assert(
    sanitized_blocks::text NOT LIKE '%isCorrect%'
      AND sanitized_blocks->0->'quizOptions' = '[{"text":"Вариант А"},{"text":"Вариант Б"}]'::jsonb,
    'leading ECMAScript whitespace cannot bypass structured-content sanitizing'
  );

  FOR lesson_no IN 24..35 LOOP
    lesson_payload := public.get_course_review_lesson(
      '7630559a-6caf-42e7-97f9-1cd0e4598c39',
      ('50000000-0000-4000-8000-' || lpad(lesson_no::text, 12, '0'))::uuid
    );
    question_total := question_total + jsonb_array_length(lesson_payload->'questions');
    PERFORM public.test_assert(
      (lesson_payload->'questions')::text NOT LIKE '%correct_answer%'
        AND (lesson_payload->'questions')::text NOT LIKE '%explanation%'
        AND (lesson_payload->'questions')::text NOT LIKE '%isCorrect%'
        AND (lesson_payload->'questions')::text NOT LIKE '%"score"%',
      'test payload contains no relational or embedded answer key'
    );
  END LOOP;
  PERFORM public.test_assert(question_total = 67,
    'all 67 questions and their masked options are reviewable');

  lesson_payload := public.get_course_review_lesson(
    '7630559a-6caf-42e7-97f9-1cd0e4598c39',
    '50000000-0000-4000-8000-000000000024'
  );
  PERFORM public.test_assert(
    lesson_payload->'questions'->0->'options' = '["Безопасный А","Безопасный Б"]'::jsonb,
    'legacy option objects are reduced to an ordered string array'
  );
END;
$$;

SELECT public.test_assert((SELECT count(*) = 0 FROM public.courses),
  'review grant does not open direct draft course SELECT');
SELECT public.test_assert((SELECT count(*) = 0 FROM public.lessons),
  'review grant does not open direct lesson SELECT');
SELECT public.test_assert((SELECT count(*) = 0 FROM public.test_questions),
  'review grant does not open direct question SELECT');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.enrollments (user_id, course_id)
    VALUES (auth.uid(), '7630559a-6caf-42e7-97f9-1cd0e4598c39');
    RAISE EXCEPTION 'FAIL: reviewer enrollment write succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.course_review_grants (
      course_id, user_id, expires_at, created_by, updated_by
    ) VALUES (
      '30000000-0000-4000-8000-000000000002', auth.uid(), now() + interval '1 day', auth.uid(), auth.uid()
    );
    RAISE EXCEPTION 'FAIL: reviewer forged a grant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT public.test_assert(
  (SELECT enrollments FROM reviewer_mutation_baseline) = (SELECT count(*) FROM public.enrollments)
    AND (SELECT progress FROM reviewer_mutation_baseline) = (SELECT count(*) FROM public.lesson_progress)
    AND (SELECT attempts FROM reviewer_mutation_baseline) = (SELECT count(*) FROM public.test_attempts)
    AND (SELECT homework FROM reviewer_mutation_baseline) = (SELECT count(*) FROM public.homework_submissions),
  'review RPC and rejected writes create no learning or submission state'
);

-- Ungranted user and wrong course receive the same non-enumerating denial.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_course_review_snapshot('7630559a-6caf-42e7-97f9-1cd0e4598c39');
    RAISE EXCEPTION 'FAIL: ungranted reviewer read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Course review is unavailable' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_course_review_snapshot('30000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'FAIL: cross-course review succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Course review is unavailable' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

-- Expired and revoked grants fail with exactly the same response.
UPDATE public.course_review_grants
SET created_at = now() - interval '2 days',
    expires_at = now() - interval '1 day'
WHERE course_id = '7630559a-6caf-42e7-97f9-1cd0e4598c39'
  AND user_id = '10000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_course_review_snapshot('7630559a-6caf-42e7-97f9-1cd0e4598c39');
    RAISE EXCEPTION 'FAIL: expired grant read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Course review is unavailable' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

UPDATE public.course_review_grants
SET expires_at = now() + interval '14 days', revoked_at = now(), revoked_by = created_by
WHERE course_id = '7630559a-6caf-42e7-97f9-1cd0e4598c39'
  AND user_id = '10000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_course_review_snapshot('7630559a-6caf-42e7-97f9-1cd0e4598c39');
    RAISE EXCEPTION 'FAIL: revoked grant read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Course review is unavailable' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

-- Anonymous callers have no EXECUTE privilege at all.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_course_review_snapshot('7630559a-6caf-42e7-97f9-1cd0e4598c39');
    RAISE EXCEPTION 'FAIL: anonymous review RPC succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT public.test_assert(
  (SELECT is_published IS FALSE FROM public.courses WHERE id = '7630559a-6caf-42e7-97f9-1cd0e4598c39')
    AND NOT EXISTS (SELECT 1 FROM public.enrollments),
  'course remains unpublished and unenrolled after the full contract'
);

ROLLBACK;
\echo 'PASS - course-scoped reviewer PostgreSQL security contract verified'
