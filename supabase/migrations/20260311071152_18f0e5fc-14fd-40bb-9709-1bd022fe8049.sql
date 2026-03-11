
-- Create admin_org_messages table
CREATE TABLE public.admin_org_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  sender_role text NOT NULL DEFAULT 'admin',
  content text,
  attachment_url text,
  attachment_name text,
  attachment_type text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_org_messages ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins full access on admin_org_messages"
  ON public.admin_org_messages
  FOR ALL
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

-- Organizations: can SELECT their own messages
CREATE POLICY "Orgs can view own admin messages"
  ON public.admin_org_messages
  FOR SELECT
  TO authenticated
  USING (organization_id = public.current_organization_id());

-- Organizations: can INSERT replies (sender_role = 'organization')
CREATE POLICY "Orgs can reply to admin messages"
  ON public.admin_org_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND sender_role = 'organization'
    AND sender_user_id = auth.uid()
  );

-- Organizations: can mark messages as read
CREATE POLICY "Orgs can mark admin messages as read"
  ON public.admin_org_messages
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_org_messages;
