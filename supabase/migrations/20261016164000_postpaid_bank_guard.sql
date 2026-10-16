-- A prepaid checkout may be confirmed after an agreement switches to postpay.
-- Record the received money once, but require reconciliation before changing
-- access. No invoice, agreement or payment is created by this migration.
BEGIN;
DO $postpaid_bank_guard$
DECLARE
  target oid := to_regprocedure('public.apply_tbank_payment_event(text,uuid,text,text,bigint,text)');
  original_body text;
  original_definition text;
  expected_body text;
  definition text;
  before_attributes jsonb;
  after_attributes jsonb;
  lock_anchor text := '  -- Same lock order as marketplace debits / apply_tbank_balance_credit.';
  decision_anchor text := '    IF v_org.subscription_plan IS DISTINCT FROM v_invoice.plan AND EXISTS(';
  lock_patch text := $lock_patch$  -- Serialize the switch to postpay before taking organization/invoice locks.
  -- save_postpaid_agreement and issue_postpaid_invoice use this same key.
  IF p_kind='subscription' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||v_org_id::text,0));
  END IF;
  -- Same lock order as marketplace debits / apply_tbank_balance_credit.$lock_patch$;
  decision_patch text := $decision_patch$    IF EXISTS (
      SELECT 1 FROM public.organization_billing_agreements agreement
      WHERE agreement.organization_id=v_org_id
        AND agreement.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date
        AND (agreement.effective_to IS NULL OR agreement.effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date)
    ) THEN
      v_reason:='prepaid_payment_after_postpaid_activation';
    ELSIF v_org.subscription_plan IS DISTINCT FROM v_invoice.plan AND EXISTS($decision_patch$;
BEGIN
  IF target IS NULL OR to_regclass('public.organization_billing_agreements') IS NULL THEN
    RAISE EXCEPTION 'Postpaid bank guard prerequisites missing';
  END IF;
  SELECT prosrc,pg_get_functiondef(oid),jsonb_build_object('owner',proowner,'acl',proacl,'security_definer',prosecdef,
    'config',proconfig,'volatility',provolatile,'strict',proisstrict,'parallel',proparallel,'leakproof',proleakproof)
    INTO original_body,original_definition,before_attributes FROM pg_proc WHERE oid=target;
  IF md5(original_body) IS DISTINCT FROM 'd37c24129758940d3cabcc2aa4ab4476' THEN
    RAISE EXCEPTION 'Postpaid bank guard canonical settlement function drift';
  END IF;
  IF (length(original_body)-length(replace(original_body,lock_anchor,'')))/length(lock_anchor)<>1
    OR (length(original_body)-length(replace(original_body,decision_anchor,'')))/length(decision_anchor)<>1 THEN
    RAISE EXCEPTION 'Postpaid bank guard anchors are not unique';
  END IF;
  expected_body:=replace(replace(original_body,lock_anchor,lock_patch),decision_anchor,decision_patch);
  definition:=replace(replace(original_definition,lock_anchor,lock_patch),decision_anchor,decision_patch);
  EXECUTE definition;
  SELECT jsonb_build_object('owner',proowner,'acl',proacl,'security_definer',prosecdef,
    'config',proconfig,'volatility',provolatile,'strict',proisstrict,'parallel',proparallel,'leakproof',proleakproof)
    INTO after_attributes FROM pg_proc WHERE oid=target;
  IF before_attributes IS DISTINCT FROM after_attributes OR
    (SELECT prosrc FROM pg_proc WHERE oid=target) IS DISTINCT FROM expected_body THEN
    RAISE EXCEPTION 'Postpaid bank guard function preservation failed';
  END IF;
END
$postpaid_bank_guard$;
COMMIT;
