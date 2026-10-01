-- S-034: rollback-only regression against the existing, isolated QA course.
-- Run the WHOLE file as the trusted database operator after reviewing it.
-- No accounts, roles, organizations, orders or grants are created/changed.
-- Only one synthetic lesson in the QA course is written; never a client lesson.
-- JWT settings below simulate existing actors for RLS inside this transaction;
-- they do not create an auth session, token or permanent account access.
-- A failure aborts the transaction. Never replace the final ROLLBACK with COMMIT.
-- Coverage limit: the positive writer is an existing platform admin because
-- this QA tenant has no organization-owner account. Oleg's owner permissions
-- and the foreign-tenant denial are checked read-only, not by client writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = on;

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = 'authenticated' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'S034 test requires authenticated without RLS bypass';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.courses c
    JOIN public.organizations o ON o.id = c.organization_id
    WHERE c.id = 'e77c7082-e557-4011-aff5-a1aff0abc12a'
      AND o.id = 'f7701297-2c10-4f8e-8123-4016cee9984f'
      AND o.name LIKE 'QA СИНТАГМА 20260930%'
  ) THEN
    RAISE EXCEPTION 'S034: expected isolated QA course/organization is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lessons
             WHERE id = 'a0341000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'S034: synthetic lesson UUID already exists; do not overwrite';
  END IF;
  IF public.has_role('2eb97083-32e1-4912-b64b-dd8d1bc07b2c', 'admin'::public.app_role) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'S034: expected existing platform admin identity changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = '70111dc5-eeea-461c-9d30-4a246c0c4585'
      AND p.organization_id = 'f7701297-2c10-4f8e-8123-4016cee9984f'
      AND p.blocked_at IS NULL AND ur.role = 'student'::public.app_role
  ) OR public.has_role('70111dc5-eeea-461c-9d30-4a246c0c4585', 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'S034: expected unprivileged QA learner identity changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id = l.course_id
    WHERE c.id = '26e65ccb-609f-5b3d-b59a-f280c9feae5b'
      AND c.organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
      AND c.source_course_id IS NULL AND c.source_order_id IS NULL
  ) THEN
    RAISE EXCEPTION 'S034: paid original needs existing lessons for a non-vacuous denial test';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = '8225c963-4926-44cf-82bc-5bb754309868'
      AND organization_id = '10f1a73c-0d18-4c9a-b6e6-b2e8f17e25fe'
  ) THEN
    RAISE EXCEPTION 'S034: read-only ordinary-owner course context changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid = 'public.lessons'::regclass
      AND polname = 'paid_20260922_lesson_select'
      AND NOT polpermissive AND polcmd = 'r' AND polroles = ARRAY[0::oid]
      AND polwithcheck IS NULL
      AND replace(pg_catalog.pg_get_expr(polqual, polrelid), 'public.', '')
        = '_paid_20260922_course_read(course_id, true)'
  ) THEN
    RAISE EXCEPTION 'S034: corrected restrictive SELECT policy is not installed';
  END IF;
END
$preflight$;

SELECT set_config('request.jwt.claim.sub', '2eb97083-32e1-4912-b64b-dd8d1bc07b2c', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"2eb97083-32e1-4912-b64b-dd8d1bc07b2c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $qa_insert_returning$
DECLARE
  v_id uuid;
  v_content text;
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'S034: QA writer JWT context is not the expected admin';
  END IF;
  INSERT INTO public.lessons (id, course_id, title, type, content, order_index)
  VALUES ('a0341000-0000-4000-8000-000000000001',
          'e77c7082-e557-4011-aff5-a1aff0abc12a',
          'QA S034 rollback-only lesson', 'text', 'S034 insert evidence', 1000000)
  RETURNING id, content INTO v_id, v_content;
  IF v_id IS DISTINCT FROM 'a0341000-0000-4000-8000-000000000001'::uuid
     OR v_content IS DISTINCT FROM 'S034 insert evidence' THEN
    RAISE EXCEPTION 'S034: INSERT RETURNING did not return the new QA lesson';
  END IF;
  RAISE NOTICE 'PASS S034: ordinary QA course INSERT RETURNING';

  UPDATE public.lessons SET content = 'S034 update evidence'
  WHERE id = 'a0341000-0000-4000-8000-000000000001'
    AND course_id = 'e77c7082-e557-4011-aff5-a1aff0abc12a'
  RETURNING content INTO v_content;
  IF NOT FOUND OR v_content IS DISTINCT FROM 'S034 update evidence' THEN
    RAISE EXCEPTION 'S034: UPDATE RETURNING did not persist the QA lesson content';
  END IF;
  RAISE NOTICE 'PASS S034: ordinary QA course UPDATE RETURNING';

  INSERT INTO public.lessons (id, course_id, title, type, content, order_index)
  VALUES ('a0341000-0000-4000-8000-000000000001',
          'e77c7082-e557-4011-aff5-a1aff0abc12a',
          'QA S034 rollback-only lesson', 'text', 'S034 upsert evidence', 1000000)
  ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content
  RETURNING content INTO v_content;
  IF v_content IS DISTINCT FROM 'S034 upsert evidence' THEN
    RAISE EXCEPTION 'S034: UPSERT RETURNING did not persist the QA lesson content';
  END IF;
  RAISE NOTICE 'PASS S034: ordinary QA course UPSERT RETURNING';
END
$qa_insert_returning$;

-- Inspect ordinary organization-owner authorization without writing its course.
SELECT set_config('request.jwt.claim.sub', '4a5fd5c7-7749-4416-bab0-569fc50018b9', true);
SELECT set_config('request.jwt.claims', '{"sub":"4a5fd5c7-7749-4416-bab0-569fc50018b9","role":"authenticated"}', true);
DO $ordinary_owner_readonly$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.can_access_course('8225c963-4926-44cf-82bc-5bb754309868', 'courses.write') IS DISTINCT FROM true
     OR public._paid_20260922_course_read('8225c963-4926-44cf-82bc-5bb754309868', true) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'S034: ordinary owner must retain courses.write and pass the neutral paid gate';
  END IF;
  RAISE NOTICE 'PASS S034: ordinary non-admin owner authorization (read-only)';
END
$ordinary_owner_readonly$;

SELECT set_config('request.jwt.claim.sub', '70111dc5-eeea-461c-9d30-4a246c0c4585', true);
SELECT set_config('request.jwt.claims', '{"sub":"70111dc5-eeea-461c-9d30-4a246c0c4585","role":"authenticated"}', true);
DO $cross_tenant_and_paid_denial$
BEGIN
  IF public.can_access_course('8225c963-4926-44cf-82bc-5bb754309868', 'courses.write') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'S034: QA learner unexpectedly has write permission in the other organization';
  END IF;
  RAISE NOTICE 'PASS S034: cross-organization write authorization denied (read-only)';

  IF public._paid_20260922_course_read('26e65ccb-609f-5b3d-b59a-f280c9feae5b', true) IS DISTINCT FROM false
     OR EXISTS (SELECT 1 FROM public.lessons
                WHERE course_id = '26e65ccb-609f-5b3d-b59a-f280c9feae5b') THEN
    RAISE EXCEPTION 'S034: paid original content became readable to a QA nonbuyer';
  END IF;
  RAISE NOTICE 'PASS S034: paid nonbuyer denied by actual lesson SELECT';
END
$cross_tenant_and_paid_denial$;

RESET ROLE;
DO $fixture_readback$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lessons
    WHERE id = 'a0341000-0000-4000-8000-000000000001'
      AND course_id = 'e77c7082-e557-4011-aff5-a1aff0abc12a'
      AND content = 'S034 upsert evidence'
  ) THEN
    RAISE EXCEPTION 'S034: trusted readback did not confirm the temporary QA lesson';
  END IF;
  RAISE NOTICE 'PASS S034: trusted QA readback; rolling back all fixture writes';
END
$fixture_readback$;
ROLLBACK;
