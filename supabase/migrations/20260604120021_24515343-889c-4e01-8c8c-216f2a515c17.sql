
-- 1. organizations: backup attribution
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS referred_by_partner_id uuid REFERENCES public.referral_partners(id);
CREATE INDEX IF NOT EXISTS idx_organizations_referred_by_partner_id
  ON public.organizations(referred_by_partner_id);

-- 2. referral_partners: terms acceptance
ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz;
UPDATE public.referral_partners
  SET accepted_terms_at = created_at
  WHERE accepted_terms_at IS NULL;

-- 3. attribution log
CREATE TABLE IF NOT EXISTS public.referral_attribution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text NOT NULL,
  organization_id uuid,
  user_id uuid,
  partner_id uuid REFERENCES public.referral_partners(id) ON DELETE SET NULL,
  status text NOT NULL,
  reason text,
  source text,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_attribution_log TO authenticated;
GRANT ALL ON public.referral_attribution_log TO service_role;
ALTER TABLE public.referral_attribution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view attribution log"
  ON public.referral_attribution_log FOR SELECT
  USING (has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Partners view own attribution attempts"
  ON public.referral_attribution_log FOR SELECT
  USING (partner_id IN (SELECT id FROM public.referral_partners WHERE user_id = auth.uid()));
CREATE POLICY "System inserts attribution log"
  ON public.referral_attribution_log FOR INSERT
  WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_referral_attribution_log_partner ON public.referral_attribution_log(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_attribution_log_org ON public.referral_attribution_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_referral_attribution_log_status ON public.referral_attribution_log(status, created_at DESC);

-- 4. register_referral: first-touch + logging
CREATE OR REPLACE FUNCTION public.register_referral(
  p_ref_code text,
  p_organization_id uuid,
  p_source text DEFAULT 'client',
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
  v_partner_status text;
  v_existing_partner uuid;
  v_normalized text;
BEGIN
  v_normalized := nullif(trim(p_ref_code), '');

  IF v_normalized IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'empty_code');
  END IF;
  IF p_organization_id IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'no_organization');
  END IF;

  -- Resolve partner
  SELECT id, status INTO v_partner_id, v_partner_status
  FROM referral_partners
  WHERE code = v_normalized;

  IF v_partner_id IS NULL THEN
    INSERT INTO referral_attribution_log(ref_code, organization_id, partner_id, status, reason, source, user_agent)
    VALUES (v_normalized, p_organization_id, NULL, 'rejected', 'code_not_found', p_source, p_user_agent);
    RETURN jsonb_build_object('attributed', false, 'reason', 'code_not_found');
  END IF;

  IF v_partner_status <> 'active' THEN
    INSERT INTO referral_attribution_log(ref_code, organization_id, partner_id, status, reason, source, user_agent)
    VALUES (v_normalized, p_organization_id, v_partner_id, 'rejected', 'partner_' || v_partner_status, p_source, p_user_agent);
    RETURN jsonb_build_object('attributed', false, 'reason', 'partner_' || v_partner_status);
  END IF;

  -- First-touch: if org already attributed, do NOT overwrite
  SELECT referred_by_partner_id INTO v_existing_partner
  FROM organizations WHERE id = p_organization_id;

  IF v_existing_partner IS NOT NULL AND v_existing_partner <> v_partner_id THEN
    INSERT INTO referral_attribution_log(ref_code, organization_id, partner_id, status, reason, source, user_agent)
    VALUES (v_normalized, p_organization_id, v_partner_id, 'rejected', 'already_attributed_to_' || v_existing_partner::text, p_source, p_user_agent);
    RETURN jsonb_build_object('attributed', false, 'reason', 'already_attributed', 'existing_partner_id', v_existing_partner);
  END IF;

  -- Insert registration (idempotent)
  INSERT INTO referral_registrations(partner_id, organization_id)
  VALUES (v_partner_id, p_organization_id)
  ON CONFLICT (partner_id, organization_id) DO NOTHING;

  -- Mirror on organizations for resilience
  UPDATE organizations SET referred_by_partner_id = v_partner_id
  WHERE id = p_organization_id AND referred_by_partner_id IS NULL;

  INSERT INTO referral_attribution_log(ref_code, organization_id, partner_id, status, reason, source, user_agent)
  VALUES (v_normalized, p_organization_id, v_partner_id, 'attributed', NULL, p_source, p_user_agent);

  RETURN jsonb_build_object('attributed', true, 'partner_id', v_partner_id);
END;
$$;

-- 5. become_referral_partner: require terms acceptance
CREATE OR REPLACE FUNCTION public.become_referral_partner(
  p_referred_by text DEFAULT NULL,
  p_accepted_terms boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_existing text;
  v_referrer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_accepted_terms IS NOT TRUE THEN
    RAISE EXCEPTION 'Необходимо принять условия партнёрского соглашения';
  END IF;

  SELECT code INTO v_existing FROM referral_partners WHERE user_id = auth.uid();
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF p_referred_by IS NOT NULL AND trim(p_referred_by) <> '' THEN
    SELECT id INTO v_referrer_id FROM referral_partners
    WHERE code = trim(p_referred_by) AND status = 'active';
  END IF;

  v_code := 'REF' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO referral_partners(user_id, code, referred_by_partner_id, accepted_terms_at)
  VALUES (auth.uid(), v_code, v_referrer_id, now());

  RETURN v_code;
END;
$$;
