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
  '28282828-2828-2828-2828-282828282828',
  '22222222-2222-2222-2222-222222222222',
  'Other tenant resource',
  'external_link',
  'Must never be assignable to the CSZ tenant course',
  'Other tenant fixture source',
  'https://example.test/other-tenant-resource',
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

-- Prove the application invariant independently of RLS. These attempts run
-- through the same trigger even for service-role code, which is exactly where
-- foreign keys alone would otherwise allow a cross-tenant or cross-course link.
BEGIN;
SET LOCAL ROLE service_role;

DO $assignment_scope_rejections$
DECLARE
  rejected boolean;
BEGIN
  rejected := false;
  BEGIN
    INSERT INTO public.course_documents (
      id,
      course_id,
      name,
      type,
      library_document_id,
      module_id,
      library_category
    ) VALUES (
      '30303030-3030-3030-3030-303030303030',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'Forbidden cross-tenant assignment',
      'library_resource',
      '28282828-2828-2828-2828-282828282828',
      'cccccccc-cccc-cccc-cccc-ccccccccccc2',
      'additional_resources'
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'course and library document belong to different organizations' THEN
        RAISE;
      END IF;
      rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'cross-tenant course/resource assignment was accepted';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.course_documents (
      id,
      course_id,
      name,
      type,
      library_document_id,
      module_id,
      library_category
    ) VALUES (
      '31313131-3131-3131-3131-313131313131',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'Forbidden cross-course module assignment',
      'library_resource',
      '12121212-1212-1212-1212-121212121212',
      'cccccccc-cccc-cccc-cccc-ccccccccccc1',
      'educational_materials'
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'course document module belongs to another course' THEN
        RAISE;
      END IF;
      rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'cross-course module assignment was accepted';
  END IF;
END;
$assignment_scope_rejections$;
ROLLBACK;

-- Administrator acceptance path: create a complete external resource, attach
-- it to the draft library course, read and edit it, then archive instead of
-- deleting it. This transaction is committed only in the disposable database
-- so later role checks can prove archive visibility.
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

DO $administrator_crud_archive$
DECLARE
  affected integer;
BEGIN
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
    '32323232-3232-3232-3232-323232323232',
    '11111111-1111-1111-1111-111111111111',
    'Administrator-created resource',
    'external_link',
    'Disposable CRUD and archive proof',
    'Official administrator fixture source',
    'https://example.test/admin-created-resource',
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
    '33333333-3333-3333-3333-333333333333',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Administrator-created assignment',
    'library_resource',
    'Disposable assignment proof',
    '32323232-3232-3232-3232-323232323232',
    'cccccccc-cccc-cccc-cccc-ccccccccccc2',
    'legal_acts',
    2,
    true,
    true
  );

  IF (
    SELECT count(*)
    FROM public.library_documents
    WHERE id = '32323232-3232-3232-3232-323232323232'
      AND created_by = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
      AND library_status = 'active'
  ) <> 1 OR (
    SELECT count(*)
    FROM public.course_documents
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ) <> 1 THEN
    RAISE EXCEPTION 'administrator could not create/read the resource assignment';
  END IF;

  UPDATE public.library_documents
  SET
    name = 'Administrator-edited resource',
    description = 'Edited through the authenticated RLS path'
  WHERE id = '32323232-3232-3232-3232-323232323232';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'administrator could not edit the resource';
  END IF;

  UPDATE public.library_documents
  SET library_status = 'archive'
  WHERE id = '32323232-3232-3232-3232-323232323232';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.library_documents
    WHERE id = '32323232-3232-3232-3232-323232323232'
      AND name = 'Administrator-edited resource'
      AND library_status = 'archive'
      AND archived_at IS NOT NULL
      AND archived_by = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  ) THEN
    RAISE EXCEPTION 'administrator archive transition was not persisted';
  END IF;

  DELETE FROM public.library_documents
  WHERE id = '32323232-3232-3232-3232-323232323232';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 OR NOT EXISTS (
    SELECT 1
    FROM public.library_documents
    WHERE id = '32323232-3232-3232-3232-323232323232'
  ) THEN
    RAISE EXCEPTION 'authenticated administrator bypassed archive-only retention';
  END IF;
END;
$administrator_crud_archive$;
COMMIT;

-- A teacher can read the same active linked material as the learner, but all
-- canonical and assignment mutations must be rejected by RLS.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '77777777-7777-7777-7777-777777777777',
  true
);
SELECT set_config(
  'request.jwt.claim.org_id',
  '11111111-1111-1111-1111-111111111111',
  true
);

DO $teacher_read_only$
DECLARE
  affected integer;
  document_insert_rejected boolean := false;
  assignment_insert_rejected boolean := false;
BEGIN
  IF (
    SELECT count(*)
    FROM public.library_documents
    WHERE id = '12121212-1212-1212-1212-121212121212'
  ) <> 1 OR (
    SELECT count(*)
    FROM public.course_documents
    WHERE id = '25252525-2525-2525-2525-252525252525'
  ) <> 1 THEN
    RAISE EXCEPTION 'teacher cannot read the active linked resource';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.library_documents
    WHERE id = '32323232-3232-3232-3232-323232323232'
  ) OR EXISTS (
    SELECT 1
    FROM public.course_documents
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ) THEN
    RAISE EXCEPTION 'teacher can read an archived resource or assignment';
  END IF;

  UPDATE public.library_documents
  SET name = 'Teacher mutation must fail'
  WHERE id = '12121212-1212-1212-1212-121212121212';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'teacher updated a canonical resource';
  END IF;

  UPDATE public.course_documents
  SET sort_order = 99
  WHERE id = '25252525-2525-2525-2525-252525252525';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'teacher updated a course assignment';
  END IF;

  DELETE FROM public.library_documents
  WHERE id = '12121212-1212-1212-1212-121212121212';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'teacher deleted a canonical resource';
  END IF;

  BEGIN
    INSERT INTO public.library_documents (
      id,
      organization_id,
      name,
      type,
      source_name,
      external_url,
      edition_label,
      last_checked_at,
      usage_basis,
      library_status
    ) VALUES (
      '34343434-3434-3434-3434-343434343434',
      '11111111-1111-1111-1111-111111111111',
      'Teacher insert must fail',
      'external_link',
      'Read-only teacher fixture',
      'https://example.test/teacher-write',
      '2026-09-03',
      now(),
      'official_open_source',
      'active'
    );
  EXCEPTION
    WHEN SQLSTATE '42501' THEN document_insert_rejected := true;
  END;
  IF NOT document_insert_rejected THEN
    RAISE EXCEPTION 'teacher inserted a canonical resource';
  END IF;

  BEGIN
    INSERT INTO public.course_documents (
      id,
      course_id,
      name,
      type,
      library_document_id,
      module_id,
      library_category
    ) VALUES (
      '35353535-3535-3535-3535-353535353535',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'Teacher assignment must fail',
      'library_resource',
      '12121212-1212-1212-1212-121212121212',
      'cccccccc-cccc-cccc-cccc-ccccccccccc2',
      'educational_materials'
    );
  EXCEPTION
    WHEN SQLSTATE '42501' THEN assignment_insert_rejected := true;
  END;
  IF NOT assignment_insert_rejected THEN
    RAISE EXCEPTION 'teacher inserted a course assignment';
  END IF;
END;
$teacher_read_only$;
ROLLBACK;

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

  IF EXISTS (
    SELECT 1
    FROM public.library_documents
    WHERE id = '32323232-3232-3232-3232-323232323232'
  ) OR EXISTS (
    SELECT 1
    FROM public.course_documents
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ) THEN
    RAISE EXCEPTION 'authorized learner can read an archived resource or assignment';
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

  IF EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) OR EXISTS (
    SELECT 1
    FROM public.course_documents
    WHERE course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) OR EXISTS (
    SELECT 1
    FROM public.library_documents
    WHERE organization_id = '11111111-1111-1111-1111-111111111111'
  ) THEN
    RAISE EXCEPTION 'cross-tenant user can read CSZ course or library rows';
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

-- Final course invariants prove the acceptance DML did not mutate the old
-- published course and did not publish or alter core metadata of the new draft.
DO $course_state_invariants$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND organization_id = '11111111-1111-1111-1111-111111111111'
      AND title = 'Protected published course'
      AND description = 'Must remain unchanged by dry-run'
      AND duration = '72'
      AND is_published = true
      AND landing_content = '{}'::jsonb
      AND skip_video_identification = false
      AND cover_image_url = 'https://example.test/cover.png'
  ) OR (
    SELECT count(*)
    FROM public.course_modules
    WHERE course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.course_modules
    WHERE course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
      AND title = 'Published module'
      AND order_index = 1
  ) OR (
    SELECT count(*)
    FROM public.lessons
    WHERE course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE id = '14141414-1414-1414-1414-141414141414'
      AND course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND title = 'Protected lesson'
  ) OR (
    SELECT count(*)
    FROM public.test_questions question
    JOIN public.lessons lesson ON lesson.id = question.lesson_id
    WHERE lesson.course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.test_questions
    WHERE id = '16161616-1616-1616-1616-161616161616'
      AND lesson_id = '14141414-1414-1414-1414-141414141414'
      AND question = 'Protected question'
  ) OR (
    SELECT count(*)
    FROM public.course_documents
    WHERE course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.course_documents
    WHERE id = '13131313-1313-1313-1313-131313131313'
      AND course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND name = 'Protected legacy document'
      AND type = 'pdf'
      AND description = 'Must remain unchanged'
      AND file_url = 'https://example.test/protected.pdf'
      AND library_document_id IS NULL
  ) THEN
    RAISE EXCEPTION 'protected published course changed during local acceptance';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND organization_id = '11111111-1111-1111-1111-111111111111'
      AND title = 'Unpublished 178-hour library course'
      AND duration = '178'
      AND is_published = false
      AND landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb
  ) THEN
    RAISE EXCEPTION 'new 178-hour library course is missing or became published';
  END IF;
END;
$course_state_invariants$;

SELECT 'PASS - local PostgreSQL admin/teacher/learner, tenant, linkage and course-state contract verified' AS result;
SELECT 'PASS - local PostgreSQL parser, catalog and RLS contract verified' AS runner_compatibility_result;
