-- Internal checksum only: no personal data, credentials or financial rows leave
-- the transaction. New nullable identity/verification fields are excluded.
SELECT jsonb_build_object(
 'organizations',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.organizations r),
 'profiles',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY user_id),'')) FROM public.profiles r),
 'roles',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY user_id,role),'')) FROM public.user_roles r),
 'invoices',(SELECT md5(COALESCE(string_agg((to_jsonb(r)-ARRAY['tbank_order_id','tbank_terminal_key','billing_kind','service_period_start','service_period_end','postpaid_statement_id'])::text,'|' ORDER BY id),'')) FROM public.subscription_invoices r),
 'coursePayments',(SELECT md5(COALESCE(string_agg((to_jsonb(r)-'tbank_terminal_key')::text,'|' ORDER BY id),'')) FROM public.course_payments r),
 'ledger',(SELECT md5(COALESCE(string_agg((to_jsonb(r)-'idempotency_key')::text,'|' ORDER BY id),'')) FROM public.balance_transactions r),
 'managers',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.sales_managers r),
 'staff',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.org_staff r),
 'leads',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.sales_leads r),
 'tasks',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.sales_tasks r),
 'activities',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.sales_lead_activities r),
 'importJobs',(SELECT md5(COALESCE(string_agg((to_jsonb(r)-'authorization_verified_at')::text,'|' ORDER BY id),'')) FROM public.skillspace_import_jobs r),
 'courses',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.courses r),
 'enrollments',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.enrollments r),
 'lessons',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.lessons r),
 'lessonProgress',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.lesson_progress r),
 'testSessions',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.test_attempt_sessions r),
 'testAttempts',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.test_attempts r),
 'homework',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.homework_submissions r),
 'orgCrmClients',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.org_crm_clients r),
 'orgCrmDeals',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.org_crm_deals r),
 'orgCrmTasks',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.org_crm_tasks r),
 'orgCrmActivities',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.org_crm_activities r),
 'webinars',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.webinars r),
 'usage',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY organization_id,month_start),'')) FROM public.organization_usage r),
 'adminNotifications',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM public.admin_notifications r),
 'otherCronJobs',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY jobid),'')) FROM cron.job r WHERE jobname<>'check-subscription-expiry-daily'),
 'billingJobSchedule',(SELECT md5((to_jsonb(r)-'command')::text) FROM cron.job r WHERE jobname='check-subscription-expiry-daily'),
 'otherVaultSecrets',(SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'|' ORDER BY id),'')) FROM vault.secrets r WHERE name IS DISTINCT FROM 'sintagma_billing_cron_secret'),
 'unrelatedPolicies',(SELECT md5(COALESCE(string_agg(to_jsonb(p)::text,'|' ORDER BY schemaname,tablename,policyname),'')) FROM pg_policies p
   WHERE schemaname='public' AND tablename NOT IN('sales_leads','sales_tasks','sales_lead_activities','skillspace_import_jobs','tbank_payment_settlements',
    'organization_billing_agreements','postpaid_feature_confirmations','postpaid_usage_events','postpaid_billing_statements','postpaid_invoice_write_tokens','manual_invoice_settlements')),
 'deletionPolicies',(SELECT md5(COALESCE(string_agg(to_jsonb(p)::text,'|' ORDER BY tablename,policyname),'')) FROM pg_policies p WHERE schemaname='public' AND policyname='account_deletion_no_revoked_access'),
 'accessHelpers',(SELECT md5(COALESCE(string_agg(pg_get_functiondef(p.oid)||COALESCE(p.proacl::text,''),'|' ORDER BY p.oid::regprocedure::text),'')) FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace AND p.proname IN('can_access_organization','account_deletion_access_allowed','is_org_owner','has_role','current_organization_id','can_access_course_as_learner')),
 'quotaFunctionAttributes',(SELECT md5(COALESCE(string_agg(jsonb_build_object('name',p.oid::regprocedure::text,'owner',proowner,'acl',proacl,'security_definer',prosecdef,
   'config',proconfig,'volatility',provolatile,'leakproof',proleakproof,'strict',proisstrict,'parallel',proparallel)::text,'|' ORDER BY p.oid::regprocedure::text),''))
   FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN('get_organization_student_capacity','create_student_profile_with_capacity','enforce_course_insert_limit','org_crm_access_allowed'))
) AS snapshot;
