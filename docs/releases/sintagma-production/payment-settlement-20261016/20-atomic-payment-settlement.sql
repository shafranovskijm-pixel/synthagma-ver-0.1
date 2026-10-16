-- Apply before deploying the corresponding T-Bank handlers. No historical
-- payment is credited again and no historical subscription is recalculated.
DO $prerequisite$
BEGIN
  IF to_regprocedure('public.apply_tbank_balance_credit(uuid,numeric,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply reviewed prerequisite 20260822164000_atomic_tbank_balance_credit.sql first';
  END IF;
END $prerequisite$;

ALTER TABLE public.subscription_invoices
  ADD COLUMN tbank_order_id text,
  ADD COLUMN tbank_terminal_key text;
ALTER TABLE public.course_payments ADD COLUMN tbank_terminal_key text;

UPDATE public.subscription_invoices
SET tbank_order_id = 'sub_' || left(replace(id::text, '-', ''), 28)
WHERE payment_method = 'tbank';
CREATE UNIQUE INDEX subscription_invoices_tbank_order_unique
  ON public.subscription_invoices(tbank_order_id) WHERE tbank_order_id IS NOT NULL;

CREATE TABLE public.tbank_payment_settlements (
  kind text NOT NULL CHECK (kind IN ('subscription','course')),
  record_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_id text NOT NULL,
  terminal_key text NOT NULL,
  amount_kopecks bigint NOT NULL CHECK (amount_kopecks > 0),
  outcome text NOT NULL CHECK (outcome IN ('applied','review_required','legacy_replay')),
  review_reason text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kind, record_id),
  UNIQUE(terminal_key, payment_id)
);
ALTER TABLE public.tbank_payment_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tbank_payment_settlements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tbank_payment_settlements TO service_role;

-- Browser-created manual invoices remain pending documents. Only trusted
-- checkout may create/change bank identity, quote, status or paid timestamps.
CREATE FUNCTION public.guard_subscription_invoice_payment_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  -- Keeps the previous Init handler compatible during SQL-first rollout.
  IF NEW.payment_method='tbank' AND NEW.tbank_order_id IS NULL THEN
    NEW.tbank_order_id := 'sub_' || left(replace(NEW.id::text, '-', ''), 28);
  END IF;
  IF auth.role() = 'service_role'
     OR (auth.role() IS NULL AND session_user IN ('postgres','supabase_admin'))
     OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP='INSERT' THEN
    IF COALESCE(NEW.payment_method,'invoice') <> 'invoice' OR NEW.status <> 'pending'
       OR NEW.payment_id IS NOT NULL OR NEW.paid_at IS NOT NULL
       OR NEW.tbank_order_id IS NOT NULL OR NEW.tbank_terminal_key IS NOT NULL THEN
      RAISE EXCEPTION 'Trusted checkout required for payment fields' USING ERRCODE='42501';
    END IF;
  ELSIF (to_jsonb(NEW) - ARRAY['buyer_name','buyer_inn','buyer_kpp','invoice_number','invoice_date'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['buyer_name','buyer_inn','buyer_kpp','invoice_number','invoice_date']) THEN
    RAISE EXCEPTION 'Invoice financial fields are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_subscription_invoice_payment_fields() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_subscription_invoice_payment_fields
BEFORE INSERT OR UPDATE ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_invoice_payment_fields();

-- PostgreSQL clamps month-end dates. UTC makes the result independent of the
-- connection timezone and avoids JavaScript setMonth overflow (Jan 31 -> Mar).
CREATE FUNCTION public.tbank_add_calendar_months(p_start timestamptz, p_months integer)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT ((p_start AT TIME ZONE 'UTC') + make_interval(months => p_months)) AT TIME ZONE 'UTC';
$fn$;
REVOKE ALL ON FUNCTION public.tbank_add_calendar_months(timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tbank_add_calendar_months(timestamptz,integer) TO service_role;

CREATE FUNCTION public.apply_tbank_payment_event(
  p_kind text, p_record_id uuid, p_payment_id text, p_terminal_key text,
  p_amount_kopecks bigint, p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE
  v_org_id uuid; v_org public.organizations%ROWTYPE;
  v_invoice public.subscription_invoices%ROWTYPE;
  v_payment public.course_payments%ROWTYPE;
  v_settlement public.tbank_payment_settlements%ROWTYPE;
  v_enrollment public.enrollments%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_amount numeric; v_bound_payment text; v_bound_terminal text;
  v_status text; v_paid_at timestamptz; v_method text; v_key text; v_credit jsonb;
  v_reason text; v_outcome text := 'applied'; v_new_until timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment integration required' USING ERRCODE='42501';
  END IF;
  IF p_kind NOT IN ('subscription','course') OR p_kind IS NULL OR p_record_id IS NULL
     OR p_payment_id IS NULL OR p_payment_id !~ '^[0-9]{1,30}$'
     OR NULLIF(btrim(p_terminal_key),'') IS NULL
     OR p_amount_kopecks IS NULL OR p_amount_kopecks <= 0
     OR p_status IS NULL OR p_status NOT IN ('CONFIRMED','REJECTED','CANCELED') THEN
    RAISE EXCEPTION 'Invalid payment event' USING ERRCODE='22023';
  END IF;

  IF p_kind='subscription' THEN
    SELECT organization_id INTO v_org_id FROM public.subscription_invoices WHERE id=p_record_id;
  ELSE
    SELECT organization_id INTO v_org_id FROM public.course_payments WHERE id=p_record_id;
  END IF;
  -- Same lock order as marketplace debits / apply_tbank_balance_credit.
  SELECT * INTO STRICT v_org FROM public.organizations WHERE id=v_org_id FOR UPDATE;
  IF p_kind='subscription' THEN
    SELECT * INTO STRICT v_invoice FROM public.subscription_invoices WHERE id=p_record_id FOR UPDATE;
    IF v_invoice.organization_id IS DISTINCT FROM v_org_id THEN RAISE EXCEPTION 'Payment organization changed'; END IF;
    v_amount:=v_invoice.amount; v_bound_payment:=v_invoice.payment_id;
    v_bound_terminal:=v_invoice.tbank_terminal_key; v_status:=v_invoice.status; v_paid_at:=v_invoice.paid_at; v_method:=v_invoice.payment_method;
  ELSE
    SELECT * INTO STRICT v_payment FROM public.course_payments WHERE id=p_record_id FOR UPDATE;
    IF v_payment.organization_id IS DISTINCT FROM v_org_id THEN RAISE EXCEPTION 'Payment organization changed'; END IF;
    v_amount:=v_payment.amount; v_bound_payment:=v_payment.robokassa_inv_id::text;
    v_bound_terminal:=v_payment.tbank_terminal_key; v_status:=v_payment.status; v_paid_at:=v_payment.paid_at; v_method:=v_payment.payment_method;
  END IF;
  IF v_method IS DISTINCT FROM 'tbank' OR v_amount*100 IS DISTINCT FROM p_amount_kopecks::numeric
     OR (v_bound_payment IS NOT NULL AND v_bound_payment <> p_payment_id)
     OR (v_bound_terminal IS NOT NULL AND v_bound_terminal <> p_terminal_key) THEN
    RAISE EXCEPTION 'Payment identity or amount mismatch' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_settlement FROM public.tbank_payment_settlements WHERE kind=p_kind AND record_id=p_record_id;
  IF FOUND THEN
    IF v_settlement.payment_id<>p_payment_id OR v_settlement.terminal_key<>p_terminal_key
       OR v_settlement.amount_kopecks<>p_amount_kopecks OR v_settlement.organization_id<>v_org_id THEN
      RAISE EXCEPTION 'Payment replay conflict' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('applied',false,'outcome',v_settlement.outcome,
      'requires_review',v_settlement.outcome='review_required');
  END IF;

  -- A late negative notification cannot revoke an already paid record.
  IF p_status <> 'CONFIRMED' THEN
    IF v_status <> 'paid' THEN
      IF p_kind='subscription' THEN
        UPDATE public.subscription_invoices SET status='failed' WHERE id=p_record_id;
      ELSE
        UPDATE public.course_payments SET status='failed' WHERE id=p_record_id;
      END IF;
    END IF;
    RETURN jsonb_build_object('applied',false,'outcome','ignored_failure','requires_review',false);
  END IF;

  v_key := 'tbank:' || p_kind || ':' || p_record_id::text;
  -- Pre-ledger handlers could already grant access/credit without storing an
  -- idempotency key. Paid markers are insufficient evidence to credit again.
  IF (v_status='paid' OR v_paid_at IS NOT NULL) AND NOT EXISTS(
    SELECT 1 FROM public.balance_transactions WHERE idempotency_key=v_key
  ) THEN
    INSERT INTO public.tbank_payment_settlements(kind,record_id,organization_id,payment_id,terminal_key,amount_kopecks,outcome,review_reason)
    VALUES(p_kind,p_record_id,v_org_id,p_payment_id,p_terminal_key,p_amount_kopecks,'review_required','historical_paid_without_ledger');
    INSERT INTO public.admin_notifications(type,title,message,related_entity_id,metadata)
    VALUES('invoice','Историческая оплата требует сверки','Повторное зачисление остановлено: оплаченный документ не связан с журналом платежей.',v_org_id::text,
      jsonb_build_object('payment_kind',p_kind,'payment_record_id',p_record_id,'organization_id',v_org_id,'reason','historical_paid_without_ledger'));
    RETURN jsonb_build_object('applied',false,'outcome','review_required','requires_review',true);
  END IF;
  -- The existing ledger is also the historical replay fence. It must be
  -- checked BEFORE entitlement writes, not merely before sending referrals.
  v_credit := public.apply_tbank_balance_credit(v_org_id, v_amount,
    CASE WHEN p_kind='subscription' THEN 'subscription' ELSE 'payment' END,
    CASE WHEN p_kind='subscription' THEN 'Оплата подписки' ELSE 'Оплата курса' END, v_key);
  IF NOT (v_credit->>'applied')::boolean THEN
    v_outcome:='legacy_replay';
  ELSIF p_kind='subscription' THEN
    IF v_invoice.plan NOT IN ('start','standard','professional','maximum')
       OR v_invoice.period_months IS NULL OR v_invoice.period_months NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid subscription quote' USING ERRCODE='22023';
    END IF;
    -- Invoice creation order is the deterministic purchase-intent order.
    -- An older first delivery must not overwrite a newer paid plan. The same
    -- plan can still be extended; a different plan needs explicit reconciliation.
    IF v_org.subscription_plan IS DISTINCT FROM v_invoice.plan AND EXISTS(
      SELECT 1 FROM public.subscription_invoices i
      WHERE i.organization_id=v_org_id AND i.status='paid' AND i.id<>v_invoice.id
        AND (COALESCE(i.created_at,'-infinity'::timestamptz),i.id)
          > (COALESCE(v_invoice.created_at,'-infinity'::timestamptz),v_invoice.id)
    ) THEN
      v_reason:='older_invoice_different_plan';
    ELSE
      v_new_until:=public.tbank_add_calendar_months(GREATEST(now(),v_org.paid_until),v_invoice.period_months);
      UPDATE public.organizations SET subscription_plan=v_invoice.plan,paid_until=v_new_until WHERE id=v_org_id;
    END IF;
    UPDATE public.subscription_invoices SET status='paid',paid_at=now(),payment_id=p_payment_id,
      tbank_terminal_key=p_terminal_key WHERE id=p_record_id;
  ELSE
    SELECT * INTO STRICT v_course FROM public.courses WHERE id=v_payment.course_id;
    IF v_course.organization_id IS DISTINCT FROM v_org_id THEN RAISE EXCEPTION 'Course organization mismatch'; END IF;
    IF v_payment.user_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.profiles p WHERE p.user_id=v_payment.user_id AND p.archived_at IS NULL
    ) OR EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=v_payment.user_id) THEN
      v_reason:='learner_unavailable';
    ELSE
      INSERT INTO public.enrollments(user_id,course_id,status,progress,access_days)
      VALUES(v_payment.user_id,v_payment.course_id,'active',0,v_course.default_access_days)
      ON CONFLICT(user_id,course_id) DO NOTHING;
      SELECT * INTO STRICT v_enrollment FROM public.enrollments
        WHERE user_id=v_payment.user_id AND course_id=v_payment.course_id FOR UPDATE;
      IF v_enrollment.status NOT IN ('active','completed')
         OR v_enrollment.expires_at <= now() THEN
        -- Preserve existing learning history / manual access restrictions.
        v_reason:='existing_enrollment_requires_review';
      END IF;
    END IF;
    UPDATE public.course_payments SET status='paid',paid_at=now(),robokassa_inv_id=p_payment_id::bigint,
      tbank_terminal_key=p_terminal_key WHERE id=p_record_id;
  END IF;

  IF v_reason IS NOT NULL THEN v_outcome:='review_required'; END IF;
  INSERT INTO public.tbank_payment_settlements(kind,record_id,organization_id,payment_id,terminal_key,amount_kopecks,outcome,review_reason)
  VALUES(p_kind,p_record_id,v_org_id,p_payment_id,p_terminal_key,p_amount_kopecks,v_outcome,v_reason);
  IF v_reason IS NOT NULL THEN
    INSERT INTO public.admin_notifications(type,title,message,related_entity_id,metadata)
    VALUES('invoice','Оплата требует сверки','Платёж получен; автоматическое изменение доступа остановлено для проверки.',v_org_id::text,
      jsonb_build_object('payment_kind',p_kind,'payment_record_id',p_record_id,'organization_id',v_org_id,'reason',v_reason));
  END IF;
  RETURN jsonb_build_object('applied',(v_credit->>'applied')::boolean,'outcome',v_outcome,'requires_review',v_reason IS NOT NULL);
END $fn$;
REVOKE ALL ON FUNCTION public.apply_tbank_payment_event(text,uuid,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tbank_payment_event(text,uuid,text,text,bigint,text) TO service_role;
