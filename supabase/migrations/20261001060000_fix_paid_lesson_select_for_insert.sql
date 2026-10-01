-- S-034: preserve the paid-course gate without looking up the lesson being
-- inserted. The STABLE lesson helper cannot see that new row in the command's
-- snapshot, so INSERT/UPSERT ... RETURNING failed even for ordinary owners.
-- The course helper applies the same paid-lineage/actor checks to course_id.
-- No permissive policies, helper bodies, roles, grants or data are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
DECLARE
  v_policy pg_catalog.pg_policy%ROWTYPE;
  v_expression text;
BEGIN
  SELECT * INTO v_policy
  FROM pg_catalog.pg_policy
  WHERE polrelid = 'public.lessons'::regclass
    AND polname = 'paid_20260922_lesson_select';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'S034: expected paid lesson SELECT policy is missing';
  END IF;
  IF v_policy.polpermissive OR v_policy.polcmd <> 'r'
     OR v_policy.polroles IS DISTINCT FROM ARRAY[0::oid]
     OR v_policy.polwithcheck IS NOT NULL THEN
    RAISE EXCEPTION 'S034: paid lesson policy shape changed; review before applying';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
          WHERE oid = 'public.lessons'::regclass) THEN
    RAISE EXCEPTION 'S034: lessons RLS must remain enabled';
  END IF;
  IF pg_catalog.to_regprocedure('public._paid_20260922_course_read(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'S034: existing paid course helper is required';
  END IF;

  v_expression := replace(pg_catalog.pg_get_expr(
    v_policy.polqual, v_policy.polrelid), 'public.', '');
  -- Accept the exact old form or an already-applied fix, not an unknown policy.
  IF v_expression IS NULL OR v_expression NOT IN (
    '_paid_20260922_lesson_read(id, false, true)',
    '_paid_20260922_course_read(course_id, true)'
  ) THEN
    RAISE EXCEPTION 'S034: paid lesson policy expression changed: %', v_expression;
  END IF;
END
$preflight$;

ALTER POLICY paid_20260922_lesson_select ON public.lessons
  USING (public._paid_20260922_course_read(course_id, true));

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid = 'public.lessons'::regclass
      AND polname = 'paid_20260922_lesson_select'
      AND NOT polpermissive AND polcmd = 'r'
      AND polroles = ARRAY[0::oid] AND polwithcheck IS NULL
      AND replace(pg_catalog.pg_get_expr(polqual, polrelid), 'public.', '')
        = '_paid_20260922_course_read(course_id, true)'
  ) THEN
    RAISE EXCEPTION 'S034: paid lesson policy postcondition failed';
  END IF;
END
$postflight$;
COMMIT;
