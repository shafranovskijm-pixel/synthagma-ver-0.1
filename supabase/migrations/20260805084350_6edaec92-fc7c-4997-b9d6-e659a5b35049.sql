ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_recipient_source_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_recipient_source_check
  CHECK (recipient_source = ANY (ARRAY['none'::text,'students'::text,'companies'::text,'organizations'::text,'companies_db'::text,'manual'::text]));

ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_status_check
  CHECK (status = ANY (ARRAY['draft'::text,'scheduled'::text,'sending'::text,'completed'::text,'failed'::text,'paused'::text]));