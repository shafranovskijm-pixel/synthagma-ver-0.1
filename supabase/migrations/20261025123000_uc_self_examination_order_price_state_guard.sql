-- SOURCE ONLY: no transaction/ledger row. Root must freeze fresh preimages and authorize release.
-- Exact service IDs come from canonical SELF_EXAMINATION_SERVICE and existing fulfillment identity checks.
-- Existing historical orders are never repriced. Paid service consent and admin fulfillment remain separate.
CREATE OR REPLACE FUNCTION public.uc_self_examination_order_price_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $uc025_price_state$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW.service_id NOT IN ('self_examination_report_auto','self_examination_report') THEN RETURN NEW; END IF;
  IF NEW.service_price IS DISTINCT FROM '3 500 ₽' THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SELF_EXAMINATION_PRICE_MISMATCH';
  END IF;
  IF NEW.status IS DISTINCT FROM 'pending' THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SELF_EXAMINATION_ORDER_INITIAL_STATE_INVALID';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.service_id IN ('self_examination_report_auto','self_examination_report')
    OR NEW.service_id IN ('self_examination_report_auto','self_examination_report') THEN
  IF NEW.service_id IS DISTINCT FROM OLD.service_id THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SELF_EXAMINATION_ORDER_IDENTITY_IMMUTABLE';
  END IF;
  IF NEW.service_price IS DISTINCT FROM OLD.service_price THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SELF_EXAMINATION_ORDER_PRICE_IMMUTABLE';
  END IF;
 END IF;
 RETURN NEW;
END;
$uc025_price_state$;
REVOKE ALL ON FUNCTION public.uc_self_examination_order_price_state_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER service_orders_uc025_price_state_guard
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.uc_self_examination_order_price_state_guard();
COMMENT ON FUNCTION public.uc_self_examination_order_price_state_guard() IS
 'UC025: new exact self-examination orders require approved3500RUB/pending; existing price/service identity immutable; no charge or historical repricing.';
