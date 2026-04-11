
-- 1. Trigger function for encrypting payment passwords
CREATE OR REPLACE FUNCTION public.trigger_encrypt_payment_passwords()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.password1_encrypted IS NOT NULL AND NEW.password1_encrypted != '' AND NOT (NEW.password1_encrypted LIKE 'ENC:%') THEN
    NEW.password1_encrypted = encrypt_password(NEW.password1_encrypted);
  END IF;
  IF NEW.password2_encrypted IS NOT NULL AND NEW.password2_encrypted != '' AND NOT (NEW.password2_encrypted LIKE 'ENC:%') THEN
    NEW.password2_encrypted = encrypt_password(NEW.password2_encrypted);
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Organization payment settings table
CREATE TABLE public.organization_payment_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  merchant_login text NOT NULL DEFAULT '',
  password1_encrypted text NOT NULL DEFAULT '',
  password2_encrypted text NOT NULL DEFAULT '',
  is_test_mode boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.organization_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org managers can view own payment settings"
  ON public.organization_payment_settings FOR SELECT TO authenticated
  USING (organization_id = current_organization_id());

CREATE POLICY "Org managers can insert own payment settings"
  ON public.organization_payment_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "Org managers can update own payment settings"
  ON public.organization_payment_settings FOR UPDATE TO authenticated
  USING (organization_id = current_organization_id());

CREATE TRIGGER encrypt_payment_passwords
  BEFORE INSERT OR UPDATE ON public.organization_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_encrypt_payment_passwords();

CREATE TRIGGER update_payment_settings_updated_at
  BEFORE UPDATE ON public.organization_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add price column to courses
ALTER TABLE public.courses ADD COLUMN price numeric NOT NULL DEFAULT 0;

-- 4. Course payments table
CREATE TABLE public.course_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  robokassa_inv_id bigint UNIQUE,
  payment_method text,
  paid_at timestamptz,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org managers can view own payments"
  ON public.course_payments FOR SELECT TO authenticated
  USING (organization_id = current_organization_id() OR user_id = auth.uid());

CREATE POLICY "Admins can view all payments"
  ON public.course_payments FOR SELECT TO authenticated
  USING (has_role('admin'::app_role, auth.uid()));

CREATE INDEX idx_course_payments_org ON public.course_payments(organization_id);
CREATE INDEX idx_course_payments_inv ON public.course_payments(robokassa_inv_id);
CREATE INDEX idx_course_payments_status ON public.course_payments(status);

-- 5. Decrypt function for edge functions
CREATE OR REPLACE FUNCTION public.get_decrypted_payment_settings(p_organization_id uuid)
  RETURNS TABLE(merchant_login text, password1 text, password2 text, is_test_mode boolean)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT ops.merchant_login,
    decrypt_password(ops.password1_encrypted) as password1,
    decrypt_password(ops.password2_encrypted) as password2,
    ops.is_test_mode
  FROM organization_payment_settings ops
  WHERE ops.organization_id = p_organization_id;
END;
$$;
