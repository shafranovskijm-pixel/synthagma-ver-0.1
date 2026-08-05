-- Журнал запусков кампаний через mailing_senders (append-only, без PII/секретов).
CREATE TABLE IF NOT EXISTS public.mailing_campaign_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.mailing_senders(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  requested_by uuid,
  reserved_count int NOT NULL CHECK (reserved_count >= 1),
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mailing_campaign_ledger TO authenticated;
GRANT ALL ON public.mailing_campaign_ledger TO service_role;

ALTER TABLE public.mailing_campaign_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS mailing_campaign_ledger_sender_idx
  ON public.mailing_campaign_ledger (sender_id, created_at DESC);

DROP POLICY IF EXISTS "mailing_campaign_ledger_select" ON public.mailing_campaign_ledger;
CREATE POLICY "mailing_campaign_ledger_select" ON public.mailing_campaign_ledger
FOR SELECT TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP TRIGGER IF EXISTS mailing_campaign_ledger_updated_at ON public.mailing_campaign_ledger;
CREATE TRIGGER mailing_campaign_ledger_updated_at
BEFORE UPDATE ON public.mailing_campaign_ledger
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Атомарное резервирование суточной квоты отправителя для запуска кампании.
CREATE OR REPLACE FUNCTION public.reserve_mailing_campaign_quota(
  p_sender_id uuid,
  p_campaign_id uuid,
  p_count int,
  p_requested_by uuid DEFAULT NULL
)
RETURNS TABLE(allowed boolean, reason text, ledger_id uuid, remaining int, daily_limit int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_limit int;
  v_status text;
  v_active boolean;
  v_camp_org uuid;
  v_camp_sender uuid;
  v_used int;
  v_id uuid;
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN
    RETURN QUERY SELECT false, 'invalid_count'::text, NULL::uuid, 0, 0;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mailing_campaign:' || p_sender_id::text, 0));

  SELECT organization_id, daily_limit, smtp_status, is_active
    INTO v_org, v_limit, v_status, v_active
  FROM public.mailing_senders
  WHERE id = p_sender_id;

  IF v_org IS NULL THEN
    RETURN QUERY SELECT false, 'sender_not_found'::text, NULL::uuid, 0, 0;
    RETURN;
  END IF;
  IF v_active IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'sender_inactive'::text, NULL::uuid, 0, 0;
    RETURN;
  END IF;
  IF v_status <> 'ok' THEN
    RETURN QUERY SELECT false, 'smtp_not_tested'::text, NULL::uuid, 0, 0;
    RETURN;
  END IF;

  SELECT organization_id, sender_id INTO v_camp_org, v_camp_sender
  FROM public.email_campaigns WHERE id = p_campaign_id;

  IF v_camp_org IS NULL OR v_camp_org <> v_org THEN
    RETURN QUERY SELECT false, 'campaign_org_mismatch'::text, NULL::uuid, 0, 0;
    RETURN;
  END IF;
  IF v_camp_sender IS NULL OR v_camp_sender <> p_sender_id THEN
    RETURN QUERY SELECT false, 'campaign_sender_mismatch'::text, NULL::uuid, 0, 0;
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(v_limit, 1), 1), 10000);

  SELECT COALESCE(SUM(reserved_count), 0) INTO v_used
  FROM public.mailing_campaign_ledger
  WHERE sender_id = p_sender_id
    AND created_at >= date_trunc('day', now());

  IF v_used + p_count > v_limit THEN
    RETURN QUERY SELECT false, 'daily_limit'::text, NULL::uuid, GREATEST(v_limit - v_used, 0), v_limit;
    RETURN;
  END IF;

  INSERT INTO public.mailing_campaign_ledger (
    organization_id, sender_id, campaign_id, requested_by, reserved_count
  ) VALUES (v_org, p_sender_id, p_campaign_id, p_requested_by, p_count)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT true, NULL::text, v_id, GREATEST(v_limit - v_used - p_count, 0), v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_mailing_campaign_quota(uuid, uuid, int, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_mailing_campaign_quota(uuid, uuid, int, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_mailing_campaign_quota(uuid, uuid, int, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_mailing_campaign_quota(uuid, uuid, int, uuid) TO service_role;

-- Запись итогов запуска (только счётчики).
CREATE OR REPLACE FUNCTION public.record_mailing_campaign_result(
  p_ledger_id uuid,
  p_sent int,
  p_failed int
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.mailing_campaign_ledger
  SET sent_count = GREATEST(COALESCE(p_sent, 0), 0),
      failed_count = GREATEST(COALESCE(p_failed, 0), 0)
  WHERE id = p_ledger_id;
$$;

REVOKE ALL ON FUNCTION public.record_mailing_campaign_result(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_mailing_campaign_result(uuid, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.record_mailing_campaign_result(uuid, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_mailing_campaign_result(uuid, int, int) TO service_role;

-- Read-only остаток квоты для UI (только своя организация или админ).
CREATE OR REPLACE FUNCTION public.get_mailing_sender_quota(p_sender_id uuid)
RETURNS TABLE(daily_limit int, used_today int, remaining int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_limit int;
  v_used int;
BEGIN
  SELECT organization_id, daily_limit INTO v_org, v_limit
  FROM public.mailing_senders WHERE id = p_sender_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT (has_role('admin'::app_role, auth.uid()) OR v_org = current_organization_id()) THEN
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(v_limit, 1), 1), 10000);

  SELECT COALESCE(SUM(reserved_count), 0) INTO v_used
  FROM public.mailing_campaign_ledger
  WHERE sender_id = p_sender_id AND created_at >= date_trunc('day', now());

  RETURN QUERY SELECT v_limit, v_used, GREATEST(v_limit - v_used, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_mailing_sender_quota(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mailing_sender_quota(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_mailing_sender_quota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mailing_sender_quota(uuid) TO service_role;