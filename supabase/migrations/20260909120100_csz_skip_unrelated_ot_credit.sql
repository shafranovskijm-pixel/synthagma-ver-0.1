-- S025: exact-course exception only. No historical row repair or broad OT rewrite.
-- Baseline: saved read-only Cloud catalogs/bodies 2026-09-09, sources/ot_source.json.
-- Run in a coordinated DDL window. Source/attachment drift aborts the transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
LOCK TABLE public.enrollments IN SHARE ROW EXCLUSIVE MODE;
DO $s025$
DECLARE
  v_oid oid := to_regprocedure('public.update_labor_safety_on_course_completion()');
  v_expected text := $expected$CREATE OR REPLACE FUNCTION public.update_labor_safety_on_course_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    UPDATE labor_safety_records lsr
    SET is_passed = true,
        exam_date = COALESCE(lsr.exam_date, CURRENT_DATE)
    FROM labor_safety_profiles lsp
    WHERE lsp.user_id = NEW.user_id
      AND lsp.record_id = lsr.id
      AND lsr.is_passed = false;
  END IF;
  RETURN NEW;
END;
$function$
$expected$;
  v_updated text := $updated$CREATE OR REPLACE FUNCTION public.update_labor_safety_on_course_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- S025: these two CSZ courses must not credit unrelated occupational-safety records.
  IF NEW.course_id = ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]) THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    UPDATE labor_safety_records lsr
    SET is_passed = true,
        exam_date = COALESCE(lsr.exam_date, CURRENT_DATE)
    FROM labor_safety_profiles lsp
    WHERE lsp.user_id = NEW.user_id
      AND lsp.record_id = lsr.id
      AND lsr.is_passed = false;
  END IF;
  RETURN NEW;
END;
$function$
$updated$;
  v_before jsonb;
  v_triggers jsonb;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'S025 preflight: expected function missing' USING ERRCODE='55000';
  END IF;
  IF pg_get_functiondef(v_oid) IS DISTINCT FROM v_expected OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=v_oid AND p.proowner=to_regrole('postgres')
      AND p.prokind='f' AND p.prorettype='trigger'::regtype AND p.pronargs=0
      AND l.lanname='plpgsql' AND p.prosecdef AND p.provolatile='v'
      AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u'
      AND p.proconfig=ARRAY['search_path=public']::text[]
  ) THEN
    RAISE EXCEPTION 'S025 preflight: expected function body/security drift' USING ERRCODE='55000';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgfoid=v_oid) <> 1 OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgfoid=v_oid AND tgrelid='public.enrollments'::regclass
      AND tgname='on_course_completion_update_labor_safety' AND tgtype=17
      AND tgenabled='O' AND NOT tgisinternal AND tgconstraint=0
      AND tgnargs=0 AND tgattr=''::int2vector AND tgqual IS NULL
      AND tgoldtable IS NULL AND tgnewtable IS NULL
  ) THEN
    RAISE EXCEPTION 'S025 preflight: expected AFTER UPDATE attachment drift' USING ERRCODE='55000';
  END IF;
  SELECT to_jsonb(p)-'prosrc' INTO v_before FROM pg_proc p WHERE oid=v_oid;
  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) INTO v_triggers FROM pg_trigger t WHERE tgfoid=v_oid;
  EXECUTE v_updated;
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=v_oid) IS DISTINCT FROM v_before
    OR pg_get_functiondef(v_oid) IS DISTINCT FROM v_updated
    OR (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE tgfoid=v_oid) IS DISTINCT FROM v_triggers THEN
    RAISE EXCEPTION 'S025 postcondition: unintended function/ACL/trigger delta' USING ERRCODE='55000';
  END IF;
END;
$s025$;
COMMIT;
