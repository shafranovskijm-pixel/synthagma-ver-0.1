CREATE TABLE public.email_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  organization_email text NOT NULL,
  action_type text NOT NULL DEFAULT 'help_request',
  template_name text NOT NULL DEFAULT 'inactive',
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

ALTER TABLE public.email_action_tokens ENABLE ROW LEVEL SECURITY;

-- Admin can read all tokens
CREATE POLICY "Admins can view email action tokens"
ON public.email_action_tokens
FOR SELECT
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

-- Admin can insert tokens
CREATE POLICY "Admins can create email action tokens"
ON public.email_action_tokens
FOR INSERT
TO authenticated
WITH CHECK (public.has_role('admin'::app_role, auth.uid()));