
-- Create promo_codes table
CREATE TABLE public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_percent INTEGER NOT NULL CHECK (discount_percent >= 1 AND discount_percent <= 100),
  is_active BOOLEAN DEFAULT true,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can read (for promo code validation)
CREATE POLICY "Anyone can read active promo codes"
ON public.promo_codes
FOR SELECT
USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage promo codes"
ON public.promo_codes
FOR ALL
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));

-- Insert default SYNTASALE promo code
INSERT INTO public.promo_codes (code, discount_percent, is_active)
VALUES ('SYNTASALE', 50, true);
