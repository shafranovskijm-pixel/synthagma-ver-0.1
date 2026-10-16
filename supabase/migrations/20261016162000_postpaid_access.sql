-- Active postpaid agreements remove admission quotas, while usage still counts.
-- Preserve the canonical authorization, tenant checks, locks, ACL and search_path.
-- No plan, agreement, usage or entitlement row is changed by this migration.
BEGIN;
DO $postpaid_access$
DECLARE
  patch record;
  target oid;
  original_body text;
  original_definition text;
  replacement text;
  expected_body text;
  before_attributes jsonb;
  after_attributes jsonb;
BEGIN
  IF to_regclass('public.organization_billing_agreements') IS NULL THEN
    RAISE EXCEPTION 'Postpaid access prerequisite missing: organization_billing_agreements';
  END IF;

  -- These hashes are the canonical live prosrc values verified before release.
  -- An unknown definition (including a repeated migration) requires a new review.
  FOR patch IN SELECT * FROM (VALUES
    ('public.get_organization_student_capacity(uuid,integer)',
     '8a35465f4c53c02ac5417d1d2d13e257',
     '  SELECT COALESCE(u.students_added_count, 0)',
     'p_organization_id', E'    v_max := -1;\n    v_source := ''postpaid'';'),
    ('public.create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text)',
     'a98662aeb134696aaa1fe26057e9a7d5',
     '  INSERT INTO public.organization_usage (organization_id, month_start, students_added_count)',
     'p_organization_id', E'    v_max := -1;\n    v_source := ''postpaid'';'),
    ('public.enforce_course_insert_limit()',
     '7b5b28b9d98d1cd0d341ca228b4f86c1',
     '  IF v_max_courses <> -1 THEN',
     'NEW.organization_id', '    v_max_courses := -1;')
  ) AS patches(signature, body_md5, anchor, organization_expression, assignment)
  LOOP
    target := to_regprocedure(patch.signature);
    IF target IS NULL THEN
      RAISE EXCEPTION 'Postpaid access prerequisite missing: %', patch.signature;
    END IF;
    SELECT prosrc, pg_get_functiondef(oid),
      jsonb_build_object('owner', proowner, 'acl', proacl, 'security_definer', prosecdef,
        'config', proconfig, 'volatility', provolatile, 'leakproof', proleakproof,
        'strict', proisstrict, 'parallel', proparallel)
      INTO original_body, original_definition, before_attributes
    FROM pg_proc WHERE oid = target;
    IF md5(original_body) IS DISTINCT FROM patch.body_md5 THEN
      RAISE EXCEPTION 'Postpaid access canonical function drift: %', patch.signature;
    END IF;
    IF (length(original_body) - length(replace(original_body, patch.anchor, ''))) / length(patch.anchor) <> 1 THEN
      RAISE EXCEPTION 'Postpaid access anchor is not unique: %', patch.signature;
    END IF;

    -- This predicate runs only after the original caller checks. Do not invoke
    -- the UI access-profile helper: legacy company viewers have a different
    -- established capacity-read contract, which must remain unchanged.
    replacement := format(E'  IF EXISTS (\n    SELECT 1 FROM public.organization_billing_agreements agreement\n    WHERE agreement.organization_id = %s\n      AND agreement.effective_from <= (now() AT TIME ZONE ''Europe/Moscow'')::date\n      AND (agreement.effective_to IS NULL\n        OR agreement.effective_to > (now() AT TIME ZONE ''Europe/Moscow'')::date)\n  ) THEN\n%s\n  END IF;\n\n%s',
      patch.organization_expression, patch.assignment, patch.anchor);
    expected_body := replace(original_body, patch.anchor, replacement);
    EXECUTE replace(original_definition, patch.anchor, replacement);

    SELECT jsonb_build_object('owner', proowner, 'acl', proacl, 'security_definer', prosecdef,
      'config', proconfig, 'volatility', provolatile, 'leakproof', proleakproof,
      'strict', proisstrict, 'parallel', proparallel)
      INTO after_attributes FROM pg_proc WHERE oid = target;
    IF before_attributes IS DISTINCT FROM after_attributes
      OR (SELECT prosrc FROM pg_proc WHERE oid = target) IS DISTINCT FROM expected_body THEN
      RAISE EXCEPTION 'Postpaid access function preservation failed: %', patch.signature;
    END IF;
  END LOOP;
END
$postpaid_access$;

-- The same central gate protects CRM SELECT policies and all CRM write RPCs.
-- Active postpay uses explicit consent, even when a legacy paid plan remains.
DO $postpaid_crm_access$
DECLARE
  target oid := to_regprocedure('public.org_crm_access_allowed(uuid,text)');
  original_body text;
  original_definition text;
  expected_body text;
  before_attributes jsonb;
  after_attributes jsonb;
  anchor text := 'o.subscription_plan::text IN(''standard'',''professional'',''maximum'')';
  replacement text := $crm_case$CASE WHEN EXISTS (
     SELECT 1 FROM public.organization_billing_agreements agreement
     WHERE agreement.organization_id=o.id
       AND agreement.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date
       AND (agreement.effective_to IS NULL OR agreement.effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date)
   ) THEN EXISTS (
     SELECT 1 FROM public.postpaid_feature_confirmations confirmation
     WHERE confirmation.organization_id=o.id AND confirmation.feature='crm'
       AND confirmation.notified_at<=confirmation.confirmed_at
       AND confirmation.confirmed_at<=now()
       AND (confirmation.effective_to IS NULL OR confirmation.effective_to>now())
   ) ELSE o.subscription_plan::text IN('standard','professional','maximum') END$crm_case$;
BEGIN
  IF target IS NULL OR to_regclass('public.postpaid_feature_confirmations') IS NULL THEN
    RAISE EXCEPTION 'Postpaid CRM access prerequisites missing';
  END IF;
  SELECT prosrc,pg_get_functiondef(oid),jsonb_build_object('owner',proowner,'acl',proacl,'security_definer',prosecdef,
    'config',proconfig,'volatility',provolatile,'strict',proisstrict,'parallel',proparallel,'leakproof',proleakproof)
    INTO original_body,original_definition,before_attributes FROM pg_proc WHERE oid=target;
  -- Read-only live metadata matches the original 20261012200000 CRM gate.
  IF md5(original_body) IS DISTINCT FROM '395b7dd7b17fd70aa2d3a48b62bc689c' THEN
    RAISE EXCEPTION 'Postpaid CRM access canonical function drift';
  END IF;
  IF (length(original_body)-length(replace(original_body,anchor,'')))/length(anchor)<>1 THEN
    RAISE EXCEPTION 'Postpaid CRM access anchor is not unique';
  END IF;
  expected_body:=replace(original_body,anchor,replacement);
  EXECUTE replace(original_definition,anchor,replacement);
  SELECT jsonb_build_object('owner',proowner,'acl',proacl,'security_definer',prosecdef,
    'config',proconfig,'volatility',provolatile,'strict',proisstrict,'parallel',proparallel,'leakproof',proleakproof)
    INTO after_attributes FROM pg_proc WHERE oid=target;
  IF before_attributes IS DISTINCT FROM after_attributes OR
    (SELECT prosrc FROM pg_proc WHERE oid=target) IS DISTINCT FROM expected_body THEN
    RAISE EXCEPTION 'Postpaid CRM access function preservation failed';
  END IF;
END
$postpaid_crm_access$;
COMMIT;
