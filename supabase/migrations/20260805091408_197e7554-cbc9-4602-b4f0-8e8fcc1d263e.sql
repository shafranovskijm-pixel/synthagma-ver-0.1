-- 1) Убираем табличные INSERT/UPDATE у authenticated: колонки статуса проверки
-- должны писаться только service_role (после реальной SMTP/IMAP-проверки).
REVOKE INSERT, UPDATE ON public.mailing_senders FROM authenticated;

GRANT INSERT (
  organization_id, label, from_name, from_email,
  smtp_host, smtp_port, smtp_security, smtp_username,
  password_encrypted,
  imap_host, imap_port, imap_security, imap_username,
  preset_key, daily_limit, is_active, created_by
) ON public.mailing_senders TO authenticated;

GRANT UPDATE (
  label, from_name, from_email,
  smtp_host, smtp_port, smtp_security, smtp_username,
  password_encrypted,
  imap_host, imap_port, imap_security, imap_username,
  preset_key, daily_limit, is_active
) ON public.mailing_senders TO authenticated;

-- 2) Журнал seed-отправок (без тела письма и без пароля).
CREATE TABLE IF NOT EXISTS public.mailing_seed_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.mailing_senders(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  requested_by uuid,
  seed_count int NOT NULL CHECK (seed_count BETWEEN 1 AND 5),
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mailing_seed_ledger TO authenticated;
GRANT ALL ON public.mailing_seed_ledger TO service_role;

ALTER TABLE public.mailing_seed_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS mailing_seed_ledger_sender_idx
  ON public.mailing_seed_ledger (sender_id, created_at DESC);

DROP POLICY IF EXISTS "mailing_seed_ledger_select" ON public.mailing_seed_ledger;
CREATE POLICY "mailing_seed_ledger_select" ON public.mailing_seed_ledger
FOR SELECT TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP TRIGGER IF EXISTS mailing_seed_ledger_updated_at ON public.mailing_seed_ledger;
CREATE TRIGGER mailing_seed_ledger_updated_at
BEFORE UPDATE ON public.mailing_seed_ledger
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Атомарное резервирование квоты seed-отправки.
CREATE OR REPLACE FUNCTION public.reserve_mailing_seed_quota(
  p_sender_id uuid,
  p_campaign_id uuid,
  p_count int,
  p_requested_by uuid DEFAULT NULL,
  p_cooldown_seconds int DEFAULT 60
)
RETURNS TABLE(allowed boolean, reason text, ledger_id uuid, remaining int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_limit int;
  v_status text;
  v_active boolean;
  v_used int;
  v_last timestamptz;
  v_id uuid;
BEGIN
  IF p_count IS NULL OR p_count < 1 OR p_count > 5 THEN
    RETURN QUERY SELECT false, 'invalid_count'::text, NULL::uuid, 0;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mailing_seed:' || p_sender_id::text, 0));

  SELECT organization_id, daily_limit, smtp_status, is_active
    INTO v_org, v_limit, v_status, v_active
  FROM public.mailing_senders
  WHERE id = p_sender_id;

  IF v_org IS NULL THEN
    RETURN QUERY SELECT false, 'sender_not_found'::text, NULL::uuid, 0;
    RETURN;
  END IF;
  IF v_active IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'sender_inactive'::text, NULL::uuid, 0;
    RETURN;
  END IF;
  IF v_status <> 'ok' THEN
    RETURN QUERY SELECT false, 'smtp_not_tested'::text, NULL::uuid, 0;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(seed_count), 0), MAX(created_at)
    INTO v_used, v_last
  FROM public.mailing_seed_ledger
  WHERE sender_id = p_sender_id
    AND created_at >= date_trunc('day', now());

  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => GREATEST(p_cooldown_seconds, 0)) THEN
    RETURN QUERY SELECT false, 'cooldown'::text, NULL::uuid, GREATEST(COALESCE(v_limit, 0) - v_used, 0);
    RETURN;
  END IF;

  IF v_used + p_count > COALESCE(v_limit, 0) THEN
    RETURN QUERY SELECT false, 'daily_limit'::text, NULL::uuid, GREATEST(COALESCE(v_limit, 0) - v_used, 0);
    RETURN;
  END IF;

  INSERT INTO public.mailing_seed_ledger (
    organization_id, sender_id, campaign_id, requested_by, seed_count
  ) VALUES (v_org, p_sender_id, p_campaign_id, p_requested_by, p_count)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT true, NULL::text, v_id, GREATEST(COALESCE(v_limit, 0) - v_used - p_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_mailing_seed_quota(uuid, uuid, int, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_mailing_seed_quota(uuid, uuid, int, uuid, int) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_mailing_seed_quota(uuid, uuid, int, uuid, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_mailing_seed_quota(uuid, uuid, int, uuid, int) TO service_role;

-- 4) Запись результата seed-отправки (без тела письма и пароля).
CREATE OR REPLACE FUNCTION public.record_mailing_seed_result(
  p_ledger_id uuid,
  p_sent int,
  p_failed int
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.mailing_seed_ledger
  SET sent_count = GREATEST(COALESCE(p_sent, 0), 0),
      failed_count = GREATEST(COALESCE(p_failed, 0), 0)
  WHERE id = p_ledger_id;
$$;

REVOKE ALL ON FUNCTION public.record_mailing_seed_result(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_mailing_seed_result(uuid, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.record_mailing_seed_result(uuid, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_mailing_seed_result(uuid, int, int) TO service_role;