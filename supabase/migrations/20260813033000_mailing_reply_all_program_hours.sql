-- Keep reply classification aligned with every program advertised in the
-- reviewed 44-FZ response template.

ALTER TABLE public.mailing_campaign_replies
  DROP CONSTRAINT IF EXISTS mailing_campaign_replies_interest_hours_check;

ALTER TABLE public.mailing_campaign_replies
  ADD CONSTRAINT mailing_campaign_replies_interest_hours_check
  CHECK (interest_hours IN (50, 150, 250, 500, 1000));
