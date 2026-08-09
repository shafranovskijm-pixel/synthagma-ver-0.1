-- Closed deliverability MVP for organization senders.
-- Control inboxes are receive-only: the worker never sends from them, marks
-- messages as read, replies, or moves messages out of Spam/Junk.

ALTER TABLE public.mailing_senders
  ADD COLUMN IF NOT EXISTS warmup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_daily_target integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS warmup_start_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_paused_reason text,
  ADD COLUMN IF NOT EXISTS warmup_last_run_at timestamptz;

ALTER TABLE public.mailing_senders
  DROP CONSTRAINT IF EXISTS mailing_senders_warmup_daily_target_check,
  ADD CONSTRAINT mailing_senders_warmup_daily_target_check
    CHECK (warmup_daily_target BETWEEN 1 AND 10),
  DROP CONSTRAINT IF EXISTS mailing_senders_warmup_start_count_check,
  ADD CONSTRAINT mailing_senders_warmup_start_count_check
    CHECK (warmup_start_count BETWEEN 1 AND warmup_daily_target);

GRANT SELECT (
  warmup_enabled, warmup_daily_target, warmup_start_count,
  warmup_started_at, warmup_paused_reason, warmup_last_run_at
) ON public.mailing_senders TO authenticated;

CREATE TABLE IF NOT EXISTS public.mailing_deliverability_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  email text NOT NULL,
  provider text NOT NULL DEFAULT 'custom'
    CHECK (provider IN ('gmail', 'yandex', 'mailru', 'custom')),
  imap_host text NOT NULL,
  imap_port integer NOT NULL DEFAULT 993 CHECK (imap_port BETWEEN 1 AND 65535),
  imap_security text NOT NULL DEFAULT 'ssl' CHECK (imap_security = 'ssl'),
  imap_username text NOT NULL,
  secret_encrypted text,
  auth_status text NOT NULL DEFAULT 'untested'
    CHECK (auth_status IN ('untested', 'ok', 'error')),
  error_category text,
  latency_ms integer,
  last_tested_at timestamptz,
  last_checked_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mailing_deliverability_seeds_org_email_uniq
  ON public.mailing_deliverability_seeds (organization_id, lower(email));
CREATE INDEX IF NOT EXISTS mailing_deliverability_seeds_org_active_idx
  ON public.mailing_deliverability_seeds (organization_id, is_active, auth_status);

ALTER TABLE public.mailing_deliverability_seeds ENABLE ROW LEVEL SECURITY;

GRANT SELECT (
  id, organization_id, label, email, provider,
  imap_host, imap_port, imap_security, imap_username,
  auth_status, error_category, latency_ms,
  last_tested_at, last_checked_at, is_active, created_by,
  created_at, updated_at
) ON public.mailing_deliverability_seeds TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mailing_deliverability_seeds TO authenticated;
GRANT ALL ON public.mailing_deliverability_seeds TO service_role;

DROP POLICY IF EXISTS "mailing_deliverability_seeds_select" ON public.mailing_deliverability_seeds;
CREATE POLICY "mailing_deliverability_seeds_select"
ON public.mailing_deliverability_seeds FOR SELECT TO authenticated
USING (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
);

DROP POLICY IF EXISTS "mailing_deliverability_seeds_insert" ON public.mailing_deliverability_seeds;
CREATE POLICY "mailing_deliverability_seeds_insert"
ON public.mailing_deliverability_seeds FOR INSERT TO authenticated
WITH CHECK (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
);

DROP POLICY IF EXISTS "mailing_deliverability_seeds_update" ON public.mailing_deliverability_seeds;
CREATE POLICY "mailing_deliverability_seeds_update"
ON public.mailing_deliverability_seeds FOR UPDATE TO authenticated
USING (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
)
WITH CHECK (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
);

DROP POLICY IF EXISTS "mailing_deliverability_seeds_delete" ON public.mailing_deliverability_seeds;
CREATE POLICY "mailing_deliverability_seeds_delete"
ON public.mailing_deliverability_seeds FOR DELETE TO authenticated
USING (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
);

CREATE OR REPLACE FUNCTION public.trigger_encrypt_mailing_deliverability_seed_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.secret_encrypted IS NOT NULL
     AND NEW.secret_encrypted <> ''
     AND NEW.secret_encrypted NOT LIKE 'ENC:%' THEN
    NEW.secret_encrypted = public.encrypt_password(NEW.secret_encrypted);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_mailing_deliverability_seed_secret_trg
  ON public.mailing_deliverability_seeds;
CREATE TRIGGER encrypt_mailing_deliverability_seed_secret_trg
BEFORE INSERT OR UPDATE OF secret_encrypted
ON public.mailing_deliverability_seeds
FOR EACH ROW EXECUTE FUNCTION public.trigger_encrypt_mailing_deliverability_seed_secret();

DROP TRIGGER IF EXISTS mailing_deliverability_seeds_updated_at
  ON public.mailing_deliverability_seeds;
CREATE TRIGGER mailing_deliverability_seeds_updated_at
BEFORE UPDATE ON public.mailing_deliverability_seeds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_mailing_deliverability_seed_secret(p_seed_id uuid)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  email text,
  provider text,
  imap_host text,
  imap_port integer,
  imap_security text,
  imap_username text,
  secret text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    s.id,
    s.organization_id,
    s.email,
    s.provider,
    s.imap_host,
    s.imap_port,
    s.imap_security,
    s.imap_username,
    CASE
      WHEN s.secret_encrypted IS NULL OR s.secret_encrypted = '' THEN NULL
      ELSE public.decrypt_password(s.secret_encrypted)
    END
  FROM public.mailing_deliverability_seeds s
  WHERE s.id = p_seed_id;
$$;

REVOKE ALL ON FUNCTION public.get_mailing_deliverability_seed_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mailing_deliverability_seed_secret(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_mailing_deliverability_seed_secret(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_mailing_deliverability_seed_secret(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.mailing_deliverability_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.mailing_senders(id) ON DELETE CASCADE,
  seed_id uuid NOT NULL REFERENCES public.mailing_deliverability_seeds(id) ON DELETE CASCADE,
  probe_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  slot_index integer NOT NULL CHECK (slot_index BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'sent', 'inbox', 'spam', 'missing', 'failed')),
  placement text CHECK (placement IS NULL OR placement IN ('inbox', 'spam', 'missing')),
  sent_at timestamptz,
  checked_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error_category text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, run_date, slot_index)
);

CREATE INDEX IF NOT EXISTS mailing_deliverability_checks_org_created_idx
  ON public.mailing_deliverability_checks (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mailing_deliverability_checks_pending_idx
  ON public.mailing_deliverability_checks (sent_at)
  WHERE status = 'sent';

ALTER TABLE public.mailing_deliverability_checks ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mailing_deliverability_checks TO authenticated;
GRANT ALL ON public.mailing_deliverability_checks TO service_role;

DROP POLICY IF EXISTS "mailing_deliverability_checks_select" ON public.mailing_deliverability_checks;
CREATE POLICY "mailing_deliverability_checks_select"
ON public.mailing_deliverability_checks FOR SELECT TO authenticated
USING (
  public.has_role('admin'::public.app_role, auth.uid())
  OR public.can_access_organization(organization_id, 'email.manage')
);

DROP TRIGGER IF EXISTS mailing_deliverability_checks_updated_at
  ON public.mailing_deliverability_checks;
CREATE TRIGGER mailing_deliverability_checks_updated_at
BEFORE UPDATE ON public.mailing_deliverability_checks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The cron job is inert until both Vault secrets are configured:
--   mailing_deliverability_worker_url
--   mailing_deliverability_cron_secret
-- The same cron secret must be configured as an Edge Function secret.
CREATE OR REPLACE FUNCTION public.invoke_mailing_deliverability_worker()
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
  WHERE name = 'mailing_deliverability_worker_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'mailing_deliverability_cron_secret'
  LIMIT 1;

  IF coalesce(v_url, '') = '' OR coalesce(v_secret, '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
EXCEPTION
  WHEN undefined_table OR undefined_function THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_mailing_deliverability_worker() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_mailing_deliverability_worker() FROM anon;
REVOKE ALL ON FUNCTION public.invoke_mailing_deliverability_worker() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_mailing_deliverability_worker() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mailing-deliverability-every-15min') THEN
      PERFORM cron.unschedule('mailing-deliverability-every-15min');
    END IF;
    PERFORM cron.schedule(
      'mailing-deliverability-every-15min',
      '*/15 * * * *',
      'SELECT public.invoke_mailing_deliverability_worker();'
    );
  END IF;
END;
$$;
