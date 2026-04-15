
-- 1. Add MLM fields to referral_partners
ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS referred_by_partner_id uuid REFERENCES public.referral_partners(id),
  ADD COLUMN IF NOT EXISTS level1_percent integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS level2_percent integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS level3_percent integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS monthly_network_revenue numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_turnover_bonus boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_top_partner boolean NOT NULL DEFAULT false;

-- 2. Add MLM fields to referral_commissions
ALTER TABLE public.referral_commissions
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_partner_id uuid REFERENCES public.referral_partners(id),
  ADD COLUMN IF NOT EXISTS bonus_type text;

-- 3. Create partner_monthly_stats table
CREATE TABLE public.partner_monthly_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  month date NOT NULL,
  network_revenue numeric NOT NULL DEFAULT 0,
  direct_revenue numeric NOT NULL DEFAULT 0,
  total_commission numeric NOT NULL DEFAULT 0,
  rank integer,
  is_top boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, month)
);

ALTER TABLE public.partner_monthly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own stats"
  ON public.partner_monthly_stats FOR SELECT
  USING (
    partner_id IN (SELECT id FROM public.referral_partners WHERE user_id = auth.uid())
    OR has_role('admin'::app_role, auth.uid())
  );

-- 4. Update become_referral_partner to accept referred_by code
CREATE OR REPLACE FUNCTION public.become_referral_partner(p_referred_by text DEFAULT NULL)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_existing text;
  v_referrer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Check if already a partner
  SELECT code INTO v_existing FROM referral_partners WHERE user_id = auth.uid();
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  
  -- Resolve referrer
  IF p_referred_by IS NOT NULL AND p_referred_by != '' THEN
    SELECT id INTO v_referrer_id FROM referral_partners WHERE code = p_referred_by AND status = 'active';
  END IF;
  
  -- Generate unique code
  v_code := 'REF' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  
  INSERT INTO referral_partners (user_id, code, referred_by_partner_id)
  VALUES (auth.uid(), v_code, v_referrer_id);
  
  RETURN v_code;
END;
$$;

-- 5. Index for tree traversal
CREATE INDEX IF NOT EXISTS idx_referral_partners_referred_by ON public.referral_partners(referred_by_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_monthly_stats_month ON public.partner_monthly_stats(month, partner_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_level ON public.referral_commissions(partner_id, level);
