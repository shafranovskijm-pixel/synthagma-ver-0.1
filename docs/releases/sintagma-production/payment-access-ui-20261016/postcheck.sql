DO $postcheck$
DECLARE signature text; v_table_name text; any_rows boolean;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.apply_tbank_balance_credit(uuid,numeric,text,text,text)',
    'public.apply_tbank_payment_event(text,uuid,text,text,bigint,text)',
    'public.finalize_created_org_user(uuid,uuid,text)',
    'public.prepare_due_postpaid_statements()', 'public.verify_billing_cron_secret(text)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL OR NOT has_function_privilege('service_role',signature,'EXECUTE')
       OR has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Service-only function privilege mismatch: %',signature;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated','public.update_organization_theme(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.update_organization_theme(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Theme function privilege mismatch';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.tbank_payment_settlements'::regclass)
     OR has_table_privilege('authenticated','public.tbank_payment_settlements','INSERT')
     OR has_table_privilege('anon','public.tbank_payment_settlements','INSERT') THEN
    RAISE EXCEPTION 'Payment settlement table privileges mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM public.subscription_invoices WHERE payment_method='tbank' AND tbank_order_id IS NULL) THEN
    RAISE EXCEPTION 'Pending bank order mapping incomplete';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
       AND tablename IN('sales_leads','sales_tasks','sales_lead_activities') AND permissive='PERMISSIVE')<>12
     OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename IN('sales_leads','sales_tasks','sales_lead_activities') AND permissive='PERMISSIVE'
       AND policyname NOT IN('legacy_crm_read','legacy_crm_insert','legacy_crm_update','legacy_crm_delete')) THEN
    RAISE EXCEPTION 'Legacy CRM policy replacement incomplete';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='skillspace_import_jobs' AND column_name='authorization_verified_at') THEN
    RAISE EXCEPTION 'Import authorization marker absent';
  END IF;
  IF EXISTS(SELECT 1 FROM public.skillspace_import_jobs WHERE authorization_verified_at IS NOT NULL)
     OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.skillspace_import_jobs'::regclass
       AND tgname='verify_skillspace_job_authorization' AND tgenabled='O')
     OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='skillspace_import_jobs' AND permissive='PERMISSIVE')<>2
     OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skillspace_import_jobs' AND permissive='PERMISSIVE'
       AND policyname NOT IN('Admins can view all import jobs','Admins can insert import jobs')) THEN
    RAISE EXCEPTION 'Import authorization release postcheck failed';
  END IF;
  -- These are installation-time assertions, before any agreement is enrolled
  -- and before imports resume. Later operational checks use scoped records.
  FOREACH v_table_name IN ARRAY ARRAY['organization_billing_agreements','postpaid_feature_confirmations','postpaid_usage_events',
    'postpaid_billing_statements','postpaid_invoice_write_tokens','manual_invoice_settlements'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||v_table_name)::regclass)
       OR has_table_privilege('authenticated','public.'||v_table_name,'INSERT') OR has_table_privilege('anon','public.'||v_table_name,'INSERT') THEN
      RAISE EXCEPTION 'Postpaid table authorization mismatch: %',v_table_name;
    END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',v_table_name) INTO any_rows;
    IF any_rows THEN RAISE EXCEPTION 'Release unexpectedly enrolled or billed an organization: %',v_table_name; END IF;
  END LOOP;
  IF has_function_privilege('authenticated','public.postpaid_authorize_invoice_write(uuid,text)','EXECUTE')
     OR has_function_privilege('service_role','public.postpaid_authorize_invoice_write(uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.confirm_manual_subscription_invoice(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.confirm_manual_subscription_invoice(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Postpaid/manual settlement function authorization mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM public.subscription_invoices WHERE billing_kind<>'prepaid' OR postpaid_statement_id IS NOT NULL
      OR service_period_start IS NOT NULL OR service_period_end IS NOT NULL) THEN
    RAISE EXCEPTION 'Release changed historical invoice billing kind';
  END IF;
  IF (SELECT count(*) FROM vault.secrets WHERE name='sintagma_billing_cron_secret')<>1
     OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='check-subscription-expiry-daily'
       AND command LIKE '%x-billing-cron-secret%' AND command LIKE '%vault.decrypted_secrets%' AND command LIKE '%timeout_milliseconds%') THEN
    RAISE EXCEPTION 'Billing scheduler authorization setup incomplete';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid='public.apply_tbank_payment_event(text,uuid,text,text,bigint,text)'::regprocedure) NOT LIKE '%organization_billing_agreements%' THEN
    RAISE EXCEPTION 'Legacy bank postpaid access guard absent';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.org_crm_access_allowed(uuid,text)'::regprocedure
      AND prosrc LIKE '%CASE WHEN EXISTS (%'
      AND prosrc LIKE '%organization_billing_agreements%'
      AND prosrc LIKE '%postpaid_feature_confirmations%'
      AND prosrc LIKE '%confirmation.feature=''crm''%'
      AND prosrc LIKE '%ELSE o.subscription_plan::text IN(''standard'',''professional'',''maximum'') END%') THEN
    RAISE EXCEPTION 'Postpaid CRM consent access guard absent';
  END IF;
END $postcheck$;
