
-- Admin branding settings (single row)
CREATE TABLE public.admin_branding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cover_url TEXT,
  logo_url TEXT,
  branding JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin_branding"
  ON public.admin_branding FOR SELECT
  TO authenticated
  USING (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can insert admin_branding"
  ON public.admin_branding FOR INSERT
  TO authenticated
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update admin_branding"
  ON public.admin_branding FOR UPDATE
  TO authenticated
  USING (has_role('admin'::app_role, auth.uid()));

-- Insert default row
INSERT INTO public.admin_branding (branding) VALUES ('{}');

-- Admin staff table
CREATE TABLE public.admin_staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.admin_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin_staff"
  ON public.admin_staff FOR SELECT
  TO authenticated
  USING (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can insert admin_staff"
  ON public.admin_staff FOR INSERT
  TO authenticated
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update admin_staff"
  ON public.admin_staff FOR UPDATE
  TO authenticated
  USING (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can delete admin_staff"
  ON public.admin_staff FOR DELETE
  TO authenticated
  USING (has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER update_admin_staff_updated_at
  BEFORE UPDATE ON public.admin_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_branding_updated_at
  BEFORE UPDATE ON public.admin_branding
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
