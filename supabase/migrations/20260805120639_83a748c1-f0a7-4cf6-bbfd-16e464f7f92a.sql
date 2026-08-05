CREATE OR REPLACE FUNCTION public.confirm_campaign_send_consent_admin(
  p_campaign_id uuid,
  p_user_id uuid,
  p_method text DEFAULT 'launch'
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_camp public.email_campaigns;
  v_now timestamptz := now();
BEGIN
  IF p_method NOT IN ('launch', 'schedule') THEN
    RAISE EXCEPTION 'Invalid method';
  END IF;

  SELECT * INTO v_camp FROM public.email_campaigns WHERE id = p_campaign_id;
  IF v_camp.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  UPDATE public.email_campaigns
     SET consent_confirmed_at = v_now,
         consent_confirmed_by = COALESCE(p_user_id, consent_confirmed_by)
   WHERE id = p_campaign_id;

  INSERT INTO public.email_campaign_consent_log
    (campaign_id, organization_id, scope, confirmed_by, method)
  VALUES (p_campaign_id, v_camp.organization_id, v_camp.scope, p_user_id, p_method);

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_campaign_send_consent_admin(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_campaign_send_consent_admin(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_campaign_send_consent_admin(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_campaign_send_consent_admin(uuid, uuid, text) TO service_role;