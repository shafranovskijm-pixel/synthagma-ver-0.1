-- Assertions are repeated inside the single-request atomic release.
DO $preflight$
DECLARE missing text;
BEGIN
  IF NOT has_table_privilege(current_user,'supabase_migrations.schema_migrations','SELECT')
     OR NOT has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') THEN
    RAISE EXCEPTION 'Release requires migration ledger SELECT and INSERT';
  END IF;
  SELECT string_agg(signature,', ') INTO missing FROM (VALUES
    ('public.has_role(public.app_role,uuid)'),('public.can_access_organization(uuid,text)'),
    ('public.account_deletion_access_allowed()'),('public.is_org_owner(uuid,uuid)'),
    ('public.current_organization_id()'),('auth.role()'),('auth.uid()'),('public.can_access_course_as_learner(uuid)'),
    ('public.get_organization_student_capacity(uuid,integer)'),('public.create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text)'),
    ('public.enforce_course_insert_limit()'),('public.org_crm_access_allowed(uuid,text)')
  ) expected(signature) WHERE to_regprocedure(signature) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Release prerequisite functions missing: %',missing; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.org_crm_access_allowed(uuid,text)'::regprocedure)
     IS DISTINCT FROM '395b7dd7b17fd70aa2d3a48b62bc689c' THEN
    RAISE EXCEPTION 'Postpaid CRM access canonical function drift';
  END IF;
  SELECT string_agg(name,', ') INTO missing FROM (VALUES
    ('public.organizations'),('public.subscription_invoices'),('public.course_payments'),('public.balance_transactions'),
    ('public.profiles'),('public.user_roles'),('auth.users'),('public.courses'),('public.enrollments'),
    ('public.account_deletion_revocations'),('public.admin_notifications'),('public.admin_staff'),('public.org_staff'),
    ('public.sales_managers'),('public.sales_leads'),('public.sales_tasks'),('public.sales_lead_activities'),('public.skillspace_import_jobs'),
    ('public.lessons'),('public.lesson_progress'),('public.test_attempt_sessions'),('public.test_attempts'),('public.homework_submissions'),
    ('public.org_crm_clients'),('public.org_crm_deals'),('public.org_crm_tasks'),('public.org_crm_activities'),('public.webinars'),('public.organization_usage'),
    ('cron.job'),('vault.secrets'),('vault.decrypted_secrets')
  ) expected(name) WHERE to_regclass(name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Release prerequisite tables missing: %',missing; END IF;
  IF EXISTS(SELECT 1 FROM public.subscription_invoices WHERE payment_method='tbank'
      GROUP BY left(replace(id::text,'-',''),28) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Existing T-Bank order prefixes collide';
  END IF;
  IF to_regprocedure('public.apply_tbank_balance_credit(uuid,numeric,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Ledger prerequisite already exists: review live drift instead of overwriting';
  END IF;
  IF to_regclass('public.organization_billing_agreements') IS NOT NULL
    OR to_regclass('public.manual_invoice_settlements') IS NOT NULL
    OR to_regprocedure('public.verify_billing_cron_secret(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Postpaid/scheduler objects already exist: review live drift';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname='check-subscription-expiry-daily')<>1 THEN
    RAISE EXCEPTION 'Expected one existing daily billing cron job';
  END IF;
  IF EXISTS(SELECT 1 FROM vault.secrets WHERE name='sintagma_billing_cron_secret') THEN
    RAISE EXCEPTION 'Billing scheduler secret already exists: review live drift';
  END IF;
END $preflight$;
