
CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text,
  user_email text,
  user_role text,
  organization_id uuid,
  description text NOT NULL,
  screenshot_url text,
  browser_info text,
  page_url text,
  error_logs text,
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all support requests"
ON public.support_requests FOR ALL
USING (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Users can create support requests"
ON public.support_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own support requests"
ON public.support_requests FOR SELECT
USING (auth.uid() = user_id);
