
-- Add invoice_id for idempotency on referral commissions
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS invoice_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_referral_commissions_invoice_partner_bonus
  ON public.referral_commissions (invoice_id, partner_id, COALESCE(bonus_type, 'base'))
  WHERE invoice_id IS NOT NULL;

-- Trigger: when subscription_invoices.status -> 'paid', invoke referral-commission edge
CREATE OR REPLACE FUNCTION public.invoke_referral_commission_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/referral-commission';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0eHd2anhicWpna2JqbGhzZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwODM5MjcsImV4cCI6MjA4MzY1OTkyN30.5mIZX4EYVPbQbCbHWww8ROD5taCQ51o5qNHOMcKK_s4';
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    -- Skip if commission already recorded for this invoice (idempotency)
    IF NOT EXISTS (SELECT 1 FROM public.referral_commissions WHERE invoice_id = NEW.id) THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type','application/json','apikey', v_anon, 'Authorization', 'Bearer ' || v_anon),
        body := jsonb_build_object(
          'organization_id', NEW.organization_id,
          'amount', NEW.amount,
          'payment_source', COALESCE(NEW.payment_method, 'subscription'),
          'invoice_id', NEW.id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_commission_on_paid ON public.subscription_invoices;
CREATE TRIGGER trg_referral_commission_on_paid
AFTER INSERT OR UPDATE OF status ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.invoke_referral_commission_on_paid();
