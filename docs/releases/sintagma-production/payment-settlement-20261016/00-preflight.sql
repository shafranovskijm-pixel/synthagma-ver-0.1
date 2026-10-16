-- Read-only. Run before applying the two explicitly listed migrations.
-- No account, payment, secret or terminal values are returned.
SELECT current_database() AS database_name,
  to_regprocedure('public.apply_tbank_balance_credit(uuid,numeric,text,text,text)') IS NOT NULL AS ledger_rpc_present,
  to_regprocedure('public.apply_tbank_payment_event(text,uuid,text,text,bigint,text)') IS NOT NULL AS settlement_rpc_present,
  to_regprocedure('public.can_access_organization(uuid,text)') IS NOT NULL AS organization_access_rpc_present,
  to_regprocedure('public.account_deletion_access_allowed()') IS NOT NULL AS account_access_rpc_present,
  to_regprocedure('public.get_decrypted_payment_settings(uuid)') IS NOT NULL AS credential_rpc_present;

WITH required(table_name, column_name) AS (VALUES
  ('organizations','id'),('organizations','balance'),('organizations','subscription_plan'),('organizations','paid_until'),
  ('organizations','custom_price'),('organizations','custom_discount'),
  ('balance_transactions','id'),('balance_transactions','organization_id'),('balance_transactions','amount'),
  ('balance_transactions','type'),('balance_transactions','description'),('balance_transactions','related_order_id'),('balance_transactions','performed_by'),
  ('subscription_invoices','id'),('subscription_invoices','organization_id'),('subscription_invoices','amount'),
  ('subscription_invoices','plan'),('subscription_invoices','period_months'),('subscription_invoices','status'),
  ('subscription_invoices','payment_method'),('subscription_invoices','payment_id'),('subscription_invoices','paid_at'),('subscription_invoices','created_at'),
  ('course_payments','id'),('course_payments','course_id'),('course_payments','organization_id'),('course_payments','user_id'),
  ('course_payments','amount'),('course_payments','status'),('course_payments','payment_method'),('course_payments','robokassa_inv_id'),('course_payments','paid_at'),
  ('courses','id'),('courses','organization_id'),('courses','default_access_days'),
  ('enrollments','user_id'),('enrollments','course_id'),('enrollments','status'),('enrollments','progress'),('enrollments','access_days'),('enrollments','expires_at'),
  ('profiles','user_id'),('profiles','archived_at'),('account_deletion_revocations','user_id'),
  ('admin_notifications','type'),('admin_notifications','title'),('admin_notifications','message'),('admin_notifications','related_entity_id'),('admin_notifications','metadata'),
  ('user_roles','user_id'),('user_roles','role'),('app_settings','setting_key'),('app_settings','setting_value')
)
SELECT required.* FROM required LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=required.table_name AND c.column_name=required.column_name
WHERE c.column_name IS NULL ORDER BY 1,2; -- MUST return zero rows.

SELECT count(*) AS order_prefix_collision_groups FROM (
  SELECT left(replace(id::text,'-',''),28)
  FROM public.subscription_invoices WHERE payment_method='tbank'
  GROUP BY 1 HAVING count(*)>1
) collisions; -- MUST be zero; do not rewrite existing bank order identities.

SELECT conrelid::regclass AS relation,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN ('public.balance_transactions'::regclass,'public.enrollments'::regclass)
ORDER BY 1,2; -- Confirm UNIQUE(user_id,course_id) and no incompatible ledger CHECK.

SELECT tgrelid::regclass AS relation,tgname,pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
  ('public.organizations'::regclass,'public.subscription_invoices'::regclass,'public.enrollments'::regclass)
ORDER BY 1,2; -- Inspect billing guard, expiration and paid/referral side effects.

SELECT status,count(*) AS bank_documents FROM public.subscription_invoices
WHERE payment_method='tbank' GROUP BY status ORDER BY status;
