\set ON_ERROR_STOP on

INSERT INTO public.organizations (
  id, name, description, branding, student_dashboard_settings, subscription_plan
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Other tenant',
  'Tenant-binding negative fixture',
  '{}'::jsonb,
  '{}'::jsonb,
  'free'
);

INSERT INTO public.profiles (id, user_id, organization_id, full_name) VALUES (
  '23232323-2323-2323-2323-232323232323',
  'abababab-abab-abab-abab-abababababab',
  '22222222-2222-2222-2222-222222222222',
  'Cross-tenant enrolled user'
);

INSERT INTO public.enrollments (
  id, user_id, course_id, status, expires_at
) VALUES (
  '24242424-2424-2424-2424-242424242424',
  'abababab-abab-abab-abab-abababababab',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'active',
  now() + interval '7 days'
);

INSERT INTO public.library_documents (
  id,
  organization_id,
  name,
  type,
  description,
  source_name,
  external_url,
  edition_label,
  last_checked_at,
  usage_basis,
  library_status
) VALUES (
  '12121212-1212-1212-1212-121212121212',
  '11111111-1111-1111-1111-111111111111',
  'Visible library resource',
  'external_link',
  'Only through the authorized library assignment',
  'Official fixture source',
  'https://example.test/library-resource',
  '2026-09-03',
  now(),
  'official_open_source',
  'active'
);

INSERT INTO public.course_documents (
  id,
  course_id,
  name,
  type,
  description,
  library_document_id,
  module_id,
  library_category,
  sort_order,
  visible_to_students,
  allow_download
) VALUES (
  '25252525-2525-2525-2525-252525252525',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Visible assignment',
  'library_resource',
  'Authorized learner resource',
  '12121212-1212-1212-1212-121212121212',
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'educational_materials',
  1,
  true,
  true
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixture_lesson_select
ON public.lessons
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.courses course_row
    WHERE course_row.id = lessons.course_id
  )
);

CREATE POLICY fixture_test_question_select
ON public.test_questions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lessons lesson_row
    WHERE lesson_row.id = test_questions.lesson_id
  )
);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  true
);
SELECT set_config(
  'request.jwt.claim.org_id',
  '11111111-1111-1111-1111-111111111111',
  true
);

DO $enrolled_learner$
DECLARE
  shell jsonb;
  snapshot jsonb;
BEGIN
  IF NOT public.can_access_course_as_learner(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) THEN
    RAISE EXCEPTION 'valid tenant-bound enrollment was rejected';
  END IF;

  IF (
    SELECT count(*)
    FROM public.courses
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) <> 0 THEN
    RAISE EXCEPTION 'learner can SELECT the unpublished course row';
  END IF;

  IF (
    SELECT count(*)
    FROM public.course_modules
    WHERE course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) <> 0 THEN
    RAISE EXCEPTION 'learner can SELECT unpublished module rows';
  END IF;

  IF (
    SELECT count(*)
    FROM public.lessons
    WHERE course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) <> 0 THEN
    RAISE EXCEPTION 'learner can SELECT unpublished lesson rows';
  END IF;

  IF (
    SELECT count(*)
    FROM public.test_questions question
    JOIN public.lessons lesson ON lesson.id = question.lesson_id
    WHERE lesson.course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) <> 0 THEN
    RAISE EXCEPTION 'learner can SELECT unpublished test rows';
  END IF;

  shell := public.get_course_electronic_library_shell(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  );
  IF shell ->> 'course_id' <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     OR shell ->> 'title' <> 'Unpublished 178-hour library course'
     OR shell ->> 'library_only' <> 'true'
     OR jsonb_array_length(shell -> 'modules') <> 1
     OR shell ? 'description'
     OR shell ? 'landing_content'
     OR shell ? 'organization_id'
  THEN
    RAISE EXCEPTION 'RPC shell payload is missing required fields or leaks extras: %', shell;
  END IF;

  IF (
    SELECT count(*)
    FROM public.course_documents
    WHERE course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) <> 1 THEN
    RAISE EXCEPTION 'authorized learner cannot read the visible assignment';
  END IF;

  IF (
    SELECT count(*)
    FROM public.library_documents
    WHERE id = '12121212-1212-1212-1212-121212121212'
  ) <> 1 THEN
    RAISE EXCEPTION 'authorized learner cannot read the active canonical resource';
  END IF;

  snapshot := public.get_student_dashboard_snapshot(
    'dddddddd-dddd-dddd-dddd-dddddddddddd'
  );
  IF snapshot #>> '{enrollments,0,library_only}' <> 'true'
     OR snapshot #>> '{enrollments,0,title}'
          <> 'Unpublished 178-hour library course'
     OR snapshot #> '{enrollments,0,description}' <> 'null'::jsonb
     OR snapshot #> '{enrollments,0,duration}' <> 'null'::jsonb
     OR snapshot #> '{enrollments,0,cover_image_url}' <> 'null'::jsonb
     OR snapshot #>> '{enrollments,0,total_lessons}' <> '0'
     OR snapshot #>> '{enrollments,0,completed_lessons}' <> '0'
  THEN
    RAISE EXCEPTION 'dashboard leaks unpublished course details: %', snapshot;
  END IF;
END;
$enrolled_learner$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  true
);
SELECT set_config(
  'request.jwt.claim.org_id',
  '11111111-1111-1111-1111-111111111111',
  true
);

DO $unenrolled_user$
BEGIN
  IF public.can_access_course_as_learner(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) THEN
    RAISE EXCEPTION 'unenrolled same-tenant user passed learner helper';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) OR EXISTS (
    SELECT 1
    FROM public.course_modules
    WHERE course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) OR EXISTS (
    SELECT 1
    FROM public.course_documents
    WHERE course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) OR EXISTS (
    SELECT 1
    FROM public.library_documents
    WHERE id = '12121212-1212-1212-1212-121212121212'
  ) THEN
    RAISE EXCEPTION 'unenrolled same-tenant user can read protected rows';
  END IF;

  BEGIN
    PERFORM public.get_course_electronic_library_shell(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    );
    RAISE EXCEPTION 'unenrolled user unexpectedly received the shell';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$unenrolled_user$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'abababab-abab-abab-abab-abababababab',
  true
);
SELECT set_config(
  'request.jwt.claim.org_id',
  '22222222-2222-2222-2222-222222222222',
  true
);

DO $cross_tenant_enrollment$
BEGIN
  IF public.can_access_course_as_learner(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) THEN
    RAISE EXCEPTION 'cross-tenant enrollment passed learner helper';
  END IF;

  BEGIN
    PERFORM public.get_course_electronic_library_shell(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    );
    RAISE EXCEPTION 'cross-tenant user unexpectedly received the shell';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$cross_tenant_enrollment$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  true
);
SELECT set_config(
  'request.jwt.claim.org_id',
  '11111111-1111-1111-1111-111111111111',
  true
);

DO $authorized_staff$
DECLARE
  shell jsonb;
BEGIN
  IF (
    SELECT count(*)
    FROM public.courses
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) <> 1 OR (
    SELECT count(*)
    FROM public.course_modules
    WHERE course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) <> 1 THEN
    RAISE EXCEPTION 'authorized staff lost draft course/module access';
  END IF;

  shell := public.get_course_electronic_library_shell(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  );
  IF shell ->> 'library_only' <> 'true' THEN
    RAISE EXCEPTION 'authorized staff received an invalid shell: %', shell;
  END IF;
END;
$authorized_staff$;
ROLLBACK;

SELECT 'PASS - local PostgreSQL parser, catalog and RLS contract verified' AS result;
