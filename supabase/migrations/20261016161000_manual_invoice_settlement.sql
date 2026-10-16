-- Invoice payments close a debt atomically. Postpaid invoices never grant
-- another future month of access. Existing paid invoices are never replayed.
CREATE TABLE public.manual_invoice_settlements (
  invoice_id uuid PRIMARY KEY REFERENCES public.subscription_invoices(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
  billing_kind text NOT NULL,
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  resulting_paid_until timestamptz
);
ALTER TABLE public.manual_invoice_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_invoice_settlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_invoice_settlements TO authenticated;
GRANT ALL ON public.manual_invoice_settlements TO service_role;
CREATE POLICY manual_invoice_settlements_admin_read ON public.manual_invoice_settlements
FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin')
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
);

CREATE FUNCTION public.confirm_manual_subscription_invoice(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE
  v_org_id uuid;
  v_org public.organizations%ROWTYPE;
  v_invoice public.subscription_invoices%ROWTYPE;
  v_previous public.manual_invoice_settlements%ROWTYPE;
  v_until timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
     OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin')
     OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Active platform administrator required' USING ERRCODE='42501';
  END IF;
  SELECT organization_id INTO v_org_id FROM public.subscription_invoices WHERE id=p_invoice_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||v_org_id::text,0));
  -- Match the bank/marketplace lock order, including simultaneous manual clicks.
  SELECT * INTO STRICT v_org FROM public.organizations WHERE id=v_org_id FOR UPDATE;
  SELECT * INTO STRICT v_invoice FROM public.subscription_invoices WHERE id=p_invoice_id FOR UPDATE;
  IF v_invoice.organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Invoice organization changed' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_previous FROM public.manual_invoice_settlements WHERE invoice_id=p_invoice_id;
  IF FOUND THEN
    RETURN jsonb_build_object('applied',false,'outcome','already_confirmed','billing_kind',v_previous.billing_kind,
      'paid_until',v_previous.resulting_paid_until);
  END IF;
  IF COALESCE(v_invoice.payment_method,'invoice') <> 'invoice' OR v_invoice.payment_id IS NOT NULL
     OR v_invoice.tbank_order_id IS NOT NULL OR v_invoice.tbank_terminal_key IS NOT NULL THEN
    RAISE EXCEPTION 'Bank invoice requires bank confirmation' USING ERRCODE='22023';
  END IF;
  IF v_invoice.status='paid' OR v_invoice.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('applied',false,'outcome','historical_paid','billing_kind',v_invoice.billing_kind,
      'paid_until',v_org.paid_until);
  END IF;
  IF v_invoice.status IS DISTINCT FROM 'pending' OR v_invoice.amount IS NULL OR v_invoice.amount<=0 OR v_invoice.amount='NaN'::numeric THEN
    RAISE EXCEPTION 'Only a positive pending invoice can be confirmed' USING ERRCODE='22023';
  END IF;
  IF v_invoice.billing_kind='postpaid' THEN
    IF v_invoice.postpaid_statement_id IS NULL OR v_invoice.service_period_start IS NULL
       OR v_invoice.service_period_end IS NULL OR v_invoice.service_period_end<=v_invoice.service_period_start THEN
      RAISE EXCEPTION 'Postpaid statement required' USING ERRCODE='22023';
    END IF;
    v_until:=v_org.paid_until;
  ELSIF v_invoice.billing_kind='prepaid' THEN
    IF public.has_active_postpaid_agreement(v_org_id) THEN
      RAISE EXCEPTION 'Prior prepaid invoice requires reconciliation after postpaid activation' USING ERRCODE='22023';
    END IF;
    IF v_invoice.plan NOT IN ('start','standard','professional','maximum')
       OR v_invoice.period_months IS NULL OR v_invoice.period_months NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid prepaid invoice' USING ERRCODE='22023';
    END IF;
    v_until:=public.tbank_add_calendar_months(GREATEST(now(),v_org.paid_until),v_invoice.period_months);
    -- Preserve the existing invoice workflow: manual confirmation extends the
    -- current access term; changing the organization's tariff is a separate action.
    UPDATE public.organizations SET paid_until=v_until WHERE id=v_org_id;
  ELSE
    RAISE EXCEPTION 'Unknown billing kind' USING ERRCODE='22023';
  END IF;
  IF v_invoice.billing_kind='postpaid' THEN
    PERFORM public.postpaid_authorize_invoice_write(p_invoice_id,'UPDATE');
  END IF;
  UPDATE public.subscription_invoices SET status='paid',paid_at=now() WHERE id=p_invoice_id;
  INSERT INTO public.manual_invoice_settlements(invoice_id,organization_id,amount,billing_kind,confirmed_by,resulting_paid_until)
  VALUES(p_invoice_id,v_org_id,v_invoice.amount,v_invoice.billing_kind,auth.uid(),v_until);
  RETURN jsonb_build_object('applied',true,'outcome','confirmed','billing_kind',v_invoice.billing_kind,'paid_until',v_until);
END $fn$;
REVOKE ALL ON FUNCTION public.confirm_manual_subscription_invoice(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.confirm_manual_subscription_invoice(uuid) TO authenticated;
