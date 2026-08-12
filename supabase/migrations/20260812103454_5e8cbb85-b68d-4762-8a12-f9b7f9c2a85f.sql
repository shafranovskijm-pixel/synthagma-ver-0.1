-- Atomic multi-sender queue for controlled organization outreach.
-- The queue is inert until an authorized operator explicitly enables a campaign
-- and the worker secret/cron are configured.

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS campaign_mode text NOT NULL DEFAULT 'permission_marketing',
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS domain_daily_limit integer,
  ADD COLUMN IF NOT EXISTS send_window_start time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS send_window_end time NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS send_timezone text NOT NULL DEFAULT 'Europe/Moscow',
  ADD COLUMN IF NOT EXISTS operator_attested_at timestamptz,
  ADD COLUMN IF NOT EXISTS operator_attested_by uuid,
  ADD COLUMN IF NOT EXISTS paused_reason text;

DO $$ BEGIN
  ALTER TABLE public.email_campaigns
    ADD CONSTRAINT email_campaigns_campaign_mode_check
    CHECK (campaign_mode IN ('cold_outreach', 'permission_marketing'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.email_campaigns
    ADD CONSTRAINT email_campaigns_delivery_mode_check
    CHECK (delivery_mode IN ('standard', 'control_20', 'fast_2_day'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS mailing_senders_org_from_email_uniq
  ON public.mailing_senders (organization_id, lower(from_email));

CREATE TABLE IF NOT EXISTS public.mailing_send_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.email_campaign_recipients(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.mailing_senders(id) ON DELETE RESTRICT,
  step_no integer NOT NULL DEFAULT 1 CHECK (step_no > 0),
  not_before timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'dispatching', 'sent', 'failed', 'suppressed', 'cancelled', 'uncertain')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claimed_at timestamptz,
  claim_token uuid,
  sent_at timestamptz,
  smtp_message_id text,
  last_error_category text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, recipient_id, step_no)
);

CREATE INDEX IF NOT EXISTS mailing_send_jobs_due_idx
  ON public.mailing_send_jobs (not_before, id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS mailing_send_jobs_sender_day_idx
  ON public.mailing_send_jobs (sender_id, not_before);

ALTER TABLE public.mailing_send_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mailing_send_jobs TO authenticated;
GRANT ALL ON public.mailing_send_jobs TO service_role;

DROP POLICY IF EXISTS mailing_send_jobs_select ON public.mailing_send_jobs;
CREATE POLICY mailing_send_jobs_select ON public.mailing_send_jobs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.email_campaigns c
    WHERE c.id = mailing_send_jobs.campaign_id
      AND (
        public.has_role('admin'::public.app_role, auth.uid())
        OR public.can_access_organization(c.organization_id, 'email.manage')
      )
  )
);

DROP TRIGGER IF EXISTS mailing_send_jobs_updated_at ON public.mailing_send_jobs;
CREATE TRIGGER mailing_send_jobs_updated_at
BEFORE UPDATE ON public.mailing_send_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_due_mailing_send_jobs(
  p_batch_size integer DEFAULT 1,
  p_stale_after interval DEFAULT interval '15 minutes'
)
RETURNS SETOF public.mailing_send_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  IF p_batch_size <> 1 THEN
    RAISE EXCEPTION 'batch_size_must_be_one';
  END IF;

  -- Serialize claim decisions so aggregate domain/sender counters cannot race
  -- when cron is accidentally invoked more than once in the same minute.
  PERFORM pg_advisory_xact_lock(hashtextextended('mailing_send_jobs_claim', 0));

  UPDATE public.mailing_send_jobs
  SET status = 'pending', claim_token = NULL, claimed_at = NULL
  WHERE status = 'claimed'
    AND claimed_at < now() - p_stale_after;

  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM public.mailing_send_jobs j
    JOIN public.email_campaigns c ON c.id = j.campaign_id
    JOIN public.mailing_senders s ON s.id = j.sender_id
    WHERE j.status = 'pending'
      AND j.not_before <= now()
      AND c.status IN ('scheduled', 'sending')
      AND c.paused_reason IS NULL
      AND s.is_active = true
      AND s.smtp_status = 'ok'
      AND s.imap_status = 'ok'
      AND (
        SELECT count(*)
        FROM public.mailing_send_jobs domain_jobs
        JOIN public.email_campaigns domain_campaign ON domain_campaign.id = domain_jobs.campaign_id
        JOIN public.mailing_senders domain_sender ON domain_sender.id = domain_jobs.sender_id
        WHERE domain_campaign.organization_id = c.organization_id
          AND lower(split_part(domain_sender.from_email, '@', 2)) =
              lower(split_part(s.from_email, '@', 2))
          AND domain_jobs.status IN ('claimed', 'dispatching', 'sent', 'uncertain')
          AND (coalesce(domain_jobs.sent_at, domain_jobs.claimed_at, domain_jobs.not_before)
               AT TIME ZONE c.send_timezone)::date =
              (now() AT TIME ZONE c.send_timezone)::date
      ) < coalesce(c.domain_daily_limit, 0)
      AND (
        SELECT count(*)
        FROM public.mailing_send_jobs sender_jobs
        WHERE sender_jobs.sender_id = s.id
          AND sender_jobs.status IN ('claimed', 'dispatching', 'sent', 'uncertain')
          AND (coalesce(sender_jobs.sent_at, sender_jobs.claimed_at, sender_jobs.not_before)
               AT TIME ZONE c.send_timezone)::date =
              (now() AT TIME ZONE c.send_timezone)::date
      ) < s.daily_limit
    ORDER BY j.not_before, j.id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE public.mailing_send_jobs j
  SET status = 'claimed', claimed_at = now(), claim_token = v_token,
      attempt_count = attempt_count + 1
  FROM due
  WHERE j.id = due.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_mailing_send_jobs(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_mailing_send_jobs(integer, interval) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_mailing_campaign_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'mailing_campaign_worker_url'
  LIMIT 1;
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'mailing_campaign_cron_secret'
  LIMIT 1;
  IF coalesce(v_url, '') = '' OR coalesce(v_secret, '') = '' THEN RETURN NULL; END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) INTO v_request_id;
  RETURN v_request_id;
EXCEPTION WHEN undefined_table OR undefined_function THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_mailing_campaign_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_mailing_campaign_worker() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mailing-campaign-every-minute') THEN
      PERFORM cron.unschedule('mailing-campaign-every-minute');
    END IF;
    PERFORM cron.schedule(
      'mailing-campaign-every-minute',
      '* * * * *',
      'SELECT public.invoke_mailing_campaign_worker();'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_mailing_senders_batch(
  p_organization_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row jsonb;
  v_email text;
  v_secret text;
  v_created int := 0;
  v_existing int := 0;
  v_invalid int := 0;
BEGIN
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id_required'; END IF;
  IF NOT (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.can_access_organization(p_organization_id, 'email.manage')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'rows_must_be_array'; END IF;
  IF jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 50 THEN
    RAISE EXCEPTION 'batch_size_out_of_range';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_email := lower(btrim(coalesce(v_row->>'email', '')));
    v_secret := coalesce(v_row->>'password', '');
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR v_secret = '' THEN
      v_invalid := v_invalid + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.mailing_senders (
      organization_id, label, from_name, from_email,
      smtp_host, smtp_port, smtp_security, smtp_username, password_encrypted,
      imap_host, imap_port, imap_security, imap_username,
      daily_limit, is_active, preset_key, created_by
    ) VALUES (
      p_organization_id,
      coalesce(nullif(btrim(v_row->>'label'), ''), v_email),
      nullif(btrim(v_row->>'from_name'), ''),
      v_email,
      coalesce(nullif(btrim(v_row->>'smtp_host'), ''), 'mail.torgi.com.ru'),
      coalesce(nullif(v_row->>'smtp_port', '')::integer, 465),
      coalesce(nullif(btrim(v_row->>'smtp_security'), ''), 'ssl'),
      coalesce(nullif(btrim(v_row->>'smtp_username'), ''), v_email),
      v_secret,
      coalesce(nullif(btrim(v_row->>'imap_host'), ''), 'mail.torgi.com.ru'),
      coalesce(nullif(v_row->>'imap_port', '')::integer, 993),
      coalesce(nullif(btrim(v_row->>'imap_security'), ''), 'ssl'),
      coalesce(nullif(btrim(v_row->>'imap_username'), ''), v_email),
      least(greatest(coalesce(nullif(v_row->>'daily_limit', '')::integer, 2), 1), 10),
      false,
      coalesce(nullif(btrim(v_row->>'preset_key'), ''), 'torgi'),
      auth.uid()
    )
    ON CONFLICT (organization_id, lower(from_email)) DO NOTHING;

    IF FOUND THEN v_created := v_created + 1;
    ELSE v_existing := v_existing + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'existing', v_existing, 'invalid', v_invalid);
END;
$$;

REVOKE ALL ON FUNCTION public.import_mailing_senders_batch(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_mailing_senders_batch(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_verified_mailing_senders(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_activated integer;
BEGIN
  IF NOT (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.can_access_organization(p_organization_id, 'email.manage')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  UPDATE public.mailing_senders
  SET is_active = true, daily_limit = least(daily_limit, 2)
  WHERE organization_id = p_organization_id
    AND smtp_status = 'ok'
    AND imap_status = 'ok'
    AND is_active = false;
  GET DIAGNOSTICS v_activated = ROW_COUNT;
  RETURN v_activated;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_verified_mailing_senders(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_verified_mailing_senders(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attest_cold_outreach_campaign(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.email_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.can_access_organization(v_org, 'email.manage')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.email_campaigns
  SET campaign_mode = 'cold_outreach', operator_attested_at = now(), operator_attested_by = auth.uid()
  WHERE id = p_campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attest_cold_outreach_campaign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attest_cold_outreach_campaign(uuid) TO authenticated;