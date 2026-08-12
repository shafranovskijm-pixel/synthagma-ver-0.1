-- Campaign-scoped reply capture for organization outreach.
-- It never scans historic messages: every sender gets an IMAP UID baseline
-- before the first campaign job is allowed to leave the queue.

CREATE TABLE IF NOT EXISTS public.mailing_reply_scan_state (
  sender_id uuid PRIMARY KEY REFERENCES public.mailing_senders(id) ON DELETE CASCADE,
  last_uid bigint NOT NULL DEFAULT 0 CHECK (last_uid >= 0),
  baseline_completed boolean NOT NULL DEFAULT false,
  last_scanned_at timestamptz,
  claimed_at timestamptz,
  claim_token uuid,
  last_error_category text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mailing_reply_scan_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mailing_reply_scan_state TO authenticated;
GRANT ALL ON public.mailing_reply_scan_state TO service_role;

DROP POLICY IF EXISTS mailing_reply_scan_state_select ON public.mailing_reply_scan_state;
CREATE POLICY mailing_reply_scan_state_select ON public.mailing_reply_scan_state
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.mailing_senders s
    WHERE s.id = mailing_reply_scan_state.sender_id
      AND (
        public.has_role('admin'::public.app_role, auth.uid())
        OR public.can_access_organization(s.organization_id, 'email.manage')
      )
  )
);

DROP TRIGGER IF EXISTS mailing_reply_scan_state_updated_at ON public.mailing_reply_scan_state;
CREATE TRIGGER mailing_reply_scan_state_updated_at
BEFORE UPDATE ON public.mailing_reply_scan_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.mailing_campaign_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.mailing_send_jobs(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.email_campaign_recipients(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.mailing_senders(id) ON DELETE RESTRICT,
  imap_uid bigint NOT NULL CHECK (imap_uid > 0),
  message_id text,
  in_reply_to text,
  remote_email text NOT NULL,
  remote_name text,
  subject text,
  body_text text,
  received_at timestamptz NOT NULL,
  classification text NOT NULL DEFAULT 'needs_review'
    CHECK (classification IN ('interested', 'not_interested', 'unsubscribe', 'auto_reply', 'needs_review')),
  interest_hours integer CHECK (interest_hours IN (50, 150, 250)),
  review_status text NOT NULL DEFAULT 'new'
    CHECK (review_status IN ('new', 'qualified', 'contacted', 'enrolled', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, imap_uid)
);

CREATE INDEX IF NOT EXISTS mailing_campaign_replies_campaign_idx
  ON public.mailing_campaign_replies (campaign_id, received_at DESC);
CREATE INDEX IF NOT EXISTS mailing_campaign_replies_org_classification_idx
  ON public.mailing_campaign_replies (organization_id, classification, review_status);
CREATE UNIQUE INDEX IF NOT EXISTS mailing_campaign_replies_message_id_uniq
  ON public.mailing_campaign_replies (message_id)
  WHERE message_id IS NOT NULL;

ALTER TABLE public.mailing_campaign_replies ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mailing_campaign_replies TO authenticated;
GRANT UPDATE (review_status, interest_hours) ON public.mailing_campaign_replies TO authenticated;
GRANT ALL ON public.mailing_campaign_replies TO service_role;

DROP POLICY IF EXISTS mailing_campaign_replies_select ON public.mailing_campaign_replies;
CREATE POLICY mailing_campaign_replies_select ON public.mailing_campaign_replies
FOR SELECT TO authenticated
USING (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
);

DROP POLICY IF EXISTS mailing_campaign_replies_update ON public.mailing_campaign_replies;
CREATE POLICY mailing_campaign_replies_update ON public.mailing_campaign_replies
FOR UPDATE TO authenticated
USING (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
)
WITH CHECK (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
);

DROP TRIGGER IF EXISTS mailing_campaign_replies_updated_at ON public.mailing_campaign_replies;
CREATE TRIGGER mailing_campaign_replies_updated_at
BEFORE UPDATE ON public.mailing_campaign_replies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomically claims a small rotating sender batch. Parallel cron invocations
-- cannot scan the same mailbox unless a previous claim became stale.
CREATE OR REPLACE FUNCTION public.claim_mailing_reply_scan_senders(
  p_campaign_ids uuid[],
  p_batch_size integer DEFAULT 5,
  p_stale_after interval DEFAULT interval '3 minutes'
)
RETURNS SETOF public.mailing_reply_scan_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  IF coalesce(array_length(p_campaign_ids, 1), 0) = 0 THEN RETURN; END IF;
  IF p_batch_size < 1 OR p_batch_size > 10 THEN RAISE EXCEPTION 'batch_size_out_of_range'; END IF;

  INSERT INTO public.mailing_reply_scan_state (sender_id)
  SELECT DISTINCT j.sender_id
  FROM public.mailing_send_jobs j
  JOIN public.mailing_senders s ON s.id = j.sender_id
  WHERE j.campaign_id = ANY (p_campaign_ids)
    AND s.is_active = true
    AND s.imap_status = 'ok'
  ON CONFLICT (sender_id) DO NOTHING;

  RETURN QUERY
  WITH due AS (
    SELECT st.sender_id
    FROM public.mailing_reply_scan_state st
    WHERE EXISTS (
      SELECT 1 FROM public.mailing_send_jobs j
      WHERE j.sender_id = st.sender_id
        AND j.campaign_id = ANY (p_campaign_ids)
    )
      AND (st.claimed_at IS NULL OR st.claimed_at < now() - p_stale_after)
    ORDER BY st.last_scanned_at ASC NULLS FIRST, st.sender_id
    FOR UPDATE OF st SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE public.mailing_reply_scan_state st
  SET claimed_at = now(), claim_token = v_token
  FROM due
  WHERE st.sender_id = due.sender_id
  RETURNING st.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mailing_reply_scan_senders(uuid[], integer, interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailing_reply_scan_senders(uuid[], integer, interval)
  TO service_role;

-- Strong match by Message-ID, with a sender + exact recipient fallback for
-- providers that strip In-Reply-To. Only already-sent jobs may match.
CREATE OR REPLACE FUNCTION public.match_mailing_campaign_reply(
  p_sender_id uuid,
  p_campaign_ids uuid[],
  p_remote_email text,
  p_in_reply_to text,
  p_received_at timestamptz
)
RETURNS TABLE(
  campaign_id uuid,
  job_id uuid,
  recipient_id uuid,
  organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.campaign_id, j.id, j.recipient_id, c.organization_id
  FROM public.mailing_send_jobs j
  JOIN public.email_campaign_recipients r ON r.id = j.recipient_id
  JOIN public.email_campaigns c ON c.id = j.campaign_id
  WHERE j.sender_id = p_sender_id
    AND j.campaign_id = ANY (p_campaign_ids)
    AND j.status = 'sent'
    AND j.sent_at IS NOT NULL
    AND j.sent_at <= p_received_at + interval '5 minutes'
    AND j.sent_at >= p_received_at - interval '30 days'
    AND (
      (coalesce(p_in_reply_to, '') <> '' AND j.smtp_message_id = p_in_reply_to)
      OR lower(r.email) = lower(btrim(p_remote_email))
    )
  ORDER BY
    CASE WHEN coalesce(p_in_reply_to, '') <> '' AND j.smtp_message_id = p_in_reply_to THEN 0 ELSE 1 END,
    j.sent_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.match_mailing_campaign_reply(uuid, uuid[], text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_mailing_campaign_reply(uuid, uuid[], text, text, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_mailing_reply_worker()
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
  SELECT replace(decrypted_secret, '/mailing-campaign-worker', '/mailing-reply-worker')
  INTO v_url
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

REVOKE ALL ON FUNCTION public.invoke_mailing_reply_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_mailing_reply_worker() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mailing-replies-every-minute') THEN
      PERFORM cron.unschedule('mailing-replies-every-minute');
    END IF;
    PERFORM cron.schedule(
      'mailing-replies-every-minute',
      '* * * * *',
      'SELECT public.invoke_mailing_reply_worker();'
    );
  END IF;
END;
$$;