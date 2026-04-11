
-- Referral partners
CREATE TABLE public.referral_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  commission_percent integer NOT NULL DEFAULT 10,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  total_earned numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  bank_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view own data" ON public.referral_partners
  FOR SELECT USING (auth.uid() = user_id OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Partners can update own bank details" ON public.referral_partners
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all partners" ON public.referral_partners
  FOR ALL USING (has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER update_referral_partners_updated_at
  BEFORE UPDATE ON public.referral_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Referral registrations
CREATE TABLE public.referral_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  registered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 years'),
  UNIQUE(partner_id, organization_id)
);

ALTER TABLE public.referral_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view own registrations" ON public.referral_registrations
  FOR SELECT USING (
    partner_id IN (SELECT id FROM referral_partners WHERE user_id = auth.uid())
    OR has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Admins can manage registrations" ON public.referral_registrations
  FOR ALL USING (has_role('admin'::app_role, auth.uid()));

-- Allow insert from security definer functions (referral tracking)
CREATE POLICY "System can insert registrations" ON public.referral_registrations
  FOR INSERT WITH CHECK (true);

-- Referral commissions
CREATE TABLE public.referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_source text NOT NULL DEFAULT 'subscription',
  amount numeric(12,2) NOT NULL,
  commission_amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view own commissions" ON public.referral_commissions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM referral_partners WHERE user_id = auth.uid())
    OR has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Admins can manage commissions" ON public.referral_commissions
  FOR ALL USING (has_role('admin'::app_role, auth.uid()));

-- Referral payouts
CREATE TABLE public.referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view own payouts" ON public.referral_payouts
  FOR SELECT USING (
    partner_id IN (SELECT id FROM referral_partners WHERE user_id = auth.uid())
    OR has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Partners can request payouts" ON public.referral_payouts
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM referral_partners WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage payouts" ON public.referral_payouts
  FOR ALL USING (has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER update_referral_payouts_updated_at
  BEFORE UPDATE ON public.referral_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Referral promo materials
CREATE TABLE public.referral_promo_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  type text NOT NULL DEFAULT 'banner',
  size text,
  html_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_promo_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active materials" ON public.referral_promo_materials
  FOR SELECT USING (is_active = true OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can manage materials" ON public.referral_promo_materials
  FOR ALL USING (has_role('admin'::app_role, auth.uid()));

-- Security definer function to register referral on org creation
CREATE OR REPLACE FUNCTION public.register_referral(p_ref_code text, p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  SELECT id INTO v_partner_id FROM referral_partners
  WHERE code = p_ref_code AND status = 'active';
  
  IF v_partner_id IS NULL THEN RETURN; END IF;
  
  INSERT INTO referral_registrations (partner_id, organization_id)
  VALUES (v_partner_id, p_organization_id)
  ON CONFLICT (partner_id, organization_id) DO NOTHING;
END;
$$;

-- Function to become a partner
CREATE OR REPLACE FUNCTION public.become_referral_partner()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_code text;
  v_existing text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Check if already a partner
  SELECT code INTO v_existing FROM referral_partners WHERE user_id = auth.uid();
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  
  -- Generate unique code
  v_code := 'REF' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  
  INSERT INTO referral_partners (user_id, code)
  VALUES (auth.uid(), v_code);
  
  RETURN v_code;
END;
$$;
