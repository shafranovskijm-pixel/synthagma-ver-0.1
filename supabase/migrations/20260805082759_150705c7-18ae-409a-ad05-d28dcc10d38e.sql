ALTER TABLE public.email_campaign_recipients
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS organization text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS custom_data jsonb;

CREATE OR REPLACE FUNCTION public.create_mailing_report_link(p_campaign_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_c public.email_campaigns;
  v_token text;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 30);
BEGIN
  SELECT * INTO v_c FROM public.email_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Кампания не найдена';
  END IF;

  IF v_c.scope = 'platform' THEN
    IF NOT public.has_role('admin'::app_role, auth.uid()) THEN
      RAISE EXCEPTION 'Недостаточно прав';
    END IF;
  ELSE
    IF NOT (public.has_role('admin'::app_role, auth.uid())
            OR public.can_access_organization(v_c.organization_id, 'sales.read')) THEN
      RAISE EXCEPTION 'Недостаточно прав';
    END IF;
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.mailing_report_links (campaign_id, organization_id, token, is_active, expires_at, created_by)
  VALUES (p_campaign_id, v_c.organization_id, v_token, true, now() + make_interval(days => v_days), auth.uid());

  RETURN jsonb_build_object('token', v_token, 'expires_at', now() + make_interval(days => v_days));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_mailing_report_link(p_link_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link public.mailing_report_links;
  v_c public.email_campaigns;
BEGIN
  SELECT * INTO v_link FROM public.mailing_report_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT * INTO v_c FROM public.email_campaigns WHERE id = v_link.campaign_id;

  IF NOT (public.has_role('admin'::app_role, auth.uid())
          OR (v_c.scope <> 'platform' AND public.can_access_organization(v_c.organization_id, 'sales.read'))) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  UPDATE public.mailing_report_links SET is_active = false, updated_at = now() WHERE id = p_link_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mailing_report_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link public.mailing_report_links;
  v_c public.email_campaigns;
  v_bounced int;
  v_sent int;
  v_failed int;
  v_total int;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_link FROM public.mailing_report_links WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;
  IF v_link.is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'disabled');
  END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  SELECT * INTO v_c FROM public.email_campaigns WHERE id = v_link.campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status IN ('sent','opened','clicked')),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'bounced')
  INTO v_total, v_sent, v_failed, v_bounced
  FROM public.email_campaign_recipients
  WHERE campaign_id = v_link.campaign_id;

  -- Публичный контракт: только агрегаты и даты. Никогда email/ФИО/тексты ошибок.
  RETURN jsonb_build_object(
    'valid', true,
    'campaign_name', v_c.name,
    'subject', v_c.subject,
    'status', v_c.status,
    'started_at', v_c.started_at,
    'completed_at', v_c.completed_at,
    'total_recipients', coalesce(nullif(v_total, 0), coalesce(v_c.total_recipients, 0)),
    'accepted', coalesce(v_sent, 0),
    'failed', coalesce(v_failed, 0),
    'bounced', coalesce(v_bounced, 0),
    'opened', coalesce(v_c.open_count, 0),
    'clicked', coalesce(v_c.click_count, 0),
    'unsubscribed', coalesce(v_c.unsubscribe_count, 0),
    'expires_at', v_link.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_mailing_report_link(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_mailing_report_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_mailing_report_link(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_mailing_report_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mailing_report_by_token(text) TO anon, authenticated;