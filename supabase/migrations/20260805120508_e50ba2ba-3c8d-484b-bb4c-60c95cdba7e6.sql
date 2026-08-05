ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS consent_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_confirmed_by uuid;

CREATE TABLE IF NOT EXISTS public.email_campaign_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  organization_id uuid,
  scope text NOT NULL,
  confirmed_by uuid,
  method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_campaign_consent_log TO authenticated;
GRANT ALL ON public.email_campaign_consent_log TO service_role;

ALTER TABLE public.email_campaign_consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent log readable in own org"
ON public.email_campaign_consent_log
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (organization_id IS NOT NULL AND organization_id = public.current_organization_id())
);

CREATE OR REPLACE FUNCTION public.confirm_campaign_send_consent(
  p_campaign_id uuid,
  p_method text DEFAULT 'launch'
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_camp public.email_campaigns;
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_method NOT IN ('launch', 'schedule') THEN
    RAISE EXCEPTION 'Invalid method';
  END IF;

  SELECT * INTO v_camp FROM public.email_campaigns WHERE id = p_campaign_id;
  IF v_camp.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF public.has_role(v_uid, 'admin') THEN
    v_ok := true;
  ELSIF v_camp.scope = 'org' AND v_camp.organization_id IS NOT NULL THEN
    v_ok := public.can_access_organization(v_camp.organization_id, 'sales.write');
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.email_campaigns
     SET consent_confirmed_at = v_now,
         consent_confirmed_by = v_uid
   WHERE id = p_campaign_id;

  INSERT INTO public.email_campaign_consent_log
    (campaign_id, organization_id, scope, confirmed_by, method)
  VALUES (p_campaign_id, v_camp.organization_id, v_camp.scope, v_uid, p_method);

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_campaign_send_consent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_campaign_send_consent(uuid, text) TO authenticated, service_role;