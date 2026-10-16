-- Read-only structural checks after SQL, before exposing the new handlers.
SELECT to_regprocedure('public.apply_tbank_balance_credit(uuid,numeric,text,text,text)') IS NOT NULL AS ledger_rpc,
  to_regprocedure('public.apply_tbank_payment_event(text,uuid,text,text,bigint,text)') IS NOT NULL AS settlement_rpc,
  to_regclass('public.tbank_payment_settlements') IS NOT NULL AS settlement_table;

SELECT routine,has_function_privilege('service_role',routine,'EXECUTE') AS service_can_execute,
  has_function_privilege('authenticated',routine,'EXECUTE') AS browser_can_execute,
  has_function_privilege('anon',routine,'EXECUTE') AS anon_can_execute
FROM (VALUES('public.apply_tbank_balance_credit(uuid,numeric,text,text,text)'),
  ('public.apply_tbank_payment_event(text,uuid,text,text,bigint,text)')) r(routine);
-- Expected service=true; browser=false; anon=false for both.

SELECT relrowsecurity,relforcerowsecurity,
  has_table_privilege('authenticated','public.tbank_payment_settlements','INSERT') AS browser_can_insert,
  has_table_privilege('anon','public.tbank_payment_settlements','INSERT') AS anon_can_insert
FROM pg_class WHERE oid='public.tbank_payment_settlements'::regclass;
-- Expected relrowsecurity=true; insert=false for both.

SELECT count(*) AS bank_invoices_without_order FROM public.subscription_invoices
WHERE payment_method='tbank' AND tbank_order_id IS NULL; -- zero

SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('tbank_payment_settlements','balance_transactions','subscription_invoices')
AND (indexname LIKE '%idempotency%' OR indexname LIKE '%tbank%' OR tablename='tbank_payment_settlements');

SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='public.subscription_invoices'::regclass
AND tgname='guard_subscription_invoice_payment_fields'; -- present and enabled

SELECT public.tbank_add_calendar_months('2040-01-31T12:00:00Z',1)='2040-02-29T12:00:00Z'::timestamptz AS month_end_ok,
  public.tbank_add_calendar_months('2040-02-29T12:00:00Z',12)='2041-02-28T12:00:00Z'::timestamptz AS annual_leap_ok;

-- Operational counters only. A review record must be reconciled by billing;
-- replaying a callback will intentionally not perform a second credit.
SELECT outcome,review_reason,count(*) FROM public.tbank_payment_settlements GROUP BY 1,2 ORDER BY 1,2;
