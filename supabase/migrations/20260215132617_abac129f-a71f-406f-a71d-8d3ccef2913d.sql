
CREATE TABLE public.subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  current_plan text NOT NULL,
  requested_plan text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid
);

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can create subscription requests"
  ON public.subscription_requests
  FOR INSERT
  WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "Org users can view own subscription requests"
  ON public.subscription_requests
  FOR SELECT
  USING (organization_id = current_organization_id());

CREATE POLICY "Admins can manage all subscription requests"
  ON public.subscription_requests
  FOR ALL
  USING (has_role('admin'::app_role, auth.uid()));
