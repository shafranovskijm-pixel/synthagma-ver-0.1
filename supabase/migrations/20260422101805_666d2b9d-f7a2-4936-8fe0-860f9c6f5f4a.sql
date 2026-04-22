ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS subject_b text,
  ADD COLUMN IF NOT EXISTS ab_test_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_sample_percent integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS ab_winner char(1),
  ADD COLUMN IF NOT EXISTS ab_winner_picked_at timestamptz,
  ADD COLUMN IF NOT EXISTS ab_sample_started_at timestamptz;

ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_ab_winner_check;
ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_ab_winner_check
  CHECK (ab_winner IS NULL OR ab_winner IN ('a','b'));

ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_ab_sample_pct_check;
ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_ab_sample_pct_check
  CHECK (ab_sample_percent BETWEEN 5 AND 50);

ALTER TABLE public.email_campaign_recipients
  ADD COLUMN IF NOT EXISTS subject_variant char(1);

ALTER TABLE public.email_campaign_recipients
  DROP CONSTRAINT IF EXISTS email_recipients_subject_variant_check;
ALTER TABLE public.email_campaign_recipients
  ADD CONSTRAINT email_recipients_subject_variant_check
  CHECK (subject_variant IS NULL OR subject_variant IN ('a','b'));

CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign_variant
  ON public.email_campaign_recipients(campaign_id, subject_variant)
  WHERE subject_variant IS NOT NULL;