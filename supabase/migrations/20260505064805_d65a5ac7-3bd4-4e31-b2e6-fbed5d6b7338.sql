CREATE TABLE public.registration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step text NOT NULL CHECK (step IN ('submitted','success','failed')),
  email text,
  phone text,
  org_name text,
  contact_name text,
  inn text,
  selected_plan text,
  promo_code text,
  ref_code text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  page_url text,
  referrer text,
  user_agent text,
  ip text,
  error_message text,
  user_id uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reg_attempts_created ON public.registration_attempts (created_at DESC);
CREATE INDEX idx_reg_attempts_step ON public.registration_attempts (step);
CREATE INDEX idx_reg_attempts_email ON public.registration_attempts (email);

ALTER TABLE public.registration_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view registration attempts"
  ON public.registration_attempts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update registration attempts"
  ON public.registration_attempts FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_registration_attempts_updated_at
  BEFORE UPDATE ON public.registration_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();