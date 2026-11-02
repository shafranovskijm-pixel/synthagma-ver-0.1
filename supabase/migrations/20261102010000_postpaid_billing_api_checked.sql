-- Normal authenticated administration for contract postpayment over MCP/API.
-- This migration only adds three wrappers. It does not issue invoices, change
-- access, record payments, grant admin roles, or alter existing financial RPCs.
BEGIN;

DO $preflight$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.postpaid_require_admin()',
    'public.postpaid_collect_snapshot(uuid,date)',
    'public.postpaid_calculate(integer,integer,jsonb,integer,integer)',
    'public.approve_postpaid_statement(uuid,text,integer,integer)',
    'public.issue_postpaid_invoice(uuid)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Checked postpaid API prerequisite missing: %',signature;
    END IF;
  END LOOP;
  IF to_regclass('public.postpaid_billing_statements') IS NULL
    OR to_regclass('public.subscription_invoices') IS NULL THEN
    RAISE EXCEPTION 'Checked postpaid API financial tables missing';
  END IF;
END $preflight$;

CREATE FUNCTION public.preview_postpaid_statement_checked(
  p_organization_id uuid,p_statement_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
DECLARE r public.postpaid_billing_statements%ROWTYPE; s jsonb; q jsonb; review_hash text;
BEGIN
  PERFORM public.postpaid_require_admin();
  IF p_organization_id IS NULL OR p_statement_id IS NULL THEN
    RAISE EXCEPTION 'invalid_postpaid_api_input' USING ERRCODE='22023';
  END IF;
  SELECT * INTO r FROM public.postpaid_billing_statements
    WHERE id=p_statement_id AND organization_id=p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'postpaid_statement_unavailable' USING ERRCODE='P0002'; END IF;
  IF r.status<>'invoiced' THEN
    s:=public.postpaid_collect_snapshot(p_organization_id,r.period_start);
    q:=public.postpaid_calculate((s->>'courses_count')::integer,(s->>'learners_count')::integer,
      s->'features',(s->>'access_days')::integer,(s->>'month_days')::integer);
  END IF;
  review_hash:=CASE WHEN r.reviewed_at IS NOT NULL THEN md5(jsonb_build_array(
    r.reviewed_courses,r.reviewed_learners,r.review_note,r.reviewed_by,
    to_char(r.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),r.plan,r.amount)::text) END;
  -- Only explicitly selected billing facts are returned. No confirmation text,
  -- event/learner payload, SMTP/payment credentials, or raw auth metadata.
  RETURN jsonb_build_object('organization_id',p_organization_id,
    'statement',jsonb_build_object('id',r.id,'organization_id',r.organization_id,'revision',r.revision,
      'status',r.status,'source_hash',r.source_hash,'period_start',r.period_start,'period_end',r.period_end,
      'plan',r.plan,'amount',r.amount,'reviewed_courses',r.reviewed_courses,'reviewed_learners',r.reviewed_learners,
      'reviewed_at',r.reviewed_at,'invoice_id',r.invoice_id,'review_hash',review_hash),
    'current',CASE WHEN s IS NOT NULL THEN jsonb_build_object('source_hash',md5(s::text),'period_closed',s->'period_closed',
      'courses_count',s->'courses_count','learners_count',s->'learners_count',
      'ledger_courses_count',s->'ledger_courses_count','ledger_learners_count',s->'ledger_learners_count',
      'features',s->'features','completeness',s->'completeness',
      'access_days',s->'access_days','month_days',s->'month_days',
      'access_period_start',s->'access_period_start','access_period_end',s->'access_period_end',
      'contract_reference',s->'agreement'->>'contract_reference','terms_version',s->>'terms_version','quote',q) END,
    'fresh',CASE WHEN s IS NOT NULL THEN r.source_hash=md5(s::text) END,'already_issued',r.status='invoiced');
END $fn$;

CREATE FUNCTION public.approve_postpaid_statement_checked(
  p_organization_id uuid,p_statement_id uuid,p_expected_source_hash text,
  p_expected_amount numeric,p_expected_plan text,p_courses integer,p_learners integer,p_review_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
DECLARE r public.postpaid_billing_statements%ROWTYPE; s jsonb; q jsonb;
  review_hash text; already_approved boolean;
BEGIN
  PERFORM public.postpaid_require_admin();
  IF p_organization_id IS NULL OR p_statement_id IS NULL
    OR p_expected_source_hash IS NULL OR p_expected_source_hash !~ '^[a-f0-9]{32}$'
    OR p_expected_amount IS NULL OR NOT(p_expected_amount>0 AND p_expected_amount<=16990)
    OR p_expected_amount<>trunc(p_expected_amount,2)
    OR p_expected_plan IS NULL OR p_expected_plan NOT IN('start','standard','professional')
    OR p_courses IS NULL OR p_learners IS NULL OR p_courses<0 OR p_learners<0
    OR length(btrim(COALESCE(p_review_note,''))) NOT BETWEEN 10 AND 4000 THEN
    RAISE EXCEPTION 'invalid_postpaid_api_input' USING ERRCODE='22023';
  END IF;
  -- Identical to the existing prepare/approve/issue advisory-lock namespace.
  -- No unchecked gap exists between the caller's money intent and native RPC.
  PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||p_organization_id::text,0));
  -- A caller may have been revoked while blocked behind another operation.
  PERFORM public.postpaid_require_admin();
  SELECT * INTO r FROM public.postpaid_billing_statements
    WHERE id=p_statement_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'postpaid_statement_unavailable' USING ERRCODE='P0002'; END IF;
  IF r.source_hash IS DISTINCT FROM p_expected_source_hash OR r.status='superseded' THEN
    RAISE EXCEPTION 'postpaid_statement_conflict' USING ERRCODE='40001';
  END IF;
  already_approved:=r.status IN('approved','invoiced');
  IF already_approved THEN
    IF r.reviewed_at IS NULL OR (r.reviewed_courses,r.reviewed_learners,r.review_note)
      IS DISTINCT FROM (p_courses,p_learners,btrim(p_review_note)) THEN
      RAISE EXCEPTION 'postpaid_review_conflict' USING ERRCODE='40001';
    END IF;
    IF (r.plan,r.amount) IS DISTINCT FROM (p_expected_plan,p_expected_amount) THEN
      RAISE EXCEPTION 'postpaid_quote_conflict' USING ERRCODE='40001';
    END IF;
    -- Immutable invoiced review can be reread without re-evaluating later use.
    -- An approved-but-not-issued retry must still be fresh and closed.
    IF r.status='approved' THEN
      s:=public.postpaid_collect_snapshot(p_organization_id,r.period_start);
      IF NOT COALESCE((s->>'period_closed')::boolean,false) THEN
        RAISE EXCEPTION 'postpaid_period_open' USING ERRCODE='55000';
      END IF;
      IF r.source_hash IS DISTINCT FROM md5(s::text) THEN
        RAISE EXCEPTION 'postpaid_statement_conflict' USING ERRCODE='40001';
      END IF;
    END IF;
  ELSE
    IF r.status<>'needs_review' THEN
      RAISE EXCEPTION 'postpaid_review_required' USING ERRCODE='55000';
    END IF;
    s:=public.postpaid_collect_snapshot(p_organization_id,r.period_start);
    IF NOT COALESCE((s->>'period_closed')::boolean,false) THEN
      RAISE EXCEPTION 'postpaid_period_open' USING ERRCODE='55000';
    END IF;
    IF r.source_hash IS DISTINCT FROM md5(s::text) THEN
      RAISE EXCEPTION 'postpaid_statement_conflict' USING ERRCODE='40001';
    END IF;
    q:=public.postpaid_calculate(p_courses,p_learners,s->'features',
      (s->>'access_days')::integer,(s->>'month_days')::integer);
    IF (q->>'plan',(q->>'amount')::numeric) IS DISTINCT FROM (p_expected_plan,p_expected_amount) THEN
      RAISE EXCEPTION 'postpaid_quote_conflict' USING ERRCODE='40001';
    END IF;
    -- The existing writer checks retained ledger lower bounds and all native
    -- review requirements. An exception rolls this whole API call back.
    PERFORM public.approve_postpaid_statement(r.id,btrim(p_review_note),p_courses,p_learners);
    SELECT * INTO STRICT r FROM public.postpaid_billing_statements
      WHERE id=p_statement_id AND organization_id=p_organization_id;
    IF r.status<>'approved' OR r.reviewed_at IS NULL OR r.reviewed_by IS DISTINCT FROM auth.uid()
      OR (r.source_hash,r.plan,r.amount,r.reviewed_courses,r.reviewed_learners,r.review_note)
      IS DISTINCT FROM (p_expected_source_hash,p_expected_plan,p_expected_amount,p_courses,p_learners,btrim(p_review_note)) THEN
      RAISE EXCEPTION 'postpaid_native_postcondition_failed' USING ERRCODE='P0001';
    END IF;
  END IF;
  review_hash:=md5(jsonb_build_array(r.reviewed_courses,r.reviewed_learners,r.review_note,r.reviewed_by,
    to_char(r.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),r.plan,r.amount)::text);
  RETURN jsonb_build_object('organization_id',p_organization_id,
    'statement',jsonb_build_object('id',r.id,'organization_id',r.organization_id,'revision',r.revision,
      'status',r.status,'source_hash',r.source_hash,'period_start',r.period_start,'period_end',r.period_end,
      'plan',r.plan,'amount',r.amount,'reviewed_courses',r.reviewed_courses,'reviewed_learners',r.reviewed_learners,
      'reviewed_at',r.reviewed_at,'invoice_id',r.invoice_id,'review_hash',review_hash),
    'already_approved',already_approved,'already_issued',r.status='invoiced');
END $fn$;

CREATE FUNCTION public.issue_postpaid_invoice_checked(
  p_organization_id uuid,p_statement_id uuid,p_expected_source_hash text,
  p_expected_amount numeric,p_expected_plan text,p_expected_review_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
DECLARE r public.postpaid_billing_statements%ROWTYPE; i public.subscription_invoices%ROWTYPE;
  s jsonb; result jsonb; review_hash text; already_issued boolean;
BEGIN
  PERFORM public.postpaid_require_admin();
  IF p_organization_id IS NULL OR p_statement_id IS NULL
    OR p_expected_source_hash IS NULL OR p_expected_source_hash !~ '^[a-f0-9]{32}$'
    OR p_expected_review_hash IS NULL OR p_expected_review_hash !~ '^[a-f0-9]{32}$'
    OR p_expected_amount IS NULL OR NOT(p_expected_amount>0 AND p_expected_amount<=16990)
    OR p_expected_amount<>trunc(p_expected_amount,2)
    OR p_expected_plan IS NULL OR p_expected_plan NOT IN('start','standard','professional') THEN
    RAISE EXCEPTION 'invalid_postpaid_api_input' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||p_organization_id::text,0));
  -- A caller may have been revoked while blocked behind another operation.
  PERFORM public.postpaid_require_admin();
  SELECT * INTO r FROM public.postpaid_billing_statements
    WHERE id=p_statement_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'postpaid_statement_unavailable' USING ERRCODE='P0002'; END IF;
  IF r.source_hash IS DISTINCT FROM p_expected_source_hash OR r.status='superseded' THEN
    RAISE EXCEPTION 'postpaid_statement_conflict' USING ERRCODE='40001';
  END IF;
  IF r.status NOT IN('approved','invoiced') OR r.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'postpaid_review_required' USING ERRCODE='55000';
  END IF;
  IF (r.plan,r.amount) IS DISTINCT FROM (p_expected_plan,p_expected_amount) THEN
    RAISE EXCEPTION 'postpaid_quote_conflict' USING ERRCODE='40001';
  END IF;
  review_hash:=md5(jsonb_build_array(r.reviewed_courses,r.reviewed_learners,r.review_note,r.reviewed_by,
    to_char(r.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),r.plan,r.amount)::text);
  IF review_hash IS DISTINCT FROM p_expected_review_hash THEN
    RAISE EXCEPTION 'postpaid_review_conflict' USING ERRCODE='40001';
  END IF;
  already_issued:=r.status='invoiced';
  IF NOT already_issued THEN
    s:=public.postpaid_collect_snapshot(p_organization_id,r.period_start);
    IF NOT COALESCE((s->>'period_closed')::boolean,false) THEN
      RAISE EXCEPTION 'postpaid_period_open' USING ERRCODE='55000';
    END IF;
    IF r.source_hash IS DISTINCT FROM md5(s::text) THEN
      RAISE EXCEPTION 'postpaid_statement_conflict' USING ERRCODE='40001';
    END IF;
    result:=public.issue_postpaid_invoice(r.id);
    SELECT * INTO STRICT r FROM public.postpaid_billing_statements
      WHERE id=p_statement_id AND organization_id=p_organization_id;
    IF r.status<>'invoiced' OR r.invoice_id IS NULL OR (result->>'invoice_id')::uuid IS DISTINCT FROM r.invoice_id THEN
      RAISE EXCEPTION 'postpaid_native_postcondition_failed' USING ERRCODE='P0001';
    END IF;
  END IF;
  IF (r.source_hash,r.plan,r.amount) IS DISTINCT FROM (p_expected_source_hash,p_expected_plan,p_expected_amount)
    OR md5(jsonb_build_array(r.reviewed_courses,r.reviewed_learners,r.review_note,r.reviewed_by,
      to_char(r.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),r.plan,r.amount)::text) IS DISTINCT FROM p_expected_review_hash THEN
    RAISE EXCEPTION 'postpaid_native_postcondition_failed' USING ERRCODE='P0001';
  END IF;
  -- An issued replay checks the frozen review and the real reciprocal binding.
  -- Later historic-event ingestion is not permission to create a second bill.
  SELECT * INTO i FROM public.subscription_invoices WHERE id=r.invoice_id FOR SHARE;
  IF NOT FOUND OR i.id IS NULL OR r.status<>'invoiced'
    OR (i.organization_id,i.postpaid_statement_id,i.plan,i.amount,i.service_period_start,i.service_period_end)
      IS DISTINCT FROM (p_organization_id,r.id,p_expected_plan,p_expected_amount,r.period_start,r.period_end)
    OR i.billing_kind IS DISTINCT FROM 'postpaid' OR i.payment_method IS DISTINCT FROM 'invoice'
    OR i.period_months IS DISTINCT FROM 1 OR i.invoice_number IS NULL OR i.invoice_date IS NULL THEN
    RAISE EXCEPTION 'postpaid_invoice_binding_invalid' USING ERRCODE='P0001';
  END IF;
  RETURN jsonb_build_object('organization_id',p_organization_id,'statement_id',r.id,
    'source_hash',r.source_hash,'review_hash',review_hash,'invoice_id',i.id,
    'invoice_number',i.invoice_number,'invoice_date',i.invoice_date,
    'period_start',r.period_start,'period_end',r.period_end,'plan',i.plan,'amount',i.amount,
    'currency','RUB','payment_status',i.status,'paid_at',i.paid_at,'already_issued',already_issued);
END $fn$;

REVOKE ALL ON FUNCTION public.preview_postpaid_statement_checked(uuid,uuid),
  public.approve_postpaid_statement_checked(uuid,uuid,text,numeric,text,integer,integer,text),
  public.issue_postpaid_invoice_checked(uuid,uuid,text,numeric,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_postpaid_statement_checked(uuid,uuid),
  public.approve_postpaid_statement_checked(uuid,uuid,text,numeric,text,integer,integer,text),
  public.issue_postpaid_invoice_checked(uuid,uuid,text,numeric,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
